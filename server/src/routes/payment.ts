import { Router } from 'express';
import {
  createPaymentOrder,
  createPaymentQr,
  getQrPaymentStatus,
  closePaymentQr,
  verifyPaymentSignature,
  handlePaymentWebhook,
  getBookingPaymentStatus,
  reconcilePaymentWithGatewayHandler,
} from '../controllers/paymentController';
import { authenticate, requireRole } from '../middleware/auth';

export const paymentRouter = Router();

// Create Razorpay Test Order (Customer only)
paymentRouter.post(
  '/create-order',
  authenticate,
  requireRole('parent', 'individual'),
  createPaymentOrder
);

// Create Razorpay Dynamic UPI QR (Customer only)
paymentRouter.post(
  '/create-qr',
  authenticate,
  requireRole('parent', 'individual'),
  createPaymentQr
);

// Get QR Payment Status and Reconcile with Gateway (Customer only)
paymentRouter.get(
  '/qr-status/:bookingId',
  authenticate,
  requireRole('parent', 'individual'),
  getQrPaymentStatus
);

// Close Active QR Payment (Customer / Admin)
paymentRouter.post(
  '/close-qr',
  authenticate,
  requireRole('parent', 'individual', 'admin'),
  closePaymentQr
);

// Verify Razorpay Payment Signature (Customer only)
paymentRouter.post(
  '/verify-signature',
  authenticate,
  requireRole('parent', 'individual'),
  verifyPaymentSignature
);

// Razorpay Webhooks (Public endpoint, verified via X-Razorpay-Signature)
paymentRouter.post('/webhook', handlePaymentWebhook);

// Get Payment Details / Breakdown for Booking
paymentRouter.get(
  '/booking/:bookingId',
  authenticate,
  getBookingPaymentStatus
);

// Reconcile Payment With Gateway (Admin only)
paymentRouter.post(
  '/reconcile/:paymentId',
  authenticate,
  requireRole('admin'),
  reconcilePaymentWithGatewayHandler
);
