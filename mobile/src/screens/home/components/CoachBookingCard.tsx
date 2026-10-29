import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { Calendar, Clock, MapPin, Phone, User as UserIcon, Check, X, MessageSquare, AlertCircle, Navigation } from 'lucide-react-native';
import { BookingItem } from '../../../services/bookingApi';
import { openInGoogleMaps } from '../../../services/locationService';
import { Badge } from '../../../components/Badge';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../../theme/tokens';

export interface CoachBookingCardProps {
  booking: BookingItem;
  onAccept?: (bookingId: string) => Promise<void> | void;
  onReject?: (bookingId: string, reason?: string) => Promise<void> | void;
  onOpenChat?: (booking: BookingItem) => void;
  isProcessing?: boolean;
}

const VENUE_LABELS: Record<string, string> = {
  coach_home: 'Coach Home / Studio',
  customer_home: 'Trainee Home',
  ground: 'Sports Ground / Facility',
};

export const CoachBookingCard: React.FC<CoachBookingCardProps> = ({
  booking,
  onAccept,
  onReject,
  onOpenChat,
  isProcessing = false,
}) => {
  const [callError, setCallError] = useState<string | null>(null);

  const getBadgeVariant = (status: string): 'lime' | 'navy' | 'demo' | 'success' => {
    switch (status) {
      case 'accepted':
        return 'success';
      case 'pending':
        return 'lime';
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

  // PRIVACY: Contact phone number is strictly restricted to accepted or completed sessions
  const isPhoneAuthorized = booking.status === 'accepted' || booking.status === 'completed';
  const showPhone = isPhoneAuthorized && Boolean(booking.customerPhone);

  // DESTINATION: Assigned coach may view destination address and coordinates for pending (to evaluate travel distance),
  // accepted, and completed sessions. Redacted for rejected and cancelled sessions.
  const isDestinationAuthorized =
    booking.status === 'pending' || booking.status === 'accepted' || booking.status === 'completed';
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

  const isPending = booking.status === 'pending';
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

      {/* Authorized Address (Hidden unless authorized) */}
      {showAddress && booking.trainingAddress ? (
        <Text style={styles.addressText} numberOfLines={2} testID={`training-address-${booking._id}`}>
          📍 {booking.trainingAddress}
        </Text>
      ) : null}

      {/* Authorized Contact Phone & Call Button (Hidden unless authorized) */}
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

      {/* Notes / Reasons */}
      {booking.status === 'rejected' && booking.rejectionReason ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>Decline Reason: {booking.rejectionReason}</Text>
        </View>
      ) : null}

      {booking.status === 'cancelled' && booking.cancellationReason ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>Cancellation Reason: {booking.cancellationReason}</Text>
        </View>
      ) : null}

      {/* Actions Section */}
      <View style={styles.actionContainer}>
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
            onPress={() =>
              openInGoogleMaps({
                coordinates: booking.coordinates || booking.locationCoordinates,
                address: booking.trainingAddress,
              })
            }
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
    backgroundColor: COLORS.lime,
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
  actionContainer: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
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
    borderColor: COLORS.lime,
    backgroundColor: COLORS.lime,
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
});
