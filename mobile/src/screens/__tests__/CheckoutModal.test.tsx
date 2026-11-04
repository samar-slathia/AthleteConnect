import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import RazorpayCheckout from 'react-native-razorpay';
import { CheckoutModal } from '../home/components/CheckoutModal';
import { CustomerBookingCard } from '../home/components/CustomerBookingCard';
import * as paymentApi from '../../services/paymentApi';
import { BookingItem } from '../../services/bookingApi';
import { AuthContext, AuthContextType } from '../../context/AuthContext';

vi.mock('react-native-razorpay', () => ({
  default: {
    open: vi.fn(),
  },
}));

// Tree inspection helpers
function findAllElements(element: any, predicate: (el: any) => boolean, results: any[] = []): any[] {
  if (!element || typeof element !== 'object') return results;
  if (predicate(element)) {
    results.push(element);
  }
  if (element.props && element.props.children) {
    const children = Array.isArray(element.props.children)
      ? element.props.children
      : [element.props.children];
    for (const child of children) {
      findAllElements(child, predicate, results);
    }
  }
  return results;
}

function findElement(element: any, predicate: (el: any) => boolean): any {
  const results = findAllElements(element, predicate);
  return results.length > 0 ? results[0] : null;
}

function findByTestId(element: any, testId: string): any {
  return findElement(element, (el) => el.props && el.props.testID === testId);
}

function extractText(element: any): string {
  if (element === null || element === undefined) return '';
  if (typeof element === 'string' || typeof element === 'number') return String(element);
  if (element.props && element.props.title) return String(element.props.title);
  if (Array.isArray(element)) return element.map(extractText).join(' ');
  if (typeof element.type === 'function') {
    try {
      return extractText(element.type(element.props));
    } catch {
      return '';
    }
  }
  if (element.props && element.props.children) {
    return extractText(element.props.children);
  }
  return '';
}

// Interactive render harness for evaluating React hooks and rerenders in Node
function createHarness(ui: React.ReactElement, authValue: Partial<AuthContextType> = {}) {
  const defaultAuth: AuthContextType = {
    user: {
      _id: 'cust_123',
      name: 'Customer Test',
      email: 'customer@test.com',
      role: 'individual',
      isActive: true,
    },
    token: 'mock_jwt_token',
    isLoading: false,
    isInitializing: false,
    error: null,
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    clearError: vi.fn(),
    ...authValue,
  };

  const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const originalDispatcher = internals ? internals.H : null;

  const hooks: any[] = [];
  let hookIdx = 0;
  const effectFns: (() => void | (() => void))[] = [];

  const dispatcher = {
    useState(initial: any) {
      const idx = hookIdx++;
      if (hooks[idx] === undefined) {
        hooks[idx] = typeof initial === 'function' ? initial() : initial;
      }
      const setState = (action: any) => {
        hooks[idx] = typeof action === 'function' ? action(hooks[idx]) : action;
      };
      return [hooks[idx], setState];
    },
    useRef(initial: any) {
      const idx = hookIdx++;
      if (hooks[idx] === undefined) {
        hooks[idx] = { current: initial };
      }
      return hooks[idx];
    },
    useCallback(fn: any) {
      const idx = hookIdx++;
      hooks[idx] = fn;
      return fn;
    },
    useEffect(fn: any) {
      effectFns.push(fn);
    },
    useContext(context: any) {
      if (context === AuthContext) {
        return defaultAuth;
      }
      return null;
    },
  };

  function renderTree(propsOverride?: any) {
    hookIdx = 0;
    if (internals) {
      internals.H = dispatcher;
    }
    const Component = ui.type as React.FC<any>;
    return Component(propsOverride || ui.props);
  }

  // Initial render
  const initialTree = renderTree();

  // Execute effects
  for (const fn of effectFns) {
    fn();
  }

  const cleanup = () => {
    if (internals) {
      internals.H = originalDispatcher;
    }
  };

  return {
    render: renderTree,
    initialTree,
    cleanup,
  };
}

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Phase 1B.2B: Genuine Razorpay Standard Checkout & Prepaid UPI Integration', () => {
  const mockBooking: BookingItem = {
    _id: 'booking_123',
    customerId: 'cust_123',
    coachId: 'coach_123',
    coachName: 'Coach Sadiq',
    sport: 'boxing',
    date: '2026-12-01',
    startTime: '10:00',
    endTime: '11:00',
    startMinutes: 600,
    endMinutes: 660,
    durationMinutes: 60,
    venueType: 'customer_home',
    status: 'accepted',
    paymentStatus: 'unpaid',
    hourlyRateSnapshot: 1500,
    paymentDueAt: '2026-12-01T12:00:00.000Z',
  };

  const mockOrderResponse: paymentApi.PaymentOrderResponse = {
    orderId: 'order_test_real_order_777',
    amount: 1500,
    amountInPaise: 150000,
    currency: 'INR',
    keyId: 'rzp_test_public_key_123',
    breakdown: {
      coachingFee: 1500,
      taxAmount: 0,
      taxRatePercentage: 0,
      taxLabel: 'Taxes & Levies (0% Sandbox Mode)',
      totalPayable: 1500,
    },
    paymentDueAt: '2026-12-01T12:00:00.000Z',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('CheckoutModal Component (Genuine Razorpay Standard Checkout)', () => {
    it('renders initial loading state while initializing payment order', () => {
      vi.spyOn(paymentApi, 'createPaymentOrder').mockReturnValue(new Promise(() => {})); // pending

      const { initialTree, cleanup } = createHarness(
        React.createElement(CheckoutModal, {
          visible: true,
          onClose: vi.fn(),
          booking: mockBooking,
          token: 'mock_token',
          onSuccess: vi.fn(),
        })
      );

      const spinner = findByTestId(initialTree, 'loading-order-spinner');
      expect(spinner).not.toBeNull();
      expect(extractText(spinner)).toContain('Initializing secure payment order');
      cleanup();
    });

    it('renders transparent breakdown and UPI features upon successful order creation', async () => {
      vi.spyOn(paymentApi, 'createPaymentOrder').mockResolvedValue(mockOrderResponse);

      const { render, cleanup } = createHarness(
        React.createElement(CheckoutModal, {
          visible: true,
          onClose: vi.fn(),
          booking: mockBooking,
          token: 'mock_token',
          onSuccess: vi.fn(),
        })
      );

      await flushPromises();
      const tree = render();

      expect(extractText(tree)).toContain('Coach Sadiq');
      expect(extractText(tree)).toContain('BOXING');

      // Check UPI Intent note
      expect(extractText(tree)).toContain('Prepaid UPI App Selection supported');

      // Check pricing breakdown
      const feeEl = findByTestId(tree, 'breakdown-coaching-fee');
      expect(extractText(feeEl)).toContain('1500.00');

      const taxEl = findByTestId(tree, 'breakdown-tax-amount');
      expect(extractText(taxEl)).toContain('0.00');

      const totalEl = findByTestId(tree, 'breakdown-total-payable');
      expect(extractText(totalEl)).toContain('1500.00');

      // Confirm old simulated shortcut buttons do NOT exist
      const simFailBtn = findByTestId(tree, 'button-simulate-failure');
      expect(simFailBtn).toBeNull();

      cleanup();
    });

    it('launches genuine RazorpayCheckout.open with exact order parameters and user prefill', async () => {
      vi.spyOn(paymentApi, 'createPaymentOrder').mockResolvedValue(mockOrderResponse);
      const razorpaySpy = vi.spyOn(RazorpayCheckout, 'open').mockResolvedValue({
        razorpay_payment_id: 'pay_genuine_rzp_999',
        razorpay_order_id: 'order_test_real_order_777',
        razorpay_signature: 'genuine_hmac_hex_signature_888',
      });

      const verifySpy = vi.spyOn(paymentApi, 'verifyPaymentSignature').mockResolvedValue({
        success: true,
        message: 'Payment verified successfully.',
        booking: {
          ...mockBooking,
          paymentStatus: 'paid',
        },
      });

      const mockOnSuccess = vi.fn();
      const { render, cleanup } = createHarness(
        React.createElement(CheckoutModal, {
          visible: true,
          onClose: vi.fn(),
          booking: mockBooking,
          token: 'mock_token',
          onSuccess: mockOnSuccess,
        })
      );

      await flushPromises();
      let tree = render();

      const payBtn = findByTestId(tree, 'button-confirm-payment');
      expect(payBtn).not.toBeNull();
      expect(extractText(payBtn)).toContain('Prepaid — Pay ₹1500.00');

      // Trigger payment
      await payBtn.props.onPress();
      await flushPromises();
      tree = render();

      // Verify RazorpayCheckout.open was called with exact options
      expect(razorpaySpy).toHaveBeenCalledTimes(1);
      expect(razorpaySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'rzp_test_public_key_123',
          order_id: 'order_test_real_order_777',
          amount: 150000,
          currency: 'INR',
          prefill: expect.objectContaining({
            email: 'customer@test.com',
            name: 'Customer Test',
          }),
        })
      );

      // Verify genuine payment signature was forwarded to backend
      expect(verifySpy).toHaveBeenCalledTimes(1);
      expect(verifySpy).toHaveBeenCalledWith(
        {
          bookingId: 'booking_123',
          razorpay_order_id: 'order_test_real_order_777',
          razorpay_payment_id: 'pay_genuine_rzp_999',
          razorpay_signature: 'genuine_hmac_hex_signature_888',
        },
        'mock_token'
      );

      const successBanner = findByTestId(tree, 'payment-success-banner');
      expect(successBanner).not.toBeNull();
      expect(extractText(successBanner)).toContain('Payment confirmed');

      cleanup();
    });

    it('handles checkout cancellation gracefully without crashing and allows retry', async () => {
      vi.spyOn(paymentApi, 'createPaymentOrder').mockResolvedValue(mockOrderResponse);
      // Simulate user closing Razorpay checkout sheet (code 0 / cancelled)
      vi.spyOn(RazorpayCheckout, 'open').mockRejectedValue({
        code: 0,
        description: 'Payment cancelled by user',
      });

      const { render, cleanup } = createHarness(
        React.createElement(CheckoutModal, {
          visible: true,
          onClose: vi.fn(),
          booking: mockBooking,
          token: 'mock_token',
          onSuccess: vi.fn(),
        })
      );

      await flushPromises();
      let tree = render();

      const payBtn = findByTestId(tree, 'button-confirm-payment');
      await payBtn.props.onPress();
      await flushPromises();
      tree = render();

      const errorBanner = findByTestId(tree, 'payment-error-banner');
      expect(errorBanner).not.toBeNull();
      expect(extractText(errorBanner)).toContain('Payment was cancelled. You can retry when you are ready');

      cleanup();
    });

    it('handles checkout failure from SDK and displays gateway error', async () => {
      vi.spyOn(paymentApi, 'createPaymentOrder').mockResolvedValue(mockOrderResponse);
      vi.spyOn(RazorpayCheckout, 'open').mockRejectedValue({
        code: 2,
        description: 'Bank servers are temporarily unreachable',
      });

      const { render, cleanup } = createHarness(
        React.createElement(CheckoutModal, {
          visible: true,
          onClose: vi.fn(),
          booking: mockBooking,
          token: 'mock_token',
          onSuccess: vi.fn(),
        })
      );

      await flushPromises();
      let tree = render();

      const payBtn = findByTestId(tree, 'button-confirm-payment');
      await payBtn.props.onPress();
      await flushPromises();
      tree = render();

      const errorBanner = findByTestId(tree, 'payment-error-banner');
      expect(errorBanner).not.toBeNull();
      expect(extractText(errorBanner)).toContain('Bank servers are temporarily unreachable');

      cleanup();
    });

    it('displays error when backend rejects invalid or tampered payment signature', async () => {
      vi.spyOn(paymentApi, 'createPaymentOrder').mockResolvedValue(mockOrderResponse);
      vi.spyOn(RazorpayCheckout, 'open').mockResolvedValue({
        razorpay_payment_id: 'pay_123',
        razorpay_order_id: 'order_test_real_order_777',
        razorpay_signature: 'tampered_signature',
      });

      vi.spyOn(paymentApi, 'verifyPaymentSignature').mockRejectedValue(
        new Error('Invalid payment signature. Payment verification failed.')
      );

      const { render, cleanup } = createHarness(
        React.createElement(CheckoutModal, {
          visible: true,
          onClose: vi.fn(),
          booking: mockBooking,
          token: 'mock_token',
          onSuccess: vi.fn(),
        })
      );

      await flushPromises();
      let tree = render();

      const payBtn = findByTestId(tree, 'button-confirm-payment');
      await payBtn.props.onPress();
      await flushPromises();
      tree = render();

      const errorBanner = findByTestId(tree, 'payment-error-banner');
      expect(errorBanner).not.toBeNull();
      expect(extractText(errorBanner)).toContain('Invalid payment signature');

      cleanup();
    });

    it('provides asynchronous status check button and confirms payment if gateway completed', async () => {
      vi.spyOn(paymentApi, 'createPaymentOrder').mockResolvedValue(mockOrderResponse);
      const getPaymentSpy = vi.spyOn(paymentApi, 'getBookingPayment').mockResolvedValue({
        bookingId: 'booking_123',
        paymentStatus: 'paid', // Completed asynchronously via webhook
      });

      const mockOnSuccess = vi.fn();
      const { render, cleanup } = createHarness(
        React.createElement(CheckoutModal, {
          visible: true,
          onClose: vi.fn(),
          booking: mockBooking,
          token: 'mock_token',
          onSuccess: mockOnSuccess,
        })
      );

      await flushPromises();
      let tree = render();

      const checkStatusBtn = findByTestId(tree, 'button-check-payment-status');
      expect(checkStatusBtn).not.toBeNull();

      await checkStatusBtn.props.onPress();
      await flushPromises();
      tree = render();

      expect(getPaymentSpy).toHaveBeenCalledWith('booking_123', 'mock_token');
      const successBanner = findByTestId(tree, 'payment-success-banner');
      expect(successBanner).not.toBeNull();

      cleanup();
    });

    it('correctly reflects pending/authorized payment status and does not mark paid', async () => {
      vi.spyOn(paymentApi, 'createPaymentOrder').mockResolvedValue(mockOrderResponse);
      const getPaymentSpy = vi.spyOn(paymentApi, 'getBookingPayment').mockResolvedValue({
        bookingId: 'booking_123',
        paymentStatus: 'unpaid',
        transaction: {
          orderId: 'order_test_123',
          status: 'authorized',
          coachingFee: 1500,
          taxAmount: 0,
          taxRatePercentage: 0,
          totalAmount: 1500,
          currency: 'INR',
        },
      });

      const mockOnSuccess = vi.fn();
      const { render, cleanup } = createHarness(
        React.createElement(CheckoutModal, {
          visible: true,
          onClose: vi.fn(),
          booking: mockBooking,
          token: 'mock_token',
          onSuccess: mockOnSuccess,
        })
      );

      await flushPromises();
      let tree = render();

      const checkStatusBtn = findByTestId(tree, 'button-check-payment-status');
      expect(checkStatusBtn).not.toBeNull();

      await checkStatusBtn.props.onPress();
      await flushPromises();
      tree = render();

      expect(getPaymentSpy).toHaveBeenCalledWith('booking_123', 'mock_token');
      const successBanner = findByTestId(tree, 'payment-success-banner');
      expect(successBanner).toBeNull();
      expect(mockOnSuccess).not.toHaveBeenCalled();

      const errorBanner = findByTestId(tree, 'payment-error-banner');
      expect(errorBanner).not.toBeNull();
      expect(extractText(errorBanner)).toContain('Payment has not yet been confirmed by the gateway');

      cleanup();
    });

    it('calls onClose when close button is pressed', async () => {
      vi.spyOn(paymentApi, 'createPaymentOrder').mockResolvedValue(mockOrderResponse);
      const mockOnClose = vi.fn();

      const { render, cleanup } = createHarness(
        React.createElement(CheckoutModal, {
          visible: true,
          onClose: mockOnClose,
          booking: mockBooking,
          token: 'mock_token',
          onSuccess: vi.fn(),
        })
      );

      await flushPromises();
      const tree = render();

      const closeBtn = findByTestId(tree, 'button-close-checkout');
      expect(closeBtn).not.toBeNull();
      closeBtn.props.onPress();

      expect(mockOnClose).toHaveBeenCalledTimes(1);
      cleanup();
    });

    it('returns null if booking is null', () => {
      const { initialTree, cleanup } = createHarness(
        React.createElement(CheckoutModal, {
          visible: true,
          onClose: vi.fn(),
          booking: null,
          token: 'mock_token',
          onSuccess: vi.fn(),
        })
      );

      expect(initialTree).toBeNull();
      cleanup();
    });
  });

  describe('CustomerBookingCard Prepaid Labeling & Integration', () => {
    it('shows "Prepaid — Pay Now" button and banner for accepted unpaid booking', () => {
      const mockOnPay = vi.fn();
      const tree = CustomerBookingCard({
        booking: mockBooking,
        onPay: mockOnPay,
      });

      const payBtn = findByTestId(tree, `button-pay-${mockBooking._id}`);
      expect(payBtn).not.toBeNull();
      expect(extractText(payBtn)).toContain('Prepaid — Pay Now');

      const unpaidBanner = findByTestId(tree, `unpaid-banner-${mockBooking._id}`);
      expect(unpaidBanner).not.toBeNull();
      expect(extractText(unpaidBanner)).toContain('Prepaid payment required to confirm session');

      payBtn.props.onPress();
      expect(mockOnPay).toHaveBeenCalledWith(mockBooking);
    });

    it('shows PAID badge and hides pay action when booking is paid', () => {
      const paidBooking: BookingItem = {
        ...mockBooking,
        paymentStatus: 'paid',
      };
      const mockOnPay = vi.fn();
      const tree = CustomerBookingCard({
        booking: paidBooking,
        onPay: mockOnPay,
      });

      const paidBadge = findByTestId(tree, `paid-badge-${paidBooking._id}`);
      expect(paidBadge).not.toBeNull();
      expect(extractText(paidBadge)).toContain('PAID');

      const payBtn = findByTestId(tree, `button-pay-${paidBooking._id}`);
      expect(payBtn).toBeNull();
    });

    it('shows PARTIAL REFUND badge and hides pay action when booking is partially refunded', () => {
      const partiallyRefundedBooking: BookingItem = {
        ...mockBooking,
        paymentStatus: 'partially_refunded',
        refundStatus: 'partially_refunded',
      };
      const mockOnPay = vi.fn();
      const tree = CustomerBookingCard({
        booking: partiallyRefundedBooking,
        onPay: mockOnPay,
      });

      const badge = findByTestId(tree, `partially-refunded-badge-${partiallyRefundedBooking._id}`);
      expect(badge).not.toBeNull();
      expect(extractText(badge)).toContain('PARTIAL REFUND');

      const payBtn = findByTestId(tree, `button-pay-${partiallyRefundedBooking._id}`);
      expect(payBtn).toBeNull();
    });

    it('shows REFUNDED badge and hides pay action when booking is fully refunded', () => {
      const refundedBooking: BookingItem = {
        ...mockBooking,
        paymentStatus: 'refunded',
        refundStatus: 'processed',
      };
      const mockOnPay = vi.fn();
      const tree = CustomerBookingCard({
        booking: refundedBooking,
        onPay: mockOnPay,
      });

      const badge = findByTestId(tree, `refunded-badge-${refundedBooking._id}`);
      expect(badge).not.toBeNull();
      expect(extractText(badge)).toContain('REFUNDED');

      const payBtn = findByTestId(tree, `button-pay-${refundedBooking._id}`);
      expect(payBtn).toBeNull();
    });

    it('shows refund pending notice when refundStatus is pending without altering paid state', () => {
      const pendingRefundBooking: BookingItem = {
        ...mockBooking,
        paymentStatus: 'paid',
        refundStatus: 'pending',
      };
      const tree = CustomerBookingCard({
        booking: pendingRefundBooking,
      });

      const paidBadge = findByTestId(tree, `paid-badge-${pendingRefundBooking._id}`);
      expect(paidBadge).not.toBeNull();
      expect(extractText(paidBadge)).toContain('PAID');

      const refundNotice = findByTestId(tree, `refund-pending-notice-${pendingRefundBooking._id}`);
      expect(refundNotice).not.toBeNull();
      expect(extractText(refundNotice)).toContain('Refund initiated — awaiting bank processing');
    });
  });
});
