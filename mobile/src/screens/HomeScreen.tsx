import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Zap } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../data/roles';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Badge } from '../components/Badge';
import { ConnectivityBanner } from '../components/ConnectivityBanner';
import { BottomNavBar, NavTab } from '../navigation/BottomNavBar';
import { ParentHomeView } from './home/ParentHomeView';
import { IndividualHomeView } from './home/IndividualHomeView';
import { CoachHomeView } from './home/CoachHomeView';
import { CoachAvailabilityScreen } from './CoachAvailabilityScreen';
import { UserProfileView } from './profile/UserProfileView';
import { CoachesDirectoryView } from './coaches/CoachesDirectoryView';
import { getCoachBookings, BookingItem } from '../services/bookingApi';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../theme/tokens';

export type HomeScreenNavProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

export interface HomeScreenProps {
  navigation?: HomeScreenNavProps['navigation'];
  route?: HomeScreenNavProps['route'];
  initialTab?: string;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ route, initialTab }) => {
  const insets = useSafeAreaInsets();
  const { user, token, logout, isLoading } = useAuth();

  const startTab = route?.params?.initialTab || initialTab || 'home';
  const [activeTab, setActiveTab] = useState<string>(startTab);

  // Shared state for coach bookings and pending count
  const [coachBookings, setCoachBookings] = useState<BookingItem[] | null>(null);
  const [isLoadingCoachBookings, setIsLoadingCoachBookings] = useState<boolean>(false);
  const [coachBookingsError, setCoachBookingsError] = useState<string | null>(null);
  const [pendingCountFromChild, setPendingCountFromChild] = useState<number>(0);

  const loadCoachBookings = useCallback(async () => {
    if (!token || user?.role !== 'coach') return;
    setIsLoadingCoachBookings(true);
    setCoachBookingsError(null);
    try {
      const data = await getCoachBookings(token);
      setCoachBookings(data);
    } catch (err: any) {
      setCoachBookingsError(err?.message || 'Failed to load trainee requests.');
    } finally {
      setIsLoadingCoachBookings(false);
    }
  }, [token, user?.role]);

  useEffect(() => {
    if (user?.role === 'coach' && token) {
      loadCoachBookings();
    }
  }, [user?.role, token, loadCoachBookings]);

  const pendingCount =
    user?.role === 'coach'
      ? coachBookings !== null
        ? coachBookings.filter((b) => b.status === 'pending').length
        : pendingCountFromChild
      : 0;

  if (!user) {
    return (
      <View style={[styles.container, styles.emptyContainer, { paddingTop: insets.top }]}>
        <Text style={styles.emptyText}>No authenticated session found.</Text>
      </View>
    );
  }

  const roleInfo = ROLES.find((r) => r.id === user.role);

  const coachTabs: NavTab[] = ['home', 'requests', 'sessions', 'availability', 'profile'];
  const customerTabs: NavTab[] = ['home', 'coaches', 'bookings', 'profile'];
  const normalizedTab = activeTab === 'discover' ? 'coaches' : activeTab;
  const validTabs = user.role === 'coach' ? coachTabs : customerTabs;
  const currentTab = validTabs.includes(normalizedTab as NavTab) ? normalizedTab : 'home';

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // In-memory state is cleared safely regardless
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Navigation Bar */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge} accessibilityLabel="AthleteConnect Logo">
            <Zap size={18} color={COLORS.navy} fill={COLORS.navy} />
          </View>
          <Text style={styles.brandName}>AthleteConnect</Text>
        </View>
        <View testID="top-bar-badge">
          <Badge
            label={
              currentTab === 'profile'
                ? 'Profile'
                : currentTab === 'coaches'
                ? 'Coaches'
                : currentTab === 'bookings'
                ? 'Bookings'
                : currentTab === 'requests'
                ? 'Booking Requests'
                : currentTab === 'sessions'
                ? 'Sessions'
                : currentTab === 'availability'
                ? 'Availability'
                : roleInfo
                ? roleInfo.title
                : 'Authenticated'
            }
            variant="orange"
          />
        </View>
      </View>

      {/* Connectivity & Cached Session Indicator */}
      <ConnectivityBanner />

      {/* Main Tab Content Area */}
      <View style={styles.contentArea}>
        {currentTab === 'home' ? (
          <ScrollView
            style={styles.mainScroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + 72 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Welcome Greeting Header */}
            <View style={styles.greetingHeader}>
              <Text style={styles.greetingSubtitle}>Welcome back,</Text>
              <Text style={styles.greetingName}>{user.name}</Text>
            </View>

            {/* Role-Specific Home Experience */}
            {user.role === 'parent' ? (
              <ParentHomeView user={user} mode="home" />
            ) : user.role === 'individual' ? (
              <IndividualHomeView user={user} mode="home" />
            ) : user.role === 'coach' ? (
              <CoachHomeView
                user={user}
                mode="home"
                onNavigateToTab={setActiveTab}
                bookings={coachBookings ?? undefined}
                isLoading={isLoadingCoachBookings}
                error={coachBookingsError}
                onBookingsChange={setCoachBookings}
                onRefreshBookings={loadCoachBookings}
                onPendingCountChange={setPendingCountFromChild}
              />
            ) : null}
          </ScrollView>
        ) : currentTab === 'coaches' ? (
          <View
            style={[styles.fullScreenTab, { paddingBottom: insets.bottom + 64 }]}
            testID="coaches-tab-view"
          >
            <CoachesDirectoryView
              onBookingSuccess={() => {
                setActiveTab('bookings');
              }}
            />
          </View>
        ) : currentTab === 'bookings' ? (
          <ScrollView
            style={styles.mainScroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + 72 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {user.role === 'parent' ? (
              <ParentHomeView user={user} mode="bookings" />
            ) : user.role === 'individual' ? (
              <IndividualHomeView user={user} mode="bookings" />
            ) : null}
          </ScrollView>
        ) : currentTab === 'requests' ? (
          <ScrollView
            style={styles.mainScroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + 72 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {user.role === 'coach' ? (
              <CoachHomeView
                user={user}
                mode="requests"
                onNavigateToTab={setActiveTab}
                bookings={coachBookings ?? undefined}
                isLoading={isLoadingCoachBookings}
                error={coachBookingsError}
                onBookingsChange={setCoachBookings}
                onRefreshBookings={loadCoachBookings}
                onPendingCountChange={setPendingCountFromChild}
              />
            ) : null}
          </ScrollView>
        ) : currentTab === 'sessions' ? (
          <ScrollView
            style={styles.mainScroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + 72 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {user.role === 'coach' ? (
              <CoachHomeView
                user={user}
                mode="sessions"
                onNavigateToTab={setActiveTab}
                bookings={coachBookings ?? undefined}
                isLoading={isLoadingCoachBookings}
                error={coachBookingsError}
                onBookingsChange={setCoachBookings}
                onRefreshBookings={loadCoachBookings}
                onPendingCountChange={setPendingCountFromChild}
              />
            ) : null}
          </ScrollView>
        ) : currentTab === 'availability' ? (
          <View
            style={[styles.fullScreenTab, { paddingBottom: insets.bottom + 64 }]}
            testID="coach-availability-tab-view"
          >
            <CoachAvailabilityScreen onBack={() => setActiveTab('home')} />
          </View>
        ) : currentTab === 'profile' ? (
          <UserProfileView user={user} onLogout={handleLogout} isLoading={isLoading} />
        ) : null}
      </View>

      {/* Persistent Bottom Navigation Bar */}
      <BottomNavBar
        activeTab={currentTab}
        onTabChange={setActiveTab}
        role={user.role}
        badges={
          user.role === 'coach' && pendingCount > 0
            ? { requests: pendingCount > 9 ? '9+' : pendingCount }
            : undefined
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.mist,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
  },
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  logoBadge: {
    width: 30,
    height: 30,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.navy,
    letterSpacing: -0.3,
  },
  contentArea: {
    flex: 1,
  },
  mainScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  fullScreenTab: {
    flex: 1,
  },
  greetingHeader: {
    marginBottom: SPACING.lg,
  },
  greetingSubtitle: {
    ...TYPOGRAPHY.body,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  greetingName: {
    ...TYPOGRAPHY.h1,
    fontSize: 26,
    lineHeight: 32,
    color: COLORS.navy,
  },
});
