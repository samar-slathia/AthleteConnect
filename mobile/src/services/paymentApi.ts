import { getApiBaseUrl, API_ENDPOINTS } from '../config/api';
import { AuthApiError } from './authApi';
import { handleProtectedResponseError } from './authEvents';
import { BookingItem } from './bookingApi';

export interface PaymentBreakdown {
  coachingFee: number;
  sessionCount?: number;
  perSessionFee?: number;
  taxAmount: number;
  taxRatePercentage: number;
  taxLabel: string;
  totalPayable: number;
}

export interface PaymentOrderResponse {
  orderId: string;
  amount: number;
  amountInPaise: number;
  currency: string;
  keyId: string;
  packageType?: 'single' | 'weekly' | 'monthly';
  sessionCount?: number;
  breakdown: PaymentBreakdown;
  paymentDueAt?: string;
  message?: string;
}

export interface VerifyPaymentPayload {
  bookingId: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  message: string;
  booking: BookingItem;
  transaction?: {
    id: string;
    orderId: string;
    paymentId: string;
    amount: number;
    status: string;
    paidAt: string;
  };
}

export interface PaymentQrResponse {
  qrId: string;
  imageUrl: string;
  amount: number;
  amountInPaise: number;
  currency: string;
  closeBy?: number;
  expiresAt?: string;
  packageType?: 'single' | 'weekly' | 'monthly';
  sessionCount?: number;
  breakdown: PaymentBreakdown;
  paymentDueAt?: string;
  message?: string;
}

export interface PaymentQrStatusResponse {
  isPaid: boolean;
  isExpired: boolean;
  paymentStatus: PaymentStatus;
  status: string;
  paymentId?: string;
  qrId?: string;
  expiresAt?: string;
  closeBy?: number;
  paidAt?: string;
}

export type PaymentStatus = 'unpaid' | 'paid' | 'partially_refunded' | 'refunded';
export type RefundStatus = 'none' | 'pending' | 'partially_refunded' | 'processed' | 'failed';

export interface BookingPaymentStatusResponse {
  bookingId: string;
  paymentStatus: PaymentStatus;
  refundStatus?: RefundStatus;
  paymentDueAt?: string;
  packageType?: 'single' | 'weekly' | 'monthly';
  sessionCount?: number;
  transaction?: {
    orderId: string;
    paymentId?: string;
    status: string;
    refundStatus?: RefundStatus;
    refundedAmount?: number;
    coachingFee: number;
    sessionCount?: number;
    taxAmount: number;
    taxRatePercentage: number;
    totalAmount: number;
    currency: string;
    paidAt?: string;
    refundedAt?: string;
  } | null;
}

async function parseResponseError(response: Response, token?: string): Promise<string> {
  let message: string | undefined;
  let code: string | undefined;

  try {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      if (data && typeof data.error === 'string' && data.error.trim()) {
        message = data.error.trim();
      }
      if (data && typeof data.code === 'string' && data.code.trim()) {
        code = data.code.trim();
      }
    }
  } catch {
    // Non-JSON or unreadable
  }

  if (!message) {
    switch (response.status) {
      case 400:
        message = 'Invalid payment request. Please review and try again.';
        break;
      case 401:
        message = 'Authentication required. Please log in again.';
        break;
      case 403:
        message = 'Access denied. You are not authorized for this payment.';
        break;
      case 404:
        message = 'Payment order or booking not found.';
        break;
      case 500:
      case 502:
      case 503:
        message = 'Payment service unavailable. Please try again later.';
        break;
      default:
        message = `Payment request failed with status ${response.status}.`;
        break;
    }
  }

  handleProtectedResponseError(response.status, message, token, code);
  return message;
}

/**
 * Creates a Razorpay Sandbox test order for an accepted booking.
 * POST /api/payments/create-order
 */
export async function createPaymentOrder(
  bookingId: string,
  token: string
): Promise<PaymentOrderResponse> {
  if (!token || !token.trim()) {
    throw new AuthApiError('Authentication token is required.', 401);
  }

  if (!bookingId || !bookingId.trim()) {
    throw new AuthApiError('Booking ID is required.', 400);
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${API_ENDPOINTS.PAYMENTS}/create-order`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token.trim()}`,
    },
    body: JSON.stringify({ bookingId: bookingId.trim() }),
  });

  if (!response.ok) {
    const errorMessage = await parseResponseError(response, token);
    throw new AuthApiError(errorMessage, response.status);
  }

  return response.json();
}

/**
 * Submits payment signature to backend for cryptographic verification and state confirmation.
 * POST /api/payments/verify-signature
 */
export async function verifyPaymentSignature(
  payload: VerifyPaymentPayload,
  token: string
): Promise<VerifyPaymentResponse> {
  if (!token || !token.trim()) {
    throw new AuthApiError('Authentication token is required.', 401);
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${API_ENDPOINTS.PAYMENTS}/verify-signature`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token.trim()}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorMessage = await parseResponseError(response, token);
    throw new AuthApiError(errorMessage, response.status);
  }

  return response.json();
}

/**
 * Fetches latest payment status and transparent breakdown for a booking.
 * GET /api/payments/booking/:bookingId
 */
export async function getBookingPayment(
  bookingId: string,
  token: string
): Promise<BookingPaymentStatusResponse> {
  if (!token || !token.trim()) {
    throw new AuthApiError('Authentication token is required.', 401);
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${API_ENDPOINTS.PAYMENTS}/booking/${encodeURIComponent(bookingId.trim())}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token.trim()}`,
    },
  });

  if (!response.ok) {
    const errorMessage = await parseResponseError(response, token);
    throw new AuthApiError(errorMessage, response.status);
  }

  return response.json();
}

/**
 * Creates a Razorpay Dynamic UPI QR code for an accepted booking.
 * POST /api/payments/create-qr
 */
export async function createPaymentQr(
  bookingId: string,
  token: string
): Promise<PaymentQrResponse> {
  if (!token || !token.trim()) {
    throw new AuthApiError('Authentication token is required.', 401);
  }

  if (!bookingId || !bookingId.trim()) {
    throw new AuthApiError('Booking ID is required.', 400);
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${API_ENDPOINTS.PAYMENTS}/create-qr`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token.trim()}`,
    },
    body: JSON.stringify({ bookingId: bookingId.trim() }),
  });

  if (!response.ok) {
    const errorMessage = await parseResponseError(response, token);
    throw new AuthApiError(errorMessage, response.status);
  }

  return response.json();
}

/**
 * Checks status of Razorpay QR code payment for a booking.
 * GET /api/payments/qr-status/:bookingId
 * Normal 4-second polling queries local DB.
 * Manual refresh passes { reconcile: true } to trigger gateway reconciliation.
 */
export async function getQrPaymentStatus(
  bookingId: string,
  token: string,
  options?: { reconcile?: boolean }
): Promise<PaymentQrStatusResponse> {
  if (!token || !token.trim()) {
    throw new AuthApiError('Authentication token is required.', 401);
  }

  if (!bookingId || !bookingId.trim()) {
    throw new AuthApiError('Booking ID is required.', 400);
  }

  const baseUrl = getApiBaseUrl();
  const queryStr = options?.reconcile ? '?reconcile=true' : '';
  const url = `${baseUrl}${API_ENDPOINTS.PAYMENTS}/qr-status/${encodeURIComponent(bookingId.trim())}${queryStr}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token.trim()}`,
    },
  });

  if (!response.ok) {
    const errorMessage = await parseResponseError(response, token);
    throw new AuthApiError(errorMessage, response.status);
  }

  return response.json();
}

/**
 * Closes an active QR code payment.
 * POST /api/payments/close-qr
 */
export async function closePaymentQr(
  bookingId: string,
  token: string
): Promise<{ success: boolean; message: string }> {
  if (!token || !token.trim()) {
    throw new AuthApiError('Authentication token is required.', 401);
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${API_ENDPOINTS.PAYMENTS}/close-qr`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token.trim()}`,
    },
    body: JSON.stringify({ bookingId: bookingId.trim() }),
  });

  if (!response.ok) {
    const errorMessage = await parseResponseError(response, token);
    throw new AuthApiError(errorMessage, response.status);
  }

  return response.json();
}
