import React, { useState, useEffect, useCallback, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Users, Sparkles, Edit3, Clock, AlertCircle, CheckCircle2, Inbox, Calendar } from 'lucide-react-native';
import { UserProfile } from '../../services/authApi';
import { AuthContext } from '../../context/AuthContext';
import { getCoachBookings, acceptBooking, rejectBooking, BookingItem } from '../../services/bookingApi';
import { groupBookingsForCoach } from '../../utils/bookingSections';
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
  mode?: 'all' | 'home' | 'sessions' | 'requests';
  onNavigateToTab?: (tabId: string) => void;
  bookings?: BookingItem[];
  isLoading?: boolean;
  error?: string | null;
  onBookingsChange?: (bookings: BookingItem[]) => void;
  onRefreshBookings?: () => Promise<void>;
  onPendingCountChange?: (count: number) => void;
}

export const CoachHomeView: React.FC<CoachHomeViewProps> = ({
  user,
  token,
  initialEditing = false,
  initialAvailability = false,
  initialBookings,
  mode = 'all',
  onNavigateToTab,
  bookings: propsBookings,
  isLoading: propsIsLoading,
  error: propsError,
  onBookingsChange,
  onRefreshBookings,
  onPendingCountChange,
}) => {
  const auth = useContext(AuthContext);
  const effectiveToken = token !== undefined ? token : auth?.token ?? null;

  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(initialEditing);
  const [isEditingAvailability, setIsEditingAvailability] = useState<boolean>(initialAvailability);

  const [internalBookings, setInternalBookings] = useState<BookingItem[]>(initialBookings ?? []);
  const [internalLoading, setInternalLoading] = useState<boolean>(false);
  const [internalError, setInternalError] = useState<string | null>(null);

  const isControlled = propsBookings !== undefined;
  const bookings = isControlled ? propsBookings : internalBookings;
  const isLoadingBookings = propsIsLoading !== undefined ? propsIsLoading : internalLoading;
  const bookingsError = propsError !== undefined ? propsError : internalError;

  const [processingBookingId, setProcessingBookingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [activeChatBooking, setActiveChatBooking] = useState<BookingItem | null>(null);

  const updateBookings = (updatedList: BookingItem[]) => {
    if (onBookingsChange) {
      onBookingsChange(updatedList);
    }
    setInternalBookings(updatedList);
  };

  useEffect(() => {
    const count = bookings.filter((b) => b.status === 'pending').length;
    onPendingCountChange?.(count);
  }, [bookings, onPendingCountChange]);

  const loadBookings = useCallback(async () => {
    if (!effectiveToken) return;
    if (!isControlled) {
      setInternalLoading(true);
      setInternalError(null);
    }
    try {
      const data = await getCoachBookings(effectiveToken);
      if (onBookingsChange) {
        onBookingsChange(data);
      }
      setInternalBookings(data);
    } catch (err: any) {
      if (!isControlled) {
        setInternalError(err?.message || 'Failed to load trainee requests.');
      }
    } finally {
      if (!isControlled) {
        setInternalLoading(false);
      }
    }
  }, [effectiveToken, isControlled, onBookingsChange]);

  useEffect(() => {
    if (effectiveToken && !initialBookings && !isControlled) {
      loadBookings();
    }
  }, [effectiveToken, initialBookings, isControlled, loadBookings]);

  const handleAccept = async (bookingId: string) => {
    if (!effectiveToken || processingBookingId) return;
    setProcessingBookingId(bookingId);
    setActionFeedback(null);
    try {
      const updated = await acceptBooking(effectiveToken, bookingId);
      setActionFeedback({ type: 'success', message: 'Booking accepted successfully!' });
      const next = bookings.map((b) => (b._id === bookingId ? updated : b));
      updateBookings(next);
      if (onRefreshBookings) {
        await onRefreshBookings();
      } else {
        await loadBookings();
      }
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
      const next = bookings.map((b) => (b._id === bookingId ? updated : b));
      updateBookings(next);
      if (onRefreshBookings) {
        await onRefreshBookings();
      } else {
        await loadBookings();
      }
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

  const sections = groupBookingsForCoach(bookings);

  const renderHomeContent = () => {
    const pendingSection = sections.find((s) => s.key === 'pending');
    const pendingPreview = (pendingSection?.data || []).slice(0, 3);

    const acceptedSection = sections.find((s) => s.key === 'accepted');
    const acceptedPreview = (acceptedSection?.data || []).slice(0, 3);

    return (
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

        {/* Pending Requests Preview (Max 3) */}
        {pendingPreview.length > 0 ? (
          <View style={styles.previewSection} testID="coach-home-pending-preview">
            <View style={styles.sectionHeaderRowWithAction}>
              <Text style={styles.sectionHeader}>
                {`NEW REQUESTS (${pendingSection?.data.length || 0})`}
              </Text>
              {onNavigateToTab ? (
                <TouchableOpacity
                  onPress={() => onNavigateToTab('requests')}
                  accessibilityRole="button"
                  accessibilityLabel="View all requests"
                  testID="view-all-requests-button"
                >
                  <Text style={styles.viewAllText}>View all requests</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {pendingPreview.map((b) => (
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

        {/* Accepted Sessions Preview (Max 3) */}
        {acceptedPreview.length > 0 ? (
          <View style={styles.previewSection} testID="coach-home-sessions-preview">
            <View style={styles.sectionHeaderRowWithAction}>
              <Text style={styles.sectionHeader}>
                {`UPCOMING SESSIONS (${acceptedSection?.data.length || 0})`}
              </Text>
              {onNavigateToTab ? (
                <TouchableOpacity
                  onPress={() => onNavigateToTab('sessions')}
                  accessibilityRole="button"
                  accessibilityLabel="View all sessions"
                  testID="view-all-sessions-button"
                >
                  <Text style={styles.viewAllText}>View all sessions</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {acceptedPreview.map((b) => (
              <CoachBookingCard
                key={b._id}
                booking={b}
                onOpenChat={(bookingToChat) => setActiveChatBooking(bookingToChat)}
              />
            ))}
          </View>
        ) : null}

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
  };

  const renderRequestsContent = () => {
    const pendingSection = sections.find((s) => s.key === 'pending');
    const pendingList = pendingSection ? pendingSection.data : [];

    return (
      <View testID="coach-requests-view">
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>BOOKING REQUESTS</Text>
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
                actionFeedback.type === 'success'
                  ? styles.feedbackSuccessText
                  : styles.feedbackErrorText,
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
            <Text style={styles.loadingText}>Loading booking requests...</Text>
          </View>
        ) : bookingsError ? (
          <View style={styles.errorContainer} testID="coach-bookings-error">
            <AlertCircle size={20} color="#DC2626" />
            <Text style={styles.errorText}>{bookingsError}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={onRefreshBookings || loadBookings}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : pendingList.length === 0 ? (
          <EmptyStateSection
            icon={<Inbox size={22} color={COLORS.navyMuted} />}
            title="No Pending Requests"
            description="No pending booking requests"
            testID="coach-requests-empty-state"
          />
        ) : (
          <View style={styles.bookingsContainer}>
            <View style={styles.bookingGroup} testID="coach-booking-section-pending">
              <Text
                style={styles.groupHeader}
                testID="coach-section-header-pending"
              >
                {`PENDING REQUESTS (${pendingList.length})`}
              </Text>
              {pendingList.map((b) => (
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
          </View>
        )}
      </View>
    );
  };

  const renderSessionsContent = () => {
    // Only accepted, declined, cancelled, completed - pending must NOT appear
    const sessionSections = sections.filter((s) => s.key !== 'pending');
    const totalSessions = sessionSections.reduce((sum, s) => sum + s.data.length, 0);

    return (
      <View testID="coach-sessions-view">
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>TRAINEE SESSIONS & HISTORY</Text>
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
                actionFeedback.type === 'success'
                  ? styles.feedbackSuccessText
                  : styles.feedbackErrorText,
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
            <Text style={styles.loadingText}>Loading sessions...</Text>
          </View>
        ) : bookingsError ? (
          <View style={styles.errorContainer} testID="coach-bookings-error">
            <AlertCircle size={20} color="#DC2626" />
            <Text style={styles.errorText}>{bookingsError}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={onRefreshBookings || loadBookings}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : bookings.length === 0 ? (
          <EmptyStateSection
            icon={<Users size={22} color={COLORS.navyMuted} />}
            title="No Active Trainee Requests"
            description="Coaching profile tools and trainee request management are currently in development. Trainee inquiries will appear here once coaching launches."
            testID="coach-sessions-empty-state"
          />
        ) : totalSessions === 0 ? (
          <EmptyStateSection
            icon={<Calendar size={22} color={COLORS.navyMuted} />}
            title="No Scheduled Sessions"
            description="Accepted and completed training sessions will appear here."
            testID="coach-sessions-empty-state"
          />
        ) : (
          <View style={styles.bookingsContainer}>
            {sessionSections.map((section) => (
              <View
                key={section.key}
                style={styles.bookingGroup}
                testID={`coach-booking-section-${section.key}`}
              >
                <Text
                  style={styles.groupHeader}
                  testID={`coach-section-header-${section.key}`}
                >
                  {`${section.title.toUpperCase()} (${section.data.length})`}
                </Text>
                {section.data.map((b) => (
                  <CoachBookingCard
                    key={b._id}
                    booking={b}
                    onOpenChat={
                      section.key === 'accepted'
                        ? (bookingToChat) => setActiveChatBooking(bookingToChat)
                        : undefined
                    }
                  />
                ))}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {mode === 'all' ? (
        <>
          {renderHomeContent()}
          {renderRequestsContent()}
          {renderSessionsContent()}
        </>
      ) : mode === 'home' ? (
        renderHomeContent()
      ) : mode === 'requests' ? (
        renderRequestsContent()
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
  sectionHeaderRowWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
    marginBottom: 6,
  },
  viewAllText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.navy,
  },
  previewSection: {
    marginBottom: SPACING.sm,
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
