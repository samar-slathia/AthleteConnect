import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Calendar, Clock, MapPin, User as UserIcon, XCircle, MessageSquare, Navigation } from 'lucide-react-native';
import { BookingItem } from '../../../services/bookingApi';
import { openInGoogleMaps } from '../../../services/locationService';
import { Badge } from '../../../components/Badge';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../../theme/tokens';

export interface CustomerBookingCardProps {
  booking: BookingItem;
  onCancel?: (bookingId: string) => void;
  isCancelling?: boolean;
  onOpenChat?: (booking: BookingItem) => void;
}

const VENUE_LABELS: Record<string, string> = {
  coach_home: 'Coach Home / Studio',
  customer_home: 'Trainee Home',
  ground: 'Sports Ground / Facility',
};

export const CustomerBookingCard: React.FC<CustomerBookingCardProps> = ({
  booking,
  onCancel,
  isCancelling = false,
  onOpenChat,
}) => {
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
  const hasValidDestination = Boolean(
    (booking.trainingAddress && booking.trainingAddress.trim()) ||
    booking.coordinates ||
    booking.locationCoordinates
  );
  const showActionRow = (canCancel && Boolean(onCancel)) || (canChat && Boolean(onOpenChat)) || hasValidDestination;

  const handleOpenMaps = () => {
    openInGoogleMaps({
      coordinates: booking.coordinates || booking.locationCoordinates,
      address: booking.trainingAddress,
    });
  };

  return (
    <View style={styles.card} testID={`booking-card-${booking._id}`}>
      {/* Header Row: Sport and Status Badge */}
      <View style={styles.headerRow}>
        <View style={styles.sportBadgeWrap}>
          <Text style={styles.sportText}>{booking.sport?.toUpperCase() || 'SESSION'}</Text>
        </View>
        <Badge
          label={getStatusLabel(booking.status)}
          variant={getBadgeVariant(booking.status)}
        />
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

      {/* Rejection / Cancellation Notes */}
      {booking.status === 'rejected' && booking.rejectionReason ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>Coach Note: {booking.rejectionReason}</Text>
        </View>
      ) : null}

      {booking.status === 'cancelled' && booking.cancellationReason ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>Cancellation Reason: {booking.cancellationReason}</Text>
        </View>
      ) : null}

      {/* Action Row */}
      {showActionRow ? (
        <View style={styles.actionRow}>
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
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF5F5',
  },
  cancelButtonText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
});
