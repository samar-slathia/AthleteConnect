import React, { useState, useEffect, useCallback, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Users, AlertCircle, Plus } from 'lucide-react-native';
import { UserProfile } from '../../services/authApi';
import { AuthContext } from '../../context/AuthContext';
import { getCustomerBookings, cancelBooking, BookingItem } from '../../services/bookingApi';
import { DisciplineCard } from './components/DisciplineCard';
import { OnboardingStepCard } from './components/OnboardingStepCard';
import { EmptyStateSection } from './components/EmptyStateSection';
import { CustomerBookingCard } from './components/CustomerBookingCard';
import { BookingRequestModal } from './components/BookingRequestModal';
import { BookingChatModal } from './components/BookingChatModal';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../theme/tokens';

export interface ParentHomeViewProps {
  user: UserProfile;
  token?: string | null;
  initialBookings?: BookingItem[];
  initialModalVisible?: boolean;
  mode?: 'all' | 'home' | 'discover' | 'bookings';
}

export const ParentHomeView: React.FC<ParentHomeViewProps> = ({
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
        <Text style={styles.introTitle}>Youth Sports & Family Hub</Text>
        <Text style={styles.introText}>
          Explore age-appropriate combat disciplines for young athletes. Find out what each
          sport teaches and review planned features for family accounts.
        </Text>
      </View>

      {/* Child Profiles Status Note */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>CHILD ATHLETE PROFILES</Text>
      </View>
      <View style={styles.childProfileCard}>
        <View style={styles.childProfileHeader}>
          <View style={styles.childProfileIconWrap}>
            <Users size={18} color={COLORS.navy} />
          </View>
          <View style={styles.childProfileTitleGroup}>
            <Text style={styles.childProfileTitle}>Child Profiles Coming Soon</Text>
            <Badge label="In Development" variant="demo" />
          </View>
        </View>
        <Text style={styles.childProfileText}>
          Child profiles are not available yet. In an upcoming phase, parents will be able to
          register youth athletes, record age and training goals, and manage sessions with direct
          parental oversight.
        </Text>
      </View>

      {/* Disciplines for Young Athletes */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>DISCIPLINES FOR YOUNG ATHLETES</Text>
      </View>
      <Text style={styles.sectionSubtext}>
        Structured fundamentals emphasizing discipline, fitness, and motor skill development.
      </Text>

      <DisciplineCard
        title="Boxing"
        audienceFocus="Youth Fundamentals"
        tagline="Stance, balance, and defensive coordination"
        description="Non-contact fundamentals focusing on footwork, discipline, reaction timing, and controlled bag work in a structured environment."
        specialties={['Footwork & Balance', 'Defensive Movement', 'Focus Mitts', 'Discipline']}
      />

      <DisciplineCard
        title="Wushu"
        audienceFocus="Forms & Flexibility"
        tagline="Traditional Taolu, flexibility, and focus"
        description="A dynamic martial art emphasizing core stability, acrobatics, forms practice, and mental discipline suited for growing athletes."
        specialties={['Taolu Forms', 'Flexibility & Balance', 'Core Coordination', 'Focus']}
      />

      <DisciplineCard
        title="Kickboxing"
        audienceFocus="Agility & Fitness"
        tagline="Aerobic conditioning, agility, and motor skills"
        description="Cardio-intensive training teaching kick technique, distance awareness, and pad combinations under controlled coaching."
        specialties={['Pad Drills', 'Cardio Conditioning', 'Agility Drills', 'Controlled Technique']}
      />

      {/* Upcoming Roadmap */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>UPCOMING YOUTH FEATURES</Text>
      </View>

      <OnboardingStepCard
        stepNumber={1}
        title="Child Profile Management"
        description="Add individual youth athlete profiles with age bracket and training goals."
        statusLabel="In Development"
      />

      <OnboardingStepCard
        stepNumber={2}
        title="Local Coach Discovery"
        description="Explore coaches once coach onboarding opens in your area."
        statusLabel="Planned"
      />

      <OnboardingStepCard
        stepNumber={3}
        title="Parental Oversight Tools"
        description="Review training schedules, direct messages, and coach feedback."
        statusLabel="Planned"
      />
    </>
  );

  const renderDiscoverContent = () => (
    <View testID="discover-view">
      <View style={styles.introHeader}>
        <Text style={styles.introTitle}>Discover Youth Coaches</Text>
        <Text style={styles.introText}>
          Find certified youth coaches specializing in Boxing, Wushu, and Kickboxing. Select a
          discipline to connect with background-checked instructors tailored for young athletes.
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
        audienceFocus="Youth Fundamentals"
        tagline="Stance, balance, and defensive coordination"
        description="Non-contact fundamentals focusing on footwork, discipline, reaction timing, and controlled bag work in a structured environment."
        specialties={['Footwork & Balance', 'Defensive Movement', 'Focus Mitts', 'Discipline']}
      />

      <DisciplineCard
        title="Wushu"
        audienceFocus="Forms & Flexibility"
        tagline="Traditional Taolu, flexibility, and focus"
        description="A dynamic martial art emphasizing core stability, acrobatics, forms practice, and mental discipline suited for growing athletes."
        specialties={['Taolu Forms', 'Flexibility & Balance', 'Core Coordination', 'Focus']}
      />

      <DisciplineCard
        title="Kickboxing"
        audienceFocus="Agility & Fitness"
        tagline="Aerobic conditioning, agility, and motor skills"
        description="Cardio-intensive training teaching kick technique, distance awareness, and pad combinations under controlled coaching."
        specialties={['Pad Drills', 'Cardio Conditioning', 'Agility Drills', 'Controlled Technique']}
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
          accessibilityLabel="Request Youth Session"
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
            icon={<AlertCircle size={22} color={COLORS.navyMuted} />}
            title="No Youth Sessions Scheduled"
            description="Session booking is not active yet. Once coach onboarding and child profiles launch, your scheduled training sessions will appear here."
          />
          <View style={styles.emptyActionRow}>
            <Button
              title="Request a Youth Session"
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
        currentUserRole="parent"
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
  childProfileCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  childProfileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  childProfileIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.limeSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childProfileTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.xs,
  },
  childProfileTitle: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 14,
    color: COLORS.navy,
  },
  childProfileText: {
    ...TYPOGRAPHY.body,
    fontSize: 12.5,
    lineHeight: 17,
    color: COLORS.textSecondary,
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
