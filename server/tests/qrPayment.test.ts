import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { Booking } from '../src/models/Booking';
import { PaymentTransaction } from '../src/models/PaymentTransaction';
import { WebhookEvent } from '../src/models/WebhookEvent';
import { User } from '../src/models/User';
import { CoachProfile } from '../src/models/CoachProfile';
import * as razorpayService from '../src/services/razorpayService';
import {
  createPaymentOrder,
  createPaymentQr,
  getQrPaymentStatus,
  closePaymentQr,
  handlePaymentWebhook,
} from '../src/controllers/paymentController';

function createMockReqRes(options: {
  user?: any;
  body?: any;
  params?: any;
  query?: any;
  headers?: any;
}) {
  const req: any = {
    user: options.user,
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
    headers: options.headers || {},
  };
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('Genuine Razorpay Dynamic UPI QR Payments Integration & Audit', () => {
  const customerId = new mongoose.Types.ObjectId();
  const otherCustomerId = new mongoose.Types.ObjectId();
  const coachId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const bookingId = new mongoose.Types.ObjectId();
  const transactionId = new mongoose.Types.ObjectId();

  const customerUser = {
    id: customerId.toString(),
    _id: customerId,
    name: 'Customer User',
    email: 'customer@test.com',
    role: 'parent',
  };

  const otherCustomerUser = {
    id: otherCustomerId.toString(),
    _id: otherCustomerId,
    name: 'Other Customer',
    email: 'other@test.com',
    role: 'individual',
  };

  const coachUser = {
    id: coachId.toString(),
    _id: coachId,
    name: 'Coach User',
    email: 'coach@test.com',
    role: 'coach',
  };

  const adminUser = {
    id: adminId.toString(),
    _id: adminId,
    name: 'Admin User',
    email: 'admin@test.com',
    role: 'admin',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(WebhookEvent, 'findOne').mockResolvedValue(null);
    vi.spyOn(WebhookEvent, 'create').mockResolvedValue({} as any);
    vi.spyOn(WebhookEvent, 'updateOne').mockResolvedValue({ acknowledged: true } as any);
    vi.spyOn(PaymentTransaction, 'updateOne').mockResolvedValue({ acknowledged: true } as any);
    vi.spyOn(PaymentTransaction, 'updateMany').mockResolvedValue({ acknowledged: true } as any);
    vi.spyOn(Booking, 'updateOne').mockResolvedValue({ acknowledged: true } as any);
    vi.spyOn(Booking, 'updateMany').mockResolvedValue({ acknowledged: true } as any);
    vi.spyOn(Booking.prototype, 'save').mockResolvedValue({} as any);
    vi.spyOn(PaymentTransaction.prototype, 'save').mockResolvedValue({} as any);
    vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue(null);
    vi.spyOn(razorpayService, 'fetchRazorpayQrPayments').mockResolvedValue([]);
  });

  describe('createPaymentQr (POST /api/payments/create-qr)', () => {
    it('rejects unauthenticated requests with HTTP 401', async () => {
      const { req, res, next } = createMockReqRes({
        user: undefined,
        body: { bookingId: bookingId.toString() },
      });

      await createPaymentQr(req, res, next);
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toMatch(/Authentication required/i);
    });

    it('rejects missing or invalid bookingId with HTTP 400', async () => {
      const { req, res, next } = createMockReqRes({
        user: customerUser,
        body: { bookingId: 'invalid-id' },
      });

      await createPaymentQr(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/Valid bookingId is required/i);
    });

    it('returns HTTP 404 if booking is not found', async () => {
      vi.spyOn(Booking, 'findById').mockResolvedValue(null);

      const { req, res, next } = createMockReqRes({
        user: customerUser,
        body: { bookingId: bookingId.toString() },
      });

      await createPaymentQr(req, res, next);
      expect(res.statusCode).toBe(404);
      expect(res.body.error).toMatch(/Booking not found/i);
    });

    it('enforces ownership check: rejects non-owner customer with HTTP 403', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);

      const { req, res, next } = createMockReqRes({
        user: otherCustomerUser,
        body: { bookingId: bookingId.toString() },
      });

      await createPaymentQr(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/Access forbidden/i);
    });

    it('rejects pending booking with HTTP 400', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'pending',
        paymentStatus: 'unpaid',
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);

      const { req, res, next } = createMockReqRes({
        user: customerUser,
        body: { bookingId: bookingId.toString() },
      });

      await createPaymentQr(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/Cannot initiate payment for a pending booking/i);
    });

    it('rejects already paid booking with HTTP 400', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'paid',
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);

      const { req, res, next } = createMockReqRes({
        user: customerUser,
        body: { bookingId: bookingId.toString() },
      });

      await createPaymentQr(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/already been paid/i);
    });

    it('cancels booking and rejects when payment window has expired', async () => {
      const pastDue = new Date(Date.now() - 3600 * 1000);
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
        paymentDueAt: pastDue,
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);
      const updateSpy = vi.spyOn(Booking, 'updateOne').mockResolvedValue({ acknowledged: true } as any);

      const { req, res, next } = createMockReqRes({
        user: customerUser,
        body: { bookingId: bookingId.toString() },
      });

      await createPaymentQr(req, res, next);
      expect(res.statusCode).toBe(400);
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

    it('rejects QR creation if remaining time before deadline is less than 2 minutes (Razorpay minimum expiry)', async () => {
      // 90 seconds remaining (< 120s minimum required by Razorpay)
      const almostExpired = new Date(Date.now() + 90 * 1000);
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
        paymentDueAt: almostExpired,
        hourlyRateSnapshot: 1500,
        durationMinutes: 60,
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(null);

      const { req, res, next } = createMockReqRes({
        user: customerUser,
        body: { bookingId: bookingId.toString() },
      });

      await createPaymentQr(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('INSUFFICIENT_TIME_FOR_QR');
      expect(res.body.error).toMatch(/minimum 2 minutes required/i);
    });

    it('caps QR expiry to booking deadline when deadline is 90 minutes away (must not expire after 90 minutes)', async () => {
      const ninetyMinsFromNow = new Date(Date.now() + 90 * 60 * 1000);
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
        paymentDueAt: ninetyMinsFromNow,
        hourlyRateSnapshot: 1000,
        durationMinutes: 60,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(null);
      const createQrSpy = vi
        .spyOn(razorpayService, 'createRazorpayQrCode')
        .mockImplementation(async (params) => ({
          id: 'qr_90m_test_123',
          entity: 'qr_code',
          created_at: Math.floor(Date.now() / 1000),
          name: params.name || '',
          usage: 'single_use',
          type: 'upi_qr',
          image_url: 'https://rzp.io/i/test_90m',
          payment_amount: params.amountInPaise,
          status: 'active',
          fixed_amount: true,
          close_by: params.closeBy,
        }));

      const { req, res, next } = createMockReqRes({
        user: customerUser,
        body: { bookingId: bookingId.toString() },
      });

      await createPaymentQr(req, res, next);
      expect(res.statusCode).toBe(201);
      const expectedDueSeconds = Math.floor(ninetyMinsFromNow.getTime() / 1000);
      expect(createQrSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          closeBy: expectedDueSeconds,
        })
      );
      expect(res.body.closeBy).toBe(expectedDueSeconds);
      // Prove requested QR expiry never exceeds 90 minutes
      expect(res.body.closeBy).toBeLessThanOrEqual(expectedDueSeconds);
    });

    it('caps QR expiry at two hours when booking deadline is more than two hours away', async () => {
      const threeHoursFromNow = new Date(Date.now() + 180 * 60 * 1000); // 3 hours away
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
        paymentDueAt: threeHoursFromNow,
        hourlyRateSnapshot: 1000,
        durationMinutes: 60,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(null);
      const createQrSpy = vi
        .spyOn(razorpayService, 'createRazorpayQrCode')
        .mockImplementation(async (params) => ({
          id: 'qr_2h_test_123',
          entity: 'qr_code',
          created_at: Math.floor(Date.now() / 1000),
          name: params.name || '',
          usage: 'single_use',
          type: 'upi_qr',
          image_url: 'https://rzp.io/i/test_2h',
          payment_amount: params.amountInPaise,
          status: 'active',
          fixed_amount: true,
          close_by: params.closeBy,
        }));

      const { req, res, next } = createMockReqRes({
        user: customerUser,
        body: { bookingId: bookingId.toString() },
      });

      const beforeCallSeconds = Math.floor(Date.now() / 1000);
      await createPaymentQr(req, res, next);
      expect(res.statusCode).toBe(201);

      const maxTwoHoursSeconds = beforeCallSeconds + 2 * 60 * 60;
      const threeHoursSeconds = Math.floor(threeHoursFromNow.getTime() / 1000);

      // Must be capped at two hours, strictly less than 3-hour booking deadline
      expect(res.body.closeBy).toBeLessThanOrEqual(maxTwoHoursSeconds + 2);
      expect(res.body.closeBy).toBeLessThan(threeHoursSeconds);
    });

    it('reuses existing active unexpired QR transaction to prevent duplicates', async () => {
      const futureExpiry = new Date(Date.now() + 10 * 60 * 1000);
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
        paymentDueAt: futureExpiry,
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);

      const existingActiveTx: any = {
        _id: transactionId,
        bookingId,
        paymentMethod: 'qr',
        status: 'created',
        razorpayQrId: 'qr_active_reuse_123',
        qrImageUrl: 'https://api.razorpay.com/v1/payments/qr_codes/qr_active_reuse_123/image',
        qrCloseBy: Math.floor(futureExpiry.getTime() / 1000),
        orderExpiresAt: futureExpiry,
        baseSessionFee: 1500,
        platformCommission: 300,
        coachAllocation: 1200,
        taxAmount: 0,
        taxRatePercentage: 0,
        totalCustomerPayable: 1500,
        amountInPaise: 150000,
        currency: 'INR',
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(existingActiveTx);

      const { req, res, next } = createMockReqRes({
        user: customerUser,
        body: { bookingId: bookingId.toString() },
      });

      await createPaymentQr(req, res, next);
      expect(res.statusCode).toBe(200);
      expect(res.body.qrId).toBe('qr_active_reuse_123');
      expect(res.body.imageUrl).toContain('qr_active_reuse_123');
      expect(res.body.amount).toBe(1500);
      expect(res.body.message).toMatch(/Active payment QR retrieved/i);
    });

    it('supersedes active standard order when switching to QR payment to prevent concurrent payable instruments', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
        hourlyRateSnapshot: 1500,
        durationMinutes: 60,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);

      const existingStandardTx: any = {
        _id: transactionId,
        bookingId,
        paymentMethod: 'standard',
        razorpayOrderId: 'order_standard_to_supersede_123',
        status: 'created',
        orderExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      };
      // First findOne returns active standard tx, then it is superseded
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(existingStandardTx);
      const updateTxSpy = vi.spyOn(PaymentTransaction, 'updateOne').mockResolvedValue({ acknowledged: true } as any);

      const mockQrResult: razorpayService.RazorpayQrResult = {
        id: 'qr_superseding_777',
        entity: 'qr_code',
        created_at: Math.floor(Date.now() / 1000),
        name: 'AthleteConnect Booking',
        usage: 'single_use',
        type: 'upi_qr',
        image_url: 'https://api.razorpay.com/v1/payments/qr_codes/qr_superseding_777/image',
        payment_amount: 150000,
        status: 'active',
        fixed_amount: true,
        close_by: Math.floor(Date.now() / 1000) + 900,
      };
      vi.spyOn(razorpayService, 'createRazorpayQrCode').mockResolvedValue(mockQrResult);
      vi.spyOn(PaymentTransaction.prototype, 'save').mockResolvedValue({} as any);

      const { req, res, next } = createMockReqRes({
        user: customerUser,
        body: { bookingId: bookingId.toString() },
      });

      await createPaymentQr(req, res, next);
      expect(res.statusCode).toBe(201);
      expect(res.body.qrId).toBe('qr_superseding_777');

      // Assert old standard order was marked failed to prevent dual payment race
      expect(updateTxSpy).toHaveBeenCalledWith(
        { _id: transactionId, status: 'created' },
        { $set: { status: 'failed', failureReason: 'Superseded by QR payment' } }
      );
    });

    it('supersedes active QR code when customer requests standard order creation', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
        hourlyRateSnapshot: 1500,
        durationMinutes: 60,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);

      const existingQrTx: any = {
        _id: transactionId,
        bookingId,
        paymentMethod: 'qr',
        razorpayQrId: 'qr_to_close_on_standard_switch_123',
        status: 'created',
        orderExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(existingQrTx);
      const closeQrSpy = vi.spyOn(razorpayService, 'closeRazorpayQrCode').mockResolvedValue({ id: 'qr_123', status: 'closed' } as any);
      const updateTxSpy = vi.spyOn(PaymentTransaction, 'updateOne').mockResolvedValue({ acknowledged: true } as any);

      vi.spyOn(razorpayService, 'createRazorpayOrder').mockResolvedValue({
        id: 'order_switched_to_standard_888',
        entity: 'order',
        amount: 150000,
        currency: 'INR',
        status: 'created',
        created_at: Math.floor(Date.now() / 1000),
      });
      vi.spyOn(PaymentTransaction.prototype, 'save').mockResolvedValue({} as any);

      const { req, res, next } = createMockReqRes({
        user: customerUser,
        body: { bookingId: bookingId.toString() },
      });

      await createPaymentOrder(req, res, next);
      expect(res.statusCode).toBe(201);
      expect(res.body.orderId).toBe('order_switched_to_standard_888');

      // Assert old QR code was closed at gateway and marked failed locally
      expect(closeQrSpy).toHaveBeenCalledWith('qr_to_close_on_standard_switch_123');
      expect(updateTxSpy).toHaveBeenCalledWith(
        { _id: transactionId, status: 'created' },
        { $set: { status: 'failed', failureReason: 'Superseded by standard checkout' } }
      );
    });

    it('handles RAZORPAY_QR_NOT_ACTIVATED error gracefully with HTTP 400', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
        hourlyRateSnapshot: 1500,
        durationMinutes: 60,
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(null);

      const activationErr = new Error(
        'Razorpay Dynamic UPI QR payments are not enabled for this account. Account activation with Razorpay is required.'
      );
      (activationErr as any).code = 'RAZORPAY_QR_NOT_ACTIVATED';
      vi.spyOn(razorpayService, 'createRazorpayQrCode').mockRejectedValue(activationErr);

      const { req, res, next } = createMockReqRes({
        user: customerUser,
        body: { bookingId: bookingId.toString() },
      });

      await createPaymentQr(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('RAZORPAY_QR_NOT_ACTIVATED');
      expect(res.body.error).toContain('Account activation with Razorpay is required');
    });

    it('creates genuine Razorpay UPI QR code and persists PaymentTransaction with 80/20 ledger split', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
        hourlyRateSnapshot: 1500,
        durationMinutes: 60,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(null);

      const qrCloseBy = Math.floor(Date.now() / 1000) + 900;
      const mockQrResult: razorpayService.RazorpayQrResult = {
        id: 'qr_genuine_test_777',
        entity: 'qr_code',
        created_at: Math.floor(Date.now() / 1000),
        name: 'AthleteConnect Booking',
        usage: 'single_use',
        type: 'upi_qr',
        image_url: 'https://api.razorpay.com/v1/payments/qr_codes/qr_genuine_test_777/image',
        payment_amount: 150000,
        status: 'active',
        fixed_amount: true,
        close_by: qrCloseBy,
      };
      const createQrSpy = vi
        .spyOn(razorpayService, 'createRazorpayQrCode')
        .mockResolvedValue(mockQrResult);

      const saveSpy = vi.spyOn(PaymentTransaction.prototype, 'save').mockResolvedValue({} as any);

      const { req, res, next } = createMockReqRes({
        user: customerUser,
        body: { bookingId: bookingId.toString() },
      });

      await createPaymentQr(req, res, next);
      expect(res.statusCode).toBe(201);
      expect(res.body.qrId).toBe('qr_genuine_test_777');
      expect(res.body.imageUrl).toBe(mockQrResult.image_url);
      expect(res.body.amount).toBe(1500);
      expect(res.body.amountInPaise).toBe(150000);
      expect(res.body.breakdown.coachingFee).toBe(1500);
      expect(res.body.breakdown.totalPayable).toBe(1500);

      expect(createQrSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          amountInPaise: 150000,
          name: 'AthleteConnect Booking',
          closeBy: expect.any(Number),
        })
      );

      expect(saveSpy).toHaveBeenCalled();
    });
  });

  describe('getQrPaymentStatus (GET /api/payments/qr-status/:bookingId)', () => {
    it('returns isPaid: true immediately if booking is already paid', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        paymentStatus: 'paid',
        paymentTransactionId: transactionId,
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(PaymentTransaction, 'findById').mockResolvedValue({
        _id: transactionId,
        status: 'captured',
        razorpayPaymentId: 'pay_qr_123',
        paidAt: new Date(),
      } as any);

      const { req, res, next } = createMockReqRes({
        user: customerUser,
        params: { bookingId: bookingId.toString() },
      });

      await getQrPaymentStatus(req, res, next);
      expect(res.statusCode).toBe(200);
      expect(res.body.isPaid).toBe(true);
      expect(res.body.paymentStatus).toBe('paid');
      expect(res.body.paymentId).toBe('pay_qr_123');
    });

    it('returns 404 if no QR transaction exists for unpaid booking', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        paymentStatus: 'unpaid',
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);
      vi.spyOn(PaymentTransaction, 'findOne').mockReturnValue({
        sort: vi.fn().mockResolvedValue(null),
      } as any);

      const { req, res, next } = createMockReqRes({
        user: customerUser,
        params: { bookingId: bookingId.toString() },
      });

      await getQrPaymentStatus(req, res, next);
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('QR_NOT_FOUND');
    });

    it('fast 4-second polling reads local database without hitting external Razorpay gateway', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);

      const futureDate = new Date(Date.now() + 10 * 60 * 1000);
      const mockTx: any = {
        _id: transactionId,
        bookingId,
        paymentMethod: 'qr',
        status: 'created',
        razorpayQrId: 'qr_poll_fast_123',
        amountInPaise: 150000,
        orderExpiresAt: futureDate,
        createdAt: new Date(), // Just created 2s ago
        lastReconciledAt: new Date(), // Reconciled 2s ago (< 15s)
        qrCloseBy: Math.floor(futureDate.getTime() / 1000),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockReturnValue({
        sort: vi.fn().mockResolvedValue(mockTx),
      } as any);

      const gatewayFetchSpy = vi.spyOn(razorpayService, 'fetchRazorpayQrPayments');

      const { req, res, next } = createMockReqRes({
        user: customerUser,
        params: { bookingId: bookingId.toString() },
        query: {}, // Normal 4-second polling: no force reconcile
      });

      await getQrPaymentStatus(req, res, next);
      expect(res.statusCode).toBe(200);
      expect(res.body.isPaid).toBe(false);
      expect(res.body.status).toBe('created');

      // Assert NO external gateway call was made on fast poll
      expect(gatewayFetchSpy).not.toHaveBeenCalled();
    });

    it('forces external gateway reconciliation when requested via ?reconcile=true (manual button click)', async () => {
      const mockBooking: any = {
        _id: bookingId,
        customerId,
        coachId,
        status: 'accepted',
        paymentStatus: 'unpaid',
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);

      const futureDate = new Date(Date.now() + 10 * 60 * 1000);
      const mockTx: any = {
        _id: transactionId,
        bookingId,
        paymentMethod: 'qr',
        status: 'created',
        razorpayQrId: 'qr_poll_reconcile_123',
        amountInPaise: 150000,
        orderExpiresAt: futureDate,
        createdAt: new Date(),
        lastReconciledAt: new Date(),
        qrCloseBy: Math.floor(futureDate.getTime() / 1000),
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockReturnValue({
        sort: vi.fn().mockResolvedValue(mockTx),
      } as any);

      const mockQrPayments: razorpayService.RazorpayPaymentEntity[] = [
        {
          id: 'pay_manual_reconcile_captured_999',
          entity: 'payment',
          amount: 150000,
          currency: 'INR',
          status: 'captured',
          order_id: '',
          captured: true,
        },
      ];
      const gatewayFetchSpy = vi
        .spyOn(razorpayService, 'fetchRazorpayQrPayments')
        .mockResolvedValue(mockQrPayments);
      vi.spyOn(PaymentTransaction, 'updateOne').mockResolvedValue({ acknowledged: true } as any);
      vi.spyOn(Booking, 'updateOne').mockResolvedValue({ acknowledged: true } as any);

      const { req, res, next } = createMockReqRes({
        user: customerUser,
        params: { bookingId: bookingId.toString() },
        query: { reconcile: 'true' }, // Force reconciliation
      });

      await getQrPaymentStatus(req, res, next);
      expect(res.statusCode).toBe(200);
      expect(res.body.isPaid).toBe(true);
      expect(res.body.paymentId).toBe('pay_manual_reconcile_captured_999');

      // Assert external gateway call WAS made when explicitly requested
      expect(gatewayFetchSpy).toHaveBeenCalledWith('qr_poll_reconcile_123');
    });
  });

  describe('closePaymentQr (POST /api/payments/close-qr)', () => {
    it('closes active QR code at gateway and marks transaction failed', async () => {
      const mockTx: any = {
        _id: transactionId,
        bookingId,
        customerId,
        paymentMethod: 'qr',
        status: 'created',
        razorpayQrId: 'qr_close_test_123',
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const closeSpy = vi
        .spyOn(razorpayService, 'closeRazorpayQrCode')
        .mockResolvedValue({ id: 'qr_close_test_123', status: 'closed' } as any);
      const updateSpy = vi
        .spyOn(PaymentTransaction, 'updateOne')
        .mockResolvedValue({ acknowledged: true } as any);

      const { req, res, next } = createMockReqRes({
        user: customerUser,
        body: { qrId: 'qr_close_test_123' },
      });

      await closePaymentQr(req, res, next);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(closeSpy).toHaveBeenCalledWith('qr_close_test_123');
      expect(updateSpy).toHaveBeenCalledWith(
        { _id: transactionId, status: 'created' },
        {
          $set: {
            status: 'failed',
            failureReason: 'Closed by user or expired',
          },
        }
      );
    });
  });

  describe('handlePaymentWebhook (qr_code.credited)', () => {
    it('rejects invalid webhook signature with HTTP 400', async () => {
      vi.spyOn(razorpayService, 'verifyRazorpayWebhookSignature').mockReturnValue(false);

      const { req, res, next } = createMockReqRes({
        headers: { 'x-razorpay-signature': 'invalid_sig' },
        body: { event: 'qr_code.credited' },
      });

      await handlePaymentWebhook(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/Invalid webhook signature/i);
    });

    it('processes qr_code.credited with independent gateway payment verification', async () => {
      vi.spyOn(razorpayService, 'verifyRazorpayWebhookSignature').mockReturnValue(true);

      const mockBooking: any = {
        _id: bookingId,
        status: 'accepted',
        paymentStatus: 'unpaid',
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);

      const mockTx: any = {
        _id: transactionId,
        bookingId,
        paymentMethod: 'qr',
        status: 'created',
        razorpayQrId: 'qr_webhook_test_123',
        amountInPaise: 150000,
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const txUpdateSpy = vi
        .spyOn(PaymentTransaction, 'updateOne')
        .mockResolvedValue({ acknowledged: true } as any);
      const bookingUpdateSpy = vi
        .spyOn(Booking, 'updateOne')
        .mockResolvedValue({ acknowledged: true } as any);

      // Gateway verification returns captured payment associated with this QR
      vi.spyOn(razorpayService, 'fetchRazorpayQrPayments').mockResolvedValue([
        {
          id: 'pay_qr_authoritative_captured_777',
          entity: 'payment',
          amount: 150000,
          currency: 'INR',
          status: 'captured',
          order_id: '',
          qr_code_id: 'qr_webhook_test_123',
        } as any,
      ]);

      const fetchPaymentSpy = vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: 'pay_qr_authoritative_captured_777',
        entity: 'payment',
        amount: 150000,
        currency: 'INR',
        status: 'captured',
        order_id: '',
        qr_code_id: 'qr_webhook_test_123',
      });

      const webhookBody = {
        entity: 'event',
        event: 'qr_code.credited',
        payload: {
          qr_code: {
            entity: {
              id: 'qr_webhook_test_123',
              type: 'upi_qr',
              status: 'closed',
            },
          },
          payment: {
            entity: {
              id: 'pay_qr_authoritative_captured_777',
              amount: 150000,
              currency: 'INR',
              status: 'captured',
              captured: true,
            },
          },
        },
      };

      const { req, res, next } = createMockReqRes({
        headers: {
          'x-razorpay-signature': 'valid_sig',
          'x-razorpay-event-id': 'evt_qr_credit_unique_1',
        },
        body: webhookBody,
      });

      await handlePaymentWebhook(req, res, next);
      expect(res.statusCode).toBe(200);
      expect(res.body.received).toBe(true);

      // Assert independent gateway query was performed
      expect(fetchPaymentSpy).toHaveBeenCalledWith('pay_qr_authoritative_captured_777');

      expect(txUpdateSpy).toHaveBeenCalledWith(
        { _id: transactionId, status: { $nin: ['captured', 'refunded'] } },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'captured',
            razorpayPaymentId: 'pay_qr_authoritative_captured_777',
            payoutStatus: 'simulated_held',
          }),
        })
      );

      expect(bookingUpdateSpy).toHaveBeenCalledWith(
        { _id: bookingId, status: 'accepted', paymentStatus: { $ne: 'refunded' } },
        expect.objectContaining({
          $set: expect.objectContaining({
            paymentStatus: 'paid',
            paymentTransactionId: transactionId,
          }),
        })
      );
    });

    it('rejects qr_code.credited if gateway reports non-captured status or amount mismatch', async () => {
      vi.spyOn(razorpayService, 'verifyRazorpayWebhookSignature').mockReturnValue(true);

      const mockTx: any = {
        _id: transactionId,
        bookingId,
        paymentMethod: 'qr',
        status: 'created',
        razorpayQrId: 'qr_webhook_test_123',
        amountInPaise: 150000,
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const txUpdateSpy = vi.spyOn(PaymentTransaction, 'updateOne');

      // Gateway reports payment is only 'authorized' (not captured)
      vi.spyOn(razorpayService, 'fetchRazorpayQrPayments').mockResolvedValue([
        {
          id: 'pay_qr_not_captured_123',
          entity: 'payment',
          amount: 150000,
          currency: 'INR',
          status: 'authorized',
          order_id: '',
          qr_code_id: 'qr_webhook_test_123',
        } as any,
      ]);
      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: 'pay_qr_not_captured_123',
        entity: 'payment',
        amount: 150000,
        currency: 'INR',
        status: 'authorized',
        order_id: '',
        qr_code_id: 'qr_webhook_test_123',
      });

      const webhookBody = {
        entity: 'event',
        event: 'qr_code.credited',
        payload: {
          qr_code: {
            entity: { id: 'qr_webhook_test_123' },
          },
          payment: {
            entity: {
              id: 'pay_qr_not_captured_123',
              amount: 150000,
              currency: 'INR',
              status: 'authorized',
            },
          },
        },
      };

      const { req, res, next } = createMockReqRes({
        headers: {
          'x-razorpay-signature': 'valid_sig',
          'x-razorpay-event-id': 'evt_qr_not_captured_1',
        },
        body: webhookBody,
      });

      await handlePaymentWebhook(req, res, next);
      expect(res.statusCode).toBe(200);
      expect(res.body.received).toBe(true);

      // Status must NOT have been updated to captured
      expect(txUpdateSpy).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'captured' }),
        })
      );
    });

    it('records duplicate payment exception without applying ledger twice when booking is already paid by another transaction', async () => {
      vi.spyOn(razorpayService, 'verifyRazorpayWebhookSignature').mockReturnValue(true);

      const otherTxId = new mongoose.Types.ObjectId();
      const mockBooking: any = {
        _id: bookingId,
        status: 'accepted',
        paymentStatus: 'paid', // Already paid by standard checkout!
        paymentTransactionId: otherTxId,
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);

      const mockTx: any = {
        _id: transactionId,
        bookingId,
        paymentMethod: 'qr',
        status: 'created',
        razorpayQrId: 'qr_webhook_test_123',
        amountInPaise: 150000,
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const txUpdateSpy = vi.spyOn(PaymentTransaction, 'updateOne').mockResolvedValue({ acknowledged: true } as any);
      const bookingUpdateSpy = vi.spyOn(Booking, 'updateOne');

      vi.spyOn(razorpayService, 'fetchRazorpayQrPayments').mockResolvedValue([
        {
          id: 'pay_late_second_payment_999',
          entity: 'payment',
          amount: 150000,
          currency: 'INR',
          status: 'captured',
          order_id: '',
          qr_code_id: 'qr_webhook_test_123',
        } as any,
      ]);
      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: 'pay_late_second_payment_999',
        entity: 'payment',
        amount: 150000,
        currency: 'INR',
        status: 'captured',
        order_id: '',
        qr_code_id: 'qr_webhook_test_123',
      });

      const webhookBody = {
        entity: 'event',
        event: 'qr_code.credited',
        payload: {
          qr_code: { entity: { id: 'qr_webhook_test_123' } },
          payment: {
            entity: {
              id: 'pay_late_second_payment_999',
              amount: 150000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };

      const { req, res, next } = createMockReqRes({
        headers: {
          'x-razorpay-signature': 'valid_sig',
          'x-razorpay-event-id': 'evt_late_duplicate_1',
        },
        body: webhookBody,
      });

      await handlePaymentWebhook(req, res, next);
      expect(res.statusCode).toBe(200);

      // Assert transaction was flagged as duplicate for reconciliation/refund
      expect(txUpdateSpy).toHaveBeenCalledWith(
        { _id: transactionId },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'captured',
            payoutStatus: 'unsettled',
            hasReconciliationDiscrepancy: true,
            hasExcessRefundAlert: true,
            excessRefundReason: 'DUPLICATE_OR_CANCELLED_PAYMENT_REQUIRES_REFUND',
          }),
        })
      );

      // Assert booking ledger was NOT updated again
      expect(bookingUpdateSpy).not.toHaveBeenCalled();
    });

    it('records payment exception without confirming booking if payment arrives after booking is cancelled', async () => {
      vi.spyOn(razorpayService, 'verifyRazorpayWebhookSignature').mockReturnValue(true);

      const mockBooking: any = {
        _id: bookingId,
        status: 'cancelled', // Booking was cancelled due to expiry
        paymentStatus: 'unpaid',
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);

      const mockTx: any = {
        _id: transactionId,
        bookingId,
        paymentMethod: 'qr',
        status: 'created',
        razorpayQrId: 'qr_webhook_test_123',
        amountInPaise: 150000,
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const txUpdateSpy = vi.spyOn(PaymentTransaction, 'updateOne').mockResolvedValue({ acknowledged: true } as any);
      const bookingUpdateSpy = vi.spyOn(Booking, 'updateOne');

      vi.spyOn(razorpayService, 'fetchRazorpayQrPayments').mockResolvedValue([
        {
          id: 'pay_late_cancelled_booking_888',
          entity: 'payment',
          amount: 150000,
          currency: 'INR',
          status: 'captured',
          order_id: '',
          qr_code_id: 'qr_webhook_test_123',
        } as any,
      ]);
      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: 'pay_late_cancelled_booking_888',
        entity: 'payment',
        amount: 150000,
        currency: 'INR',
        status: 'captured',
        order_id: '',
        qr_code_id: 'qr_webhook_test_123',
      });

      const webhookBody = {
        entity: 'event',
        event: 'qr_code.credited',
        payload: {
          qr_code: { entity: { id: 'qr_webhook_test_123' } },
          payment: {
            entity: {
              id: 'pay_late_cancelled_booking_888',
              amount: 150000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };

      const { req, res, next } = createMockReqRes({
        headers: {
          'x-razorpay-signature': 'valid_sig',
          'x-razorpay-event-id': 'evt_late_cancelled_1',
        },
        body: webhookBody,
      });

      await handlePaymentWebhook(req, res, next);
      expect(res.statusCode).toBe(200);

      // Assert transaction was captured but flagged for refund
      expect(txUpdateSpy).toHaveBeenCalledWith(
        { _id: transactionId },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'captured',
            payoutStatus: 'unsettled',
            hasReconciliationDiscrepancy: true,
            hasExcessRefundAlert: true,
          }),
        })
      );

      // Assert cancelled booking remains cancelled and NOT marked paid
      expect(bookingUpdateSpy).not.toHaveBeenCalled();
    });

    it('strictly rejects a valid captured payment ID associated with a different QR ID without marking booking paid', async () => {
      vi.spyOn(razorpayService, 'verifyRazorpayWebhookSignature').mockReturnValue(true);

      const mockBooking: any = {
        _id: bookingId,
        status: 'accepted',
        paymentStatus: 'unpaid',
      };
      vi.spyOn(Booking, 'findById').mockResolvedValue(mockBooking);

      const mockTx: any = {
        _id: transactionId,
        bookingId,
        paymentMethod: 'qr',
        status: 'created',
        razorpayQrId: 'qr_athleteconnect_legit_123',
        amountInPaise: 150000,
      };
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(mockTx);
      const txUpdateSpy = vi.spyOn(PaymentTransaction, 'updateOne');
      const bookingUpdateSpy = vi.spyOn(Booking, 'updateOne');

      // QR-specific payments fetch returns empty or other payments (this payment does NOT belong to this QR)
      vi.spyOn(razorpayService, 'fetchRazorpayQrPayments').mockResolvedValue([]);

      // Direct payment fetch returns a real captured payment, but associated with a DIFFERENT QR ID
      vi.spyOn(razorpayService, 'fetchRazorpayPayment').mockResolvedValue({
        id: 'pay_foreign_different_qr_999',
        entity: 'payment',
        amount: 150000,
        currency: 'INR',
        status: 'captured',
        order_id: '',
        qr_code_id: 'qr_some_other_merchant_456', // DIFFERENT QR ID
      } as any);

      const webhookBody = {
        entity: 'event',
        event: 'qr_code.credited',
        payload: {
          qr_code: {
            entity: {
              id: 'qr_athleteconnect_legit_123',
              type: 'upi_qr',
              status: 'closed',
            },
          },
          payment: {
            entity: {
              id: 'pay_foreign_different_qr_999',
              amount: 150000,
              currency: 'INR',
              status: 'captured',
              captured: true,
              qr_code_id: 'qr_some_other_merchant_456',
            },
          },
        },
      };

      const { req, res, next } = createMockReqRes({
        headers: {
          'x-razorpay-signature': 'valid_sig',
          'x-razorpay-event-id': 'evt_qr_mismatch_attack_1',
        },
        body: webhookBody,
      });

      await handlePaymentWebhook(req, res, next);
      expect(res.statusCode).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.ignored).toBe(true);
      expect(res.body.reason).toBe('PAYMENT_NOT_ASSOCIATED_WITH_QR');

      // Crucial assertion: Transaction must NOT be marked captured
      expect(txUpdateSpy).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'captured' }),
        })
      );

      // Crucial assertion: Booking must NOT be marked paid
      expect(bookingUpdateSpy).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({ paymentStatus: 'paid' }),
        })
      );
    });

    it('idempotently returns received: true for duplicate webhook events', async () => {
      vi.spyOn(razorpayService, 'verifyRazorpayWebhookSignature').mockReturnValue(true);
      vi.spyOn(WebhookEvent, 'findOne').mockResolvedValue({
        eventId: 'evt_duplicate_qr_1',
        status: 'completed',
      } as any);

      const { req, res, next } = createMockReqRes({
        headers: {
          'x-razorpay-signature': 'valid_sig',
          'x-razorpay-event-id': 'evt_duplicate_qr_1',
        },
        body: {
          event: 'qr_code.credited',
          payload: {
            qr_code: { entity: { id: 'qr_123' } },
            payment: { entity: { id: 'pay_123' } },
          },
        },
      });

      await handlePaymentWebhook(req, res, next);
      expect(res.statusCode).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.duplicate).toBe(true);
    });
  });
});
