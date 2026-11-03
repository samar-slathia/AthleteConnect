import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Modal } from 'react-native';
import {
  Calendar,
  Clock,
  MapPin,
  Phone,
  User as UserIcon,
  Check,
  X,
  MessageSquare,
  AlertCircle,
  Navigation,
  CheckCircle,
  Play,
  Timer,
} from 'lucide-react-native';
import { BookingItem } from '../../../services/bookingApi';
import { openInGoogleMaps } from '../../../services/locationService';
import { Badge } from '../../../components/Badge';
import { SlideToComplete } from './SlideToComplete';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../../theme/tokens';

export interface CoachBookingCardProps {
  booking: BookingItem;
  onAccept?: (bookingId: string) => Promise<void> | void;
  onReject?: (bookingId: string, reason?: string) => Promise<void> | void;
  onStartSession?: (bookingId: string) => Promise<void> | void;
  onComplete?: (bookingId: string) => Promise<void> | void;
  onOpenChat?: (booking: BookingItem) => void;
  isProcessing?: boolean;
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

export const CoachBookingCard: React.FC<CoachBookingCardProps> = ({
  booking,
  onAccept,
  onReject,
  onStartSession,
  onComplete,
  onOpenChat,
  isProcessing = false,
}) => {
  const [callError, setCallError] = useState<string | null>(null);
  const [showArrivalModal, setShowArrivalModal] = useState<boolean>(false);
  const [now, setNow] = useState<number>(Date.now());

  const isInProgress = booking.status === 'in_progress';

  // Live timer tick when session is in progress
  useEffect(() => {
    if (!isInProgress) return;
    setNow(Date.now());
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [isInProgress]);

  // Duration calculations
  const durationMs = (booking.durationMinutes || 60) * 60 * 1000;
  const startTimeMs = booking.sessionStartedAt
    ? new Date(booking.sessionStartedAt).getTime()
    : now;
  const expectedEndMs = booking.expectedEndedAt
    ? new Date(booking.expectedEndedAt).getTime()
    : startTimeMs + durationMs;

  const elapsedMs = Math.max(0, now - startTimeMs);
  const remainingMs = Math.max(0, expectedEndMs - now);
  const isDurationElapsed = now >= expectedEndMs;
  const progressRatio = Math.min(1, Math.max(0, elapsedMs / durationMs));

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
        return 'Accepted Session';
      case 'pending':
        return 'Pending Response';
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

  // PRIVACY: Contact phone number is strictly restricted to accepted, in_progress or completed sessions
  const isPhoneAuthorized =
    booking.status === 'accepted' ||
    booking.status === 'in_progress' ||
    booking.status === 'completed';
  const showPhone = isPhoneAuthorized && Boolean(booking.customerPhone);

  // DESTINATION: Authorized for pending, accepted, in_progress, and completed sessions
  const isDestinationAuthorized =
    booking.status === 'pending' ||
    booking.status === 'accepted' ||
    booking.status === 'in_progress' ||
    booking.status === 'completed';
  const showAddress = isDestinationAuthorized && Boolean(booking.trainingAddress);
  const hasValidDestination =
    isDestinationAuthorized &&
    Boolean(
      (booking.trainingAddress && booking.trainingAddress.trim()) ||
        booking.coordinates ||
        booking.locationCoordinates
    );

  const handleCall = async () => {
    if (!booking.customerPhone) return;
    setCallError(null);
    const cleanPhone = booking.customerPhone.replace(/[^\d+]/g, '');
    const url = `tel:${cleanPhone}`;

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        setCallError('Phone dialer is not supported on this device.');
      }
    } catch {
      setCallError('Unable to open phone dialer.');
    }
  };

  const handleOpenMaps = () => {
    const isGround = booking.venueType === 'ground';
    openInGoogleMaps({
      coordinates: isGround ? undefined : booking.coordinates || booking.locationCoordinates,
      address: booking.trainingAddress,
      venueType: booking.venueType,
    });
  };

  const handleConfirmStart = async () => {
    setShowArrivalModal(false);
    if (onStartSession) {
      await onStartSession(booking._id);
    }
  };

  const isPending = booking.status === 'pending';
  const isAccepted = booking.status === 'accepted';
  const canChat = booking.status !== 'rejected' && booking.status !== 'cancelled';

  return (
    <View style={styles.card} testID={`coach-booking-card-${booking._id}`}>
      {/* Header Row: Sport & Status Badge */}
      <View style={styles.headerRow}>
        <View style={styles.sportBadgeWrap}>
          <Text style={styles.sportText}>{booking.sport?.toUpperCase() || 'SESSION'}</Text>
        </View>
        <Badge
          label={getStatusLabel(booking.status)}
          variant={getBadgeVariant(booking.status)}
        />
      </View>

      {/* Trainee Name */}
      <View style={styles.infoRow}>
        <UserIcon size={16} color={COLORS.navy} style={styles.infoIcon} />
        <Text style={styles.traineeNameText}>
          Trainee: {booking.customerName || 'Athlete'}
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

      {/* Venue */}
      <View style={styles.infoRow}>
        <MapPin size={16} color={COLORS.textMuted} style={styles.infoIcon} />
        <Text style={styles.detailText}>
          {VENUE_LABELS[booking.venueType] || booking.venueType}
        </Text>
      </View>

      {/* Authorized Address */}
      {showAddress && booking.trainingAddress ? (
        <Text style={styles.addressText} numberOfLines={2} testID={`training-address-${booking._id}`}>
          📍 {booking.trainingAddress}
        </Text>
      ) : null}

      {/* Authorized Contact Phone & Call Button */}
      {showPhone && booking.customerPhone ? (
        <View style={styles.contactContainer} testID={`contact-phone-section-${booking._id}`}>
          <View style={styles.phoneRow}>
            <Phone size={14} color={COLORS.navy} style={styles.infoIcon} />
            <Text style={styles.phoneText}>{booking.customerPhone}</Text>
            <TouchableOpacity
              style={styles.callButton}
              onPress={handleCall}
              accessibilityRole="button"
              accessibilityLabel={`Call trainee at ${booking.customerPhone}`}
              testID={`button-call-${booking._id}`}
            >
              <Phone size={13} color={COLORS.navy} />
              <Text style={styles.callButtonText}>Call</Text>
            </TouchableOpacity>
          </View>

          {callError ? (
            <View style={styles.callErrorRow} testID={`call-error-${booking._id}`}>
              <AlertCircle size={12} color="#DC2626" style={styles.callErrorIcon} />
              <Text style={styles.callErrorText}>{callError}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* LIVE SESSION TIMER BANNER (When session is in_progress) */}
      {isInProgress ? (
        <View style={styles.liveTimerContainer} testID={`live-timer-coach-${booking._id}`}>
          <View style={styles.timerHeaderRow}>
            <View style={styles.liveDotRow}>
              <View style={styles.livePulsingDot} />
              <Text style={styles.timerTitle}>LIVE SESSION</Text>
            </View>
            <Timer size={14} color={COLORS.navy} />
          </View>

          <View style={styles.countdownRow}>
            <View style={styles.timeBlock}>
              <Text style={styles.timeLabel}>REMAINING</Text>
              <Text style={styles.timeValue} testID={`time-remaining-${booking._id}`}>
                {formatDuration(remainingMs)}
              </Text>
            </View>
            <View style={styles.timeDivider} />
            <View style={styles.timeBlock}>
              <Text style={styles.timeLabel}>ELAPSED</Text>
              <Text style={styles.timeValue} testID={`time-elapsed-${booking._id}`}>
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
      ) : null}

      {/* SLIDE-TO-COMPLETE SLIDER (When session is in_progress) */}
      {isInProgress && onComplete ? (
        <View style={styles.sliderWrapper} testID={`slider-container-${booking._id}`}>
          <SlideToComplete
            disabled={!isDurationElapsed}
            disabledMessage={`LOCKED (${formatDuration(remainingMs)} REMAINING)`}
            isCompleting={isProcessing}
            onComplete={() => onComplete(booking._id)}
            testID={`slide-to-complete-${booking._id}`}
          />
        </View>
      ) : null}

      {/* Notes / Reasons */}
      {booking.status === 'rejected' && booking.rejectionReason ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>Decline Reason: {booking.rejectionReason}</Text>
        </View>
      ) : null}

      {booking.status === 'cancelled' ? (
        <View style={styles.noteBox} testID={`cancellation-note-${booking._id}`}>
          <Text style={styles.noteLabel} testID={`cancellation-actor-${booking._id}`}>
            {booking.cancelledBy === 'coach'
              ? 'Cancelled by You'
              : booking.cancelledBy === 'customer'
              ? 'Cancelled by Trainee'
              : 'Cancelled'}
          </Text>
          {booking.cancellationReason ? (
            <Text style={styles.noteReason} testID={`cancellation-reason-${booking._id}`}>
              Reason: {booking.cancellationReason}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Actions Section */}
      <View style={styles.actionContainer}>
        {/* Coach Arrival Action: "I'm at the location" button on accepted bookings */}
        {isAccepted && onStartSession ? (
          <TouchableOpacity
            style={[styles.arrivalButton, isProcessing && styles.btnDisabled]}
            onPress={() => setShowArrivalModal(true)}
            disabled={isProcessing}
            accessibilityRole="button"
            accessibilityLabel={`I'm at the location for session with ${booking.customerName || 'trainee'}`}
            testID={`button-arrived-${booking._id}`}
          >
            <MapPin size={14} color={COLORS.navy} />
            <Text style={styles.arrivalButtonText}>I'm at the location</Text>
          </TouchableOpacity>
        ) : isAccepted && onComplete ? (
          <TouchableOpacity
            style={[styles.completeButton, isProcessing && styles.btnDisabled]}
            onPress={() => onComplete(booking._id)}
            disabled={isProcessing}
            accessibilityRole="button"
            accessibilityLabel={`Mark session with ${booking.customerName || 'trainee'} as completed`}
            testID={`button-complete-${booking._id}`}
          >
            <CheckCircle size={14} color={COLORS.white} />
            <Text style={styles.completeButtonText}>
              {isProcessing ? 'Completing...' : 'Complete Session'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Pending Decision Buttons */}
        {isPending && onAccept && onReject ? (
          <View style={styles.decisionRow}>
            <TouchableOpacity
              style={[styles.decisionBtn, styles.rejectBtn, isProcessing && styles.btnDisabled]}
              onPress={() => onReject(booking._id)}
              disabled={isProcessing}
              accessibilityRole="button"
              accessibilityLabel={`Decline request from ${booking.customerName || 'trainee'}`}
              testID={`button-reject-${booking._id}`}
            >
              <X size={14} color="#DC2626" />
              <Text style={styles.rejectBtnText}>
                {isProcessing ? 'Declining...' : 'Reject'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.decisionBtn, styles.acceptBtn, isProcessing && styles.btnDisabled]}
              onPress={() => onAccept(booking._id)}
              disabled={isProcessing}
              accessibilityRole="button"
              accessibilityLabel={`Accept request from ${booking.customerName || 'trainee'}`}
              testID={`button-accept-${booking._id}`}
            >
              <Check size={14} color={COLORS.navy} />
              <Text style={styles.acceptBtnText}>
                {isProcessing ? 'Accepting...' : 'Accept'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {hasValidDestination ? (
          <TouchableOpacity
            style={styles.mapsButton}
            onPress={handleOpenMaps}
            accessibilityRole="button"
            accessibilityLabel={`Open directions in Google Maps for ${booking.customerName || 'trainee'}`}
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
            accessibilityLabel={`Chat with ${booking.customerName || 'trainee'}`}
            testID={`button-chat-${booking._id}`}
          >
            <MessageSquare size={14} color={COLORS.navy} />
            <Text style={styles.chatButtonText}>Chat</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Arrival Confirmation Modal */}
      <Modal
        visible={showArrivalModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowArrivalModal(false)}
        testID={`modal-confirm-arrival-${booking._id}`}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconWrap}>
              <MapPin size={28} color={COLORS.navy} />
            </View>
            <Text style={styles.modalTitle}>Confirm Arrival</Text>
            <Text style={styles.modalBody}>
              Are you at the training location? Confirming arrival will start the live session countdown
              timer for {booking.durationMinutes} minutes.
            </Text>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowArrivalModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel arrival confirmation"
                testID={`button-cancel-start-${booking._id}`}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleConfirmStart}
                accessibilityRole="button"
                accessibilityLabel="Confirm arrival and start timer"
                testID={`button-confirm-start-${booking._id}`}
              >
                <Play size={14} color={COLORS.navy} fill={COLORS.navy} />
                <Text style={styles.modalConfirmBtnText}>Start Session</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  traineeNameText: {
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
    marginBottom: 4,
  },
  contactContainer: {
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: COLORS.mist,
    borderRadius: RADII.sm,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  phoneText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.navy,
    flex: 1,
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: COLORS.orange,
    borderRadius: RADII.sm,
  },
  callButtonText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.navy,
  },
  callErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  callErrorIcon: {
    marginRight: 4,
  },
  callErrorText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: '#DC2626',
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
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.navy,
    letterSpacing: 0.6,
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
  sliderWrapper: {
    marginTop: SPACING.sm,
  },
  // Actions
  actionContainer: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  arrivalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.orange,
    flex: 1,
    justifyContent: 'center',
  },
  arrivalButtonText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12.5,
    fontWeight: '800',
    color: COLORS.navy,
  },
  decisionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    flex: 1,
  },
  decisionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: RADII.sm,
    borderWidth: 1,
  },
  rejectBtn: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF5F5',
  },
  rejectBtnText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  acceptBtn: {
    borderColor: COLORS.orange,
    backgroundColor: COLORS.orange,
  },
  acceptBtnText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.navy,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.mist,
  },
  mapsButtonText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.navy,
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.mist,
  },
  chatButtonText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.navy,
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.navy,
  },
  completeButtonText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.white,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16, 28, 44, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(249, 115, 22, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  modalTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.navy,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  modalBody: {
    ...TYPOGRAPHY.body,
    fontSize: 13.5,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: SPACING.lg,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 13.5,
    color: COLORS.navy,
  },
  modalConfirmBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.orange,
  },
  modalConfirmBtnText: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 13.5,
    color: COLORS.navy,
  },
});
