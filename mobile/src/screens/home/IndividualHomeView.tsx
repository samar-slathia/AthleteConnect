import React, { useState, useEffect, useCallback, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Target, Plus } from 'lucide-react-native';
import { UserProfile } from '../../services/authApi';
import { AuthContext } from '../../context/AuthContext';
import { getCustomerBookings, cancelBooking, BookingItem } from '../../services/bookingApi';
import { DisciplineCard } from './components/DisciplineCard';
import { OnboardingStepCard } from './components/OnboardingStepCard';
import { EmptyStateSection } from './components/EmptyStateSection';
import { CustomerBookingCard } from './components/CustomerBookingCard';
import { BookingRequestModal } from './components/BookingRequestModal';
import { BookingChatModal } from './components/BookingChatModal';
import { Button } from '../../components/Button';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../theme/tokens';

export interface IndividualHomeViewProps {
  user: UserProfile;
  token?: string | null;
  initialBookings?: BookingItem[];
  initialModalVisible?: boolean;
  mode?: 'all' | 'home' | 'discover' | 'bookings';
}

export const IndividualHomeView: React.FC<IndividualHomeViewProps> = ({
  user,
  token,
  initialBookings,
  initialModalVisible = false,
  mode = 'all',
}) => {
  const auth = useContext(AuthContext);
  const effectiveToken = token !== undefined ? token : auth?.token ?? null;

  const [bookings, setBookings] = useState<BookingItem[]>(initialBookings ?? []);
  const [isLoadingBookings, setIsLoadingBookings] = useState<boolean>(false);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(initialModalVisible);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [activeChatBooking, setActiveChatBooking] = useState<BookingItem | null>(null);

  const loadBookings = useCallback(async () => {
    if (!effectiveToken) return;
    setIsLoadingBookings(true);
    setBookingsError(null);
    try {
      const res = await getCustomerBookings(effectiveToken);
      setBookings(res);
    } catch (err: any) {
      setBookingsError(err?.message || 'Failed to load bookings');
    } finally {
      setIsLoadingBookings(false);
    }
  }, [effectiveToken]);

  useEffect(() => {
    if (effectiveToken && !initialBookings) {
      loadBookings();
    }
  }, [effectiveToken, initialBookings, loadBookings]);

  const handleCancelBooking = async (bookingId: string) => {
    if (!effectiveToken) return;
    setCancellingBookingId(bookingId);
    setCancelError(null);
    try {
      await cancelBooking(effectiveToken, bookingId);
      setBookings((prev) =>
        prev.map((b) => (b._id === bookingId ? { ...b, status: 'cancelled' as const } : b))
      );
      await loadBookings();
    } catch (err: any) {
      setCancelError(err?.message || 'Failed to cancel booking');
    } finally {
      setCancellingBookingId(null);
    }
  };

  const renderHomeContent = () => (
    <>
      {/* Introduction */}
      <View style={styles.introHeader}>
        <Text style={styles.introTitle}>Personal Training Hub</Text>
        <Text style={styles.introText}>
          Explore combat disciplines tailored for adult training—from fundamental striking
          and conditioning to technical mastery.
        </Text>
      </View>

      {/* Disciplines & Focus Areas */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>DISCIPLINES & TRAINING FOCUS</Text>
      </View>
      <Text style={styles.sectionSubtext}>
        Key combat disciplines and primary skill development areas.
      </Text>

      <DisciplineCard
        title="Boxing"
        audienceFocus="Striking & Defense"
        tagline="Footwork, counter-punching, and conditioning"
        description="Master sweet science fundamentals: jab mechanics, slip-and-counter defense, heavy bag combinations, and footwork conditioning."
        specialties={['Jab Mechanics', 'Defensive Slipping', 'Heavy Bag Work', 'Footwork']}
      />

      <DisciplineCard
        title="Wushu"
        audienceFocus="Contemporary & Traditional"
        tagline="Sanda kickboxing, takedowns, and Taolu forms"
        description="Practice full-body striking and sweeps in contemporary Sanda, or develop mobility, power, and weapon mastery through traditional forms."
        specialties={['Sanda Kickboxing', 'Takedowns & Sweeps', 'Taolu Routines', 'Mobility']}
      />

      <DisciplineCard
        title="Kickboxing"
        audienceFocus="Combos & Power"
        tagline="Dutch-style combos, low kicks, and explosive power"
        description="High-output pad work combining Western boxing hands with low kicks, knees, and defensive checks for peak conditioning."
        specialties={['Dutch Combos', 'Low Kick Drills', 'Pad Conditioning', 'Defense Checks']}
      />

      {/* Platform Roadmap */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>PLATFORM ROADMAP</Text>
      </View>

      <OnboardingStepCard
        stepNumber={1}
        title="Live Coach Discovery"
        description="Live coach discovery is not available yet. Direct search and filtering by discipline, location, and rates will open after coach onboarding."
        statusLabel="In Development"
      />

      <OnboardingStepCard
        stepNumber={2}
        title="1-on-1 Session Scheduling"
        description="Book private sessions and small group pad work directly with certified coaches."
        statusLabel="Planned"
      />

      <OnboardingStepCard
        stepNumber={3}
        title="Workout & Progress Log"
        description="Keep track of session notes, technique feedback, and skill milestones."
        statusLabel="Planned"
      />
    </>
  );

  const renderDiscoverContent = () => (
    <View testID="discover-view">
      <View style={styles.introHeader}>
        <Text style={styles.introTitle}>Discover Combat Coaches</Text>
        <Text style={styles.introText}>
          Explore certified coaches across Boxing, Wushu, and Kickboxing. Select a discipline to
          find experienced trainers for 1-on-1 private workouts and small group pad sessions.
        </Text>
      </View>

      <View style={styles.emptyActionRow}>
        <Button
          title="Find Coaches by Discipline"
          variant="primary"
          onPress={() => setIsModalOpen(true)}
        />
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>EXPLORE DISCIPLINES</Text>
      </View>

      <DisciplineCard
        title="Boxing"
        audienceFocus="Striking & Defense"
        tagline="Footwork, counter-punching, and conditioning"
        description="Master sweet science fundamentals: jab mechanics, slip-and-counter defense, heavy bag combinations, and footwork conditioning."
        specialties={['Jab Mechanics', 'Defensive Slipping', 'Heavy Bag Work', 'Footwork']}
      />

      <DisciplineCard
        title="Wushu"
        audienceFocus="Contemporary & Traditional"
        tagline="Sanda kickboxing, takedowns, and Taolu forms"
        description="Practice full-body striking and sweeps in contemporary Sanda, or develop mobility, power, and weapon mastery through traditional forms."
        specialties={['Sanda Kickboxing', 'Takedowns & Sweeps', 'Taolu Routines', 'Mobility']}
      />

      <DisciplineCard
        title="Kickboxing"
        audienceFocus="Combos & Power"
        tagline="Dutch-style combos, low kicks, and explosive power"
        description="High-output pad work combining Western boxing hands with low kicks, knees, and defensive checks for peak conditioning."
        specialties={['Dutch Combos', 'Low Kick Drills', 'Pad Conditioning', 'Defense Checks']}
      />
    </View>
  );

  const renderBookingsContent = () => (
    <View testID="bookings-view">
      {/* Scheduled Sessions */}
      <View style={styles.sectionHeaderRowWithAction}>
        <Text style={styles.sectionHeader}>SCHEDULED SESSIONS</Text>
        <TouchableOpacity
          style={styles.headerActionButton}
          onPress={() => setIsModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Request Training Session"
        >
          <Plus size={14} color={COLORS.navy} />
          <Text style={styles.headerActionText}>Book Session</Text>
        </TouchableOpacity>
      </View>

      {isLoadingBookings ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="small" color={COLORS.navy} />
          <Text style={styles.stateText}>Loading scheduled sessions...</Text>
        </View>
      ) : bookingsError ? (
        <View style={styles.stateContainer}>
          <Text style={styles.errorStateText}>{bookingsError}</Text>
          <Button title="Retry" variant="outline" onPress={loadBookings} />
        </View>
      ) : bookings.length === 0 ? (
        <>
          <EmptyStateSection
            icon={<Target size={22} color={COLORS.navyMuted} />}
            title="No Scheduled Sessions"
            description="Direct session booking is currently in development. Once coaches join and bookings open, your upcoming workouts will appear here."
          />
          <View style={styles.emptyActionRow}>
            <Button
              title="Request a Training Session"
              variant="primary"
              onPress={() => setIsModalOpen(true)}
            />
          </View>
        </>
      ) : (
        <View style={styles.bookingsContainer}>
          {cancelError ? (
            <View style={styles.cancelErrorBanner}>
              <Text style={styles.cancelErrorText}>{cancelError}</Text>
            </View>
          ) : null}
          {bookings.map((booking) => (
            <CustomerBookingCard
              key={booking._id}
              booking={booking}
              onCancel={handleCancelBooking}
              isCancelling={cancellingBookingId === booking._id}
              onOpenChat={(b) => setActiveChatBooking(b)}
            />
          ))}
          <View style={styles.emptyActionRow}>
            <Button
              title="Request Another Session"
              variant="outline"
              onPress={() => setIsModalOpen(true)}
            />
          </View>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {mode === 'all' ? (
        <>
          {renderHomeContent()}
          {renderBookingsContent()}
        </>
      ) : mode === 'home' ? (
        renderHomeContent()
      ) : mode === 'discover' ? (
        renderDiscoverContent()
      ) : mode === 'bookings' ? (
        renderBookingsContent()
      ) : null}

      {/* Booking Request Modal */}
      <BookingRequestModal
        visible={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        token={effectiveToken}
        onBookingCreated={(newBooking) => {
          setIsModalOpen(false);
          setBookings((prev) => [newBooking, ...prev]);
          loadBookings();
        }}
      />

      {/* Booking Chat Modal */}
      <BookingChatModal
        visible={Boolean(activeChatBooking)}
        onClose={() => setActiveChatBooking(null)}
        booking={activeChatBooking}
        token={effectiveToken}
        currentUserRole="individual"
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
  sectionHeaderRow: {
    marginTop: SPACING.md,
    marginBottom: 6,
  },
  sectionHeaderRowWithAction: {
    marginTop: SPACING.md,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.lime,
  },
  headerActionText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.navy,
  },
  sectionHeader: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionSubtext: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  stateContainer: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.md,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  stateText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  errorStateText: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    color: '#DC2626',
    textAlign: 'center',
  },
  bookingsContainer: {
    gap: SPACING.xs,
  },
  emptyActionRow: {
    marginTop: SPACING.sm,
  },
  cancelErrorBanner: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: RADII.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  cancelErrorText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: '#991B1B',
  },
});
