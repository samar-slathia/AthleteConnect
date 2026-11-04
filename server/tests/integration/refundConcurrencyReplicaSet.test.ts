import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PaymentTransaction } from '../../src/models/PaymentTransaction';
import { Booking } from '../../src/models/Booking';
import { User } from '../../src/models/User';
import {
  applyRefundEventToTransaction,
  reconcilePaymentWithGateway,
} from '../../src/controllers/paymentController';
import * as razorpayService from '../../src/services/razorpayService';

describe('Real MongoDB Replica-Set Transactional Refund Concurrency Integration Tests', () => {
  let replSet: MongoMemoryReplSet;
  let replUri: string;
  let customerUser: any;
  let coachUser: any;

  beforeAll(async () => {
    // 1. Spin up genuine MongoDB Replica Set for WiredTiger multi-document transactions
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    replUri = replSet.getUri();

    // 2. Connect primary Mongoose instance over real network socket
    await mongoose.connect(replUri);

    // 3. Ensure indexes are built
    await PaymentTransaction.syncIndexes();
    await Booking.syncIndexes();
    await User.syncIndexes();
  }, 90000);

  afterAll(async () => {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      if (replSet) {
        await replSet.stop();
      }
    } catch {
      // Clean teardown
    }
  }, 60000);

  beforeEach(async () => {
    // Clean collections before each test to maintain strict isolation
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }

    // Seed customer and coach users
    customerUser = await User.create({
      name: 'Integration Customer',
      email: `customer_${Date.now()}@test.com`,
      passwordHash: 'dummy_hash_for_testing_123',
      role: 'parent',
      isActive: true,
    });

    coachUser = await User.create({
      name: 'Integration Coach',
      email: `coach_${Date.now()}@test.com`,
      passwordHash: 'dummy_hash_for_testing_123',
      role: 'coach',
      isActive: true,
    });
  });

  // Helper to create an accepted & captured booking and transaction
  async function seedCapturedBookingAndTransaction(amountInPaise = 100000) {
    const booking = await Booking.create({
      customerId: customerUser._id,
      coachId: coachUser._id,
      sport: 'boxing',
      date: '2026-12-01',
      startTime: '10:00',
      endTime: '11:00',
      startMinutes: 600,
      endMinutes: 660,
      durationMinutes: 60,
      venueType: 'coach_home',
      trainingAddress: '123 Main Boxing Gym, Srinagar',
      customerPhone: '+919999999999',
      status: 'accepted',
      paymentStatus: 'paid',
      refundStatus: 'none',
      hourlyRateSnapshot: amountInPaise / 100,
    });

    const paymentId = `pay_repl_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const orderId = `order_repl_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    const transaction = await PaymentTransaction.create({
      bookingId: booking._id,
      customerId: customerUser._id,
      coachId: coachUser._id,
      currency: 'INR',
      hourlyRate: amountInPaise / 100,
      durationMinutes: 60,
      baseSessionFee: amountInPaise / 100,
      platformCommission: Math.round((amountInPaise / 100) * 0.2),
      coachAllocation: Math.round((amountInPaise / 100) * 0.8),
      taxRatePercentage: 0,
      taxAmount: 0,
      totalCustomerPayable: amountInPaise / 100,
      amountInPaise,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      status: 'captured',
      refundStatus: 'none',
      refundedAmountInPaise: 0,
      refunds: [],
      payoutStatus: 'simulated_held',
      orderExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      paidAt: new Date(),
    });

    booking.paymentTransactionId = transaction._id as any;
    await booking.save();

    return { booking, transaction, paymentId, orderId };
  }

  // ---------------------------------------------------------------------------
  // 1. Two Concurrent refund.processed Events For The Same Payment
  // ---------------------------------------------------------------------------
  it('1. concurrently applies two refund.processed events without lost updates or race corruption', async () => {
    const { booking, paymentId } = await seedCapturedBookingAndTransaction(100000); // ₹1,000

    const refundAId = `rfnd_A_${Date.now()}`;
    const refundBId = `rfnd_B_${Date.now()}`;

    // Execute Refund A (₹300 / 30,000 paise) and Refund B (₹400 / 40,000 paise) concurrently
    const [resultA, resultB] = await Promise.all([
      applyRefundEventToTransaction({
        paymentId,
        refundId: refundAId,
        eventType: 'refund.processed',
        amountInPaise: 30000,
      }),
      applyRefundEventToTransaction({
        paymentId,
        refundId: refundBId,
        eventType: 'refund.processed',
        amountInPaise: 40000,
      }),
    ]);

    expect(resultA.isExcess).toBe(false);
    expect(resultB.isExcess).toBe(false);

    // Reload transaction from real replica set
    const freshTx = await PaymentTransaction.findOne({ razorpayPaymentId: paymentId });
    expect(freshTx).not.toBeNull();

    // Verify cumulative refunded amount is exactly ₹700 (70,000 paise)
    expect(freshTx!.refundedAmountInPaise).toBe(70000);
    expect(freshTx!.refundStatus).toBe('partially_refunded');
    expect(freshTx!.status).toBe('captured'); // Still captured because not 100% refunded

    // Verify both refund IDs are strictly recorded
    expect(freshTx!.refunds.length).toBe(2);
    const recordedIds = freshTx!.refunds.map((r) => r.refundId);
    expect(recordedIds).toContain(refundAId);
    expect(recordedIds).toContain(refundBId);

    // Verify Booking synchronized to partially_refunded
    const freshBooking = await Booking.findById(booking._id);
    expect(freshBooking!.paymentStatus).toBe('partially_refunded');
    expect(freshBooking!.refundStatus).toBe('partially_refunded');
  });

  // ---------------------------------------------------------------------------
  // 2. Gateway Fact Integrity: Processed Excess Refund Preserved With Alert
  // ---------------------------------------------------------------------------
  it('2. preserves genuine processed excess refund as processed and records excess discrepancy without silent truncation', async () => {
    const { booking, paymentId } = await seedCapturedBookingAndTransaction(100000); // ₹1,000

    // Apply valid initial refund of ₹700 (70,000 paise)
    const validRefundId = `rfnd_valid_${Date.now()}`;
    await applyRefundEventToTransaction({
      paymentId,
      refundId: validRefundId,
      eventType: 'refund.processed',
      amountInPaise: 70000,
    });

    // Genuine gateway excess refund of ₹400 (40,000 paise).
    // Total = 70,000 + 40,000 = 110,000 paise > 100,000 paise original payment.
    const excessRefundId = `rfnd_excess_${Date.now()}`;
    const excessResult = await applyRefundEventToTransaction({
      paymentId,
      refundId: excessRefundId,
      eventType: 'refund.processed',
      amountInPaise: 40000,
    });

    expect(excessResult.isExcess).toBe(true);
    expect(excessResult.excessReason).toMatch(/excess refund discrepancy/i);

    // Reload transaction from real replica set
    const freshTx = await PaymentTransaction.findOne({ razorpayPaymentId: paymentId });
    expect(freshTx).not.toBeNull();

    // 1. Amount reflects actual cumulative gateway refunds (110,000 paise)
    expect(freshTx!.refundedAmountInPaise).toBe(110000);
    // 2. Transaction is marked fully refunded
    expect(freshTx!.status).toBe('refunded');
    expect(freshTx!.refundStatus).toBe('processed');
    // 3. Excess refund discrepancy is flagged for administrative review
    expect(freshTx!.hasExcessRefundAlert).toBe(true);
    expect(freshTx!.excessRefundReason).toBe(excessResult.excessReason);

    // 4. Genuine gateway refund item is preserved as 'processed' (NEVER falsely marked failed)
    expect(freshTx!.refunds.length).toBe(2);
    const validItem = freshTx!.refunds.find((r) => r.refundId === validRefundId);
    expect(validItem!.status).toBe('processed');
    expect(validItem!.amountInPaise).toBe(70000);

    const excessItem = freshTx!.refunds.find((r) => r.refundId === excessRefundId);
    expect(excessItem!.status).toBe('processed');
    expect(excessItem!.amountInPaise).toBe(40000);

    // 5. Booking transitions to refunded
    const freshBooking = await Booking.findById(booking._id);
    expect(freshBooking!.paymentStatus).toBe('refunded');
    expect(freshBooking!.refundStatus).toBe('processed');
  });

  // ---------------------------------------------------------------------------
  // 3. Exact Cumulative Full Refund
  // ---------------------------------------------------------------------------
  it('3. transitions transaction and booking to fully refunded when exact cumulative sum equals original payment', async () => {
    const { booking, paymentId } = await seedCapturedBookingAndTransaction(100000); // ₹1,000

    // Step 1: Refund ₹700 (70,000 paise)
    await applyRefundEventToTransaction({
      paymentId,
      refundId: `rfnd_part1_${Date.now()}`,
      eventType: 'refund.processed',
      amountInPaise: 70000,
    });

    // Step 2: Refund remaining ₹300 (30,000 paise) -> exactly 100,000 paise
    const fullResult = await applyRefundEventToTransaction({
      paymentId,
      refundId: `rfnd_part2_${Date.now()}`,
      eventType: 'refund.processed',
      amountInPaise: 30000,
    });

    expect(fullResult.isExcess).toBe(false);

    // Reload from replica set
    const freshTx = await PaymentTransaction.findOne({ razorpayPaymentId: paymentId });
    expect(freshTx!.refundedAmountInPaise).toBe(100000);
    expect(freshTx!.status).toBe('refunded');
    expect(freshTx!.refundStatus).toBe('processed');
    expect(freshTx!.payoutStatus).toBe('unsettled');
    expect(freshTx!.refundedAt).toBeDefined();

    // Verify Booking is marked fully refunded
    const freshBooking = await Booking.findById(booking._id);
    expect(freshBooking!.paymentStatus).toBe('refunded');
    expect(freshBooking!.refundStatus).toBe('processed');
  });

  // ---------------------------------------------------------------------------
  // 4. Multiple Refund Attempt Combinations
  // ---------------------------------------------------------------------------
  it('4. multiple refund combinations: pending -> processed, duplicate processed, delayed created, failed protection', async () => {
    const { paymentId } = await seedCapturedBookingAndTransaction(100000); // ₹1,000

    const refundId = `rfnd_combo_${Date.now()}`;

    // A. refund.created arrives (pending)
    const createResult = await applyRefundEventToTransaction({
      paymentId,
      refundId,
      eventType: 'refund.created',
      amountInPaise: 50000,
    });
    expect(createResult.isDuplicate).toBe(false);

    let tx = await PaymentTransaction.findOne({ razorpayPaymentId: paymentId });
    expect(tx!.refundStatus).toBe('pending');
    expect(tx!.refundedAmountInPaise).toBe(0); // Pending does not count as refunded yet
    expect(tx!.refunds[0].status).toBe('pending');

    // B. refund.processed arrives for the same refundId -> transitions to processed
    const processedResult = await applyRefundEventToTransaction({
      paymentId,
      refundId,
      eventType: 'refund.processed',
      amountInPaise: 50000,
    });
    expect(processedResult.isDuplicate).toBe(false);

    tx = await PaymentTransaction.findOne({ razorpayPaymentId: paymentId });
    expect(tx!.refundStatus).toBe('partially_refunded');
    expect(tx!.refundedAmountInPaise).toBe(50000);
    expect(tx!.refunds.length).toBe(1);
    expect(tx!.refunds[0].status).toBe('processed');

    // C. Duplicate refund.processed arrives for the same refundId -> idempotent, no double counting
    const duplicateResult = await applyRefundEventToTransaction({
      paymentId,
      refundId,
      eventType: 'refund.processed',
      amountInPaise: 50000,
    });
    expect(duplicateResult.isDuplicate).toBe(true);

    tx = await PaymentTransaction.findOne({ razorpayPaymentId: paymentId });
    expect(tx!.refundedAmountInPaise).toBe(50000); // Still 50,000, NOT 100,000

    // D. Delayed refund.created arrives after processed -> ignored, does not revert to pending
    const delayedResult = await applyRefundEventToTransaction({
      paymentId,
      refundId,
      eventType: 'refund.created',
      amountInPaise: 50000,
    });
    expect(delayedResult.isDuplicate).toBe(true);

    tx = await PaymentTransaction.findOne({ razorpayPaymentId: paymentId });
    expect(tx!.refundStatus).toBe('partially_refunded');
    expect(tx!.refunds[0].status).toBe('processed');

    // E. Independent refund.failed arrives for a new refund ID -> does not undo processed refund
    const failedRefundId = `rfnd_failed_${Date.now()}`;
    await applyRefundEventToTransaction({
      paymentId,
      refundId: failedRefundId,
      eventType: 'refund.failed',
      amountInPaise: 30000,
      failureReason: 'Card issuer network timeout',
    });

    tx = await PaymentTransaction.findOne({ razorpayPaymentId: paymentId });
    expect(tx!.refundedAmountInPaise).toBe(50000); // 50,000 preserved
    expect(tx!.refundStatus).toBe('partially_refunded');
    expect(tx!.refunds.length).toBe(2);

    const failedItem = tx!.refunds.find((r) => r.refundId === failedRefundId);
    expect(failedItem!.status).toBe('failed');
    expect(failedItem!.failureReason).toBe('Card issuer network timeout');
  });

  // ---------------------------------------------------------------------------
  // 5. Booking and Session Start Lifecycle Under Partial vs Full Refund
  // ---------------------------------------------------------------------------
  it('5. booking session lifecycle: partially refunded booking permits session start; fully refunded strictly prevents it', async () => {
    // Case A: Partially refunded booking
    const { booking: partialBooking, paymentId: partialPayId } =
      await seedCapturedBookingAndTransaction(100000);

    await applyRefundEventToTransaction({
      paymentId: partialPayId,
      refundId: `rfnd_partial_${Date.now()}`,
      eventType: 'refund.processed',
      amountInPaise: 40000,
    });

    const refreshedPartialBooking = await Booking.findById(partialBooking._id);
    expect(refreshedPartialBooking!.paymentStatus).toBe('partially_refunded');

    // Atomic session start query simulates bookingController.startBookingSession
    const startedPartial = await Booking.findOneAndUpdate(
      {
        _id: partialBooking._id,
        coachId: coachUser._id,
        status: 'accepted',
        paymentStatus: { $in: ['paid', 'partially_refunded'] },
      },
      {
        $set: {
          status: 'in_progress',
          sessionStartedAt: new Date(),
          expectedEndedAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      },
      { new: true }
    );
    expect(startedPartial).not.toBeNull();
    expect(startedPartial!.status).toBe('in_progress');

    // Case B: Fully refunded booking
    const { booking: fullBooking, paymentId: fullPayId } =
      await seedCapturedBookingAndTransaction(100000);

    await applyRefundEventToTransaction({
      paymentId: fullPayId,
      refundId: `rfnd_full_${Date.now()}`,
      eventType: 'refund.processed',
      amountInPaise: 100000,
    });

    const refreshedFullBooking = await Booking.findById(fullBooking._id);
    expect(refreshedFullBooking!.paymentStatus).toBe('refunded');

    // Session start query must fail to find match
    const startedFull = await Booking.findOneAndUpdate(
      {
        _id: fullBooking._id,
        coachId: coachUser._id,
        status: 'accepted',
        paymentStatus: { $in: ['paid', 'partially_refunded'] },
      },
      {
        $set: {
          status: 'in_progress',
          sessionStartedAt: new Date(),
          expectedEndedAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      },
      { new: true }
    );
    expect(startedFull).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 6. Real Replica-Set Authoritative Gateway Reconciliation
  // ---------------------------------------------------------------------------
  it('6. reconciles payment with authoritative gateway and recovers missing refund records on replica set', async () => {
    const { booking, paymentId, orderId } = await seedCapturedBookingAndTransaction(100000); // ₹1,000

    vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
      id: paymentId,
      entity: 'payment',
      amount: 100000,
      currency: 'INR',
      status: 'captured',
      order_id: orderId,
      amount_refunded: 40000,
      refund_status: 'partial',
    });

    vi.spyOn(razorpayService, 'fetchRazorpayPaymentRefunds').mockResolvedValue([
      {
        id: `rfnd_repl_recon_${Date.now()}`,
        entity: 'refund',
        amount: 40000,
        currency: 'INR',
        payment_id: paymentId,
        status: 'processed',
        created_at: Math.floor(Date.now() / 1000),
      },
    ]);

    const result = await reconcilePaymentWithGateway(paymentId);

    expect(result.localRefundedAmountInPaise).toBe(40000);
    expect(result.gatewayRefundedAmountInPaise).toBe(40000);
    expect(result.hasDiscrepancy).toBe(false);
    expect(result.hasExcessRefundAlert).toBe(false);

    // Verify persisted state in replica set
    const freshTx = await PaymentTransaction.findOne({ razorpayPaymentId: paymentId });
    expect(freshTx!.refundedAmountInPaise).toBe(40000);
    expect(freshTx!.refundStatus).toBe('partially_refunded');
    expect(freshTx!.refunds.length).toBe(1);
    expect(freshTx!.gatewayAmountRefundedInPaise).toBe(40000);
    expect(freshTx!.gatewayRefundStatus).toBe('partial');
    expect(freshTx!.lastReconciledAt).toBeDefined();

    const freshBooking = await Booking.findById(booking._id);
    expect(freshBooking!.paymentStatus).toBe('partially_refunded');
    expect(freshBooking!.refundStatus).toBe('partially_refunded');
  });

  // ---------------------------------------------------------------------------
  // 7. Concurrent Webhook Delivery & Manual Gateway Reconciliation Concurrency
  // ---------------------------------------------------------------------------
  it('7. safely handles concurrent webhook delivery and manual reconciliation on real replica set without race conditions', async () => {
    const { booking, paymentId, orderId } = await seedCapturedBookingAndTransaction(100000); // ₹1,000

    const webhookRefundId = `rfnd_async_webhook_${Date.now()}`;
    const gatewayOnlyRefundId = `rfnd_gw_only_${Date.now()}`;

    vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
      id: paymentId,
      entity: 'payment',
      amount: 100000,
      currency: 'INR',
      status: 'captured',
      order_id: orderId,
      amount_refunded: 50000,
      refund_status: 'partial',
    });

    vi.spyOn(razorpayService, 'fetchRazorpayPaymentRefunds').mockResolvedValue([
      {
        id: webhookRefundId,
        entity: 'refund',
        amount: 30000,
        currency: 'INR',
        payment_id: paymentId,
        status: 'processed',
        created_at: Math.floor(Date.now() / 1000),
      },
      {
        id: gatewayOnlyRefundId,
        entity: 'refund',
        amount: 20000,
        currency: 'INR',
        payment_id: paymentId,
        status: 'processed',
        created_at: Math.floor(Date.now() / 1000),
      },
    ]);

    // Concurrently trigger webhook delivery and reconciliation
    const [webhookRes, reconRes] = await Promise.all([
      applyRefundEventToTransaction({
        paymentId,
        refundId: webhookRefundId,
        eventType: 'refund.processed',
        amountInPaise: 30000,
      }),
      reconcilePaymentWithGateway(paymentId),
    ]);

    // Either webhook or reconciliation can commit first; if reconciliation committed first,
    // webhook detects the refund is already recorded as processed (isDuplicate = true).
    // In all concurrent outcomes, both distinct refund IDs are safely recorded without double-counting.
    expect([true, false]).toContain(webhookRes.isDuplicate);
    expect(reconRes.hasDiscrepancy).toBe(false);

    // Verify final state on replica set: both refunds preserved, cumulative total is 50,000
    const freshTx = await PaymentTransaction.findOne({ razorpayPaymentId: paymentId });
    expect(freshTx!.refundedAmountInPaise).toBe(50000);
    expect(freshTx!.refunds.length).toBe(2);

    const recordedRefundIds = freshTx!.refunds.map((r) => r.refundId);
    expect(recordedRefundIds).toContain(webhookRefundId);
    expect(recordedRefundIds).toContain(gatewayOnlyRefundId);

    const freshBooking = await Booking.findById(booking._id);
    expect(freshBooking!.paymentStatus).toBe('partially_refunded');
  });
});
