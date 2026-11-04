import { Router } from 'express';
import {
  createPaymentOrder,
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
