import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { app } from '../src/app';
import { Booking } from '../src/models/Booking';
import { PaymentTransaction } from '../src/models/PaymentTransaction';
import { WebhookEvent } from '../src/models/WebhookEvent';
import { User } from '../src/models/User';
import { CoachProfile } from '../src/models/CoachProfile';
import { signToken } from '../src/utils/jwt';
import { config } from '../src/config/env';
import * as razorpayService from '../src/services/razorpayService';
import {
  calculatePaymentBreakdown,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
  fetchRazorpayPaymentRefunds,
} from '../src/services/razorpayService';
import { reconcilePaymentWithGateway } from '../src/controllers/paymentController';

describe('Payment & Razorpay Backend Security Remediation (Phase 1B.2A)', () => {
  const customerId = new mongoose.Types.ObjectId();
  const otherCustomerId = new mongoose.Types.ObjectId();
  const coachId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const bookingId = new mongoose.Types.ObjectId();

  const customerUser = {
    _id: customerId,
    name: 'Trainee Customer',
    email: 'customer@test.com',
    role: 'parent',
    isActive: true,
  };

  const otherCustomerUser = {
    _id: otherCustomerId,
    name: 'Other Customer',
    email: 'other@test.com',
    role: 'individual',
    isActive: true,
  };

  const coachUser = {
    _id: coachId,
    name: 'Coach Sadiq',
    email: 'coach@test.com',
    role: 'coach',
    isActive: true,
  };

  const adminUser = {
    _id: adminId,
    name: 'Admin User',
    email: 'admin@test.com',
    role: 'admin',
    isActive: true,
  };

  const customerToken = signToken({
    userId: customerId.toString(),
    email: 'customer@test.com',
    role: 'parent',
  });

  const otherCustomerToken = signToken({
    userId: otherCustomerId.toString(),
    email: 'other@test.com',
    role: 'individual',
  });

  const coachToken = signToken({
    userId: coachId.toString(),
    email: 'coach@test.com',
    role: 'coach',
  });

  const adminToken = signToken({
    userId: adminId.toString(),
    email: 'admin@test.com',
    role: 'admin',
  });

  function mockBookingFindById(result: any) {
    const query: any = {
      populate: vi.fn().mockImplementation(() => query),
      exec: vi.fn().mockResolvedValue(result),
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
      catch: (reject: any) => Promise.resolve(result).catch(reject),
    };
    return vi.spyOn(Booking, 'findById').mockReturnValue(query);
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(WebhookEvent, 'findOne').mockResolvedValue(null);
    vi.spyOn(WebhookEvent, 'create').mockResolvedValue({} as any);
    vi.spyOn(WebhookEvent, 'updateOne').mockResolvedValue({ acknowledged: true } as any);
    vi.spyOn(User, 'findById').mockImplementation(async (id: any) => {
      const idStr = id?.toString();
      if (idStr === customerId.toString()) return customerUser as any;
      if (idStr === otherCustomerId.toString()) return otherCustomerUser as any;
      if (idStr === coachId.toString()) return coachUser as any;
      if (idStr === adminId.toString()) return adminUser as any;
      return null;
    });
  });

  describe('Financial Calculation Logic', () => {
    it('calculates exact 80/20 split and 0% tax default without rounding discrepancy', () => {
      const breakdown = calculatePaymentBreakdown({
        hourlyRate: 1500,
        durationMinutes: 60,
        taxRatePercentage: 0,
      });

      expect(breakdown.baseSessionFee).toBe(1500);
      expect(breakdown.platformCommission).toBe(300); // 20%
      expect(breakdown.coachAllocation).toBe(1200);   // 80%
      expect(breakdown.taxAmount).toBe(0);
      expect(breakdown.totalCustomerPayable).toBe(1500);
      expect(breakdown.amountInPaise).toBe(150000);
      expect(breakdown.platformCommission + breakdown.coachAllocation).toBe(breakdown.baseSessionFee);
    });

    it('calculates duration scaling with 90 minute session correctly', () => {
      const breakdown = calculatePaymentBreakdown({
        hourlyRate: 1000,
        durationMinutes: 90, // 1.5 hours
        taxRatePercentage: 0,
      });

      expect(breakdown.baseSessionFee).toBe(1500);
      expect(breakdown.platformCommission).toBe(300);
      expect(breakdown.coachAllocation).toBe(1200);
      expect(breakdown.totalCustomerPayable).toBe(1500);
      expect(breakdown.amountInPaise).toBe(150000);
    });

    it('adds separate configurable demonstration tax without altering coach or platform allocations', () => {
      const breakdown = calculatePaymentBreakdown({
        hourlyRate: 1000,
        durationMinutes: 60,
        taxRatePercentage: 18,
      });

      expect(breakdown.baseSessionFee).toBe(1000);
      expect(breakdown.platformCommission).toBe(200); // 20% of 1000
      expect(breakdown.coachAllocation).toBe(800);    // 80% of 1000
      expect(breakdown.taxAmount).toBe(180);          // 18% of 1000
      expect(breakdown.totalCustomerPayable).toBe(1180);
      expect(breakdown.amountInPaise).toBe(118000);
      expect(breakdown.taxLabel).toContain('Demonstration Tax Estimate (18%');
    });
  });

  describe('POST /api/payments/create-order', () => {
    it('rejects unauthenticated requests with HTTP 401', async () => {
      const res = await request(app)
        .post('/api/payments/create-order')
        .send({ bookingId: bookingId.toString() });

      expect(res.status).toBe(401);
    });

    it('rejects coach role from creating payment orders with HTTP 403', async () => {
      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${coachToken}`)
        .send({ bookingId: bookingId.toString() });

      expect(res.status).toBe(403);
    });

    it('rejects invalid bookingId format with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ bookingId: 'invalid-id' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Valid bookingId is required/i);
    });

    it('returns HTTP 404 when booking is not found', async () => {
      mockBookingFindById(null);

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ bookingId: bookingId.toString() });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Booking not found/i);
    });

    it('rejects non-owner customer with HTTP 403', async () => {
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
      };
      mockBookingFindById(mockBooking);

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${otherCustomerToken}`)
        .send({ bookingId: bookingId.toString() });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Access forbidden/i);
    });

    it('rejects pending booking with HTTP 400', async () => {
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'pending',
        paymentStatus: 'unpaid',
      };
      mockBookingFindById(mockBooking);

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ bookingId: bookingId.toString() });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Cannot initiate payment for a pending booking/i);
    });

    it('rejects already paid booking with HTTP 400', async () => {
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'paid',
      };
      mockBookingFindById(mockBooking);

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ bookingId: bookingId.toString() });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already been paid/i);
    });

    it('cancels booking and rejects order creation when payment window has expired', async () => {
      const pastDue = new Date(Date.now() - 1000 * 60 * 60);
      const mockBooking = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
        paymentDueAt: pastDue,
      };
      mockBookingFindById(mockBooking);
      const updateSpy = vi.spyOn(Booking, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ bookingId: bookingId.toString() });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PAYMENT_EXPIRED');
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ _id: bookingId, status: 'accepted', paymentStatus: 'unpaid' }),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'cancelled',
            cancelledBy: 'customer',
          }),
        })
      );
    });

    it('fails safely with HTTP 502 when payment gateway order creation fails or network is down', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
        hourlyRateSnapshot: 1200,
        durationMinutes: 60,
        paymentDueAt: new Date(Date.now() + 1000 * 60 * 120),
        save: vi.fn().mockResolvedValue(true),
      };
      mockBookingFindById(mockBooking);
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(null);
      vi.spyOn(razorpayService, 'createRazorpayOrder').mockRejectedValue(
        new Error('Failed to reach Razorpay gateway: Connection refused')
      );

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ bookingId: bookingId.toString() });

      expect(res.status).toBe(502);
      expect(res.body.code).toBe('GATEWAY_ERROR');
      expect(res.body.error).toMatch(/Payment gateway order initialization failed/i);
    });

    it('creates Razorpay test order with transparent breakdown and internal ledger recording', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
        hourlyRateSnapshot: 1200,
        durationMinutes: 60,
        paymentDueAt: new Date(Date.now() + 1000 * 60 * 120),
        save: vi.fn().mockResolvedValue(true),
      };
      mockBookingFindById(mockBooking);
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(null);
      vi.spyOn(razorpayService, 'createRazorpayOrder').mockResolvedValue({
        id: 'order_test_rzp_mock_123',
        amount: 120000,
        currency: 'INR',
        receipt: 'rcpt_123',
        status: 'created',
        created_at: Math.floor(Date.now() / 1000),
      });

      const saveTxSpy = vi.spyOn(PaymentTransaction.prototype, 'save').mockResolvedValue(true as any);

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ bookingId: bookingId.toString() });

      expect(res.status).toBe(201);
      expect(res.body.orderId).toBe('order_test_rzp_mock_123');
      expect(res.body.amount).toBe(1200);
      expect(res.body.amountInPaise).toBe(120000);
      expect(res.body.currency).toBe('INR');

      expect(res.body.breakdown).toEqual({
        coachingFee: 1200,
        taxAmount: 0,
        taxRatePercentage: 0,
        taxLabel: expect.stringContaining('Sandbox Mode'),
        totalPayable: 1200,
      });
      expect(res.body.breakdown.platformCommission).toBeUndefined();
      expect(res.body.breakdown.coachAllocation).toBeUndefined();

      expect(saveTxSpy).toHaveBeenCalledTimes(1);
    });

    it('prevents duplicate orders by reusing active unexpired order', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
        hourlyRateSnapshot: 1000,
        durationMinutes: 60,
        paymentDueAt: new Date(Date.now() + 1000 * 60 * 120),
      };
      mockBookingFindById(mockBooking);

      const existingActiveTx = {
        razorpayOrderId: 'order_existing_12345',
        totalCustomerPayable: 1000,
        amountInPaise: 100000,
        currency: 'INR',
        baseSessionFee: 1000,
        taxAmount: 0,
        taxRatePercentage: 0,
        orderExpiresAt: new Date(Date.now() + 1000 * 60 * 20),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(existingActiveTx as any);

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ bookingId: bookingId.toString() });

      expect(res.status).toBe(200);
      expect(res.body.orderId).toBe('order_existing_12345');
      expect(res.body.message).toMatch(/Active payment order retrieved/i);
    });
  });

  describe('POST /api/payments/verify-signature (Strict Cryptographic & Gateway Entity Checks)', () => {
    it('rejects missing parameters with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/payments/verify-signature')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ bookingId: bookingId.toString() });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing required payment verification parameters/i);
    });

    it('strictly rejects the hardcoded sandbox signature bypass even in non-production environments', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
      };
      mockBookingFindById(mockBooking);

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayOrderId: 'order_test_real_order',
        status: 'created',
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);

      const res = await request(app)
        .post('/api/payments/verify-signature')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: bookingId.toString(),
          razorpay_order_id: 'order_test_real_order',
          razorpay_payment_id: 'pay_test_bypass_attempt',
          razorpay_signature: 'sandbox_verified_signature', // Hardcoded bypass attempt
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_SIGNATURE');
      expect(mockTx.status).toBe('failed');
    });

    it('rejects tampered cryptographic signature with HTTP 400 INVALID_SIGNATURE', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
      };
      mockBookingFindById(mockBooking);

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayOrderId: 'order_test_999',
        status: 'created',
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);

      const res = await request(app)
        .post('/api/payments/verify-signature')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: bookingId.toString(),
          razorpay_order_id: 'order_test_999',
          razorpay_payment_id: 'pay_test_888',
          razorpay_signature: 'tampered_invalid_signature_hex_value',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_SIGNATURE');
      expect(mockTx.status).toBe('failed');
    });

    it('rejects when order ID does not match stored transaction', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
      };
      mockBookingFindById(mockBooking);
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .post('/api/payments/verify-signature')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: bookingId.toString(),
          razorpay_order_id: 'order_unmatched_id',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'some_sig',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Payment order record not found/i);
    });

    it('rejects fabricated payment ID when gateway returns null (payment not found)', async () => {
      const orderId = 'order_valid_123';
      const paymentId = 'pay_fake_not_in_gateway';
      const secret = config.RAZORPAY_KEY_SECRET;
      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
      };
      mockBookingFindById(mockBooking);

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayOrderId: orderId,
        status: 'created',
        totalCustomerPayable: 1500,
        amountInPaise: 150000,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      // Gateway returns null for fabricated payment ID
      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue(null);

      const res = await request(app)
        .post('/api/payments/verify-signature')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: bookingId.toString(),
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: validSignature,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PAYMENT_NOT_FOUND');
      expect(mockTx.status).toBe('failed');
    });

    it('rejects when gateway payment entity order_id mismatches stored order ID', async () => {
      const orderId = 'order_expected_123';
      const paymentId = 'pay_gateway_456';
      const secret = config.RAZORPAY_KEY_SECRET;
      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
      };
      mockBookingFindById(mockBooking);

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayOrderId: orderId,
        status: 'created',
        totalCustomerPayable: 1500,
        amountInPaise: 150000,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: paymentId,
        entity: 'payment',
        order_id: 'order_DIFFERENT_789', // Mismatched order ID
        amount: 150000,
        currency: 'INR',
        status: 'captured',
      });

      const res = await request(app)
        .post('/api/payments/verify-signature')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: bookingId.toString(),
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: validSignature,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('ORDER_ID_MISMATCH');
      expect(mockTx.status).toBe('failed');
    });

    it('rejects when gateway payment amount mismatches transaction amount', async () => {
      const orderId = 'order_valid_123';
      const paymentId = 'pay_gateway_456';
      const secret = config.RAZORPAY_KEY_SECRET;
      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
      };
      mockBookingFindById(mockBooking);

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayOrderId: orderId,
        status: 'created',
        totalCustomerPayable: 1500,
        amountInPaise: 150000, // Expected 1500.00 INR (150000 paise)
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: paymentId,
        entity: 'payment',
        order_id: orderId,
        amount: 50000, // Gateway reported only 500.00 INR
        currency: 'INR',
        status: 'captured',
      });

      const res = await request(app)
        .post('/api/payments/verify-signature')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: bookingId.toString(),
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: validSignature,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('AMOUNT_MISMATCH');
      expect(mockTx.status).toBe('failed');
    });

    it('rejects when gateway payment currency is not INR', async () => {
      const orderId = 'order_valid_123';
      const paymentId = 'pay_gateway_456';
      const secret = config.RAZORPAY_KEY_SECRET;
      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
      };
      mockBookingFindById(mockBooking);

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayOrderId: orderId,
        status: 'created',
        totalCustomerPayable: 1500,
        amountInPaise: 150000,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: paymentId,
        entity: 'payment',
        order_id: orderId,
        amount: 150000,
        currency: 'USD', // Non-INR currency
        status: 'captured',
      });

      const res = await request(app)
        .post('/api/payments/verify-signature')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: bookingId.toString(),
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: validSignature,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CURRENCY_MISMATCH');
      expect(mockTx.status).toBe('failed');
    });

    it('does not mark booking paid when payment is only authorized (pending capture)', async () => {
      const orderId = 'order_valid_123';
      const paymentId = 'pay_gateway_auth_only';
      const secret = config.RAZORPAY_KEY_SECRET;
      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
      };
      mockBookingFindById(mockBooking);

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayOrderId: orderId,
        status: 'created',
        totalCustomerPayable: 1500,
        amountInPaise: 150000,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: paymentId,
        entity: 'payment',
        order_id: orderId,
        amount: 150000,
        currency: 'INR',
        status: 'authorized', // Not captured
      });

      const res = await request(app)
        .post('/api/payments/verify-signature')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: bookingId.toString(),
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: validSignature,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PAYMENT_NOT_CAPTURED');
      expect(mockTx.status).toBe('authorized');
    });

    it('fails safely with HTTP 502 when gateway cannot be reached during payment status check', async () => {
      const orderId = 'order_valid_123';
      const paymentId = 'pay_gateway_456';
      const secret = config.RAZORPAY_KEY_SECRET;
      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
      };
      mockBookingFindById(mockBooking);

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayOrderId: orderId,
        status: 'created',
        totalCustomerPayable: 1500,
        amountInPaise: 150000,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockRejectedValue(
        new Error('Network timeout connecting to Razorpay REST API')
      );

      const res = await request(app)
        .post('/api/payments/verify-signature')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: bookingId.toString(),
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: validSignature,
        });

      expect(res.status).toBe(502);
      expect(res.body.code).toBe('GATEWAY_ERROR');
    });

    it('successfully confirms booking when cryptographic signature and gateway entity checks pass', async () => {
      const orderId = 'order_valid_123';
      const paymentId = 'pay_valid_456';
      const secret = config.RAZORPAY_KEY_SECRET;
      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
      };
      mockBookingFindById(mockBooking);

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayOrderId: orderId,
        status: 'created',
        totalCustomerPayable: 1500,
        amountInPaise: 150000,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      vi.spyOn(PaymentTransaction, 'findOneAndUpdate').mockResolvedValue({
        ...mockTx,
        status: 'captured',
        razorpayPaymentId: paymentId,
        payoutStatus: 'simulated_held',
      } as any);

      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: paymentId,
        entity: 'payment',
        order_id: orderId,
        amount: 150000,
        currency: 'INR',
        status: 'captured',
      });

      const updatedBooking = {
        ...mockBooking,
        paymentStatus: 'paid',
        paymentTransactionId: mockTx._id,
      };
      const findOneAndUpdateQuery: any = {
        populate: vi.fn().mockImplementation(() => findOneAndUpdateQuery),
        then: (resolve: any) => Promise.resolve(updatedBooking).then(resolve),
      };
      vi.spyOn(Booking, 'findOneAndUpdate').mockReturnValue(findOneAndUpdateQuery);

      const res = await request(app)
        .post('/api/payments/verify-signature')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: bookingId.toString(),
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: validSignature,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.booking.paymentStatus).toBe('paid');
      expect(res.body.transaction.status).toBe('captured');
    });

    it('handles idempotent verification call when already captured', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'paid',
      };
      mockBookingFindById(mockBooking);

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayOrderId: 'order_test_already_paid',
        status: 'captured',
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);

      const res = await request(app)
        .post('/api/payments/verify-signature')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: bookingId.toString(),
          razorpay_order_id: 'order_test_already_paid',
          razorpay_payment_id: 'pay_test_already_paid',
          razorpay_signature: 'any_sig',
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/Payment has already been verified/i);
    });

    it('rejects verification when transaction is already refunded', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'refunded',
      };
      mockBookingFindById(mockBooking);

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayOrderId: 'order_test_refunded',
        status: 'refunded',
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);

      const res = await request(app)
        .post('/api/payments/verify-signature')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: bookingId.toString(),
          razorpay_order_id: 'order_test_refunded',
          razorpay_payment_id: 'pay_test_refunded',
          razorpay_signature: 'any_sig',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PAYMENT_REFUNDED');
      expect(res.body.error).toMatch(/refunded/i);
    });

    it('confirms that an authorized-only payment cannot unlock the coach session timer', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
        durationMinutes: 60,
      };
      mockBookingFindById(mockBooking);

      const startRes = await request(app)
        .patch(`/api/bookings/${bookingId}/start`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(startRes.status).toBe(400);
      expect(startRes.body.error).toMatch(/Customer payment has not been confirmed for this booking/i);
    });

    it('confirms that a refunded booking cannot unlock the coach session timer', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'refunded',
        durationMinutes: 60,
      };
      mockBookingFindById(mockBooking);

      const startRes = await request(app)
        .patch(`/api/bookings/${bookingId}/start`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(startRes.status).toBe(400);
      expect(startRes.body.error).toMatch(/Customer payment has not been confirmed for this booking/i);
    });
  });

  describe('POST /api/payments/webhook (Signature, Deduplication & Event Integrity)', () => {
    it('rejects missing X-Razorpay-Signature with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/payments/webhook')
        .send({ event: 'payment.captured' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing X-Razorpay-Signature/i);
    });

    it('rejects invalid webhook signature with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', 'invalid_webhook_signature')
        .send({ event: 'payment.captured' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid webhook signature/i);
    });

    it('processes payment.captured webhook and updates transaction and booking', async () => {
      const payloadObj = {
        event: 'payment.captured',
        id: 'evt_test_unique_101',
        payload: {
          payment: {
            entity: {
              id: 'pay_hook_123',
              order_id: 'order_hook_456',
              amount: 100000,
              currency: 'INR',
            },
          },
        },
      };
      const rawPayload = JSON.stringify(payloadObj);
      const validSignature = crypto
        .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawPayload)
        .digest('hex');

      vi.spyOn(WebhookEvent, 'create').mockResolvedValue({} as any);

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayOrderId: 'order_hook_456',
        amountInPaise: 100000,
        currency: 'INR',
        status: 'created',
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const updateTxSpy = vi.spyOn(PaymentTransaction, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);
      const updateBookingSpy = vi.spyOn(Booking, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('x-razorpay-event-id', 'evt_test_unique_101')
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(updateTxSpy).toHaveBeenCalledTimes(1);
      expect(updateBookingSpy).toHaveBeenCalledTimes(1);
    });

    it('deduplicates duplicate webhook deliveries without double processing', async () => {
      const payloadObj = {
        event: 'payment.captured',
        id: 'evt_test_duplicate_999',
        payload: {
          payment: {
            entity: {
              id: 'pay_hook_dup',
              order_id: 'order_hook_dup',
              amount: 100000,
              currency: 'INR',
            },
          },
        },
      };
      const rawPayload = JSON.stringify(payloadObj);
      const validSignature = crypto
        .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawPayload)
        .digest('hex');

      // Simulate previously completed event in WebhookEvent store
      vi.spyOn(WebhookEvent, 'findOne').mockResolvedValue({
        eventId: 'evt_test_duplicate_999',
        status: 'completed',
      } as any);

      const findTxSpy = vi.spyOn(PaymentTransaction, 'findOne');

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('x-razorpay-event-id', 'evt_test_duplicate_999')
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.duplicate).toBe(true);
      // Processing stopped at deduplication layer
      expect(findTxSpy).not.toHaveBeenCalled();
    });

    it('processes order.paid webhook when matching payment entity is captured', async () => {
      const payloadObj = {
        event: 'order.paid',
        id: 'evt_order_paid_001',
        payload: {
          order: {
            entity: {
              id: 'order_hook_paid_777',
              amount_paid: 150000,
            },
          },
          payment: {
            entity: {
              id: 'pay_hook_paid_888',
              order_id: 'order_hook_paid_777',
              amount: 150000,
              status: 'captured',
            },
          },
        },
      };
      const rawPayload = JSON.stringify(payloadObj);
      const validSignature = crypto
        .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawPayload)
        .digest('hex');

      vi.spyOn(WebhookEvent, 'create').mockResolvedValue({} as any);

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayOrderId: 'order_hook_paid_777',
        amountInPaise: 150000,
        status: 'created',
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const updateTxSpy = vi.spyOn(PaymentTransaction, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);
      const updateBookingSpy = vi.spyOn(Booking, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(updateTxSpy).toHaveBeenCalledTimes(1);
      expect(updateBookingSpy).toHaveBeenCalledTimes(1);
    });

    it('ensures payment.failed does not overwrite an already captured transaction', async () => {
      const payloadObj = {
        event: 'payment.failed',
        id: 'evt_payment_failed_001',
        payload: {
          payment: {
            entity: {
              id: 'pay_failed_111',
              order_id: 'order_already_captured_222',
              error_description: 'Card declined',
            },
          },
        },
      };
      const rawPayload = JSON.stringify(payloadObj);
      const validSignature = crypto
        .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawPayload)
        .digest('hex');

      vi.spyOn(WebhookEvent, 'create').mockResolvedValue({} as any);
      const updateTxSpy = vi.spyOn(PaymentTransaction, 'updateOne').mockResolvedValue({ matchedCount: 0 } as any);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(updateTxSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          razorpayOrderId: 'order_already_captured_222',
          status: { $nin: ['captured', 'refunded'] }, // Strictly guards captured/refunded
        }),
        expect.anything()
      );
    });

    it('does not mark booking paid when webhook delivers payment.authorized', async () => {
      const payloadObj = {
        event: 'payment.authorized',
        id: 'evt_auth_only_333',
        payload: {
          payment: {
            entity: {
              id: 'pay_auth_333',
              order_id: 'order_auth_333',
            },
          },
        },
      };
      const rawPayload = JSON.stringify(payloadObj);
      const validSignature = crypto
        .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawPayload)
        .digest('hex');

      vi.spyOn(WebhookEvent, 'create').mockResolvedValue({} as any);
      const updateTxSpy = vi.spyOn(PaymentTransaction, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);
      const updateBookingSpy = vi.spyOn(Booking, 'updateOne');

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(updateTxSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          razorpayOrderId: 'order_auth_333',
          status: { $nin: ['captured', 'refunded'] },
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'authorized',
          }),
        })
      );
      // Booking update is NOT called for authorized payments
      expect(updateBookingSpy).not.toHaveBeenCalled();
    });

    it('ensures payment.authorized cannot overwrite an already captured transaction', async () => {
      const payloadObj = {
        event: 'payment.authorized',
        id: 'evt_auth_delayed_444',
        payload: {
          payment: {
            entity: {
              id: 'pay_auth_444',
              order_id: 'order_already_captured_444',
            },
          },
        },
      };
      const rawPayload = JSON.stringify(payloadObj);
      const validSignature = crypto
        .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawPayload)
        .digest('hex');

      vi.spyOn(WebhookEvent, 'create').mockResolvedValue({} as any);
      const updateTxSpy = vi.spyOn(PaymentTransaction, 'updateOne').mockResolvedValue({ matchedCount: 0 } as any);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(updateTxSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          razorpayOrderId: 'order_already_captured_444',
          status: { $nin: ['captured', 'refunded'] },
        }),
        expect.anything()
      );
    });

    it('processes refund.created: records pending status without marking booking fully refunded', async () => {
      const payloadObj = {
        event: 'refund.created',
        id: 'evt_refund_create_001',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_create_001',
              payment_id: 'pay_captured_111',
              amount: 150000,
              created_at: 1700000000,
            },
          },
        },
      };
      const rawPayload = JSON.stringify(payloadObj);
      const validSignature = crypto
        .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawPayload)
        .digest('hex');

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: 'pay_captured_111',
        amountInPaise: 150000,
        status: 'captured',
        refundStatus: 'none',
        refundedAmountInPaise: 0,
        refunds: [],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const bookingUpdateSpy = vi.spyOn(Booking, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(mockTx.refundStatus).toBe('pending');
      expect(mockTx.status).toBe('captured'); // Stays captured, not refunded!
      expect(mockTx.refunds).toHaveLength(1);
      expect(mockTx.refunds[0].status).toBe('pending');
      expect(mockTx.refunds[0].refundId).toBe('rfnd_create_001');

      // Booking paymentStatus is NOT set to 'refunded'
      expect(bookingUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ _id: bookingId, paymentStatus: { $ne: 'refunded' } }),
        { $set: { refundStatus: 'pending' } }
      );
    });

    it('processes refund.processed webhook: marks transaction and booking fully refunded when cumulative amount equals original', async () => {
      const payloadObj = {
        event: 'refund.processed',
        id: 'evt_refund_proc_full',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_full_001',
              payment_id: 'pay_captured_222',
              amount: 150000,
              created_at: 1700000000,
            },
          },
        },
      };
      const rawPayload = JSON.stringify(payloadObj);
      const validSignature = crypto
        .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawPayload)
        .digest('hex');

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: 'pay_captured_222',
        amountInPaise: 150000,
        status: 'captured',
        refundStatus: 'none',
        refundedAmountInPaise: 0,
        refunds: [],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const bookingUpdateSpy = vi.spyOn(Booking, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(mockTx.status).toBe('refunded');
      expect(mockTx.refundStatus).toBe('processed');
      expect(mockTx.refundedAmountInPaise).toBe(150000);
      expect(mockTx.payoutStatus).toBe('unsettled');
      expect(bookingUpdateSpy).toHaveBeenCalledWith(
        { _id: bookingId },
        { $set: { paymentStatus: 'refunded', refundStatus: 'processed' } }
      );
    });

    it('processes partial refund: updates transaction to partially_refunded and does not mark entire booking refunded', async () => {
      const payloadObj = {
        event: 'refund.processed',
        id: 'evt_refund_proc_partial',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_part_001',
              payment_id: 'pay_captured_333',
              amount: 50000, // 500.00 INR out of 1500.00 INR
              created_at: 1700000000,
            },
          },
        },
      };
      const rawPayload = JSON.stringify(payloadObj);
      const validSignature = crypto
        .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawPayload)
        .digest('hex');

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: 'pay_captured_333',
        amountInPaise: 150000, // 1500.00 INR total
        status: 'captured',
        refundStatus: 'none',
        refundedAmountInPaise: 0,
        refunds: [],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const bookingUpdateSpy = vi.spyOn(Booking, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(mockTx.status).toBe('captured'); // Preserves captured!
      expect(mockTx.refundStatus).toBe('partially_refunded');
      expect(mockTx.refundedAmountInPaise).toBe(50000);
      expect(bookingUpdateSpy).toHaveBeenCalledWith(
        { _id: bookingId },
        { $set: { paymentStatus: 'partially_refunded', refundStatus: 'partially_refunded' } }
      );
    });

    it('cumulatively sums multiple partial refunds until full refund threshold is met', async () => {
      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: 'pay_captured_multi',
        amountInPaise: 150000,
        status: 'captured',
        refundStatus: 'partially_refunded',
        refundedAmountInPaise: 50000,
        refunds: [
          {
            refundId: 'rfnd_part_first',
            amountInPaise: 50000,
            status: 'processed',
            createdAt: new Date(),
            processedAt: new Date(),
          },
        ],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const bookingUpdateSpy = vi.spyOn(Booking, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);

      const payloadObj = {
        event: 'refund.processed',
        id: 'evt_refund_proc_second',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_part_second',
              payment_id: 'pay_captured_multi',
              amount: 100000,
              created_at: 1700000000,
            },
          },
        },
      };
      const rawPayload = JSON.stringify(payloadObj);
      const validSignature = crypto
        .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawPayload)
        .digest('hex');

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(mockTx.refundedAmountInPaise).toBe(150000); // 50000 + 100000 = 150000
      expect(mockTx.status).toBe('refunded');
      expect(mockTx.refundStatus).toBe('processed');
      expect(bookingUpdateSpy).toHaveBeenCalledWith(
        { _id: bookingId },
        { $set: { paymentStatus: 'refunded', refundStatus: 'processed' } }
      );
    });

    it('ensures duplicate refund.processed is idempotent and does not increase refunded amount twice', async () => {
      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: 'pay_captured_dup',
        amountInPaise: 150000,
        status: 'captured',
        refundStatus: 'partially_refunded',
        refundedAmountInPaise: 50000,
        refunds: [
          {
            refundId: 'rfnd_dup_999',
            amountInPaise: 50000,
            status: 'processed',
            createdAt: new Date(),
            processedAt: new Date(),
          },
        ],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const bookingUpdateSpy = vi.spyOn(Booking, 'updateOne');

      const payloadObj = {
        event: 'refund.processed',
        id: 'evt_refund_dup_delivery',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_dup_999',
              payment_id: 'pay_captured_dup',
              amount: 50000,
              created_at: 1700000000,
            },
          },
        },
      };
      const rawPayload = JSON.stringify(payloadObj);
      const validSignature = crypto
        .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawPayload)
        .digest('hex');

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(mockTx.refundedAmountInPaise).toBe(50000);
      expect(mockTx.save).not.toHaveBeenCalled();
      expect(bookingUpdateSpy).not.toHaveBeenCalled();
    });

    it('preserves genuine excess refund as processed and flags excess discrepancy alert without silent truncation', async () => {
      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: 'pay_captured_excess',
        amountInPaise: 100000, // ₹1,000
        status: 'captured',
        refundStatus: 'partially_refunded',
        refundedAmountInPaise: 70000, // ₹700 already refunded
        refunds: [
          {
            refundId: 'rfnd_valid_first',
            amountInPaise: 70000,
            status: 'processed',
            createdAt: new Date(),
            processedAt: new Date(),
          },
        ],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const bookingUpdateSpy = vi.spyOn(Booking, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);

      const payloadObj = {
        event: 'refund.processed',
        id: 'evt_refund_excess_attempt',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_excess_attempt',
              payment_id: 'pay_captured_excess',
              amount: 40000, // ₹400 -> total 110,000 > 100,000!
              created_at: 1700000000,
            },
          },
        },
      };
      const rawPayload = JSON.stringify(payloadObj);
      const validSignature = crypto
        .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawPayload)
        .digest('hex');

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(mockTx.refundedAmountInPaise).toBe(110000); // Authentic gateway total, NOT silently truncated!
      expect(mockTx.status).toBe('refunded'); // Preserves full refund state
      expect(mockTx.refundStatus).toBe('processed');
      expect(mockTx.hasExcessRefundAlert).toBe(true);
      expect(mockTx.excessRefundReason).toMatch(/excess refund discrepancy/i);
      expect(mockTx.refunds.length).toBe(2);
      expect(mockTx.refunds[1].status).toBe('processed'); // Never falsely marked failed!
      expect(bookingUpdateSpy).toHaveBeenCalledWith(
        { _id: bookingId },
        { $set: { paymentStatus: 'refunded', refundStatus: 'processed' } }
      );
    });

    it('ensures delayed refund.created cannot overwrite an already processed refund status', async () => {
      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: 'pay_captured_delayed',
        amountInPaise: 150000,
        status: 'refunded',
        refundStatus: 'processed',
        refundedAmountInPaise: 150000,
        refunds: [
          {
            refundId: 'rfnd_delayed_123',
            amountInPaise: 150000,
            status: 'processed',
            createdAt: new Date(),
            processedAt: new Date(),
          },
        ],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const bookingUpdateSpy = vi.spyOn(Booking, 'updateOne');

      const payloadObj = {
        event: 'refund.created',
        id: 'evt_delayed_create_123',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_delayed_123',
              payment_id: 'pay_captured_delayed',
              amount: 150000,
              created_at: 1700000000,
            },
          },
        },
      };
      const rawPayload = JSON.stringify(payloadObj);
      const validSignature = crypto
        .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawPayload)
        .digest('hex');

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(mockTx.refundStatus).toBe('processed');
      expect(mockTx.refunds[0].status).toBe('processed');
      expect(mockTx.save).not.toHaveBeenCalled();
      expect(bookingUpdateSpy).not.toHaveBeenCalled();
    });

    it('processes refund.failed: records failure and does not count toward refunded amount', async () => {
      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: 'pay_captured_fail_test',
        amountInPaise: 150000,
        status: 'captured',
        refundStatus: 'none',
        refundedAmountInPaise: 0,
        refunds: [],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const bookingUpdateSpy = vi.spyOn(Booking, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);

      const payloadObj = {
        event: 'refund.failed',
        id: 'evt_refund_failed_001',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_failed_001',
              payment_id: 'pay_captured_fail_test',
              amount: 150000,
              error_code: 'GATEWAY_ERROR',
              error_description: 'Issuer declined refund',
              created_at: 1700000000,
            },
          },
        },
      };
      const rawPayload = JSON.stringify(payloadObj);
      const validSignature = crypto
        .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawPayload)
        .digest('hex');

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(mockTx.status).toBe('captured');
      expect(mockTx.refundStatus).toBe('failed');
      expect(mockTx.refundedAmountInPaise).toBe(0);
      expect(mockTx.refunds[0].status).toBe('failed');
      expect(mockTx.refunds[0].failureReason).toBe('Issuer declined refund');
      expect(bookingUpdateSpy).toHaveBeenCalledWith(
        { _id: bookingId },
        { $set: { refundStatus: 'failed' } }
      );
    });

    it('safely rejects/ignores refund event linked to an unknown payment ID', async () => {
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(null);
      const bookingUpdateSpy = vi.spyOn(Booking, 'updateOne');

      const payloadObj = {
        event: 'refund.processed',
        id: 'evt_refund_unknown_payment',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_unknown_001',
              payment_id: 'pay_unrelated_foreign_account',
              amount: 50000,
            },
          },
        },
      };
      const rawPayload = JSON.stringify(payloadObj);
      const validSignature = crypto
        .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawPayload)
        .digest('hex');

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(bookingUpdateSpy).not.toHaveBeenCalled();
    });

    it('ensures out-of-order payment.captured cannot overwrite an already refunded transaction or booking', async () => {
      const payloadObj = {
        event: 'payment.captured',
        id: 'evt_captured_after_refund_666',
        payload: {
          payment: {
            entity: {
              id: 'pay_refunded_666',
              order_id: 'order_refunded_666',
              amount: 150000,
              currency: 'INR',
            },
          },
        },
      };
      const rawPayload = JSON.stringify(payloadObj);
      const validSignature = crypto
        .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawPayload)
        .digest('hex');

      vi.spyOn(WebhookEvent, 'create').mockResolvedValue({} as any);

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayOrderId: 'order_refunded_666',
        amountInPaise: 150000,
        currency: 'INR',
        status: 'refunded', // Already refunded
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const updateTxSpy = vi.spyOn(PaymentTransaction, 'updateOne');
      const updateBookingSpy = vi.spyOn(Booking, 'updateOne');

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      // Because status is refunded, updateOne was not invoked to transition back to captured
      expect(updateTxSpy).not.toHaveBeenCalled();
      expect(updateBookingSpy).not.toHaveBeenCalled();
    });

    it('ensures duplicate payment.captured does not re-apply updates when already captured', async () => {
      const payloadObj = {
        event: 'payment.captured',
        id: 'evt_captured_dup_777',
        payload: {
          payment: {
            entity: {
              id: 'pay_captured_777',
              order_id: 'order_captured_777',
              amount: 150000,
              currency: 'INR',
            },
          },
        },
      };
      const rawPayload = JSON.stringify(payloadObj);
      const validSignature = crypto
        .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawPayload)
        .digest('hex');

      vi.spyOn(WebhookEvent, 'create').mockResolvedValue({} as any);

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayOrderId: 'order_captured_777',
        amountInPaise: 150000,
        currency: 'INR',
        status: 'captured', // Already captured
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const updateTxSpy = vi.spyOn(PaymentTransaction, 'updateOne');
      const updateBookingSpy = vi.spyOn(Booking, 'updateOne');

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(updateTxSpy).not.toHaveBeenCalled();
      expect(updateBookingSpy).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/payments/booking/:bookingId', () => {
    it('returns customer-specific view without revealing internal commission', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        paymentStatus: 'paid',
        paymentDueAt: new Date(),
      };
      mockBookingFindById(mockBooking);

      const mockTx = {
        razorpayOrderId: 'order_123',
        razorpayPaymentId: 'pay_456',
        status: 'captured',
        baseSessionFee: 1000,
        platformCommission: 200,
        coachAllocation: 800,
        taxAmount: 0,
        taxRatePercentage: 0,
        totalCustomerPayable: 1000,
        currency: 'INR',
        paidAt: new Date(),
      };
      const sortQuery: any = {
        sort: vi.fn().mockResolvedValue(mockTx),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockReturnValue(sortQuery as any);

      const res = await request(app)
        .get(`/api/payments/booking/${bookingId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.transaction.coachingFee).toBe(1000);
      expect(res.body.transaction.totalAmount).toBe(1000);
      expect(res.body.transaction.platformCommission).toBeUndefined();
      expect(res.body.transaction.coachAllocation).toBeUndefined();
    });

    it('returns coach-specific view with 80% coach allocation', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        paymentStatus: 'paid',
      };
      mockBookingFindById(mockBooking);

      const mockTx = {
        status: 'captured',
        baseSessionFee: 1000,
        coachAllocation: 800,
        currency: 'INR',
        paidAt: new Date(),
      };
      const sortQuery: any = {
        sort: vi.fn().mockResolvedValue(mockTx),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockReturnValue(sortQuery as any);

      const res = await request(app)
        .get(`/api/payments/booking/${bookingId}`)
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(200);
      expect(res.body.coachingFee).toBe(1000);
      expect(res.body.coachAllocation).toBe(800);
    });

    it('returns complete financial ledger to platform administrator', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        paymentStatus: 'paid',
      };
      mockBookingFindById(mockBooking);

      const mockTx = {
        _id: new mongoose.Types.ObjectId(),
        razorpayOrderId: 'order_123',
        razorpayPaymentId: 'pay_456',
        status: 'captured',
        payoutStatus: 'simulated_held',
        baseSessionFee: 1000,
        platformCommission: 200,
        coachAllocation: 800,
        taxAmount: 0,
        taxRatePercentage: 0,
        totalCustomerPayable: 1000,
        currency: 'INR',
        paidAt: new Date(),
      };
      const sortQuery: any = {
        sort: vi.fn().mockResolvedValue(mockTx),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockReturnValue(sortQuery as any);

      const res = await request(app)
        .get(`/api/payments/booking/${bookingId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ledger.platformCommission).toBe(200);
      expect(res.body.ledger.coachAllocation).toBe(800);
      expect(res.body.ledger.payoutStatus).toBe('simulated_held');
    });

    it('returns complete financial ledger with excess refund alert to platform administrator', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        paymentStatus: 'partially_refunded',
      };
      mockBookingFindById(mockBooking);

      const mockTx = {
        _id: new mongoose.Types.ObjectId(),
        razorpayOrderId: 'order_123',
        razorpayPaymentId: 'pay_456',
        status: 'captured',
        refundStatus: 'partially_refunded',
        refundedAmountInPaise: 70000,
        refunds: [],
        hasExcessRefundAlert: true,
        excessRefundReason: 'Excess refund rejected: attempted cumulative refund exceeds limit',
        payoutStatus: 'simulated_held',
        baseSessionFee: 1000,
        platformCommission: 200,
        coachAllocation: 800,
        taxAmount: 0,
        taxRatePercentage: 0,
        totalCustomerPayable: 1000,
        currency: 'INR',
        paidAt: new Date(),
      };
      const sortQuery: any = {
        sort: vi.fn().mockResolvedValue(mockTx),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockReturnValue(sortQuery as any);

      const res = await request(app)
        .get(`/api/payments/booking/${bookingId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ledger.hasExcessRefundAlert).toBe(true);
      expect(res.body.ledger.excessRefundReason).toContain('Excess refund rejected');
    });

    it('does not falsely represent a pending refund as successfully refunded in customer view', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        paymentStatus: 'paid',
        refundStatus: 'pending',
        paymentDueAt: new Date(),
      };
      mockBookingFindById(mockBooking);

      const mockTx = {
        razorpayOrderId: 'order_test_pending_rfnd',
        razorpayPaymentId: 'pay_test_pending_rfnd',
        status: 'captured',
        refundStatus: 'pending',
        refundedAmountInPaise: 0,
        baseSessionFee: 1500,
        taxAmount: 0,
        taxRatePercentage: 0,
        totalCustomerPayable: 1500,
        currency: 'INR',
        paidAt: new Date(),
      };
      const sortQuery: any = {
        sort: vi.fn().mockResolvedValue(mockTx),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockReturnValue(sortQuery as any);

      const res = await request(app)
        .get(`/api/payments/booking/${bookingId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.paymentStatus).toBe('paid');
      expect(res.body.refundStatus).toBe('pending');
      expect(res.body.transaction.status).toBe('captured');
      expect(res.body.transaction.refundStatus).toBe('pending');
      expect(res.body.transaction.refundedAmount).toBe(0); // Not claimed as returned!
    });
  });

  describe('Gateway Reconciliation Service (reconcilePaymentWithGateway)', () => {
    it('reconciles missing gateway refund record and updates cumulative amount', async () => {
      const paymentId = 'pay_reconcile_1';
      const orderId = 'order_reconcile_1';

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: paymentId,
        razorpayOrderId: orderId,
        amountInPaise: 100000,
        status: 'captured',
        refundStatus: 'none',
        refundedAmountInPaise: 0,
        refunds: [],
        baseSessionFee: 1000,
        platformCommission: 200,
        coachAllocation: 800,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      vi.spyOn(Booking, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);

      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: paymentId,
        entity: 'payment',
        amount: 100000,
        currency: 'INR',
        status: 'captured',
        order_id: orderId,
        amount_refunded: 30000,
        refund_status: 'partial',
      });

      vi.spyOn(razorpayService, 'fetchRazorpayPaymentRefunds').mockResolvedValue([
        {
          id: 'rfnd_gw_001',
          entity: 'refund',
          amount: 30000,
          currency: 'INR',
          payment_id: paymentId,
          status: 'processed',
          created_at: 1700000000,
        },
      ]);

      const result = await reconcilePaymentWithGateway(paymentId);

      expect(result.localRefundedAmountInPaise).toBe(30000);
      expect(result.gatewayRefundedAmountInPaise).toBe(30000);
      expect(result.hasDiscrepancy).toBe(false);
      expect(result.hasExcessRefundAlert).toBe(false);
      expect(mockTx.refunds.length).toBe(1);
      expect(mockTx.refunds[0].refundId).toBe('rfnd_gw_001');
      expect(mockTx.refunds[0].status).toBe('processed');
      expect(mockTx.refundStatus).toBe('partially_refunded');
    });

    it('is idempotent on repeated reconciliation without creating duplicate records', async () => {
      const paymentId = 'pay_reconcile_dup';
      const orderId = 'order_reconcile_dup';

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: paymentId,
        razorpayOrderId: orderId,
        amountInPaise: 100000,
        status: 'captured',
        refundStatus: 'partially_refunded',
        refundedAmountInPaise: 30000,
        refunds: [
          {
            refundId: 'rfnd_already_here',
            amountInPaise: 30000,
            status: 'processed',
            createdAt: new Date(),
            processedAt: new Date(),
          },
        ],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      vi.spyOn(Booking, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);

      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: paymentId,
        entity: 'payment',
        amount: 100000,
        currency: 'INR',
        status: 'captured',
        order_id: orderId,
        amount_refunded: 30000,
        refund_status: 'partial',
      });

      vi.spyOn(razorpayService, 'fetchRazorpayPaymentRefunds').mockResolvedValue([
        {
          id: 'rfnd_already_here',
          entity: 'refund',
          amount: 30000,
          currency: 'INR',
          payment_id: paymentId,
          status: 'processed',
          created_at: 1700000000,
        },
      ]);

      const result = await reconcilePaymentWithGateway(paymentId);

      expect(result.reconciledRefundsCount).toBe(1);
      expect(mockTx.refunds.length).toBe(1); // No duplicates!
      expect(mockTx.refundedAmountInPaise).toBe(30000);
    });

    it('excludes pending and failed gateway refunds from processed cumulative totals', async () => {
      const paymentId = 'pay_reconcile_pending_failed';
      const orderId = 'order_reconcile_pf';

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: paymentId,
        razorpayOrderId: orderId,
        amountInPaise: 100000,
        status: 'captured',
        refundStatus: 'none',
        refundedAmountInPaise: 0,
        refunds: [],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      vi.spyOn(Booking, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);

      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: paymentId,
        entity: 'payment',
        amount: 100000,
        currency: 'INR',
        status: 'captured',
        order_id: orderId,
        amount_refunded: 30000,
        refund_status: 'partial',
      });

      vi.spyOn(razorpayService, 'fetchRazorpayPaymentRefunds').mockResolvedValue([
        {
          id: 'rfnd_proc_1',
          entity: 'refund',
          amount: 30000,
          currency: 'INR',
          payment_id: paymentId,
          status: 'processed',
          created_at: 1700000000,
        },
        {
          id: 'rfnd_pending_2',
          entity: 'refund',
          amount: 20000,
          currency: 'INR',
          payment_id: paymentId,
          status: 'pending',
          created_at: 1700000010,
        },
        {
          id: 'rfnd_failed_3',
          entity: 'refund',
          amount: 10000,
          currency: 'INR',
          payment_id: paymentId,
          status: 'failed',
          created_at: 1700000020,
        },
      ]);

      const result = await reconcilePaymentWithGateway(paymentId);

      expect(result.localRefundedAmountInPaise).toBe(30000); // Only processed refund is counted
      expect(result.hasDiscrepancy).toBe(false);
      expect(mockTx.refunds.length).toBe(3);
      expect(mockTx.refunds.find((r: any) => r.refundId === 'rfnd_pending_2').status).toBe('pending');
      expect(mockTx.refunds.find((r: any) => r.refundId === 'rfnd_failed_3').status).toBe('failed');
    });

    it('flags excess refund discrepancy without silent capping when gateway refunds exceed original payment', async () => {
      const paymentId = 'pay_reconcile_excess';
      const orderId = 'order_reconcile_excess';

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: paymentId,
        razorpayOrderId: orderId,
        amountInPaise: 100000, // ₹1,000
        status: 'captured',
        refundStatus: 'none',
        refundedAmountInPaise: 0,
        refunds: [],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const bookingUpdateSpy = vi.spyOn(Booking, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);

      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: paymentId,
        entity: 'payment',
        amount: 100000,
        currency: 'INR',
        status: 'refunded',
        order_id: orderId,
        amount_refunded: 110000, // ₹1,100
        refund_status: 'full',
      });

      vi.spyOn(razorpayService, 'fetchRazorpayPaymentRefunds').mockResolvedValue([
        {
          id: 'rfnd_excess_1',
          entity: 'refund',
          amount: 70000,
          currency: 'INR',
          payment_id: paymentId,
          status: 'processed',
          created_at: 1700000000,
        },
        {
          id: 'rfnd_excess_2',
          entity: 'refund',
          amount: 40000,
          currency: 'INR',
          payment_id: paymentId,
          status: 'processed',
          created_at: 1700000010,
        },
      ]);

      const result = await reconcilePaymentWithGateway(paymentId);

      expect(result.localRefundedAmountInPaise).toBe(110000); // Authentic total, not silently capped!
      expect(result.hasExcessRefundAlert).toBe(true);
      expect(result.excessRefundReason).toMatch(/excess refund discrepancy/i);
      expect(mockTx.status).toBe('refunded');
      expect(bookingUpdateSpy).toHaveBeenCalledWith(
        { _id: bookingId },
        { $set: { paymentStatus: 'refunded', refundStatus: 'processed' } }
      );
    });

    it('flags discrepancy when gateway aggregate amount_refunded disagrees with sum of verified items', async () => {
      const paymentId = 'pay_reconcile_discrepancy';
      const orderId = 'order_reconcile_disc';

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: paymentId,
        razorpayOrderId: orderId,
        amountInPaise: 100000,
        status: 'captured',
        refundStatus: 'none',
        refundedAmountInPaise: 0,
        refunds: [],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      vi.spyOn(Booking, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);

      // Gateway claims 50,000 paise refunded, but individual refunds list only has 30,000 paise
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
          id: 'rfnd_only_30k',
          entity: 'refund',
          amount: 30000,
          currency: 'INR',
          payment_id: paymentId,
          status: 'processed',
          created_at: 1700000000,
        },
      ]);

      const result = await reconcilePaymentWithGateway(paymentId);

      expect(result.hasDiscrepancy).toBe(true);
      expect(result.discrepancyReason).toMatch(/disagrees with sum of verified processed refund items/i);
      expect(mockTx.hasReconciliationDiscrepancy).toBe(true);
      expect(mockTx.refunds.length).toBe(1); // Does not invent fictitious records!
    });

    it('rejects reconciliation when payment ID or currency or order ID mismatches', async () => {
      const paymentId = 'pay_mismatch_test';
      const orderId = 'order_valid';

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: paymentId,
        razorpayOrderId: orderId,
        amountInPaise: 100000,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);

      // Currency mismatch test
      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: paymentId,
        entity: 'payment',
        amount: 100000,
        currency: 'USD', // Invalid currency!
        status: 'captured',
        order_id: orderId,
      });

      await expect(reconcilePaymentWithGateway(paymentId)).rejects.toThrow(/currency mismatch/i);

      // Order ID mismatch test
      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: paymentId,
        entity: 'payment',
        amount: 100000,
        currency: 'INR',
        status: 'captured',
        order_id: 'order_different_rogue',
      });

      await expect(reconcilePaymentWithGateway(paymentId)).rejects.toThrow(/order association mismatch/i);
    });

    it('preserves platform commission and coach allocation immutably during reconciliation', async () => {
      const paymentId = 'pay_reconcile_alloc';
      const orderId = 'order_reconcile_alloc';

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: paymentId,
        razorpayOrderId: orderId,
        amountInPaise: 100000,
        baseSessionFee: 1000,
        platformCommission: 200,
        coachAllocation: 800,
        status: 'captured',
        refundStatus: 'none',
        refundedAmountInPaise: 0,
        refunds: [],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      vi.spyOn(Booking, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);

      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: paymentId,
        entity: 'payment',
        amount: 100000,
        currency: 'INR',
        status: 'captured',
        order_id: orderId,
        amount_refunded: 30000,
        refund_status: 'partial',
      });

      vi.spyOn(razorpayService, 'fetchRazorpayPaymentRefunds').mockResolvedValue([
        {
          id: 'rfnd_alloc_1',
          entity: 'refund',
          amount: 30000,
          currency: 'INR',
          payment_id: paymentId,
          status: 'processed',
          created_at: 1700000000,
        },
      ]);

      await reconcilePaymentWithGateway(paymentId);

      expect(mockTx.baseSessionFee).toBe(1000);
      expect(mockTx.platformCommission).toBe(200);
      expect(mockTx.coachAllocation).toBe(800);
    });

    it('admin endpoint POST /api/payments/reconcile/:paymentId executes reconciliation successfully', async () => {
      const paymentId = 'pay_admin_reconcile';
      const orderId = 'order_admin_reconcile';

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: paymentId,
        razorpayOrderId: orderId,
        amountInPaise: 100000,
        status: 'captured',
        refundStatus: 'none',
        refundedAmountInPaise: 0,
        refunds: [],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      vi.spyOn(Booking, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);

      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: paymentId,
        entity: 'payment',
        amount: 100000,
        currency: 'INR',
        status: 'captured',
        order_id: orderId,
        amount_refunded: 30000,
        refund_status: 'partial',
      });

      vi.spyOn(razorpayService, 'fetchRazorpayPaymentRefunds').mockResolvedValue([
        {
          id: 'rfnd_admin_1',
          entity: 'refund',
          amount: 30000,
          currency: 'INR',
          payment_id: paymentId,
          status: 'processed',
          created_at: 1700000000,
        },
      ]);

      const res = await request(app)
        .post(`/api/payments/reconcile/${paymentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.reconciliation.paymentId).toBe(paymentId);
      expect(res.body.reconciliation.localRefundedAmountInPaise).toBe(30000);
    });
  });

  describe('Razorpay Refund Pagination & Multi-Page Collection', () => {
    const testAuth = {
      keyId: 'rzp_test_pagination_suite',
      keySecret: 'secret_pagination_suite',
    };

    function createMockRefundBatch(
      count: number,
      startIndex = 0,
      status: 'processed' | 'pending' | 'failed' = 'processed',
      paymentId = 'pay_paginate_test'
    ) {
      const items = [];
      for (let i = 0; i < count; i++) {
        const idx = startIndex + i;
        items.push({
          id: `rfnd_mock_${idx}`,
          entity: 'refund',
          amount: 1000,
          currency: 'INR',
          payment_id: paymentId,
          status,
          created_at: 1700000000 + idx,
        });
      }
      return items;
    }

    it('1. fetches a single page containing fewer than 100 refunds completely', async () => {
      const items = createMockRefundBatch(15);
      const requestedUrls: string[] = [];

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        requestedUrls.push(url.toString());
        return {
          ok: true,
          status: 200,
          json: async () => ({ entity: 'collection', count: 15, items }),
        } as Response;
      });

      const result = await fetchRazorpayPaymentRefunds('pay_paginate_test', testAuth);

      expect(result.length).toBe(15);
      expect(requestedUrls.length).toBe(1);
      expect(requestedUrls[0]).toContain('count=100&skip=0');
    });

    it('2. fetches exactly 100 refunds on page 1 followed by a second page and terminates', async () => {
      const page1Items = createMockRefundBatch(100, 0);
      const page2Items = createMockRefundBatch(25, 100);
      const requestedUrls: string[] = [];

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        requestedUrls.push(urlStr);

        if (urlStr.includes('skip=0')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entity: 'collection', count: 125, items: page1Items }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ entity: 'collection', count: 125, items: page2Items }),
        } as Response;
      });

      const result = await fetchRazorpayPaymentRefunds('pay_paginate_test', testAuth);

      expect(result.length).toBe(125);
      expect(requestedUrls.length).toBe(2);
      expect(requestedUrls[0]).toContain('count=100&skip=0');
      expect(requestedUrls[1]).toContain('count=100&skip=100');
    });

    it('3. retrieves more than 10 refunds without default-limit truncation', async () => {
      const items = createMockRefundBatch(25);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ entity: 'collection', count: 25, items }),
      } as Response);

      const result = await fetchRazorpayPaymentRefunds('pay_paginate_test', testAuth);
      expect(result.length).toBe(25);
    });

    it('4. retrieves more than 100 refunds across 3 pages (235 refunds total)', async () => {
      const page1 = createMockRefundBatch(100, 0);
      const page2 = createMockRefundBatch(100, 100);
      const page3 = createMockRefundBatch(35, 200);
      const requestedUrls: string[] = [];

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        requestedUrls.push(urlStr);

        if (urlStr.includes('skip=0')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entity: 'collection', count: 235, items: page1 }),
          } as Response;
        }
        if (urlStr.includes('skip=100')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entity: 'collection', count: 235, items: page2 }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ entity: 'collection', count: 235, items: page3 }),
        } as Response;
      });

      const result = await fetchRazorpayPaymentRefunds('pay_paginate_test', testAuth);

      expect(result.length).toBe(235);
      expect(requestedUrls.length).toBe(3);
      expect(requestedUrls[0]).toContain('skip=0');
      expect(requestedUrls[1]).toContain('skip=100');
      expect(requestedUrls[2]).toContain('skip=200');
    });

    it('5. handles an empty first page correctly without looping', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ entity: 'collection', count: 0, items: [] }),
      } as Response);

      const result = await fetchRazorpayPaymentRefunds('pay_paginate_test', testAuth);
      expect(result).toEqual([]);
    });

    it('6. handles an empty subsequent page safely and terminates', async () => {
      const page1 = createMockRefundBatch(100, 0);
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('skip=0')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entity: 'collection', count: 100, items: page1 }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ entity: 'collection', count: 100, items: [] }),
        } as Response;
      });

      const result = await fetchRazorpayPaymentRefunds('pay_paginate_test', testAuth);
      expect(result.length).toBe(100);
    });

    it('7. deduplicates refund IDs across pages while incrementing skip by raw batch count', async () => {
      const page1 = createMockRefundBatch(100, 0); // IDs 0..99
      const page2 = createMockRefundBatch(25, 95); // IDs 95..119 (5 overlapping items)
      const requestedUrls: string[] = [];

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        requestedUrls.push(urlStr);

        if (urlStr.includes('skip=0')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entity: 'collection', count: 125, items: page1 }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ entity: 'collection', count: 125, items: page2 }),
        } as Response;
      });

      const result = await fetchRazorpayPaymentRefunds('pay_paginate_test', testAuth);

      // Total unique items: 100 + 20 = 120 (5 overlapping items deduplicated)
      expect(result.length).toBe(120);
      // Skip incremented by raw count (100)
      expect(requestedUrls[1]).toContain('skip=100');
    });

    it('8. increments skip correctly based on actual raw records returned', async () => {
      const page1 = createMockRefundBatch(100, 0);
      const page2 = createMockRefundBatch(50, 100);
      const requestedUrls: string[] = [];

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        requestedUrls.push(urlStr);

        if (urlStr.includes('skip=0')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entity: 'collection', count: 150, items: page1 }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ entity: 'collection', count: 150, items: page2 }),
        } as Response;
      });

      await fetchRazorpayPaymentRefunds('pay_paginate_test', testAuth);

      expect(requestedUrls[0]).toContain('count=100&skip=0');
      expect(requestedUrls[1]).toContain('count=100&skip=100');
    });

    it('9. fails the entire operation when page two encounters an HTTP error (never returns partial collection)', async () => {
      const page1 = createMockRefundBatch(100, 0);

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('skip=0')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entity: 'collection', count: 150, items: page1 }),
          } as Response;
        }
        return {
          ok: false,
          status: 502,
          json: async () => ({ error: { description: 'Bad Gateway upstream error' } }),
        } as Response;
      });

      await expect(fetchRazorpayPaymentRefunds('pay_paginate_test', testAuth)).rejects.toThrow(
        /Razorpay payment refunds fetch failed on page 2 \(skip=100\)/i
      );
    });

    it('10. fails the entire operation when a later page encounters a network error', async () => {
      const page1 = createMockRefundBatch(100, 0);
      const page2 = createMockRefundBatch(100, 100);

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('skip=0')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entity: 'collection', count: 250, items: page1 }),
          } as Response;
        }
        if (urlStr.includes('skip=100')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entity: 'collection', count: 250, items: page2 }),
          } as Response;
        }
        throw new Error('ETIMEDOUT connecting to api.razorpay.com');
      });

      await expect(fetchRazorpayPaymentRefunds('pay_paginate_test', testAuth)).rejects.toThrow(
        /Failed to reach Razorpay gateway on page 3 \(skip=200\)/i
      );
    });

    it('11. rejects safely when gateway returns a malformed collection response without items array', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ entity: 'collection', items: null }),
      } as Response);

      await expect(fetchRazorpayPaymentRefunds('pay_paginate_test', testAuth)).rejects.toThrow(
        /Malformed gateway collection response/i
      );
    });

    it('12. reconciliation uses all retrieved paginated pages to match gateway aggregate', async () => {
      const paymentId = 'pay_multi_page_recon';
      const orderId = 'order_multi_page_recon';

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: paymentId,
        razorpayOrderId: orderId,
        amountInPaise: 200000,
        status: 'captured',
        refundStatus: 'none',
        refundedAmountInPaise: 0,
        refunds: [],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      vi.spyOn(Booking, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);

      // Total 125 refunds of 1000 paise (₹10) each = 125,000 paise (₹1,250)
      const all125Refunds = createMockRefundBatch(125, 0, 'processed', paymentId);

      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: paymentId,
        entity: 'payment',
        amount: 200000,
        currency: 'INR',
        status: 'captured',
        order_id: orderId,
        amount_refunded: 125000,
        refund_status: 'partial',
      });

      vi.spyOn(razorpayService, 'fetchRazorpayPaymentRefunds').mockResolvedValue(all125Refunds);

      const result = await reconcilePaymentWithGateway(paymentId);

      expect(result.reconciledRefundsCount).toBe(125);
      expect(result.localRefundedAmountInPaise).toBe(125000);
      expect(result.gatewayRefundedAmountInPaise).toBe(125000);
      expect(result.hasDiscrepancy).toBe(false);
      expect(mockTx.refunds.length).toBe(125);
    });

    it('13. incomplete retrieval failure does not modify local transaction or booking', async () => {
      const paymentId = 'pay_recon_fail_safe';
      const orderId = 'order_recon_fail_safe';

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: paymentId,
        razorpayOrderId: orderId,
        amountInPaise: 100000,
        status: 'captured',
        refundStatus: 'none',
        refundedAmountInPaise: 0,
        refunds: [],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const bookingUpdateSpy = vi.spyOn(Booking, 'updateOne');

      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: paymentId,
        entity: 'payment',
        amount: 100000,
        currency: 'INR',
        status: 'captured',
        order_id: orderId,
        amount_refunded: 50000,
      });

      // Simulation of a mid-pagination failure
      vi.spyOn(razorpayService, 'fetchRazorpayPaymentRefunds').mockRejectedValue(
        new Error('Razorpay payment refunds fetch failed on page 2 (skip=100): HTTP 500')
      );

      await expect(reconcilePaymentWithGateway(paymentId)).rejects.toThrow(/fetch failed on page 2/i);

      // Verify no mutations were saved to the local database
      expect(mockTx.save).not.toHaveBeenCalled();
      expect(bookingUpdateSpy).not.toHaveBeenCalled();
      expect(mockTx.refundedAmountInPaise).toBe(0);
      expect(mockTx.refunds.length).toBe(0);
    });

    it('14. repeated reconciliation across paginated collections remains completely idempotent', async () => {
      const paymentId = 'pay_multi_page_idempotent';
      const orderId = 'order_multi_page_idemp';

      const all125Refunds = createMockRefundBatch(125, 0, 'processed', paymentId);

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: paymentId,
        razorpayOrderId: orderId,
        amountInPaise: 200000,
        status: 'captured',
        refundStatus: 'partially_refunded',
        refundedAmountInPaise: 125000,
        // Transaction already contains these 125 items from prior run
        refunds: all125Refunds.map((r) => ({
          refundId: r.id,
          amountInPaise: r.amount,
          status: r.status,
          createdAt: new Date(r.created_at * 1000),
          processedAt: new Date(),
        })),
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      vi.spyOn(Booking, 'updateOne').mockResolvedValue({ matchedCount: 1 } as any);

      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: paymentId,
        entity: 'payment',
        amount: 200000,
        currency: 'INR',
        status: 'captured',
        order_id: orderId,
        amount_refunded: 125000,
        refund_status: 'partial',
      });

      vi.spyOn(razorpayService, 'fetchRazorpayPaymentRefunds').mockResolvedValue(all125Refunds);

      const result = await reconcilePaymentWithGateway(paymentId);

      expect(result.localRefundedAmountInPaise).toBe(125000);
      expect(mockTx.refunds.length).toBe(125); // Exactly 125, zero duplicates!
    });

    it('15. 9,999 refunds: returns all 9,999 records without probe request (page 100 has 99 items)', async () => {
      const requestedUrls: string[] = [];

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        requestedUrls.push(urlStr);
        const match = urlStr.match(/skip=(\d+)/);
        const skipVal = match ? parseInt(match[1], 10) : 0;

        // Pages 0 to 98 (skip 0 to 9800): 100 items each (9900 items)
        // Page 99 (skip 9900): 99 items (total 9999 items)
        const batchSize = skipVal === 9900 ? 99 : 100;
        const items = [];
        for (let i = 0; i < batchSize; i++) {
          items.push({
            id: `rfnd_9999_${skipVal + i}`,
            entity: 'refund',
            amount: 1000,
            currency: 'INR',
            payment_id: 'pay_paginate_test',
            status: 'processed',
            created_at: 1700000000 + skipVal + i,
          });
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ entity: 'collection', count: 9999, items }),
        } as Response;
      });

      const result = await fetchRazorpayPaymentRefunds('pay_paginate_test', testAuth);

      expect(result.length).toBe(9999);
      expect(requestedUrls.length).toBe(100);
      expect(requestedUrls[99]).toContain('skip=9900');
      // Verify no probe request was made beyond page 100
      expect(requestedUrls.some((u) => u.includes('skip=10000'))).toBe(false);
    });

    it('16. exactly 10,000 refunds: returns all records after probe page 101 returns empty collection', async () => {
      const requestedUrls: string[] = [];

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        requestedUrls.push(urlStr);
        const match = urlStr.match(/skip=(\d+)/);
        const skipVal = match ? parseInt(match[1], 10) : 0;

        if (skipVal >= 10000) {
          // Probe request for page 101
          return {
            ok: true,
            status: 200,
            json: async () => ({ entity: 'collection', count: 10000, items: [] }),
          } as Response;
        }

        // Pages 1..100 (skip 0..9900) return 100 items each
        const items = [];
        for (let i = 0; i < 100; i++) {
          items.push({
            id: `rfnd_10k_${skipVal + i}`,
            entity: 'refund',
            amount: 1000,
            currency: 'INR',
            payment_id: 'pay_paginate_test',
            status: 'processed',
            created_at: 1700000000 + skipVal + i,
          });
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ entity: 'collection', count: 10000, items }),
        } as Response;
      });

      const result = await fetchRazorpayPaymentRefunds('pay_paginate_test', testAuth);

      expect(result.length).toBe(10000);
      expect(requestedUrls.length).toBe(101); // 100 data pages + 1 probe page
      expect(requestedUrls[100]).toContain('count=100&skip=10000');
    });

    it('17. 10,001 refunds: throws PAGINATION_LIMIT_EXCEEDED when probe page 101 returns 1 item', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        const match = urlStr.match(/skip=(\d+)/);
        const skipVal = match ? parseInt(match[1], 10) : 0;

        if (skipVal >= 10000) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              entity: 'collection',
              count: 10001,
              items: [
                {
                  id: 'rfnd_overflow_10001',
                  entity: 'refund',
                  amount: 1000,
                  currency: 'INR',
                  payment_id: 'pay_paginate_test',
                  status: 'processed',
                  created_at: 1700010001,
                },
              ],
            }),
          } as Response;
        }

        const items = [];
        for (let i = 0; i < 100; i++) {
          items.push({
            id: `rfnd_10001_${skipVal + i}`,
            entity: 'refund',
            amount: 1000,
            currency: 'INR',
            payment_id: 'pay_paginate_test',
            status: 'processed',
            created_at: 1700000000 + skipVal + i,
          });
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ entity: 'collection', count: 10001, items }),
        } as Response;
      });

      await expect(fetchRazorpayPaymentRefunds('pay_paginate_test', testAuth)).rejects.toThrow(
        /PAGINATION_LIMIT_EXCEEDED/i
      );
    });

    it('18. more than 10,000 refunds (e.g. 10,050): throws PAGINATION_LIMIT_EXCEEDED without returning partial results', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        const match = urlStr.match(/skip=(\d+)/);
        const skipVal = match ? parseInt(match[1], 10) : 0;

        if (skipVal >= 10000) {
          const probeItems = [];
          for (let i = 0; i < 50; i++) {
            probeItems.push({
              id: `rfnd_extra_${i}`,
              entity: 'refund',
              amount: 1000,
              currency: 'INR',
              payment_id: 'pay_paginate_test',
              status: 'processed',
              created_at: 1700010000 + i,
            });
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ entity: 'collection', count: 10050, items: probeItems }),
          } as Response;
        }

        const items = [];
        for (let i = 0; i < 100; i++) {
          items.push({
            id: `rfnd_10050_${skipVal + i}`,
            entity: 'refund',
            amount: 1000,
            currency: 'INR',
            payment_id: 'pay_paginate_test',
            status: 'processed',
            created_at: 1700000000 + skipVal + i,
          });
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ entity: 'collection', count: 10050, items }),
        } as Response;
      });

      await expect(fetchRazorpayPaymentRefunds('pay_paginate_test', testAuth)).rejects.toThrow(
        /PAGINATION_LIMIT_EXCEEDED/i
      );
    });

    it('19. page 101 network failure: safely throws and fails entire operation', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        const match = urlStr.match(/skip=(\d+)/);
        const skipVal = match ? parseInt(match[1], 10) : 0;

        if (skipVal >= 10000) {
          throw new Error('ETIMEDOUT connecting to api.razorpay.com during probe');
        }

        const items = [];
        for (let i = 0; i < 100; i++) {
          items.push({
            id: `rfnd_probe_net_${skipVal + i}`,
            entity: 'refund',
            amount: 1000,
            currency: 'INR',
            payment_id: 'pay_paginate_test',
            status: 'processed',
            created_at: 1700000000 + skipVal + i,
          });
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ entity: 'collection', count: 10000, items }),
        } as Response;
      });

      await expect(fetchRazorpayPaymentRefunds('pay_paginate_test', testAuth)).rejects.toThrow(
        /Failed to reach Razorpay gateway during pagination limit probe/i
      );
    });

    it('20. probe response malformed: safely throws when probe response is missing items array', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        const match = urlStr.match(/skip=(\d+)/);
        const skipVal = match ? parseInt(match[1], 10) : 0;

        if (skipVal >= 10000) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entity: 'collection', items: 'not-an-array' }),
          } as Response;
        }

        const items = [];
        for (let i = 0; i < 100; i++) {
          items.push({
            id: `rfnd_probe_malf_${skipVal + i}`,
            entity: 'refund',
            amount: 1000,
            currency: 'INR',
            payment_id: 'pay_paginate_test',
            status: 'processed',
            created_at: 1700000000 + skipVal + i,
          });
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ entity: 'collection', count: 10000, items }),
        } as Response;
      });

      await expect(fetchRazorpayPaymentRefunds('pay_paginate_test', testAuth)).rejects.toThrow(
        /Malformed gateway collection response on pagination probe/i
      );
    });

    it('21. reconciliation never performs database writes when the pagination limit is exceeded', async () => {
      const paymentId = 'pay_recon_limit_exceeded';
      const orderId = 'order_recon_limit_exceeded';

      const mockTx: any = {
        _id: new mongoose.Types.ObjectId(),
        bookingId,
        razorpayPaymentId: paymentId,
        razorpayOrderId: orderId,
        amountInPaise: 20000000, // 200,000 INR
        status: 'captured',
        refundStatus: 'none',
        refundedAmountInPaise: 0,
        refunds: [],
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const bookingUpdateSpy = vi.spyOn(Booking, 'updateOne');

      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: paymentId,
        entity: 'payment',
        amount: 20000000,
        currency: 'INR',
        status: 'captured',
        order_id: orderId,
        amount_refunded: 15000000,
        refund_status: 'partial',
      });

      // Mid-retrieval pagination limit error
      vi.spyOn(razorpayService, 'fetchRazorpayPaymentRefunds').mockRejectedValue(
        new Error('PAGINATION_LIMIT_EXCEEDED: Payment refunds collection exceeds maximum supported limit of 10000 records (100 pages).')
      );

      await expect(reconcilePaymentWithGateway(paymentId)).rejects.toThrow(/PAGINATION_LIMIT_EXCEEDED/i);

      // Verify strict isolation: local transaction and booking are never written
      expect(mockTx.save).not.toHaveBeenCalled();
      expect(bookingUpdateSpy).not.toHaveBeenCalled();
      expect(mockTx.refundedAmountInPaise).toBe(0);
      expect(mockTx.refunds.length).toBe(0);
    });
  });

  describe('Razorpay Service Unit Functions', () => {
    it('verifies valid HMAC-SHA256 signature and rejects tampered signature', () => {
      const orderId = 'order_test_unit_1';
      const paymentId = 'pay_test_unit_1';
      const secret = 'test_secret_for_unit_tests';
      const validSig = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      expect(verifyRazorpaySignature({ orderId, paymentId, signature: validSig, secret })).toBe(true);
      expect(verifyRazorpaySignature({ orderId, paymentId, signature: 'bad_sig', secret })).toBe(false);
      expect(verifyRazorpaySignature({ orderId: 'wrong_order', paymentId, signature: validSig, secret })).toBe(false);
    });

    it('verifies valid webhook raw body signature and rejects tampered signature', () => {
      const rawBody = '{"event":"payment.captured","test":true}';
      const secret = 'webhook_secret_unit_test';
      const validSig = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      expect(verifyRazorpayWebhookSignature({ rawBody, signature: validSig, secret })).toBe(true);
      expect(verifyRazorpayWebhookSignature({ rawBody, signature: 'tampered', secret })).toBe(false);
      expect(verifyRazorpayWebhookSignature({ rawBody: 'modified', signature: validSig, secret })).toBe(false);
    });

    it('throws error when placeholder or unconfigured credentials are used in createRazorpayOrder', async () => {
      await expect(
        razorpayService.createRazorpayOrder({
          amountInPaise: 100000,
          receipt: 'rcpt_test',
        })
      ).rejects.toThrow(/credentials are not configured/i);
    });

    it('throws error when placeholder or unconfigured credentials are used in fetchRazorpayPayment', async () => {
      await expect(
        razorpayService.fetchRazorpayPayment('pay_any_id')
      ).rejects.toThrow(/credentials are not configured/i);
    });

    it('throws error when placeholder or unconfigured credentials are used in fetchRazorpayPaymentRefunds', async () => {
      await expect(
        razorpayService.fetchRazorpayPaymentRefunds('pay_any_id')
      ).rejects.toThrow(/credentials are not configured/i);
    });
  });
});
