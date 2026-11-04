import { Request, Response, NextFunction } from 'express';
import mongoose, { ClientSession } from 'mongoose';
import { Booking, serializeBookingForUser } from '../models/Booking';
import { PaymentTransaction, IPaymentTransactionDocument } from '../models/PaymentTransaction';
import { CoachProfile } from '../models/CoachProfile';
import { WebhookEvent } from '../models/WebhookEvent';
import { config } from '../config/env';
import {
  calculatePaymentBreakdown,
  createRazorpayOrder,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
  fetchRazorpayPayment,
  fetchRazorpayPaymentRefunds,
  RazorpayPaymentEntity,
  RazorpayRefundEntity,
} from '../services/razorpayService';

/**
 * Create a Razorpay Test Order for an accepted, unpaid booking.
 * POST /api/payments/create-order
 * Protected: 'parent', 'individual'.
 */
export async function createPaymentOrder(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const { bookingId } = req.body || {};
    if (!bookingId || typeof bookingId !== 'string' || !mongoose.Types.ObjectId.isValid(bookingId.trim())) {
      return res.status(400).json({ error: 'Valid bookingId is required.' });
    }

    const cleanBookingId = bookingId.trim();
    const booking = await Booking.findById(cleanBookingId);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    // Ownership check: Customer who created the booking only
    const customerIdStr = (booking.customerId?._id || booking.customerId).toString();
    if (customerIdStr !== req.user.id) {
      return res.status(403).json({
        error: 'Access forbidden. You can only create payment orders for your own bookings.',
      });
    }

    let sessionCount = 1;
    let packageBookings: any[] = [];
    if (booking.packageGroupId) {
      packageBookings = await Booking.find({ packageGroupId: booking.packageGroupId }).sort({
        packageSessionIndex: 1,
      });
      sessionCount = packageBookings.length || 1;

      // Lifecycle check for package: all sessions must be accepted
      const hasPending = packageBookings.some((b) => b.status === 'pending');
      if (hasPending) {
        return res.status(400).json({
          error: 'Cannot initiate payment for a pending package. Please wait for the coach to accept your request.',
        });
      }

      const invalidStatusBooking = packageBookings.find((b) => b.status !== 'accepted');
      if (invalidStatusBooking) {
        return res.status(400).json({
          error: `Cannot initiate payment for package with status "${invalidStatusBooking.status}". Only accepted packages can be paid.`,
        });
      }

      const alreadyPaid = packageBookings.every(
        (b) => b.paymentStatus === 'paid' || b.paymentStatus === 'partially_refunded'
      );
      if (alreadyPaid) {
        return res.status(400).json({
          error: 'This package has already been paid.',
        });
      }

      const allRefunded = packageBookings.every((b) => b.paymentStatus === 'refunded');
      if (allRefunded) {
        return res.status(400).json({
          error: 'This package was refunded. Please request a new package.',
          code: 'BOOKING_REFUNDED',
        });
      }
    } else {
      // Lifecycle check: Single booking must be accepted
      if (booking.status === 'pending') {
        return res.status(400).json({
          error: 'Cannot initiate payment for a pending booking. Please wait for the coach to accept your request.',
        });
      }

      if (booking.status !== 'accepted') {
        return res.status(400).json({
          error: `Cannot initiate payment for booking with status "${booking.status}". Only accepted bookings can be paid.`,
        });
      }

      // Payment state check
      if (booking.paymentStatus === 'paid' || booking.paymentStatus === 'partially_refunded') {
        return res.status(400).json({
          error: 'This booking has already been paid.',
        });
      }

      if (booking.paymentStatus === 'refunded') {
        return res.status(400).json({
          error: 'This booking was refunded. Please request a new booking session.',
          code: 'BOOKING_REFUNDED',
        });
      }
    }

    // Payment window expiration check
    if (booking.paymentDueAt && new Date() > new Date(booking.paymentDueAt)) {
      // Safely transition overdue unpaid booking(s) to cancelled
      if (booking.packageGroupId) {
        await Booking.updateMany(
          {
            packageGroupId: booking.packageGroupId,
            status: 'accepted',
            paymentStatus: 'unpaid',
          },
          {
            $set: {
              status: 'cancelled',
              cancellationReason: 'Payment window expired before completion.',
              cancelledBy: 'customer',
            },
          }
        );
      } else {
        await Booking.updateOne(
          {
            _id: booking._id,
            status: 'accepted',
            paymentStatus: 'unpaid',
          },
          {
            $set: {
              status: 'cancelled',
              cancellationReason: 'Payment window expired before completion.',
              cancelledBy: 'customer',
            },
          }
        );
      }

      return res.status(400).json({
        error: 'The payment window for this booking has expired. The booking has been cancelled.',
        code: 'PAYMENT_EXPIRED',
      });
    }

    // Check for existing active (unexpired) order for this booking / package
    const existingTx = await PaymentTransaction.findOne({
      $or: [
        { bookingId: booking._id },
        ...(booking.packageGroupId ? [{ packageGroupId: booking.packageGroupId }] : []),
      ],
      status: 'created',
      orderExpiresAt: { $gt: new Date() },
    });

    if (existingTx) {
      // Reuse existing active order to prevent duplicates
      return res.status(200).json({
        orderId: existingTx.razorpayOrderId,
        amount: existingTx.totalCustomerPayable,
        amountInPaise: existingTx.amountInPaise,
        currency: existingTx.currency,
        keyId: config.RAZORPAY_KEY_ID,
        ...(booking.packageGroupId ? {
          packageType: existingTx.packageType || booking.packageType || 'single',
          sessionCount: existingTx.sessionCount || sessionCount,
        } : {}),
        breakdown: {
          coachingFee: existingTx.baseSessionFee,
          ...(booking.packageGroupId ? {
            sessionCount: existingTx.sessionCount || sessionCount,
          } : {}),
          taxAmount: existingTx.taxAmount,
          taxRatePercentage: existingTx.taxRatePercentage,
          taxLabel:
            existingTx.taxRatePercentage > 0
              ? `Demonstration Tax Estimate (${existingTx.taxRatePercentage}% - Sandbox Test Mode)`
              : 'Taxes & Levies (0% Sandbox Mode)',
          totalPayable: existingTx.totalCustomerPayable,
        },
        paymentDueAt: booking.paymentDueAt,
        message: 'Active payment order retrieved.',
      });
    }

    // Resolve coach hourly rate
    let hourlyRate = booking.hourlyRateSnapshot;
    if (typeof hourlyRate !== 'number' || hourlyRate <= 0) {
      const coachProfile = await CoachProfile.findOne({ userId: booking.coachId });
      hourlyRate = coachProfile?.hourlyRate || 1000;
    }

    const durationMinutes = booking.durationMinutes || 60;
    const breakdown = calculatePaymentBreakdown({
      hourlyRate,
      durationMinutes,
      sessionCount,
      taxRatePercentage: config.TAX_RATE_PERCENTAGE,
    });

    // Create Razorpay Test Order directly with payment gateway
    const receiptPrefix = booking.packageGroupId ? 'pkg' : 'rcpt';
    const idPrefix = booking.packageGroupId
      ? booking.packageGroupId.toString().substring(0, 8)
      : booking._id.toString().substring(0, 10);
    const receipt = `${receiptPrefix}_${idPrefix}_${Date.now()}`;

    let razorpayOrder;
    try {
      razorpayOrder = await createRazorpayOrder({
        amountInPaise: breakdown.amountInPaise,
        currency: 'INR',
        receipt,
        notes: {
          bookingId: booking._id.toString(),
          packageGroupId: booking.packageGroupId ? booking.packageGroupId.toString() : '',
          packageType: booking.packageType || 'single',
          sessionCount: String(sessionCount),
          customerId: req.user.id,
          coachId: booking.coachId.toString(),
        },
      });
    } catch (orderErr: any) {
      return res.status(502).json({
        error: `Payment gateway order initialization failed: ${orderErr?.message || 'Gateway error'}`,
        code: 'GATEWAY_ERROR',
      });
    }

    // Persist internal financial transaction record (storing 20% commission & 80% coach allocation)
    const orderExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins order validity
    const transaction = new PaymentTransaction({
      bookingId: booking._id,
      packageGroupId: booking.packageGroupId,
      packageType: booking.packageType || 'single',
      sessionCount,
      customerId: booking.customerId,
      coachId: booking.coachId,
      currency: 'INR',
      hourlyRate: breakdown.hourlyRate,
      durationMinutes: breakdown.durationMinutes,
      baseSessionFee: breakdown.baseSessionFee,
      platformCommission: breakdown.platformCommission, // 20%
      coachAllocation: breakdown.coachAllocation,       // 80%
      taxRatePercentage: breakdown.taxRatePercentage,
      taxAmount: breakdown.taxAmount,
      totalCustomerPayable: breakdown.totalCustomerPayable,
      amountInPaise: breakdown.amountInPaise,
      razorpayOrderId: razorpayOrder.id,
      status: 'created',
      payoutStatus: 'unsettled',
      orderExpiresAt,
    });

    await transaction.save();

    // Link transaction reference to booking (or all package bookings)
    if (booking.packageGroupId) {
      await Booking.updateMany(
        { packageGroupId: booking.packageGroupId },
        { $set: { paymentTransactionId: transaction._id } }
      );
    } else {
      booking.paymentTransactionId = transaction._id;
      await booking.save();
    }

    // Customer-facing response strictly shows: coaching fee, tax, and total payable
    return res.status(201).json({
      orderId: razorpayOrder.id,
      amount: breakdown.totalCustomerPayable,
      amountInPaise: breakdown.amountInPaise,
      currency: 'INR',
      keyId: config.RAZORPAY_KEY_ID,
      ...(booking.packageGroupId ? {
        packageType: booking.packageType || 'single',
        sessionCount,
      } : {}),
      breakdown: {
        coachingFee: breakdown.baseSessionFee,
        ...(booking.packageGroupId ? {
          sessionCount: breakdown.sessionCount,
          perSessionFee: breakdown.perSessionFee,
        } : {}),
        taxAmount: breakdown.taxAmount,
        taxRatePercentage: breakdown.taxRatePercentage,
        taxLabel: breakdown.taxLabel,
        totalPayable: breakdown.totalCustomerPayable,
      },
      paymentDueAt: booking.paymentDueAt,
      message: 'Payment order created successfully.',
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Verify Razorpay payment signature and confirm payment on backend.
 * POST /api/payments/verify-signature
 * Protected: 'parent', 'individual'.
 */
export async function verifyPaymentSignature(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

    if (!bookingId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        error: 'Missing required payment verification parameters: bookingId, razorpay_order_id, razorpay_payment_id, and razorpay_signature are all required.',
      });
    }

    const cleanBookingId = String(bookingId).trim();
    const cleanOrderId = String(razorpay_order_id).trim();
    const cleanPaymentId = String(razorpay_payment_id).trim();
    const cleanSignature = String(razorpay_signature).trim();

    if (!mongoose.Types.ObjectId.isValid(cleanBookingId)) {
      return res.status(400).json({ error: 'Invalid bookingId format.' });
    }

    const booking = await Booking.findById(cleanBookingId)
      .populate('customerId', 'name')
      .populate('coachId', 'name');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    // Ownership check: Authenticated customer only
    const customerIdStr = (booking.customerId?._id || booking.customerId).toString();
    if (customerIdStr !== req.user.id) {
      return res.status(403).json({
        error: 'Access forbidden. You can only verify payments for your own bookings.',
      });
    }

    // Lifecycle check
    if (booking.status !== 'accepted') {
      return res.status(400).json({
        error: `Cannot verify payment for booking with status "${booking.status}". Only accepted bookings can be confirmed.`,
      });
    }

    // Find matching transaction by booking/package and order ID
    const transaction = await PaymentTransaction.findOne({
      $or: [
        { bookingId: booking._id },
        ...(booking.packageGroupId ? [{ packageGroupId: booking.packageGroupId }] : []),
      ],
      razorpayOrderId: cleanOrderId,
    });

    if (!transaction) {
      return res.status(404).json({
        error: 'Payment order record not found for this booking and order ID.',
      });
    }

    // Idempotency: If already captured and booking is paid or partially refunded, return success immediately
    if (
      transaction.status === 'captured' &&
      (booking.paymentStatus === 'paid' || booking.paymentStatus === 'partially_refunded')
    ) {
      const serialized = serializeBookingForUser(booking, req.user.id, req.user.role);
      return res.status(200).json({
        success: true,
        message: 'Payment has already been verified and recorded.',
        booking: serialized,
      });
    }

    // Refund guard: Fully refunded transactions can never be verified or captured
    if (transaction.status === 'refunded' || booking.paymentStatus === 'refunded') {
      return res.status(400).json({
        error: 'This payment transaction has been refunded and cannot be confirmed.',
        code: 'PAYMENT_REFUNDED',
      });
    }

    // Strict order ID cross-check against stored transaction
    if (cleanOrderId !== transaction.razorpayOrderId) {
      return res.status(400).json({
        error: 'Order ID mismatch between request and stored transaction.',
        code: 'ORDER_ID_MISMATCH',
      });
    }

    // Strict cryptographic signature verification using HMAC-SHA256 & timingSafeEqual
    // NO bypasses: Every signature must be mathematically valid with RAZORPAY_KEY_SECRET
    const isValidSignature = verifyRazorpaySignature({
      orderId: transaction.razorpayOrderId,
      paymentId: cleanPaymentId,
      signature: cleanSignature,
    });

    if (!isValidSignature) {
      transaction.status = 'failed';
      transaction.failureReason = 'Invalid cryptographic signature verification failure';
      await transaction.save();

      return res.status(400).json({
        error: 'Invalid payment signature. Payment verification failed.',
        code: 'INVALID_SIGNATURE',
      });
    }

    // Strict Razorpay Payment Entity Verification with gateway REST API
    let paymentDetails: RazorpayPaymentEntity | null;
    try {
      paymentDetails = await fetchRazorpayPayment(cleanPaymentId);
    } catch (fetchErr: any) {
      return res.status(502).json({
        error: `Unable to verify payment status with payment gateway: ${fetchErr?.message || 'Gateway unreachable'}`,
        code: 'GATEWAY_ERROR',
      });
    }

    if (!paymentDetails) {
      transaction.status = 'failed';
      transaction.failureReason = 'Payment entity not found at gateway';
      await transaction.save();

      return res.status(400).json({
        error: 'Payment entity not found at payment gateway.',
        code: 'PAYMENT_NOT_FOUND',
      });
    }

    // Verify payment ID matches expected payment
    if (paymentDetails.id !== cleanPaymentId) {
      transaction.status = 'failed';
      transaction.failureReason = `Payment ID mismatch: expected ${cleanPaymentId}, got ${paymentDetails.id}`;
      await transaction.save();

      return res.status(400).json({
        error: 'Payment ID mismatch between gateway response and client request.',
        code: 'PAYMENT_ID_MISMATCH',
      });
    }

    // Verify payment.order_id matches the stored Razorpay order ID
    if (paymentDetails.order_id !== transaction.razorpayOrderId) {
      transaction.status = 'failed';
      transaction.failureReason = `Gateway payment order_id mismatch: expected ${transaction.razorpayOrderId}, got ${paymentDetails.order_id}`;
      await transaction.save();

      return res.status(400).json({
        error: 'Payment does not match the expected order ID.',
        code: 'ORDER_ID_MISMATCH',
      });
    }

    // Verify payment.amount exactly matches transaction.amountInPaise
    if (paymentDetails.amount !== transaction.amountInPaise) {
      transaction.status = 'failed';
      transaction.failureReason = `Gateway payment amount mismatch: expected ${transaction.amountInPaise}, got ${paymentDetails.amount}`;
      await transaction.save();

      return res.status(400).json({
        error: 'Payment amount mismatch between gateway and transaction.',
        code: 'AMOUNT_MISMATCH',
      });
    }

    // Verify payment.currency matches INR
    if (paymentDetails.currency !== 'INR') {
      transaction.status = 'failed';
      transaction.failureReason = `Gateway payment currency mismatch: expected INR, got ${paymentDetails.currency}`;
      await transaction.save();

      return res.status(400).json({
        error: 'Payment currency mismatch: only INR is supported.',
        code: 'CURRENCY_MISMATCH',
      });
    }

    // Verify payment status is genuinely captured
    if (paymentDetails.status !== 'captured') {
      if (paymentDetails.status === 'failed') {
        transaction.status = 'failed';
        transaction.failureReason = paymentDetails.error_description || 'Gateway reported payment failure';
        await transaction.save();

        return res.status(400).json({
          error: 'Payment failed at the gateway.',
          code: 'PAYMENT_FAILED',
        });
      }

      if (paymentDetails.status === 'authorized') {
        transaction.status = 'authorized';
        transaction.failureReason = 'Payment is authorized but not yet captured by gateway';
        await transaction.save();

        return res.status(400).json({
          error: 'Payment is authorized but capture is pending. Booking will confirm upon capture.',
          code: 'PAYMENT_NOT_CAPTURED',
        });
      }

      return res.status(400).json({
        error: `Payment is in status "${paymentDetails.status}" and has not been captured.`,
        code: 'PAYMENT_NOT_CAPTURED',
      });
    }

    // Atomic update of transaction status: strictly prevents double capture or race conditions
    const paidAt = new Date();
    const updatedTx = await PaymentTransaction.findOneAndUpdate(
      {
        _id: transaction._id,
        status: { $in: ['created', 'attempted', 'authorized'] },
      },
      {
        $set: {
          status: 'captured',
          razorpayPaymentId: cleanPaymentId,
          razorpaySignature: cleanSignature,
          paidAt,
          payoutStatus: 'simulated_held',
        },
      },
      { new: true }
    );

    if (!updatedTx && transaction.status !== 'captured') {
      // Another worker or webhook already updated state
      const currentTx = await PaymentTransaction.findById(transaction._id);
      if (currentTx?.status !== 'captured') {
        return res.status(400).json({
          error: 'Payment transaction is no longer in a valid state to be captured.',
          code: 'INVALID_TRANSACTION_STATE',
        });
      }
    }

    // Atomic conditional booking transition: strictly requires status 'accepted'
    if (transaction.packageGroupId) {
      await Booking.updateMany(
        {
          packageGroupId: transaction.packageGroupId,
          status: 'accepted',
        },
        {
          $set: {
            paymentStatus: 'paid',
            paymentTransactionId: transaction._id,
          },
        }
      );
    }

    const updatedBooking = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        status: 'accepted',
      },
      {
        $set: {
          paymentStatus: 'paid',
          paymentTransactionId: transaction._id,
        },
      },
      { new: true }
    )
      .populate('customerId', 'name')
      .populate('coachId', 'name');

    if (!updatedBooking) {
      // Booking state changed concurrently (e.g. cancelled while paying)
      const current = await Booking.findById(cleanBookingId);
      return res.status(400).json({
        error: `Cannot confirm payment: booking is in status "${current?.status || 'unknown'}".`,
      });
    }

    const serialized = serializeBookingForUser(updatedBooking, req.user.id, req.user.role);

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully. Booking is now confirmed.',
      booking: serialized,
      transaction: {
        id: transaction._id,
        orderId: transaction.razorpayOrderId,
        paymentId: cleanPaymentId,
        amount: transaction.totalCustomerPayable,
        status: 'captured',
        paidAt,
      },
    });
  } catch (error) {
    return next(error);
  }
}

export interface ApplyRefundResult {
  transaction: IPaymentTransactionDocument | null;
  isExcess: boolean;
  isDuplicate: boolean;
  excessReason?: string;
}

/**
 * Concurrently safe, atomic refund application supporting replica-set transactions
 * and optimistic concurrency conflict retries.
 * Enforces maximum refund bounds (cumulative <= amountInPaise).
 */
export async function applyRefundEventToTransaction(params: {
  paymentId: string;
  refundId: string;
  eventType: 'refund.created' | 'refund.processed' | 'refund.failed';
  amountInPaise: number;
  createdAt?: Date;
  failureReason?: string;
}): Promise<ApplyRefundResult> {
  const { paymentId, refundId, eventType, amountInPaise, createdAt, failureReason } = params;

  for (let attempt = 1; attempt <= 5; attempt++) {
    let session: ClientSession | null = null;
    let canUseTransactions = false;

    if (mongoose.connection.readyState === 1) {
      try {
        session = await mongoose.startSession();
        canUseTransactions = true;
      } catch {
        session = null;
        canUseTransactions = false;
      }
    }

    try {
      let result: ApplyRefundResult = {
        transaction: null,
        isExcess: false,
        isDuplicate: false,
      };

      const executeMutation = async (currentSession?: ClientSession) => {
        const query = PaymentTransaction.findOne({ razorpayPaymentId: paymentId });
        if (currentSession) query.session(currentSession);
        const transaction = await query;

        if (!transaction) {
          result = { transaction: null, isExcess: false, isDuplicate: false };
          return;
        }

        transaction.refunds = transaction.refunds || [];
        const existingRefund = transaction.refunds.find((r) => r.refundId === refundId);

        // 1. refund.created
        if (eventType === 'refund.created') {
          // Delayed created event must never overwrite an already processed refund
          if (existingRefund && existingRefund.status === 'processed') {
            result = { transaction, isExcess: false, isDuplicate: true };
            return;
          }

          if (existingRefund) {
            existingRefund.status = 'pending';
            existingRefund.amountInPaise = amountInPaise;
          } else {
            transaction.refunds.push({
              refundId,
              amountInPaise,
              status: 'pending',
              createdAt: createdAt || new Date(),
            });
          }

          if (
            transaction.refundStatus !== 'partially_refunded' &&
            transaction.refundStatus !== 'processed'
          ) {
            transaction.refundStatus = 'pending';
          }

          await transaction.save({ session: currentSession });

          if (transaction.bookingId) {
            const bQuery = Booking.updateOne(
              { _id: transaction.bookingId, paymentStatus: { $ne: 'refunded' } },
              { $set: { refundStatus: transaction.refundStatus } }
            );
            if (currentSession) bQuery.session(currentSession);
            await bQuery;
          }

          result = { transaction, isExcess: false, isDuplicate: false };
          return;
        }

        // 2. refund.processed
        if (eventType === 'refund.processed') {
          // Deduplication: already processed
          if (existingRefund && existingRefund.status === 'processed') {
            result = {
              transaction,
              isExcess: Boolean(transaction.hasExcessRefundAlert),
              isDuplicate: true,
              excessReason: transaction.excessRefundReason,
            };
            return;
          }

          // Preserve gateway-confirmed refund fact as 'processed'
          if (existingRefund) {
            existingRefund.status = 'processed';
            existingRefund.amountInPaise = amountInPaise;
            existingRefund.processedAt = new Date();
            existingRefund.failureReason = undefined;
          } else {
            transaction.refunds.push({
              refundId,
              amountInPaise,
              status: 'processed',
              createdAt: createdAt || new Date(),
              processedAt: new Date(),
            });
          }

          // Cumulative successfully processed refund amount in integer paise
          // Must reflect actual gateway-confirmed amounts; NOT capped at amountInPaise
          const cumulativeRefundedPaise = transaction.refunds
            .filter((r) => r.status === 'processed')
            .reduce((sum, r) => sum + r.amountInPaise, 0);

          transaction.refundedAmountInPaise = cumulativeRefundedPaise;

          let isExcess = false;
          let excessReason: string | undefined;

          // Check if cumulative processed refunds exceed original payment
          if (cumulativeRefundedPaise > transaction.amountInPaise) {
            isExcess = true;
            const excessPaise = cumulativeRefundedPaise - transaction.amountInPaise;
            excessReason = `Excess refund discrepancy: cumulative processed refunds ₹${(cumulativeRefundedPaise / 100).toFixed(2)} exceed original payment ₹${(transaction.amountInPaise / 100).toFixed(2)} by ₹${(excessPaise / 100).toFixed(2)}`;

            transaction.hasExcessRefundAlert = true;
            transaction.excessRefundReason = excessReason;

            // Preserve full refund state for transaction and booking
            transaction.status = 'refunded';
            transaction.refundStatus = 'processed';
            transaction.payoutStatus = 'unsettled';
            transaction.refundedAt = transaction.refundedAt || new Date();

            await transaction.save({ session: currentSession });

            if (transaction.packageGroupId) {
              const bQuery = Booking.updateMany(
                { packageGroupId: transaction.packageGroupId },
                { $set: { paymentStatus: 'refunded', refundStatus: 'processed' } }
              );
              if (currentSession) bQuery.session(currentSession);
              await bQuery;
            } else if (transaction.bookingId) {
              const bQuery = Booking.updateOne(
                { _id: transaction.bookingId },
                { $set: { paymentStatus: 'refunded', refundStatus: 'processed' } }
              );
              if (currentSession) bQuery.session(currentSession);
              await bQuery;
            }
          } else if (cumulativeRefundedPaise === transaction.amountInPaise) {
            // Exact / full refund
            transaction.status = 'refunded';
            transaction.refundStatus = 'processed';
            transaction.payoutStatus = 'unsettled';
            transaction.refundedAt = transaction.refundedAt || new Date();

            await transaction.save({ session: currentSession });

            if (transaction.packageGroupId) {
              const bQuery = Booking.updateMany(
                { packageGroupId: transaction.packageGroupId },
                { $set: { paymentStatus: 'refunded', refundStatus: 'processed' } }
              );
              if (currentSession) bQuery.session(currentSession);
              await bQuery;
            } else if (transaction.bookingId) {
              const bQuery = Booking.updateOne(
                { _id: transaction.bookingId },
                { $set: { paymentStatus: 'refunded', refundStatus: 'processed' } }
              );
              if (currentSession) bQuery.session(currentSession);
              await bQuery;
            }
          } else {
            // Partial refund
            transaction.refundStatus = 'partially_refunded';
            await transaction.save({ session: currentSession });

            if (transaction.packageGroupId) {
              const bQuery = Booking.updateMany(
                { packageGroupId: transaction.packageGroupId },
                { $set: { paymentStatus: 'partially_refunded', refundStatus: 'partially_refunded' } }
              );
              if (currentSession) bQuery.session(currentSession);
              await bQuery;
            } else if (transaction.bookingId) {
              const bQuery = Booking.updateOne(
                { _id: transaction.bookingId },
                { $set: { paymentStatus: 'partially_refunded', refundStatus: 'partially_refunded' } }
              );
              if (currentSession) bQuery.session(currentSession);
              await bQuery;
            }
          }

          result = { transaction, isExcess, isDuplicate: false, excessReason };
          return;
        }

        // 3. refund.failed
        if (eventType === 'refund.failed') {
          // A failed refund event must not undo an already processed refund
          if (existingRefund && existingRefund.status === 'processed') {
            result = { transaction, isExcess: false, isDuplicate: true };
            return;
          }

          if (existingRefund) {
            existingRefund.status = 'failed';
            existingRefund.failureReason = failureReason || 'Refund failed at gateway';
          } else {
            transaction.refunds.push({
              refundId,
              amountInPaise: typeof amountInPaise === 'number' ? amountInPaise : 0,
              status: 'failed',
              createdAt: createdAt || new Date(),
              failureReason: failureReason || 'Refund failed at gateway',
            });
          }

          // Recalculate valid processed
          const cumulativeRefundedPaise = transaction.refunds
            .filter((r) => r.status === 'processed')
            .reduce((sum, r) => sum + r.amountInPaise, 0);

          transaction.refundedAmountInPaise = cumulativeRefundedPaise;

          if (cumulativeRefundedPaise >= transaction.amountInPaise) {
            transaction.refundStatus = 'processed';
            transaction.status = 'refunded';
          } else if (cumulativeRefundedPaise > 0) {
            transaction.refundStatus = 'partially_refunded';
          } else {
            transaction.refundStatus = 'failed';
          }

          await transaction.save({ session: currentSession });

          if (transaction.bookingId) {
            let bQuery;
            if (cumulativeRefundedPaise >= transaction.amountInPaise) {
              bQuery = Booking.updateOne(
                { _id: transaction.bookingId },
                { $set: { paymentStatus: 'refunded', refundStatus: 'processed' } }
              );
            } else if (cumulativeRefundedPaise > 0) {
              bQuery = Booking.updateOne(
                { _id: transaction.bookingId },
                { $set: { paymentStatus: 'partially_refunded', refundStatus: 'partially_refunded' } }
              );
            } else {
              bQuery = Booking.updateOne(
                { _id: transaction.bookingId },
                { $set: { refundStatus: 'failed' } }
              );
            }
            if (currentSession) bQuery.session(currentSession);
            await bQuery;
          }

          result = { transaction, isExcess: false, isDuplicate: false };
          return;
        }
      };

      if (session && canUseTransactions) {
        await session.withTransaction(async () => {
          await executeMutation(session);
        });
      } else {
        await executeMutation();
      }

      return result;
    } catch (err: any) {
      const isConflict =
        err.name === 'VersionError' ||
        err.code === 112 ||
        err.hasErrorLabel?.('TransientTransactionError');

      if (isConflict && attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
        continue;
      }
      throw err;
    } finally {
      if (session) {
        try {
          await session.endSession();
        } catch {
          // ignore session end error
        }
      }
    }
  }

  throw new Error(`Failed to apply refund event ${refundId} after 5 concurrency retry attempts.`);
}

/**
 * Handle Razorpay Webhooks.
 * POST /api/payments/webhook
 * Unauthenticated endpoint verified via X-Razorpay-Signature header.
 */
export async function handlePaymentWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature || typeof signature !== 'string') {
      return res.status(400).json({ error: 'Missing X-Razorpay-Signature header.' });
    }

    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const isValid = verifyRazorpayWebhookSignature({
      rawBody,
      signature: signature.trim(),
    });

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid webhook signature.' });
    }

    const event = req.body?.event;
    const payload = req.body?.payload;

    if (!event || !payload) {
      return res.status(400).json({ error: 'Malformed webhook payload.' });
    }

    // Provider event identifier deduplication & crash recovery
    const eventIdHeader = req.headers['x-razorpay-event-id'] as string | undefined;
    const eventIdBody = req.body?.id || req.body?.event_id;
    const paymentEntityId = payload.payment?.entity?.id;
    const orderEntityId = payload.order?.entity?.id || payload.payment?.entity?.order_id;
    const fallbackEventId = `${event}_${orderEntityId || ''}_${paymentEntityId || ''}_${req.body?.created_at || ''}`;
    const deduplicationKey = (eventIdHeader || eventIdBody || fallbackEventId).trim();

    if (deduplicationKey) {
      const existingEvent = await WebhookEvent.findOne({ eventId: deduplicationKey });
      if (existingEvent) {
        if (existingEvent.status === 'completed') {
          // Idempotent acknowledgement for completed event
          return res.status(200).json({ received: true, duplicate: true });
        }

        // Stale lease check: If event was marked processing > 60 seconds ago, previous worker crashed
        const isStale =
          Date.now() - new Date((existingEvent as any).updatedAt || existingEvent.createdAt).getTime() > 60 * 1000;
        if (existingEvent.status === 'processing' && !isStale) {
          // In-flight concurrency lock: ask provider to retry later
          return res.status(429).json({ error: 'Webhook event is currently processing.' });
        }

        // Re-lease event for recovery
        existingEvent.status = 'processing';
        existingEvent.error = undefined;
        await existingEvent.save();
      } else {
        try {
          await WebhookEvent.create({
            eventId: deduplicationKey,
            event,
            orderId: orderEntityId,
            paymentId: paymentEntityId,
            status: 'processing',
          });
        } catch (dupErr: any) {
          if (dupErr.code === 11000) {
            const recheck = await WebhookEvent.findOne({ eventId: deduplicationKey });
            if (recheck?.status === 'completed') {
              return res.status(200).json({ received: true, duplicate: true });
            }
            return res.status(429).json({ error: 'Concurrent event processing in progress.' });
          }
          throw dupErr;
        }
      }
    }

    try {
      // 1. Handle payment.captured
      if (event === 'payment.captured') {
        const paymentEntity = payload.payment?.entity;
        const orderId = paymentEntity?.order_id;
        const paymentId = paymentEntity?.id;
        const amount = paymentEntity?.amount;
        const currency = paymentEntity?.currency;

        if (orderId && paymentId) {
          const transaction = await PaymentTransaction.findOne({ razorpayOrderId: orderId });
          if (transaction) {
            // Verify amount and currency integrity
            if (amount === transaction.amountInPaise && currency === 'INR') {
              if (transaction.status !== 'captured' && transaction.status !== 'refunded') {
                await PaymentTransaction.updateOne(
                  { _id: transaction._id, status: { $nin: ['captured', 'refunded'] } },
                  {
                    $set: {
                      status: 'captured',
                      razorpayPaymentId: paymentId,
                      paidAt: new Date(),
                      payoutStatus: 'simulated_held',
                    },
                  }
                );

                if (transaction.packageGroupId) {
                  await Booking.updateMany(
                    { packageGroupId: transaction.packageGroupId, status: 'accepted', paymentStatus: { $ne: 'refunded' } },
                    { $set: { paymentStatus: 'paid', paymentTransactionId: transaction._id } }
                  );
                } else {
                  await Booking.updateOne(
                    { _id: transaction.bookingId, status: 'accepted', paymentStatus: { $ne: 'refunded' } },
                    { $set: { paymentStatus: 'paid', paymentTransactionId: transaction._id } }
                  );
                }
              }
            }
          }
        }
      }

      // 2. Handle order.paid (with payment entity validation)
      if (event === 'order.paid') {
        const orderEntity = payload.order?.entity;
        const orderId = orderEntity?.id;
        const amountPaid = orderEntity?.amount_paid;

        if (orderId) {
          const transaction = await PaymentTransaction.findOne({ razorpayOrderId: orderId });
          if (transaction && amountPaid === transaction.amountInPaise) {
            let paymentEntity = payload.payment?.entity;
            if (!paymentEntity && paymentEntityId) {
              try {
                paymentEntity = await fetchRazorpayPayment(paymentEntityId);
              } catch {
                // If gateway check fails, keep order unpaid; next retry will re-attempt
              }
            }

            if (
              paymentEntity &&
              paymentEntity.status === 'captured' &&
              paymentEntity.order_id === transaction.razorpayOrderId &&
              paymentEntity.amount === transaction.amountInPaise
            ) {
              if (transaction.status !== 'captured' && transaction.status !== 'refunded') {
                await PaymentTransaction.updateOne(
                  { _id: transaction._id, status: { $nin: ['captured', 'refunded'] } },
                  {
                    $set: {
                      status: 'captured',
                      razorpayPaymentId: paymentEntity.id,
                      paidAt: new Date(),
                      payoutStatus: 'simulated_held',
                    },
                  }
                );

                if (transaction.packageGroupId) {
                  await Booking.updateMany(
                    { packageGroupId: transaction.packageGroupId, status: 'accepted', paymentStatus: { $ne: 'refunded' } },
                    { $set: { paymentStatus: 'paid', paymentTransactionId: transaction._id } }
                  );
                } else {
                  await Booking.updateOne(
                    { _id: transaction.bookingId, status: 'accepted', paymentStatus: { $ne: 'refunded' } },
                    { $set: { paymentStatus: 'paid', paymentTransactionId: transaction._id } }
                  );
                }
              }
            }
          }
        }
      }

      // 3. Handle payment.failed
      if (event === 'payment.failed') {
        const paymentEntity = payload.payment?.entity;
        const orderId = paymentEntity?.order_id;
        if (orderId) {
          // Never overwrite a captured or refunded payment with a failed event
          await PaymentTransaction.updateOne(
            { razorpayOrderId: orderId, status: { $nin: ['captured', 'refunded'] } },
            {
              $set: {
                status: 'failed',
                failureReason: paymentEntity?.error_description || 'Payment failed at gateway',
              },
            }
          );
        }
      }

      // 4. Handle payment.authorized (never treat as captured)
      if (event === 'payment.authorized') {
        const paymentEntity = payload.payment?.entity;
        const orderId = paymentEntity?.order_id;
        if (orderId) {
          await PaymentTransaction.updateOne(
            { razorpayOrderId: orderId, status: { $nin: ['captured', 'refunded'] } },
            {
              $set: {
                status: 'authorized',
                failureReason: 'Payment authorized, awaiting capture confirmation',
              },
            }
          );
        }
      }

      // 5. Handle refund.created (Refund initiated / pending)
      if (event === 'refund.created') {
        const refundEntity = payload.refund?.entity;
        const refundId = refundEntity?.id;
        const paymentId = refundEntity?.payment_id;
        const refundAmount = refundEntity?.amount;

        if (paymentId && refundId && typeof refundAmount === 'number' && refundAmount > 0) {
          await applyRefundEventToTransaction({
            paymentId,
            refundId,
            eventType: 'refund.created',
            amountInPaise: refundAmount,
            createdAt: refundEntity.created_at ? new Date(refundEntity.created_at * 1000) : new Date(),
          });
        }
      }

      // 6. Handle refund.processed (Refund successfully executed)
      if (event === 'refund.processed') {
        const refundEntity = payload.refund?.entity;
        const refundId = refundEntity?.id;
        const paymentId = refundEntity?.payment_id;
        const refundAmount = refundEntity?.amount;

        if (paymentId && refundId && typeof refundAmount === 'number' && refundAmount > 0) {
          await applyRefundEventToTransaction({
            paymentId,
            refundId,
            eventType: 'refund.processed',
            amountInPaise: refundAmount,
            createdAt: refundEntity.created_at ? new Date(refundEntity.created_at * 1000) : new Date(),
          });
        }
      }

      // 7. Handle refund.failed (Refund attempt failed at gateway)
      if (event === 'refund.failed') {
        const refundEntity = payload.refund?.entity;
        const refundId = refundEntity?.id;
        const paymentId = refundEntity?.payment_id;
        const refundAmount = refundEntity?.amount;
        const failureReason =
          refundEntity?.error_description || refundEntity?.error_code || 'Refund failed at gateway';

        if (paymentId && refundId) {
          await applyRefundEventToTransaction({
            paymentId,
            refundId,
            eventType: 'refund.failed',
            amountInPaise: typeof refundAmount === 'number' ? refundAmount : 0,
            createdAt: refundEntity.created_at ? new Date(refundEntity.created_at * 1000) : new Date(),
            failureReason,
          });
        }
      }

      // Mark webhook event completed upon successful execution
      if (deduplicationKey) {
        await WebhookEvent.updateOne(
          { eventId: deduplicationKey },
          { $set: { status: 'completed', processedAt: new Date() } }
        );
      }

      // Acknowledge receipt to Razorpay immediately
      return res.status(200).json({ received: true });
    } catch (procError: any) {
      // Mark webhook event failed to permit safe recovery on retry
      if (deduplicationKey) {
        await WebhookEvent.updateOne(
          { eventId: deduplicationKey },
          { $set: { status: 'failed', error: procError?.message } }
        );
      }
      throw procError;
    }
  } catch (error) {
    return next(error);
  }
}

/**
 * Get payment status and breakdown for a specific booking.
 * GET /api/payments/booking/:bookingId
 * Protected: 'parent', 'individual', 'coach', 'admin'.
 */
export async function getBookingPaymentStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const { bookingId } = req.params;
    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId.trim())) {
      return res.status(400).json({ error: 'Invalid bookingId.' });
    }

    const cleanBookingId = bookingId.trim();
    const booking = await Booking.findById(cleanBookingId);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const customerIdStr = (booking.customerId?._id || booking.customerId).toString();
    const coachIdStr = (booking.coachId?._id || booking.coachId).toString();
    const isCustomer = req.user.id === customerIdStr;
    const isCoach = req.user.id === coachIdStr;
    const isAdmin = req.user.role === 'admin';

    if (!isCustomer && !isCoach && !isAdmin) {
      return res.status(403).json({
        error: 'Access forbidden. You are not authorized to view payment details for this booking.',
      });
    }

    const transaction = await PaymentTransaction.findOne({
      $or: [
        { bookingId: booking._id },
        ...(booking.packageGroupId ? [{ packageGroupId: booking.packageGroupId }] : []),
      ],
    }).sort({ createdAt: -1 });

    // Customer view: coaching fee, tax, total, status, refund details
    if (isCustomer) {
      return res.status(200).json({
        bookingId: booking._id,
        paymentStatus: booking.paymentStatus,
        refundStatus: booking.refundStatus || transaction?.refundStatus || 'none',
        paymentDueAt: booking.paymentDueAt,
        packageType: transaction?.packageType || booking.packageType || 'single',
        sessionCount: transaction?.sessionCount || booking.packageSessionCount || 1,
        transaction: transaction
          ? {
              orderId: transaction.razorpayOrderId,
              paymentId: transaction.razorpayPaymentId,
              status: transaction.status,
              refundStatus: transaction.refundStatus,
              refundedAmount: transaction.refundedAmountInPaise ? transaction.refundedAmountInPaise / 100 : 0,
              coachingFee: transaction.baseSessionFee,
              sessionCount: transaction.sessionCount || 1,
              taxAmount: transaction.taxAmount,
              taxRatePercentage: transaction.taxRatePercentage,
              totalAmount: transaction.totalCustomerPayable,
              currency: transaction.currency,
              paidAt: transaction.paidAt,
              refundedAt: transaction.refundedAt,
            }
          : null,
      });
    }

    // Coach view: coaching fee, coach allocation (80%), payment status
    if (isCoach) {
      return res.status(200).json({
        bookingId: booking._id,
        paymentStatus: booking.paymentStatus,
        refundStatus: booking.refundStatus || transaction?.refundStatus || 'none',
        coachAllocation: transaction?.coachAllocation || null,
        coachingFee: transaction?.baseSessionFee || null,
        currency: transaction?.currency || 'INR',
        paidAt: transaction?.paidAt || null,
      });
    }

    // Admin view: complete financial ledger (commission 20%, coach allocation 80%, tax, refunds)
    return res.status(200).json({
      bookingId: booking._id,
      paymentStatus: booking.paymentStatus,
      refundStatus: booking.refundStatus || transaction?.refundStatus || 'none',
      paymentDueAt: booking.paymentDueAt,
      ledger: transaction
        ? {
            transactionId: transaction._id,
            orderId: transaction.razorpayOrderId,
            paymentId: transaction.razorpayPaymentId,
            status: transaction.status,
            refundStatus: transaction.refundStatus,
            refundedAmountInPaise: transaction.refundedAmountInPaise,
            refunds: transaction.refunds || [],
            hasExcessRefundAlert: Boolean(transaction.hasExcessRefundAlert),
            excessRefundReason: transaction.excessRefundReason || null,
            gatewayAmountRefundedInPaise: transaction.gatewayAmountRefundedInPaise ?? null,
            gatewayRefundStatus: transaction.gatewayRefundStatus || null,
            hasReconciliationDiscrepancy: Boolean(transaction.hasReconciliationDiscrepancy),
            reconciliationDiscrepancyReason: transaction.reconciliationDiscrepancyReason || null,
            lastReconciledAt: transaction.lastReconciledAt || null,
            payoutStatus: transaction.payoutStatus,
            baseSessionFee: transaction.baseSessionFee,
            platformCommission: transaction.platformCommission, // 20%
            coachAllocation: transaction.coachAllocation,       // 80%
            taxAmount: transaction.taxAmount,
            taxRatePercentage: transaction.taxRatePercentage,
            totalCustomerPayable: transaction.totalCustomerPayable,
            currency: transaction.currency,
            paidAt: transaction.paidAt,
            refundedAt: transaction.refundedAt,
            createdAt: transaction.createdAt,
          }
        : null,
    });
  } catch (error) {
    return next(error);
  }
}

export interface ReconciliationResult {
  paymentId: string;
  orderId: string;
  localAmountInPaise: number;
  gatewayAmountInPaise: number;
  localRefundedAmountInPaise: number;
  gatewayRefundedAmountInPaise: number;
  gatewayRefundStatus: string | null;
  reconciledRefundsCount: number;
  hasDiscrepancy: boolean;
  discrepancyReason?: string;
  hasExcessRefundAlert: boolean;
  excessRefundReason?: string;
  transaction: IPaymentTransactionDocument;
}

/**
 * Authoritative gateway-to-local refund reconciliation service.
 * Fetches the authoritative Razorpay payment entity and refunds collection,
 * validates against local captured transaction, reconciles missing records idempotently,
 * and raises alerts for discrepancies without corrupting financial facts.
 */
export async function reconcilePaymentWithGateway(paymentId: string): Promise<ReconciliationResult> {
  if (!paymentId || typeof paymentId !== 'string' || !paymentId.trim()) {
    throw new Error('Valid paymentId is required for gateway reconciliation.');
  }

  const cleanPaymentId = paymentId.trim();

  // 1. Find matching local captured PaymentTransaction
  const localTx = await PaymentTransaction.findOne({ razorpayPaymentId: cleanPaymentId });
  if (!localTx) {
    throw new Error(`No local payment transaction found for Razorpay payment ID: ${cleanPaymentId}`);
  }

  // 2. Fetch authoritative payment entity from Razorpay
  const gatewayPayment = await fetchRazorpayPayment(cleanPaymentId);
  if (!gatewayPayment) {
    throw new Error(`Payment entity not found at Razorpay gateway: ${cleanPaymentId}`);
  }

  // 3. Verify payment ID, currency, original amount and order association
  if (gatewayPayment.id !== cleanPaymentId) {
    throw new Error(`Gateway payment ID mismatch: expected ${cleanPaymentId}, got ${gatewayPayment.id}`);
  }

  if (gatewayPayment.currency !== 'INR') {
    throw new Error(`Gateway currency mismatch: expected INR, got ${gatewayPayment.currency}`);
  }

  if (gatewayPayment.order_id !== localTx.razorpayOrderId) {
    throw new Error(
      `Gateway order association mismatch: expected ${localTx.razorpayOrderId}, got ${gatewayPayment.order_id}`
    );
  }

  // 4. Read gateway amount_refunded and refund_status
  const gwAmountRefundedInPaise = gatewayPayment.amount_refunded || 0;
  const gwRefundStatus = gatewayPayment.refund_status || null;

  // 5. Retrieve gateway refund records for the payment using documented Refunds API
  const gatewayRefundRecords = await fetchRazorpayPaymentRefunds(cleanPaymentId);

  // Execute mutation with replica set transaction support & retry loop
  for (let attempt = 1; attempt <= 5; attempt++) {
    let session: ClientSession | null = null;
    let canUseTransactions = false;

    if (mongoose.connection.readyState === 1) {
      try {
        session = await mongoose.startSession();
        canUseTransactions = true;
      } catch {
        session = null;
        canUseTransactions = false;
      }
    }

    try {
      let finalResult!: ReconciliationResult;

      const executeReconciliation = async (currentSession?: ClientSession) => {
        const query = PaymentTransaction.findOne({ razorpayPaymentId: cleanPaymentId });
        if (currentSession) query.session(currentSession);
        const transaction = await query;

        if (!transaction) {
          throw new Error(`Payment transaction ${cleanPaymentId} was deleted during reconciliation.`);
        }

        // Amount verification: Flag discrepancy if original amount differs
        let hasDiscrepancy = false;
        let discrepancyReason: string | undefined;

        if (gatewayPayment.amount !== transaction.amountInPaise) {
          hasDiscrepancy = true;
          discrepancyReason = `Gateway captured amount ₹${(gatewayPayment.amount / 100).toFixed(2)} differs from local amount ₹${(transaction.amountInPaise / 100).toFixed(2)}`;
        }

        transaction.refunds = transaction.refunds || [];

        // 6, 7, 8 & 9. Compare and reconcile gateway refund records idempotently
        for (const gwRefund of gatewayRefundRecords) {
          if (
            !gwRefund.id ||
            gwRefund.payment_id !== cleanPaymentId ||
            typeof gwRefund.amount !== 'number' ||
            gwRefund.amount <= 0
          ) {
            continue;
          }

          const existingLocal = transaction.refunds.find((r) => r.refundId === gwRefund.id);
          const gwStatus = gwRefund.status as 'pending' | 'processed' | 'failed';

          if (!existingLocal) {
            // Missing refund record discovered at gateway -> add idempotently
            transaction.refunds.push({
              refundId: gwRefund.id,
              amountInPaise: gwRefund.amount,
              status: gwStatus,
              createdAt: gwRefund.created_at ? new Date(gwRefund.created_at * 1000) : new Date(),
              processedAt: gwStatus === 'processed' ? new Date() : undefined,
              failureReason: gwRefund.error_description || undefined,
            });
          } else {
            // Reconcile status transitions:
            // Pending -> Processed
            if (existingLocal.status === 'pending' && gwStatus === 'processed') {
              existingLocal.status = 'processed';
              existingLocal.amountInPaise = gwRefund.amount;
              existingLocal.processedAt = existingLocal.processedAt || new Date();
              existingLocal.failureReason = undefined;
            }
            // Pending -> Failed
            else if (existingLocal.status === 'pending' && gwStatus === 'failed') {
              existingLocal.status = 'failed';
              existingLocal.failureReason = gwRefund.error_description || 'Refund failed at gateway';
            }
            // A processed refund by Razorpay is NEVER relabeled as failed
          }
        }

        // Cumulative successfully processed refunds from individual records
        const localCumulativeProcessedPaise = transaction.refunds
          .filter((r) => r.status === 'processed')
          .reduce((sum, r) => sum + r.amountInPaise, 0);

        transaction.refundedAmountInPaise = localCumulativeProcessedPaise;
        transaction.gatewayAmountRefundedInPaise = gwAmountRefundedInPaise;
        transaction.gatewayRefundStatus = gwRefundStatus;
        transaction.lastReconciledAt = new Date();

        // 10. Raise administrative alert when gateway aggregate and local sum of individual records disagree
        if (gwAmountRefundedInPaise !== localCumulativeProcessedPaise) {
          hasDiscrepancy = true;
          const diffPaise = Math.abs(gwAmountRefundedInPaise - localCumulativeProcessedPaise);
          const reason = `Gateway aggregate amount_refunded ₹${(gwAmountRefundedInPaise / 100).toFixed(2)} disagrees with sum of verified processed refund items ₹${(localCumulativeProcessedPaise / 100).toFixed(2)} (difference ₹${(diffPaise / 100).toFixed(2)})`;
          discrepancyReason = discrepancyReason ? `${discrepancyReason}; ${reason}` : reason;
        }

        transaction.hasReconciliationDiscrepancy = hasDiscrepancy;
        transaction.reconciliationDiscrepancyReason = discrepancyReason;

        // Excess refund check (cumulative processed exceeds original payment)
        let hasExcess = false;
        let excessReason: string | undefined;

        if (localCumulativeProcessedPaise > transaction.amountInPaise) {
          hasExcess = true;
          const excessPaise = localCumulativeProcessedPaise - transaction.amountInPaise;
          excessReason = `Excess refund discrepancy: cumulative processed refunds ₹${(localCumulativeProcessedPaise / 100).toFixed(2)} exceed original payment ₹${(transaction.amountInPaise / 100).toFixed(2)} by ₹${(excessPaise / 100).toFixed(2)}`;
          transaction.hasExcessRefundAlert = true;
          transaction.excessRefundReason = excessReason;

          transaction.status = 'refunded';
          transaction.refundStatus = 'processed';
          transaction.payoutStatus = 'unsettled';
          transaction.refundedAt = transaction.refundedAt || new Date();

          if (transaction.packageGroupId) {
            const bQuery = Booking.updateMany(
              { packageGroupId: transaction.packageGroupId },
              { $set: { paymentStatus: 'refunded', refundStatus: 'processed' } }
            );
            if (currentSession) bQuery.session(currentSession);
            await bQuery;
          } else if (transaction.bookingId) {
            const bQuery = Booking.updateOne(
              { _id: transaction.bookingId },
              { $set: { paymentStatus: 'refunded', refundStatus: 'processed' } }
            );
            if (currentSession) bQuery.session(currentSession);
            await bQuery;
          }
        } else if (localCumulativeProcessedPaise === transaction.amountInPaise) {
          transaction.status = 'refunded';
          transaction.refundStatus = 'processed';
          transaction.payoutStatus = 'unsettled';
          transaction.refundedAt = transaction.refundedAt || new Date();

          if (transaction.packageGroupId) {
            const bQuery = Booking.updateMany(
              { packageGroupId: transaction.packageGroupId },
              { $set: { paymentStatus: 'refunded', refundStatus: 'processed' } }
            );
            if (currentSession) bQuery.session(currentSession);
            await bQuery;
          } else if (transaction.bookingId) {
            const bQuery = Booking.updateOne(
              { _id: transaction.bookingId },
              { $set: { paymentStatus: 'refunded', refundStatus: 'processed' } }
            );
            if (currentSession) bQuery.session(currentSession);
            await bQuery;
          }
        } else if (localCumulativeProcessedPaise > 0) {
          transaction.refundStatus = 'partially_refunded';

          if (transaction.packageGroupId) {
            const bQuery = Booking.updateMany(
              { packageGroupId: transaction.packageGroupId },
              { $set: { paymentStatus: 'partially_refunded', refundStatus: 'partially_refunded' } }
            );
            if (currentSession) bQuery.session(currentSession);
            await bQuery;
          } else if (transaction.bookingId) {
            const bQuery = Booking.updateOne(
              { _id: transaction.bookingId },
              { $set: { paymentStatus: 'partially_refunded', refundStatus: 'partially_refunded' } }
            );
            if (currentSession) bQuery.session(currentSession);
            await bQuery;
          }
        } else {
          // Zero processed refunds
          const hasPending = transaction.refunds.some((r) => r.status === 'pending');
          const hasFailed = transaction.refunds.some((r) => r.status === 'failed');

          if (hasPending) {
            transaction.refundStatus = 'pending';
            if (transaction.packageGroupId) {
              const bQuery = Booking.updateMany(
                { packageGroupId: transaction.packageGroupId, paymentStatus: { $ne: 'refunded' } },
                { $set: { refundStatus: 'pending' } }
              );
              if (currentSession) bQuery.session(currentSession);
              await bQuery;
            } else if (transaction.bookingId) {
              const bQuery = Booking.updateOne(
                { _id: transaction.bookingId, paymentStatus: { $ne: 'refunded' } },
                { $set: { refundStatus: 'pending' } }
              );
              if (currentSession) bQuery.session(currentSession);
              await bQuery;
            }
          } else if (hasFailed) {
            transaction.refundStatus = 'failed';
            if (transaction.packageGroupId) {
              const bQuery = Booking.updateMany(
                { packageGroupId: transaction.packageGroupId, paymentStatus: { $ne: 'refunded' } },
                { $set: { refundStatus: 'failed' } }
              );
              if (currentSession) bQuery.session(currentSession);
              await bQuery;
            } else if (transaction.bookingId) {
              const bQuery = Booking.updateOne(
                { _id: transaction.bookingId, paymentStatus: { $ne: 'refunded' } },
                { $set: { refundStatus: 'failed' } }
              );
              if (currentSession) bQuery.session(currentSession);
              await bQuery;
            }
          }
        }

        await transaction.save({ session: currentSession });

        finalResult = {
          paymentId: cleanPaymentId,
          orderId: transaction.razorpayOrderId,
          localAmountInPaise: transaction.amountInPaise,
          gatewayAmountInPaise: gatewayPayment.amount,
          localRefundedAmountInPaise: localCumulativeProcessedPaise,
          gatewayRefundedAmountInPaise: gwAmountRefundedInPaise,
          gatewayRefundStatus: gwRefundStatus,
          reconciledRefundsCount: gatewayRefundRecords.length,
          hasDiscrepancy,
          discrepancyReason,
          hasExcessRefundAlert: hasExcess,
          excessRefundReason: excessReason,
          transaction,
        };
      };

      if (session && canUseTransactions) {
        await session.withTransaction(async () => {
          await executeReconciliation(session);
        });
      } else {
        await executeReconciliation();
      }

      return finalResult;
    } catch (err: any) {
      const isConflict =
        err.name === 'VersionError' ||
        err.code === 112 ||
        err.hasErrorLabel?.('TransientTransactionError');

      if (isConflict && attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
        continue;
      }
      throw err;
    } finally {
      if (session) {
        try {
          await session.endSession();
        } catch {
          // ignore
        }
      }
    }
  }

  throw new Error(`Failed to reconcile payment ${cleanPaymentId} after 5 attempts.`);
}

/**
 * Admin API to reconcile a payment with Razorpay gateway.
 * POST /api/payments/reconcile/:paymentId
 * Protected: 'admin'.
 */
export async function reconcilePaymentWithGatewayHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access forbidden. Administrator access required.' });
    }

    const { paymentId } = req.params;
    if (!paymentId || typeof paymentId !== 'string' || !paymentId.trim()) {
      return res.status(400).json({ error: 'Valid paymentId is required.' });
    }

    const result = await reconcilePaymentWithGateway(paymentId.trim());

    return res.status(200).json({
      success: true,
      message: 'Payment reconciled successfully with Razorpay gateway.',
      reconciliation: {
        paymentId: result.paymentId,
        orderId: result.orderId,
        localAmountInPaise: result.localAmountInPaise,
        gatewayAmountInPaise: result.gatewayAmountInPaise,
        localRefundedAmountInPaise: result.localRefundedAmountInPaise,
        gatewayRefundedAmountInPaise: result.gatewayRefundedAmountInPaise,
        gatewayRefundStatus: result.gatewayRefundStatus,
        reconciledRefundsCount: result.reconciledRefundsCount,
        hasDiscrepancy: result.hasDiscrepancy,
        discrepancyReason: result.discrepancyReason || null,
        hasExcessRefundAlert: result.hasExcessRefundAlert,
        excessRefundReason: result.excessRefundReason || null,
      },
    });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message?.includes('mismatch')) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
}
