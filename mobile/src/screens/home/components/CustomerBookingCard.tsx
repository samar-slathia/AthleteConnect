import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  Calendar,
  Clock,
  MapPin,
  User as UserIcon,
  XCircle,
  MessageSquare,
  Navigation,
  Star,
  Timer,
  CheckCircle2,
  CheckCircle,
  CreditCard,
} from 'lucide-react-native';
import { BookingItem } from '../../../services/bookingApi';
import { openInGoogleMaps } from '../../../services/locationService';
import { Badge } from '../../../components/Badge';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../../theme/tokens';

export interface CustomerBookingCardProps {
  booking: BookingItem;
  onCancel?: (bookingId: string) => void;
  isCancelling?: boolean;
  onOpenChat?: (booking: BookingItem) => void;
  onRate?: (booking: BookingItem) => void;
  onPay?: (booking: BookingItem) => void;
}

const VENUE_LABELS: Record<string, string> = {
  customer_home: "Customer's Home",
  ground: 'Sports Ground',
  coach_home: "Coach's Home (Legacy)",
};

const formatDuration = (ms: number): string => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
};

/**
 * Dedicated subcomponent for live session countdown when status is in_progress.
 * Isolates timer state hooks so parent CustomerBookingCard remains hook-free for non-active sessions.
 */
export const CustomerLiveSessionTimer: React.FC<{ booking: BookingItem }> = ({ booking }) => {
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const durationMs = (booking.durationMinutes || 60) * 60 * 1000;
  const startTimeMs = booking.sessionStartedAt
    ? new Date(booking.sessionStartedAt).getTime()
    : now;
  const expectedEndMs = booking.expectedEndedAt
    ? new Date(booking.expectedEndedAt).getTime()
    : startTimeMs + durationMs;

  const elapsedMs = Math.max(0, now - startTimeMs);
  const remainingMs = Math.max(0, expectedEndMs - now);
  const progressRatio = Math.min(1, Math.max(0, elapsedMs / durationMs));

  return (
    <View style={styles.liveTimerContainer} testID={`live-timer-customer-${booking._id}`}>
      <View style={styles.timerHeaderRow}>
        <View style={styles.liveDotRow}>
          <View style={styles.livePulsingDot} />
          <Text style={styles.timerTitle}>COACH ARRIVED • SESSION IN PROGRESS</Text>
        </View>
        <Timer size={14} color={COLORS.navy} />
      </View>

      <View style={styles.countdownRow}>
        <View style={styles.timeBlock}>
          <Text style={styles.timeLabel}>REMAINING</Text>
          <Text style={styles.timeValue} testID={`customer-time-remaining-${booking._id}`}>
            {formatDuration(remainingMs)}
          </Text>
        </View>
        <View style={styles.timeDivider} />
        <View style={styles.timeBlock}>
          <Text style={styles.timeLabel}>ELAPSED</Text>
          <Text style={styles.timeValue} testID={`customer-time-elapsed-${booking._id}`}>
            {formatDuration(elapsedMs)}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBarTrack}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${Math.round(progressRatio * 100)}%` },
          ]}
        />
      </View>
    </View>
  );
};

export const CustomerBookingCard: React.FC<CustomerBookingCardProps> = ({
  booking,
  onCancel,
  isCancelling = false,
  onOpenChat,
  onRate,
  onPay,
}) => {
  const isInProgress = booking.status === 'in_progress';
  const isPaid = booking.paymentStatus === 'paid';
  const canPay = booking.status === 'accepted' && booking.paymentStatus === 'unpaid' && Boolean(onPay);

  const getBadgeVariant = (status: string): 'orange' | 'navy' | 'demo' | 'success' => {
    switch (status) {
      case 'in_progress':
        return 'orange';
      case 'accepted':
        return 'success';
      case 'pending':
        return 'orange';
      case 'rejected':
      case 'cancelled':
        return 'demo';
      case 'completed':
        return 'navy';
      default:
        return 'demo';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'in_progress':
        return 'In Progress';
      case 'accepted':
        return 'Confirmed';
      case 'pending':
        return 'Pending Coach';
      case 'rejected':
        return 'Declined';
      case 'cancelled':
        return 'Cancelled';
      case 'completed':
        return 'Completed';
      default:
        return status;
    }
  };

  const canCancel = booking.status === 'pending' || booking.status === 'accepted';
  const canChat = booking.status !== 'rejected' && booking.status !== 'cancelled';
  const isRated = Boolean(booking.isRated || booking.review);
  const canRate = booking.status === 'completed' && !isRated && Boolean(onRate);
  const hasValidDestination = Boolean(
    (booking.trainingAddress && booking.trainingAddress.trim()) ||
      booking.coordinates ||
      booking.locationCoordinates
  );
  const showActionRow =
    (canCancel && Boolean(onCancel)) ||
    (canChat && Boolean(onOpenChat)) ||
    hasValidDestination ||
    canRate ||
    canPay;

  const handleOpenMaps = () => {
    const isGround = booking.venueType === 'ground';
    openInGoogleMaps({
      coordinates: isGround ? undefined : booking.coordinates || booking.locationCoordinates,
      address: booking.trainingAddress,
      venueType: booking.venueType,
    });
  };

  return (
    <View style={styles.card} testID={`booking-card-${booking._id}`}>
      {/* Header Row: Sport and Status Badge */}
      <View style={styles.headerRow}>
        <View style={styles.sportBadgeWrap}>
          <Text style={styles.sportText}>{booking.sport?.toUpperCase() || 'SESSION'}</Text>
        </View>
        <View style={styles.headerBadgesRow}>
          {isPaid ? (
            <View style={styles.paidBadge} testID={`paid-badge-${booking._id}`}>
              <CheckCircle size={11} color={COLORS.success} />
              <Text style={styles.paidBadgeText}>PAID</Text>
            </View>
          ) : booking.paymentStatus === 'partially_refunded' ? (
            <View style={styles.paidBadge} testID={`partially-refunded-badge-${booking._id}`}>
              <CheckCircle size={11} color="#D97706" />
              <Text style={[styles.paidBadgeText, { color: '#D97706' }]}>PARTIAL REFUND</Text>
            </View>
          ) : booking.paymentStatus === 'refunded' ? (
            <View style={styles.paidBadge} testID={`refunded-badge-${booking._id}`}>
              <CheckCircle size={11} color="#DC2626" />
              <Text style={[styles.paidBadgeText, { color: '#DC2626' }]}>REFUNDED</Text>
            </View>
          ) : null}
          <Badge
            label={getStatusLabel(booking.status)}
            variant={getBadgeVariant(booking.status)}
          />
        </View>
      </View>

      {/* Coach Info */}
      <View style={styles.infoRow}>
        <UserIcon size={16} color={COLORS.navy} style={styles.infoIcon} />
        <Text style={styles.coachNameText}>
          Coach: {booking.coachName || 'Assigned Coach'}
        </Text>
      </View>

      {/* Date & Time */}
      <View style={styles.infoRow}>
        <Calendar size={16} color={COLORS.textMuted} style={styles.infoIcon} />
        <Text style={styles.detailText}>{booking.date}</Text>
        <Clock size={16} color={COLORS.textMuted} style={[styles.infoIcon, styles.timeIcon]} />
        <Text style={styles.detailText}>
          {booking.startTime} – {booking.endTime} ({booking.durationMinutes}m)
        </Text>
      </View>

      {/* Venue & Location */}
      <View style={styles.infoRow}>
        <MapPin size={16} color={COLORS.textMuted} style={styles.infoIcon} />
        <Text style={styles.detailText}>
          {VENUE_LABELS[booking.venueType] || booking.venueType}
        </Text>
      </View>

      {booking.trainingAddress ? (
        <Text style={styles.addressText} numberOfLines={2}>
          📍 {booking.trainingAddress}
        </Text>
      ) : null}

      {/* Unpaid Payment Banner for Accepted Bookings */}
      {booking.status === 'accepted' && booking.paymentStatus === 'unpaid' ? (
        <View style={styles.paymentNoticeBox} testID={`unpaid-banner-${booking._id}`}>
          <View style={styles.paymentNoticeLeft}>
            <CreditCard size={14} color="#B45309" />
            <Text style={styles.paymentNoticeText}>Prepaid payment required to confirm session</Text>
          </View>
          {onPay ? (
            <TouchableOpacity
              style={styles.payNowSmallBtn}
              onPress={() => onPay(booking)}
              accessibilityRole="button"
              accessibilityLabel="Prepaid Pay Now"
              testID={`button-pay-notice-${booking._id}`}
            >
              <Text style={styles.payNowSmallBtnText}>Prepaid — Pay Now</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* Refund status notice */}
      {booking.refundStatus === 'pending' ? (
        <View style={styles.noteBox} testID={`refund-pending-notice-${booking._id}`}>
          <Text style={styles.noteLabel}>Refund Notice: Refund initiated — awaiting bank processing</Text>
        </View>
      ) : null}
      {booking.refundStatus === 'failed' ? (
        <View style={styles.noteBox} testID={`refund-failed-notice-${booking._id}`}>
          <Text style={styles.noteLabel}>Refund Notice: Refund attempt was unsuccessful</Text>
        </View>
      ) : null}

      {/* LIVE IN-PROGRESS BANNER (Customer view) */}
      {isInProgress ? <CustomerLiveSessionTimer booking={booking} /> : null}

      {/* Completed session note */}
      {booking.status === 'completed' && !isRated ? (
        <View style={styles.completedNotice} testID={`completed-notice-${booking._id}`}>
          <CheckCircle2 size={14} color={COLORS.success} />
          <Text style={styles.completedNoticeText}>
            Session completed! Please rate your experience below.
          </Text>
        </View>
      ) : null}

      {/* Rejection / Cancellation Notes */}
      {booking.status === 'rejected' && booking.rejectionReason ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>Coach Note: {booking.rejectionReason}</Text>
        </View>
      ) : null}

      {booking.status === 'cancelled' ? (
        <View style={styles.noteBox} testID={`cancellation-note-${booking._id}`}>
          <Text style={styles.noteLabel} testID={`cancellation-actor-${booking._id}`}>
            {booking.cancelledBy === 'customer'
              ? 'Cancelled by You'
              : booking.cancelledBy === 'coach'
              ? 'Cancelled by Coach'
              : 'Cancelled'}
          </Text>
          {booking.cancellationReason ? (
            <Text style={styles.noteReason} testID={`cancellation-reason-${booking._id}`}>
              Reason: {booking.cancellationReason}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Rated Status Indicator for Completed Sessions */}
      {booking.status === 'completed' && isRated ? (
        <View style={styles.ratedBadge} testID={`rated-indicator-${booking._id}`}>
          <Star size={13} color={COLORS.orange} fill={COLORS.orange} />
          <Text style={styles.ratedBadgeText}>
            You rated this session {booking.review?.rating || 5}/5
          </Text>
        </View>
      ) : null}

      {/* Action Row */}
      {showActionRow ? (
        <View style={styles.actionRow}>
          {canPay ? (
            <TouchableOpacity
              style={styles.payButton}
              onPress={() => onPay && onPay(booking)}
              accessibilityRole="button"
              accessibilityLabel={`Prepaid pay for session with ${booking.coachName || 'coach'}`}
              testID={`button-pay-${booking._id}`}
            >
              <CreditCard size={13} color={COLORS.navy} />
              <Text style={styles.payButtonText}>Prepaid — Pay Now</Text>
            </TouchableOpacity>
          ) : null}

          {canRate ? (
            <TouchableOpacity
              style={styles.rateButton}
              onPress={() => onRate && onRate(booking)}
              accessibilityRole="button"
              accessibilityLabel={`Rate coach ${booking.coachName || 'coach'}`}
              testID={`button-rate-${booking._id}`}
            >
              <Star size={13} color={COLORS.navy} fill={COLORS.navy} />
              <Text style={styles.rateButtonText}>Rate Coach</Text>
            </TouchableOpacity>
          ) : null}

          {hasValidDestination ? (
            <TouchableOpacity
              style={styles.mapsButton}
              onPress={handleOpenMaps}
              accessibilityRole="button"
              accessibilityLabel={`Open directions in Google Maps for ${booking.coachName || 'coach'}`}
              testID={`button-maps-${booking._id}`}
            >
              <Navigation size={13} color={COLORS.navy} />
              <Text style={styles.mapsButtonText}>Maps</Text>
            </TouchableOpacity>
          ) : null}

          {canChat && onOpenChat ? (
            <TouchableOpacity
              style={styles.chatButton}
              onPress={() => onOpenChat(booking)}
              accessibilityRole="button"
              accessibilityLabel={`Chat with ${booking.coachName || 'coach'}`}
              testID={`button-chat-${booking._id}`}
            >
              <MessageSquare size={13} color={COLORS.navy} />
              <Text style={styles.chatButtonText}>Chat</Text>
            </TouchableOpacity>
          ) : null}

          {canCancel && onCancel ? (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => onCancel(booking._id)}
              disabled={isCancelling}
              accessibilityRole="button"
              accessibilityLabel={`Cancel booking with ${booking.coachName || 'coach'}`}
              testID={`button-cancel-${booking._id}`}
            >
              <XCircle size={14} color="#DC2626" />
              <Text style={styles.cancelButtonText}>
                {isCancelling ? 'Cancelling...' : 'Cancel Booking'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  sportBadgeWrap: {
    backgroundColor: COLORS.mist,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADII.sm,
  },
  sportText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.navy,
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoIcon: {
    marginRight: 6,
  },
  timeIcon: {
    marginLeft: SPACING.sm,
  },
  coachNameText: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 14,
    color: COLORS.navy,
  },
  detailText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12.5,
    color: COLORS.textSecondary,
  },
  addressText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
    marginLeft: 22,
  },
  // Live Timer Styles
  liveTimerContainer: {
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    backgroundColor: 'rgba(249, 115, 22, 0.08)',
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.25)',
  },
  timerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  liveDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  livePulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.orange,
  },
  timerTitle: {
    ...TYPOGRAPHY.caption,
    fontSize: 10.5,
    fontWeight: '800',
    color: COLORS.navy,
    letterSpacing: 0.5,
  },
  countdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginVertical: 4,
  },
  timeBlock: {
    alignItems: 'center',
  },
  timeLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  timeValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.navy,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  timeDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(16, 28, 44, 0.1)',
  },
  progressBarTrack: {
    height: 5,
    backgroundColor: 'rgba(16, 28, 44, 0.08)',
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.orange,
    borderRadius: 3,
  },
  completedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.sm,
    padding: 8,
    backgroundColor: 'rgba(22, 128, 93, 0.08)',
    borderRadius: RADII.sm,
  },
  completedNoticeText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.success,
    flex: 1,
  },
  noteBox: {
    marginTop: 6,
    padding: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  noteLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 11.5,
    color: '#991B1B',
  },
  noteReason: {
    ...TYPOGRAPHY.caption,
    fontSize: 11.5,
    color: '#991B1B',
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  rateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.orange,
    borderRadius: RADII.sm,
  },
  rateButtonText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.navy,
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.orange,
    borderRadius: RADII.sm,
  },
  payButtonText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.navy,
  },
  headerBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(22, 128, 93, 0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: 'rgba(22, 128, 93, 0.25)',
  },
  paidBadgeText: {
    ...TYPOGRAPHY.caption,
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.success,
    letterSpacing: 0.5,
  },
  paymentNoticeBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginTop: 6,
  },
  paymentNoticeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  paymentNoticeText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#92400E',
    flex: 1,
  },
  payNowSmallBtn: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADII.sm,
  },
  payNowSmallBtnText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.white,
  },
  ratedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: SPACING.xs,
    paddingVertical: 3,
  },
  ratedBadgeText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.orange,
  },
  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.mist,
  },
  mapsButtonText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.navy,
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.mist,
  },
  chatButtonText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.navy,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
  },
  cancelButtonText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
});
