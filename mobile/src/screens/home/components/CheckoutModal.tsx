import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {
  X,
  CreditCard,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  Zap,
} from 'lucide-react-native';
import RazorpayCheckout from 'react-native-razorpay';
import { BookingItem } from '../../../services/bookingApi';
import {
  createPaymentOrder,
  verifyPaymentSignature,
  getBookingPayment,
  PaymentOrderResponse,
} from '../../../services/paymentApi';
import { AuthContext } from '../../../context/AuthContext';
import { Button } from '../../../components/Button';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../../theme/tokens';

export interface CheckoutModalProps {
  visible: boolean;
  onClose: () => void;
  booking: BookingItem | null;
  token: string | null;
  onSuccess: (bookingId: string, updatedBooking: BookingItem) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  visible,
  onClose,
  booking,
  token,
  onSuccess,
}) => {
  const auth = useContext(AuthContext);
  const [isLoadingOrder, setIsLoadingOrder] = useState<boolean>(true);
  const [orderData, setOrderData] = useState<PaymentOrderResponse | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  const loadOrder = useCallback(async () => {
    if (!booking || !token) return;

    setIsLoadingOrder(true);
    setOrderError(null);
    setPaymentError(null);
    setIsSuccess(false);

    try {
      const data = await createPaymentOrder(booking._id, token);
      setOrderData(data);
    } catch (err: any) {
      setOrderError(err?.message || 'Failed to initialize payment order. Please try again.');
    } finally {
      setIsLoadingOrder(false);
    }
  }, [booking, token]);

  useEffect(() => {
    if (visible && booking) {
      loadOrder();
    } else {
      setOrderData(null);
      setOrderError(null);
      setPaymentError(null);
      setIsSuccess(false);
    }
  }, [visible, booking, loadOrder]);

  const handlePayPrepaid = async () => {
    if (!booking || !orderData || !token || isProcessingPayment) return;

    setIsProcessingPayment(true);
    setPaymentError(null);

    try {
      const options = {
        description: `${booking.sport?.toUpperCase() || 'SESSION'} with ${booking.coachName || 'Coach'}`,
        currency: orderData.currency || 'INR',
        key: orderData.keyId,
        amount: orderData.amountInPaise,
        name: 'AthleteConnect',
        order_id: orderData.orderId,
        prefill: {
          email: auth?.user?.email || '',
          contact: (auth?.user as any)?.phone || '',
          name: auth?.user?.name || '',
        },
        theme: {
          color: COLORS.navy,
        },
      };

      // Launch genuine Razorpay Standard Checkout SDK
      const checkoutResult = await RazorpayCheckout.open(options);

      // Verify the genuine payment signature with our backend
      const verification = await verifyPaymentSignature(
        {
          bookingId: booking._id,
          razorpay_order_id: checkoutResult.razorpay_order_id,
          razorpay_payment_id: checkoutResult.razorpay_payment_id,
          razorpay_signature: checkoutResult.razorpay_signature,
        },
        token
      );

      if (verification.success) {
        setIsSuccess(true);
        setTimeout(() => {
          onSuccess(booking._id, verification.booking);
          onClose();
        }, 1200);
      } else {
        setPaymentError(verification.message || 'Payment verification failed at server.');
      }
    } catch (err: any) {
      // Razorpay cancellation or failure handling
      const errorCode = err?.code;
      const errorDesc = err?.description || err?.message || 'Payment was not completed.';

      if (errorCode === 0 || errorDesc.toLowerCase().includes('cancelled') || errorDesc.toLowerCase().includes('dismissed')) {
        setPaymentError('Payment was cancelled. You can retry when you are ready.');
      } else {
        setPaymentError(`Payment failed: ${errorDesc}`);
      }
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!booking || !token || isCheckingStatus) return;

    setIsCheckingStatus(true);
    try {
      const statusData = await getBookingPayment(booking._id, token);
      if (statusData.paymentStatus === 'paid') {
        setIsSuccess(true);
        setTimeout(() => {
          onSuccess(booking._id, { ...booking, paymentStatus: 'paid' });
          onClose();
        }, 1200);
      } else {
        setPaymentError('Payment has not yet been confirmed by the gateway. If you already completed payment, please wait a moment and check again.');
      }
    } catch (err: any) {
      setPaymentError(err?.message || 'Failed to check payment status.');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  if (!booking) return null;

  const durationHrs = Math.round(((booking.durationMinutes || 60) / 60) * 10) / 10;
  const rateSnapshot = booking.hourlyRateSnapshot || 1000;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer} testID="checkout-modal">
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerLeft}>
              <CreditCard size={20} color={COLORS.navy} />
              <Text style={styles.headerTitle}>Prepaid Checkout</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close checkout"
              testID="button-close-checkout"
            >
              <X size={20} color={COLORS.navy} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Session Info Header */}
            <View style={styles.sessionCard}>
              <Text style={styles.coachNameText}>{booking.coachName || 'Coaching Session'}</Text>
              <Text style={styles.sportText}>
                {booking.packageType && booking.packageType !== 'single'
                  ? `${booking.packageType === 'weekly' ? '7-Day Coaching Package' : 'Monthly Coaching Package'} • ${booking.sport?.toUpperCase()}`
                  : `${booking.sport?.toUpperCase()} • ${durationHrs} hrs (${booking.durationMinutes} mins)`}
              </Text>
              {booking.packageType && booking.packageType !== 'single' ? (
                <Text style={styles.dateText}>
                  📅 {booking.packageSessionCount || orderData?.sessionCount || 1} Sessions ({booking.packageStartDate || booking.date} to {booking.packageEndDate || booking.date}) at {booking.startTime}–{booking.endTime}
                </Text>
              ) : (
                <Text style={styles.dateText}>
                  📅 {booking.date} at {booking.startTime}–{booking.endTime}
                </Text>
              )}
            </View>

            {/* Test Mode Callout */}
            <View style={styles.sandboxCallout} testID="sandbox-mode-callout">
              <View style={styles.sandboxBadge}>
                <Sparkles size={13} color="#92400E" />
                <Text style={styles.sandboxBadgeText}>RAZORPAY TEST MODE</Text>
              </View>
              <Text style={styles.sandboxNoticeText}>
                Development demonstration. Choose UPI, Test Card, or NetBanking in genuine Checkout. In Test Mode, use test UPI IDs (e.g. success@razorpay) or sandbox test cards.
              </Text>
            </View>

            {/* Error banners */}
            {orderError ? (
              <View style={styles.errorBox} testID="order-error-banner">
                <AlertCircle size={16} color="#DC2626" />
                <Text style={styles.errorText}>{orderError}</Text>
              </View>
            ) : null}

            {paymentError ? (
              <View style={styles.errorBox} testID="payment-error-banner">
                <AlertCircle size={16} color="#DC2626" />
                <Text style={styles.errorText}>{paymentError}</Text>
              </View>
            ) : null}

            {/* Success Banner */}
            {isSuccess ? (
              <View style={styles.successBox} testID="payment-success-banner">
                <CheckCircle2 size={18} color={COLORS.success} />
                <Text style={styles.successText}>
                  Payment confirmed! Booking is now verified and ready.
                </Text>
              </View>
            ) : null}

            {/* Breakdown Content */}
            {isLoadingOrder ? (
              <View style={styles.loadingContainer} testID="loading-order-spinner">
                <ActivityIndicator size="small" color={COLORS.navy} />
                <Text style={styles.loadingText}>Initializing secure payment order...</Text>
              </View>
            ) : orderData ? (
              <View style={styles.breakdownCard} testID="pricing-breakdown-card">
                <Text style={styles.breakdownHeader}>PAYMENT BREAKDOWN</Text>

                {/* Coaching Fee */}
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>
                    {orderData.breakdown.sessionCount && orderData.breakdown.sessionCount > 1
                      ? `Package Fee (${orderData.breakdown.sessionCount} sessions @ ₹${orderData.breakdown.perSessionFee || (orderData.breakdown.coachingFee / orderData.breakdown.sessionCount)}/session)`
                      : `Coaching Session Fee (${durationHrs} hr @ ₹${rateSnapshot}/hr)`}
                  </Text>
                  <Text style={styles.breakdownValue} testID="breakdown-coaching-fee">
                    ₹{orderData.breakdown.coachingFee.toFixed(2)}
                  </Text>
                </View>

                {/* Separate Tax Line Item */}
                <View style={styles.breakdownRow}>
                  <View style={styles.taxLabelCol}>
                    <Text style={styles.breakdownLabel}>Taxes & Levies</Text>
                    <Text style={styles.taxSubNote}>
                      {orderData.breakdown.taxLabel}
                    </Text>
                  </View>
                  <Text style={styles.breakdownValue} testID="breakdown-tax-amount">
                    ₹{orderData.breakdown.taxAmount.toFixed(2)}
                  </Text>
                </View>

                <View style={styles.divider} />

                {/* Total Customer Payable */}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total Payable</Text>
                  <Text style={styles.totalValue} testID="breakdown-total-payable">
                    ₹{orderData.breakdown.totalPayable.toFixed(2)}
                  </Text>
                </View>

                {/* UPI Intent Highlight */}
                <View style={styles.upiFeatureRow}>
                  <Zap size={14} color="#059669" />
                  <Text style={styles.upiFeatureText}>
                    Prepaid UPI App Selection supported (Google Pay, PhonePe, Paytm, BHIM)
                  </Text>
                </View>

                {/* Payment Due Deadline */}
                {orderData.paymentDueAt ? (
                  <View style={styles.deadlineRow} testID="payment-deadline-indicator">
                    <Clock size={13} color="#B45309" />
                    <Text style={styles.deadlineText}>
                      Payment due window active (expires in ~2 hours)
                    </Text>
                  </View>
                ) : null}

                {/* Trust and Safety Callout */}
                <View style={styles.securityRow}>
                  <ShieldCheck size={14} color={COLORS.navy} />
                  <Text style={styles.securityText}>
                    Genuine Razorpay SDK with 256-bit server cryptographic signature verification.
                  </Text>
                </View>
              </View>
            ) : null}
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.modalFooter}>
            {orderError ? (
              <Button
                title="Retry Order Initialization"
                onPress={loadOrder}
                variant="primary"
                testID="button-retry-order"
              />
            ) : (
              <>
                <Button
                  title={
                    isProcessingPayment
                      ? 'Opening Razorpay Checkout...'
                      : isSuccess
                      ? 'Payment Confirmed'
                      : orderData
                      ? `Prepaid — Pay ₹${orderData.breakdown.totalPayable.toFixed(2)}`
                      : 'Prepaid — Pay Now'
                  }
                  onPress={handlePayPrepaid}
                  loading={isProcessingPayment}
                  disabled={isLoadingOrder || isProcessingPayment || isSuccess || !orderData}
                  variant="primary"
                  testID="button-confirm-payment"
                />

                {/* Asynchronous Status Check in case of app switch or delayed webhook */}
                {orderData && !isSuccess && !isLoadingOrder ? (
                  <TouchableOpacity
                    style={styles.checkStatusBtn}
                    onPress={handleCheckStatus}
                    disabled={isProcessingPayment || isCheckingStatus}
                    testID="button-check-payment-status"
                  >
                    <RefreshCw size={13} color={COLORS.navy} />
                    <Text style={styles.checkStatusText}>
                      {isCheckingStatus ? 'Checking Status...' : 'Check Payment Status'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16, 28, 44, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
    maxHeight: '85%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    ...TYPOGRAPHY.h3,
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.navy,
  },
  closeBtn: {
    padding: 6,
    borderRadius: RADII.sm,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  sessionCard: {
    backgroundColor: COLORS.mist,
    padding: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  coachNameText: {
    ...TYPOGRAPHY.body,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.navy,
  },
  sportText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.orange,
    marginTop: 2,
  },
  dateText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  sandboxCallout: {
    backgroundColor: '#FEF3C7',
    padding: SPACING.sm,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: SPACING.md,
  },
  sandboxBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  sandboxBadgeText: {
    ...TYPOGRAPHY.caption,
    fontSize: 10.5,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 0.5,
  },
  sandboxNoticeText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11.5,
    color: '#78350F',
    lineHeight: 16,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    padding: SPACING.sm,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    marginBottom: SPACING.md,
  },
  errorText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: '#DC2626',
    flex: 1,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(22, 128, 93, 0.1)',
    padding: SPACING.sm,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: 'rgba(22, 128, 93, 0.3)',
    marginBottom: SPACING.md,
  },
  successText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.success,
    flex: 1,
  },
  loadingContainer: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    ...TYPOGRAPHY.caption,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  breakdownCard: {
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  breakdownHeader: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginVertical: 4,
  },
  breakdownLabel: {
    ...TYPOGRAPHY.body,
    fontSize: 13.5,
    color: COLORS.navy,
    flex: 1,
  },
  taxLabelCol: {
    flex: 1,
    paddingRight: 8,
  },
  taxSubNote: {
    ...TYPOGRAPHY.caption,
    fontSize: 10.5,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  breakdownValue: {
    ...TYPOGRAPHY.body,
    fontSize: 13.5,
    fontWeight: '700',
    color: COLORS.navy,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  totalLabel: {
    ...TYPOGRAPHY.body,
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.navy,
  },
  totalValue: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.orange,
  },
  upiFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    padding: 8,
    borderRadius: RADII.sm,
    marginTop: SPACING.sm,
  },
  upiFeatureText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#065F46',
    flex: 1,
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFBEB',
    padding: 6,
    borderRadius: RADII.sm,
    marginTop: SPACING.sm,
  },
  deadlineText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '600',
    color: '#B45309',
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: SPACING.sm,
  },
  securityText: {
    ...TYPOGRAPHY.caption,
    fontSize: 10.5,
    color: COLORS.textMuted,
    flex: 1,
  },
  modalFooter: {
    paddingHorizontal: SPACING.md,
    gap: 8,
    marginTop: SPACING.xs,
  },
  checkStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  checkStatusText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.navy,
  },
});
