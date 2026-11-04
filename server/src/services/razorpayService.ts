import crypto from 'crypto';
import { config } from '../config/env';

export interface PaymentBreakdown {
  hourlyRate: number;
  durationMinutes: number;
  sessionCount: number;
  perSessionFee: number;
  baseSessionFee: number;
  platformCommission: number; // 20% internal ledger
  coachAllocation: number;    // 80% internal ledger
  taxRatePercentage: number;  // Configurable test rate (e.g. 0%)
  taxAmount: number;          // Separate customer line item
  totalCustomerPayable: number;
  amountInPaise: number;
  taxLabel: string;
}

/**
 * Calculates deterministic pricing breakdown adhering strictly to:
 * - Session scaling: baseSessionFee = hourlyRate * (durationMinutes / 60) * sessionCount
 * - 20% platform commission (internal)
 * - 80% coach allocation (internal)
 * - Separate configurable tax line (demonstration estimate, never deducted from allocations)
 * - Integer paise conversion for gateway
 */
export function calculatePaymentBreakdown(params: {
  hourlyRate: number;
  durationMinutes: number;
  taxRatePercentage?: number;
  sessionCount?: number;
}): PaymentBreakdown {
  const { hourlyRate, durationMinutes } = params;
  const count = params.sessionCount && params.sessionCount > 0 ? Math.floor(params.sessionCount) : 1;
  const taxRate = params.taxRatePercentage ?? config.TAX_RATE_PERCENTAGE ?? 0;

  const perSessionFee = Number((hourlyRate * (durationMinutes / 60)).toFixed(2));
  const baseSessionFee = Number((perSessionFee * count).toFixed(2));
  const commPercent = config.PLATFORM_COMMISSION_PERCENTAGE ?? 20;
  const platformCommission = Number((baseSessionFee * (commPercent / 100)).toFixed(2));
  // Exact complement to prevent 1-paise rounding discrepancy
  const coachAllocation = Number((baseSessionFee - platformCommission).toFixed(2));

  const taxAmount = Number((baseSessionFee * (taxRate / 100)).toFixed(2));
  const totalCustomerPayable = Number((baseSessionFee + taxAmount).toFixed(2));
  const amountInPaise = Math.round(totalCustomerPayable * 100);

  const taxLabel =
    taxRate > 0
      ? `Demonstration Tax Estimate (${taxRate}% - Sandbox Test Mode)`
      : 'Taxes & Levies (0% Sandbox Mode)';

  return {
    hourlyRate,
    durationMinutes,
    sessionCount: count,
    perSessionFee,
    baseSessionFee,
    platformCommission,
    coachAllocation,
    taxRatePercentage: taxRate,
    taxAmount,
    totalCustomerPayable,
    amountInPaise,
    taxLabel,
  };
}

export interface CreateOrderParams {
  amountInPaise: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrderResult {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
  created_at: number;
}

export interface RazorpayPaymentEntity {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  order_id: string;
  method?: string;
  captured?: boolean;
  amount_refunded?: number;
  refund_status?: 'null' | 'partial' | 'full' | null;
  error_code?: string | null;
  error_description?: string | null;
  created_at?: number;
}

export interface RazorpayRefundEntity {
  id: string;
  entity: string;
  amount: number; // in integer paise
  currency: string;
  payment_id: string;
  status: 'pending' | 'processed' | 'failed';
  speed_processed?: string;
  speed_requested?: string;
  created_at: number;
  notes?: Record<string, string>;
  receipt?: string | null;
  error_code?: string | null;
  error_description?: string | null;
}

export interface RazorpayRefundCollection {
  entity: string;
  count: number;
  items: RazorpayRefundEntity[];
}

/**
 * Creates an order directly with Razorpay test mode API.
 * Fails safely if credentials are unconfigured or gateway is unavailable.
 */
export async function createRazorpayOrder(
  params: CreateOrderParams
): Promise<RazorpayOrderResult> {
  const { amountInPaise, currency = 'INR', receipt, notes } = params;
  const keyId = config.RAZORPAY_KEY_ID;
  const keySecret = config.RAZORPAY_KEY_SECRET;

  if (keyId.startsWith('rzp_live_')) {
    throw new Error('SECURITY VIOLATION: Live Razorpay credentials rejected in sandbox mode.');
  }

  if (!keyId || !keySecret || keyId.includes('placeholder') || keySecret.includes('placeholder')) {
    throw new Error('Razorpay payment gateway credentials are not configured.');
  }

  const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  let response: Response;
  try {
    response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${authHeader}`,
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency,
        receipt,
        notes,
      }),
    });
  } catch (err: any) {
    throw new Error(`Failed to reach Razorpay gateway: ${err?.message || 'Network error'}`);
  }

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson?.error?.description) {
        errorDetail = errJson.error.description;
      }
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(`Razorpay order creation failed: ${errorDetail}`);
  }

  return (await response.json()) as RazorpayOrderResult;
}

/**
 * Verifies Razorpay payment signature using HMAC-SHA256 and timingSafeEqual.
 * Signature equation: HMAC-SHA256(order_id + "|" + payment_id, secret)
 */
export function verifyRazorpaySignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
  secret?: string;
}): boolean {
  const { orderId, paymentId, signature } = params;
  const secret = params.secret || config.RAZORPAY_KEY_SECRET;

  if (!orderId || !paymentId || !signature || !secret) {
    return false;
  }

  try {
    const payload = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== signatureBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}

/**
 * Verifies Razorpay webhook signature using HMAC-SHA256 and timingSafeEqual on raw body.
 */
export function verifyRazorpayWebhookSignature(params: {
  rawBody: Buffer | string;
  signature: string;
  secret?: string;
}): boolean {
  const { rawBody, signature } = params;
  const secret = params.secret || config.RAZORPAY_WEBHOOK_SECRET;

  if (!rawBody || !signature || !secret) {
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== signatureBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}

/**
 * Fetches actual payment entity from Razorpay REST API.
 * Strict: Never returns fake captured responses for missing credentials or payment IDs.
 */
export async function fetchRazorpayPayment(
  paymentId: string,
  options?: { keyId?: string; keySecret?: string }
): Promise<RazorpayPaymentEntity | null> {
  const keyId = options?.keyId || config.RAZORPAY_KEY_ID;
  const keySecret = options?.keySecret || config.RAZORPAY_KEY_SECRET;

  if (keyId.startsWith('rzp_live_')) {
    throw new Error('SECURITY VIOLATION: Live Razorpay credentials rejected.');
  }

  if (!keyId || !keySecret || keyId.includes('placeholder') || keySecret.includes('placeholder')) {
    throw new Error('Razorpay payment gateway credentials are not configured.');
  }

  if (!paymentId || typeof paymentId !== 'string' || !paymentId.trim()) {
    return null;
  }

  const cleanPaymentId = paymentId.trim();
  const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  let response: Response;
  try {
    response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(cleanPaymentId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${authHeader}`,
      },
    });
  } catch (err: any) {
    throw new Error(`Failed to reach Razorpay gateway: ${err?.message || 'Network error'}`);
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson?.error?.description) {
        errorDetail = errJson.error.description;
      }
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(`Razorpay payment fetch failed: ${errorDetail}`);
  }

  return (await response.json()) as RazorpayPaymentEntity;
}

/**
 * Authoritatively fetches all refunds for a specific payment from Razorpay REST API
 * using documented pagination query parameters (?count=100&skip=X).
 *
 * Requirements:
 * - Uses count=100 and initial skip=0.
 * - Iteratively retrieves subsequent pages until a page returns < 100 items or 0 items.
 * - Increments skip by the raw number of records returned in each page.
 * - Deduplicates refund records in memory by Razorpay refund ID.
 * - Fails the entire operation if any page request fails (network or non-OK response),
 *   never returning a partial collection as complete.
 * - Protects against malformed responses and unexpected pagination loops (max 100 pages = 10,000 items).
 */
export async function fetchRazorpayPaymentRefunds(
  paymentId: string,
  options?: { keyId?: string; keySecret?: string }
): Promise<RazorpayRefundEntity[]> {
  const keyId = options?.keyId || config.RAZORPAY_KEY_ID;
  const keySecret = options?.keySecret || config.RAZORPAY_KEY_SECRET;

  if (keyId.startsWith('rzp_live_')) {
    throw new Error('SECURITY VIOLATION: Live Razorpay credentials rejected.');
  }

  if (!keyId || !keySecret || keyId.includes('placeholder') || keySecret.includes('placeholder')) {
    throw new Error('Razorpay payment gateway credentials are not configured.');
  }

  if (!paymentId || typeof paymentId !== 'string' || !paymentId.trim()) {
    return [];
  }

  const cleanPaymentId = paymentId.trim();
  const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  const PAGE_SIZE = 100;
  const MAX_PAGES = 100; // Safety guard against infinite loops (up to 10,000 refunds per payment)
  let skip = 0;
  let pageCount = 0;
  let lastBatchCount = 0;

  const refundMap = new Map<string, RazorpayRefundEntity>();

  while (pageCount < MAX_PAGES) {
    pageCount++;
    const url = `https://api.razorpay.com/v1/payments/${encodeURIComponent(cleanPaymentId)}/refunds?count=${PAGE_SIZE}&skip=${skip}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${authHeader}`,
        },
      });
    } catch (err: any) {
      throw new Error(
        `Failed to reach Razorpay gateway on page ${pageCount} (skip=${skip}): ${err?.message || 'Network error'}`
      );
    }

    // A 404 on the very first page means payment or refunds resource not found -> empty list
    if (response.status === 404) {
      if (skip === 0) {
        return [];
      }
      // A 404 on a subsequent page is an unexpected error
      throw new Error(
        `Razorpay refunds pagination error: unexpected HTTP 404 on page ${pageCount} (skip=${skip})`
      );
    }

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson?.error?.description) {
          errorDetail = errJson.error.description;
        }
      } catch {
        // ignore JSON parse failure
      }
      throw new Error(
        `Razorpay payment refunds fetch failed on page ${pageCount} (skip=${skip}): ${errorDetail}`
      );
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        `Malformed JSON response from Razorpay refunds API on page ${pageCount} (skip=${skip})`
      );
    }

    if (!data || !Array.isArray(data.items)) {
      throw new Error(
        `Malformed gateway collection response: 'items' array missing on page ${pageCount} (skip=${skip})`
      );
    }

    const rawBatch: RazorpayRefundEntity[] = data.items;
    lastBatchCount = rawBatch.length;

    // In-memory deduplication preserving valid refund records
    for (const item of rawBatch) {
      if (item && item.id) {
        refundMap.set(item.id, item);
      }
    }

    // Always increment skip by the raw number of records returned by the gateway
    skip += lastBatchCount;

    // Termination condition: If returned page contains fewer than PAGE_SIZE (100) records,
    // this was the final page.
    if (lastBatchCount < PAGE_SIZE) {
      break;
    }
  }

  // Maximum-boundary probe check: If exactly MAX_PAGES full pages (10,000 items) were retrieved,
  // we must probe page 101 (skip=10000) to verify no additional records exist beyond the cap.
  if (pageCount === MAX_PAGES && lastBatchCount === PAGE_SIZE) {
    const probeUrl = `https://api.razorpay.com/v1/payments/${encodeURIComponent(cleanPaymentId)}/refunds?count=${PAGE_SIZE}&skip=${skip}`;
    let probeResponse: Response;
    try {
      probeResponse = await fetch(probeUrl, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${authHeader}`,
        },
      });
    } catch (err: any) {
      throw new Error(
        `Failed to reach Razorpay gateway during pagination limit probe (skip=${skip}): ${err?.message || 'Network error'}`
      );
    }

    if (!probeResponse.ok) {
      let errorDetail = `HTTP ${probeResponse.status}`;
      try {
        const errJson = await probeResponse.json();
        if (errJson?.error?.description) {
          errorDetail = errJson.error.description;
        }
      } catch {
        // ignore JSON parse failure
      }
      throw new Error(
        `Razorpay payment refunds pagination probe failed (skip=${skip}): ${errorDetail}`
      );
    }

    let probeData: any;
    try {
      probeData = await probeResponse.json();
    } catch {
      throw new Error(
        `Malformed JSON response from Razorpay refunds pagination probe (skip=${skip})`
      );
    }

    if (!probeData || !Array.isArray(probeData.items)) {
      throw new Error(
        `Malformed gateway collection response on pagination probe: 'items' array missing (skip=${skip})`
      );
    }

    if (probeData.items.length > 0) {
      throw new Error(
        `PAGINATION_LIMIT_EXCEEDED: Payment refunds collection exceeds maximum supported limit of ${MAX_PAGES * PAGE_SIZE} records (100 pages). Incomplete results cannot be processed.`
      );
    }
  }

  return Array.from(refundMap.values());
}
