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

  describe('CustomerBookingCard Payment CTA & Integration', () => {
    it('shows prominent "Pay Now" button with subtle Recommended badge and no warning banner for accepted unpaid booking', () => {
      const mockOnPay = vi.fn();
      const tree = CustomerBookingCard({
        booking: mockBooking,
        onPay: mockOnPay,
      });

      const payBtn = findByTestId(tree, `button-pay-${mockBooking._id}`);
      expect(payBtn).not.toBeNull();
      expect(extractText(payBtn)).toContain('Pay Now');
      expect(extractText(payBtn)).not.toContain('Prepaid');

      const recommendedBadge = findByTestId(tree, `recommended-badge-${mockBooking._id}`);
      expect(recommendedBadge).not.toBeNull();
      expect(extractText(recommendedBadge)).toContain('Recommended');

      const unpaidBanner = findByTestId(tree, `unpaid-banner-${mockBooking._id}`);
      expect(unpaidBanner).toBeNull();

      payBtn.props.onPress();
      expect(mockOnPay).toHaveBeenCalledWith(mockBooking);
    });

    it('renders all four actions (Pay Now, Maps, Chat, Cancel Booking) in a single row without wrapping', () => {
      const fullBooking: BookingItem = {
        ...mockBooking,
        trainingAddress: '123 Main Road, Bangalore',
        coordinates: { latitude: 12.9716, longitude: 77.5946 },
      };
      const mockOnPay = vi.fn();
      const mockOnCancel = vi.fn();
      const mockOnOpenChat = vi.fn();

      const tree = CustomerBookingCard({
        booking: fullBooking,
        onPay: mockOnPay,
        onCancel: mockOnCancel,
        onOpenChat: mockOnOpenChat,
      });

      const payBtn = findByTestId(tree, `button-pay-${fullBooking._id}`);
      const mapsBtn = findByTestId(tree, `button-maps-${fullBooking._id}`);
      const chatBtn = findByTestId(tree, `button-chat-${fullBooking._id}`);
      const cancelBtn = findByTestId(tree, `button-cancel-${fullBooking._id}`);
      const recommendedBadge = findByTestId(tree, `recommended-badge-${fullBooking._id}`);

      expect(payBtn).not.toBeNull();
      expect(mapsBtn).not.toBeNull();
      expect(chatBtn).not.toBeNull();
      expect(cancelBtn).not.toBeNull();
      expect(recommendedBadge).not.toBeNull();

      expect(extractText(payBtn).trim()).toBe('Pay Now');
      expect(extractText(mapsBtn).trim()).toBe('Maps');
      expect(extractText(chatBtn).trim()).toBe('Chat');
      expect(extractText(cancelBtn).trim()).toBe('Cancel Booking');
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

    it('shows package badge on CustomerBookingCard for weekly and monthly packages', () => {
      const weeklyBooking: BookingItem = {
        ...mockBooking,
        packageType: 'weekly',
        packageSessionIndex: 1,
        packageSessionCount: 3,
      };

      const tree = CustomerBookingCard({
        booking: weeklyBooking,
      });

      const pkgBadge = findByTestId(tree, `package-badge-${weeklyBooking._id}`);
      expect(pkgBadge).not.toBeNull();
      expect(extractText(pkgBadge)).toContain('7-Day Pkg • 1/3');
    });

    it('displays package information in CheckoutModal for package bookings', async () => {
      const packageBooking: BookingItem = {
        ...mockBooking,
        packageType: 'weekly',
        packageSessionCount: 3,
        packageStartDate: '2026-11-20',
        packageEndDate: '2026-11-26',
      };

      vi.spyOn(paymentApi, 'createPaymentOrder').mockResolvedValue({
        orderId: 'order_pkg_test',
        amount: 3600,
        amountInPaise: 360000,
        currency: 'INR',
        keyId: 'rzp_test_mock',
        packageType: 'weekly',
        sessionCount: 3,
        breakdown: {
          coachingFee: 3600,
          sessionCount: 3,
          perSessionFee: 1200,
          taxAmount: 0,
          taxRatePercentage: 0,
          taxLabel: 'Taxes & Levies (0% Sandbox Mode)',
          totalPayable: 3600,
        },
      });

      const { render, cleanup } = createHarness(
        React.createElement(CheckoutModal, {
          visible: true,
          onClose: vi.fn(),
          booking: packageBooking,
          token: 'jwt_token',
          onSuccess: vi.fn(),
        })
      );

      await flushPromises();
      const tree = render();

      const sessionCard = findElement(tree, (el) => el.props?.style && el.props?.children);
      const text = extractText(tree);
      expect(text).toContain('7-Day Coaching Package');
      expect(text).toContain('Sessions');
      expect(text).toContain('Package Fee (3 sessions @ ₹1200/session)');
      expect(text).toContain('₹3600.00');

      cleanup();
    });

    it('renders payment mode selection tabs with "Pay on this phone" as default', async () => {
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

      const standardTab = findByTestId(tree, 'tab-pay-standard');
      const qrTab = findByTestId(tree, 'tab-pay-qr');

      expect(standardTab).not.toBeNull();
      expect(qrTab).not.toBeNull();
      expect(extractText(standardTab)).toContain('Pay on this phone');
      expect(extractText(qrTab)).toContain('Pay via QR (other phone)');

      // Pricing breakdown is visible by default
      const breakdown = findByTestId(tree, 'pricing-breakdown-card');
      expect(breakdown).not.toBeNull();

      cleanup();
    });

    it('switches to QR payment mode and renders genuine Razorpay QR image', async () => {
      vi.spyOn(paymentApi, 'createPaymentOrder').mockResolvedValue(mockOrderResponse);
      const mockQrResponse: paymentApi.PaymentQrResponse = {
        qrId: 'qr_test_genuine_123',
        imageUrl: 'https://api.razorpay.com/v1/payments/qr_codes/qr_test_genuine_123/image',
        amount: 1500,
        amountInPaise: 150000,
        currency: 'INR',
        closeBy: Math.floor(Date.now() / 1000) + 900,
        breakdown: mockOrderResponse.breakdown,
        message: 'Payment QR created successfully.',
      };
      const createQrSpy = vi.spyOn(paymentApi, 'createPaymentQr').mockResolvedValue(mockQrResponse);

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

      // Tap QR Tab
      const qrTab = findByTestId(tree, 'tab-pay-qr');
      qrTab.props.onPress();

      await flushPromises();
      tree = render();

      expect(createQrSpy).toHaveBeenCalledWith('booking_123', 'mock_token');

      // Verify QR image and details
      const qrImage = findByTestId(tree, 'razorpay-qr-image');
      expect(qrImage).not.toBeNull();
      expect(qrImage.props.source).toEqual({
        uri: 'https://api.razorpay.com/v1/payments/qr_codes/qr_test_genuine_123/image',
      });

      const amountText = findByTestId(tree, 'qr-amount-text');
      expect(extractText(amountText)).toContain('1500.00');

      const instruction = findByTestId(tree, 'qr-instruction-text');
      expect(extractText(instruction)).toContain('Google Pay, PhonePe, Paytm, BHIM');

      const countdown = findByTestId(tree, 'qr-countdown-timer');
      expect(countdown).not.toBeNull();
      expect(extractText(countdown)).toContain('Expires in');

      cleanup();
    });

    it('handles Razorpay QR not activated error and provides smooth fallback to phone checkout', async () => {
      vi.spyOn(paymentApi, 'createPaymentOrder').mockResolvedValue(mockOrderResponse);
      vi.spyOn(paymentApi, 'createPaymentQr').mockRejectedValue(
        new Error(
          'Razorpay Dynamic UPI QR payments are not enabled for this account. Account activation with Razorpay is required.'
        )
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

      // Switch to QR tab
      const qrTab = findByTestId(tree, 'tab-pay-qr');
      qrTab.props.onPress();

      await flushPromises();
      tree = render();

      const activationBanner = findByTestId(tree, 'qr-activation-error-banner');
      expect(activationBanner).not.toBeNull();
      expect(extractText(activationBanner)).toContain('Dynamic UPI QR Feature Not Activated');
      expect(extractText(activationBanner)).toContain(
        'Razorpay Dynamic UPI QR payments are not enabled for this account.'
      );

      // Tap fallback button to switch back to phone checkout
      const fallbackBtn = findByTestId(tree, 'button-switch-to-standard');
      expect(fallbackBtn).not.toBeNull();
      fallbackBtn.props.onPress();

      await flushPromises();
      tree = render();

      // Standard checkout card is back
      const breakdown = findByTestId(tree, 'pricing-breakdown-card');
      expect(breakdown).not.toBeNull();

      cleanup();
    });

    it('manually checks QR payment status and confirms payment when captured', async () => {
      vi.spyOn(paymentApi, 'createPaymentOrder').mockResolvedValue(mockOrderResponse);
      const mockQrResponse: paymentApi.PaymentQrResponse = {
        qrId: 'qr_test_genuine_123',
        imageUrl: 'https://api.razorpay.com/v1/payments/qr_codes/qr_test_genuine_123/image',
        amount: 1500,
        amountInPaise: 150000,
        currency: 'INR',
        closeBy: Math.floor(Date.now() / 1000) + 900,
        breakdown: mockOrderResponse.breakdown,
      };
      vi.spyOn(paymentApi, 'createPaymentQr').mockResolvedValue(mockQrResponse);
      const getQrStatusSpy = vi.spyOn(paymentApi, 'getQrPaymentStatus').mockResolvedValue({
        isPaid: true,
        isExpired: false,
        paymentStatus: 'paid',
        status: 'captured',
        paymentId: 'pay_qr_captured_999',
      });

      const onSuccessMock = vi.fn();
      const { render, cleanup } = createHarness(
        React.createElement(CheckoutModal, {
          visible: true,
          onClose: vi.fn(),
          booking: mockBooking,
          token: 'mock_token',
          onSuccess: onSuccessMock,
        })
      );

      await flushPromises();
      let tree = render();

      // Switch to QR mode
      const qrTab = findByTestId(tree, 'tab-pay-qr');
      qrTab.props.onPress();

      await flushPromises();
      tree = render();

      // Check payment status button
      const checkStatusBtn = findByTestId(tree, 'button-check-qr-status');
      expect(checkStatusBtn).not.toBeNull();
      checkStatusBtn.props.onPress();

      await flushPromises();
      tree = render();

      expect(getQrStatusSpy).toHaveBeenCalledWith('booking_123', 'mock_token', { reconcile: true });

      const successBanner = findByTestId(tree, 'payment-success-banner');
      expect(successBanner).not.toBeNull();
      expect(extractText(successBanner)).toContain('Payment confirmed');

      cleanup();
    });
  });
});
