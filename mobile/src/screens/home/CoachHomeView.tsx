import React, { useState, useEffect, useCallback, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Users, Sparkles, Edit3, Clock, AlertCircle, CheckCircle2 } from 'lucide-react-native';
import { UserProfile } from '../../services/authApi';
import { AuthContext } from '../../context/AuthContext';
import { getCoachBookings, acceptBooking, rejectBooking, BookingItem } from '../../services/bookingApi';
import { OnboardingStepCard } from './components/OnboardingStepCard';
import { EmptyStateSection } from './components/EmptyStateSection';
import { CoachBookingCard } from './components/CoachBookingCard';
import { BookingChatModal } from './components/BookingChatModal';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { CoachProfileEditScreen } from '../CoachProfileEditScreen';
import { CoachAvailabilityScreen } from '../CoachAvailabilityScreen';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../theme/tokens';

export interface CoachHomeViewProps {
  user: UserProfile;
  token?: string | null;
  initialEditing?: boolean;
  initialAvailability?: boolean;
  initialBookings?: BookingItem[];
  mode?: 'all' | 'home' | 'sessions';
  onNavigateToTab?: (tabId: string) => void;
}

export const CoachHomeView: React.FC<CoachHomeViewProps> = ({
  user,
  token,
  initialEditing = false,
  initialAvailability = false,
  initialBookings,
  mode = 'all',
  onNavigateToTab,
}) => {
  const auth = useContext(AuthContext);
  const effectiveToken = token !== undefined ? token : auth?.token ?? null;

  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(initialEditing);
  const [isEditingAvailability, setIsEditingAvailability] = useState<boolean>(initialAvailability);

  const [bookings, setBookings] = useState<BookingItem[]>(initialBookings ?? []);
  const [isLoadingBookings, setIsLoadingBookings] = useState<boolean>(false);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [processingBookingId, setProcessingBookingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [activeChatBooking, setActiveChatBooking] = useState<BookingItem | null>(null);

  const loadBookings = useCallback(async () => {
    if (!effectiveToken) return;
    setIsLoadingBookings(true);
    setBookingsError(null);
    try {
      const data = await getCoachBookings(effectiveToken);
      setBookings(data);
    } catch (err: any) {
      setBookingsError(err?.message || 'Failed to load trainee requests.');
    } finally {
      setIsLoadingBookings(false);
    }
  }, [effectiveToken]);

  useEffect(() => {
    if (effectiveToken && !initialBookings) {
      loadBookings();
    }
  }, [effectiveToken, initialBookings, loadBookings]);

  const handleAccept = async (bookingId: string) => {
    if (!effectiveToken || processingBookingId) return;
    setProcessingBookingId(bookingId);
    setActionFeedback(null);
    try {
      const updated = await acceptBooking(effectiveToken, bookingId);
      setActionFeedback({ type: 'success', message: 'Booking accepted successfully!' });
      setBookings((prev) =>
        prev.map((b) => (b._id === bookingId ? updated : b))
      );
      await loadBookings();
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err?.message || 'Failed to accept booking.' });
    } finally {
      setProcessingBookingId(null);
    }
  };

  const handleReject = async (bookingId: string, reason?: string) => {
    if (!effectiveToken || processingBookingId) return;
    setProcessingBookingId(bookingId);
    setActionFeedback(null);
    try {
      const updated = await rejectBooking(effectiveToken, bookingId, reason);
      setActionFeedback({ type: 'success', message: 'Booking request declined.' });
      setBookings((prev) =>
        prev.map((b) => (b._id === bookingId ? updated : b))
      );
      await loadBookings();
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err?.message || 'Failed to decline booking.' });
    } finally {
      setProcessingBookingId(null);
    }
  };

  if (isEditingProfile) {
    return <CoachProfileEditScreen onBack={() => setIsEditingProfile(false)} />;
  }

  if (isEditingAvailability) {
    return <CoachAvailabilityScreen onBack={() => setIsEditingAvailability(false)} />;
  }

  const pendingBookings = bookings.filter((b) => b.status === 'pending');
  const acceptedBookings = bookings.filter((b) => b.status === 'accepted');
  const otherBookings = bookings.filter((b) => b.status !== 'pending' && b.status !== 'accepted');

  const renderHomeContent = () => (
    <>
      {/* Introduction */}
      <View style={styles.introHeader}>
        <Text style={styles.introTitle}>Coach Studio</Text>
        <Text style={styles.introText}>
          Welcome to your coaching workstation. You can now edit and save your coaching profile
          details and hourly rates, while credential submission and scheduling features remain in
          development.
        </Text>
      </View>

      {/* Development Status Notice */}
      <View style={styles.statusCard}>
        <View style={styles.statusHeaderRow}>
          <View style={styles.statusIconWrap}>
            <Sparkles size={16} color={COLORS.navy} />
          </View>
          <View style={styles.statusTitleGroup}>
            <Text style={styles.statusTitle}>Coach Tools Under Development</Text>
            <Badge label="In Development" variant="demo" />
          </View>
        </View>
        <Text style={styles.statusText}>
          Coaching profile editing and rate configuration are now live. Credential submission
          and scheduling tools remain in development.
        </Text>
        <View style={styles.editorActionWrap}>
          <Button
            title="Edit Coach Profile"
            variant="primary"
            onPress={() => {
              if (onNavigateToTab) {
                onNavigateToTab('profile');
              } else {
                setIsEditingAvailability(false);
                setIsEditingProfile(true);
              }
            }}
            icon={<Edit3 size={16} color={COLORS.navy} />}
          />
          <Button
            title="Configure Availability"
            variant="outline"
            onPress={() => {
              if (onNavigateToTab) {
                onNavigateToTab('availability');
              } else {
                setIsEditingProfile(false);
                setIsEditingAvailability(true);
              }
            }}
            icon={<Clock size={16} color={COLORS.navy} />}
            style={styles.availabilityActionBtn}
          />
        </View>
      </View>

      {/* Upcoming Setup Roadmap */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>UPCOMING SETUP ROADMAP</Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          if (onNavigateToTab) {
            onNavigateToTab('profile');
          } else {
            setIsEditingAvailability(false);
            setIsEditingProfile(true);
          }
        }}
        accessibilityRole="button"
        accessibilityLabel="Edit Profile Details and Coaching Bio"
      >
        <OnboardingStepCard
          stepNumber={1}
          title="Profile Details & Coaching Bio"
          description="Share your martial arts background, competitive experience, and coaching philosophy."
          statusLabel="Available"
        />
      </TouchableOpacity>

      <OnboardingStepCard
        stepNumber={2}
        title="Disciplines & Specialties"
        description="Specify the disciplines you coach (Boxing, Wushu, Kickboxing) and focus areas."
        statusLabel="In Development"
      />

      <OnboardingStepCard
        stepNumber={3}
        title="Pricing & Session Formats"
        description="Set hourly rates for 1-on-1 private coaching, small-group pad work, or workshops."
        statusLabel="Planned"
      />

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          if (onNavigateToTab) {
            onNavigateToTab('availability');
          } else {
            setIsEditingProfile(false);
            setIsEditingAvailability(true);
          }
        }}
        accessibilityRole="button"
        accessibilityLabel="Configure Weekly Availability Schedule"
      >
        <OnboardingStepCard
          stepNumber={4}
          title="Weekly Availability"
          description="Configure recurring weekly schedule slots and blackout dates. Training locations coming in a later phase."
          statusLabel="Available"
        />
      </TouchableOpacity>
    </>
  );

  const renderSessionsContent = () => (
    <View testID="coach-sessions-view">
      {/* Trainee Requests & Sessions */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>TRAINEE REQUESTS & SESSIONS</Text>
      </View>

      {/* Action Feedback Banner */}
      {actionFeedback ? (
        <View
          style={[
            styles.feedbackBanner,
            actionFeedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError,
          ]}
          testID="coach-action-feedback"
        >
          {actionFeedback.type === 'success' ? (
            <CheckCircle2 size={14} color="#059669" />
          ) : (
            <AlertCircle size={14} color="#DC2626" />
          )}
          <Text
            style={[
              styles.feedbackText,
              actionFeedback.type === 'success' ? styles.feedbackSuccessText : styles.feedbackErrorText,
            ]}
          >
            {actionFeedback.message}
          </Text>
        </View>
      ) : null}

      {/* Loading & Error States */}
      {isLoadingBookings ? (
        <View style={styles.loadingContainer} testID="coach-bookings-loading">
          <ActivityIndicator size="small" color={COLORS.navy} />
          <Text style={styles.loadingText}>Loading trainee requests...</Text>
        </View>
      ) : bookingsError ? (
        <View style={styles.errorContainer} testID="coach-bookings-error">
          <AlertCircle size={20} color="#DC2626" />
          <Text style={styles.errorText}>{bookingsError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadBookings}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : bookings.length === 0 ? (
        /* Honest empty state when no trainee requests exist */
        <EmptyStateSection
          icon={<Users size={22} color={COLORS.navyMuted} />}
          title="No Active Trainee Requests"
          description="Coaching profile tools and trainee request management are currently in development. Trainee inquiries will appear here once coaching launches."
        />
      ) : (
        <View style={styles.bookingsContainer}>
          {/* Pending Requests */}
          {pendingBookings.length > 0 ? (
            <View style={styles.bookingGroup}>
              <Text style={styles.groupHeader}>
                {`PENDING REQUESTS (${pendingBookings.length})`}
              </Text>
              {pendingBookings.map((b) => (
                <CoachBookingCard
                  key={b._id}
                  booking={b}
                  onAccept={handleAccept}
                  onReject={handleReject}
                  onOpenChat={(bookingToChat) => setActiveChatBooking(bookingToChat)}
                  isProcessing={processingBookingId === b._id}
                />
              ))}
            </View>
          ) : null}

          {/* Accepted Sessions */}
          {acceptedBookings.length > 0 ? (
            <View style={styles.bookingGroup}>
              <Text style={styles.groupHeader}>
                {`ACCEPTED SESSIONS (${acceptedBookings.length})`}
              </Text>
              {acceptedBookings.map((b) => (
                <CoachBookingCard
                  key={b._id}
                  booking={b}
                  onOpenChat={(bookingToChat) => setActiveChatBooking(bookingToChat)}
                />
              ))}
            </View>
          ) : null}

          {/* Other / Historical Sessions */}
          {otherBookings.length > 0 ? (
            <View style={styles.bookingGroup}>
              <Text style={styles.groupHeader}>
                {`COMPLETED & DECLINED (${otherBookings.length})`}
              </Text>
              {otherBookings.map((b) => (
                <CoachBookingCard key={b._id} booking={b} />
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {mode === 'all' ? (
        <>
          {renderHomeContent()}
          {renderSessionsContent()}
        </>
      ) : mode === 'home' ? (
        renderHomeContent()
      ) : mode === 'sessions' ? (
        renderSessionsContent()
      ) : null}

      {/* Booking Chat Modal */}
      <BookingChatModal
        visible={Boolean(activeChatBooking)}
        onClose={() => setActiveChatBooking(null)}
        booking={activeChatBooking}
        token={effectiveToken}
        currentUserRole="coach"
        currentUserId={user._id}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
  },
  introHeader: {
    marginBottom: SPACING.md,
  },
  introTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 20,
    color: COLORS.navy,
    marginBottom: 4,
  },
  introText: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textSecondary,
  },
  statusCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  statusIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.limeSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.xs,
  },
  statusTitle: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 13.5,
    color: COLORS.navy,
  },
  statusText: {
    ...TYPOGRAPHY.body,
    fontSize: 12.5,
    lineHeight: 17,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  editorActionWrap: {
    marginTop: SPACING.xs,
  },
  availabilityActionBtn: {
    marginTop: SPACING.sm,
  },
  sectionHeaderRow: {
    marginTop: SPACING.md,
    marginBottom: 6,
  },
  sectionHeader: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  groupHeader: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.navy,
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 4,
  },
  bookingGroup: {
    marginBottom: SPACING.sm,
  },
  bookingsContainer: {
    marginTop: 4,
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADII.sm,
    marginBottom: SPACING.sm,
  },
  feedbackSuccess: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  feedbackSuccessText: {
    color: '#065F46',
  },
  feedbackError: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  feedbackErrorText: {
    color: '#991B1B',
  },
  feedbackText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  loadingContainer: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  loadingText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12.5,
    color: COLORS.textMuted,
  },
  errorContainer: {
    padding: SPACING.md,
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginVertical: SPACING.sm,
  },
  errorText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12.5,
    color: '#DC2626',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: COLORS.white,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  retryButtonText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.navy,
  },
});
