import React, { useState, useEffect, useCallback, useRef, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  Platform,
} from 'react-native';
import {
  Search,
  MapPin,
  AlertCircle,
  RefreshCw,
  Award,
  ChevronRight,
  ShieldCheck,
  Sparkles,
} from 'lucide-react-native';
import {
  getPublicCoaches,
  CoachDiscoveryItem,
  CoachDiscipline,
  BookingItem,
} from '../../services/bookingApi';
import { ProfileAvatar } from '../../components/profile/ProfileAvatar';
import { getPublicCoachPhotoUrl } from '../../services/profilePhotoService';
import { CoachDetailModal } from './CoachDetailModal';
import { BookingRequestModal } from '../home/components/BookingRequestModal';
import { AuthContext } from '../../context/AuthContext';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../theme/tokens';

const DISCIPLINES: { id: CoachDiscipline; label: string }[] = [
  { id: 'boxing', label: 'Boxing' },
  { id: 'wushu', label: 'Wushu' },
  { id: 'kickboxing', label: 'Kickboxing' },
];

export interface CoachesDirectoryViewProps {
  token?: string | null;
  initialDiscipline?: CoachDiscipline | null;
  onBookingSuccess?: (newBooking: BookingItem) => void;
}

export const CoachesDirectoryView: React.FC<CoachesDirectoryViewProps> = ({
  token,
  initialDiscipline = null,
  onBookingSuccess,
}) => {
  const auth = useContext(AuthContext);
  const effectiveToken = token !== undefined ? token : auth?.token ?? null;

  const [selectedDiscipline, setSelectedDiscipline] = useState<CoachDiscipline | null>(
    initialDiscipline
  );
  const [coaches, setCoaches] = useState<CoachDiscoveryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState<string>('');

  // Detail Modal state
  const [selectedCoachForDetail, setSelectedCoachForDetail] = useState<CoachDiscoveryItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  // Booking Modal state
  const [isBookingModalOpen, setIsBookingModalOpen] = useState<boolean>(false);
  const [bookingCoachId, setBookingCoachId] = useState<string | undefined>(undefined);
  const [bookingSport, setBookingSport] = useState<CoachDiscipline | undefined>(undefined);

  // Request race-condition tracking
  const requestIdRef = useRef<number>(0);

  const loadCoaches = useCallback(
    async (discipline: CoachDiscipline, isRefresh: boolean = false) => {
      const currentReqId = ++requestIdRef.current;
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const result = await getPublicCoaches({
          discipline,
        });

        // Discard stale responses if a newer request was dispatched
        if (currentReqId !== requestIdRef.current) return;

        setCoaches(result);
      } catch (err: any) {
        if (currentReqId !== requestIdRef.current) return;
        setError(err?.message || 'Unable to load coaches. Please check your network.');
      } finally {
        if (currentReqId === requestIdRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    []
  );

  // Load coaches when discipline changes
  useEffect(() => {
    if (selectedDiscipline) {
      loadCoaches(selectedDiscipline);
    } else {
      setCoaches([]);
      setError(null);
      setIsLoading(false);
    }
  }, [selectedDiscipline, loadCoaches]);

  const handleSelectDiscipline = (disc: CoachDiscipline) => {
    if (disc === selectedDiscipline) return;
    setLocationFilter('');
    setSelectedDiscipline(disc);
  };

  const handleRefresh = () => {
    if (selectedDiscipline) {
      loadCoaches(selectedDiscipline, true);
    }
  };

  const handleRetry = () => {
    if (selectedDiscipline) {
      loadCoaches(selectedDiscipline, false);
    }
  };

  const handleOpenDetail = (coach: CoachDiscoveryItem) => {
    setSelectedCoachForDetail(coach);
    setIsDetailModalOpen(true);
  };

  const handleChooseCoachFromDetail = (
    coach: CoachDiscoveryItem,
    discipline?: CoachDiscipline | null
  ) => {
    setIsDetailModalOpen(false);
    setBookingCoachId(coach._id);
    const chosenSport =
      discipline ||
      selectedDiscipline ||
      (coach.profile?.disciplines && coach.profile.disciplines.length > 0
        ? coach.profile.disciplines[0]
        : 'boxing');
    setBookingSport(chosenSport);
    setIsBookingModalOpen(true);
  };

  // Filter coaches by compact location search if user typed a query
  const filteredCoaches = coaches.filter((c) => {
    if (!locationFilter.trim()) return true;
    const q = locationFilter.trim().toLowerCase();
    const locs = c.profile?.locations || [];
    return locs.some((loc) => loc.toLowerCase().includes(q));
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container} testID="coaches-directory-screen">
        {/* Header Title */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Coaches Directory</Text>
          <Text style={styles.headerSubtitle}>
            Find certified combat and martial arts coaches for 1-on-1 sessions
          </Text>
        </View>

        {/* 1. Discipline First Selector */}
        <View style={styles.disciplineSection}>
          <Text style={styles.disciplineSectionLabel}>SELECT DISCIPLINE</Text>
          <View style={styles.disciplineRow}>
            {DISCIPLINES.map((d) => {
              const isSelected = d.id === selectedDiscipline;
              return (
                <TouchableOpacity
                  key={d.id}
                  style={[
                    styles.disciplineChip,
                    isSelected && styles.disciplineChipSelected,
                  ]}
                  onPress={() => handleSelectDiscipline(d.id)}
                  testID={`sport-chip-${d.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text
                    style={[
                      styles.disciplineChipText,
                      isSelected && styles.disciplineChipTextSelected,
                    ]}
                  >
                    {d.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 2. Main Content Area */}
        {!selectedDiscipline ? (
          /* Initial Guidance State */
          <View style={styles.initialPromptContainer} testID="initial-discipline-prompt">
            <View style={styles.sparkleIconCircle}>
              <Sparkles size={28} color={COLORS.navy} />
            </View>
            <Text style={styles.initialPromptTitle}>Choose Your Discipline</Text>
            <Text style={styles.initialPromptSubtitle}>
              Select a discipline above to discover verified martial arts and combat coaches.
            </Text>
            <View style={styles.disciplinePreviews}>
              <View style={styles.previewBadge}>
                <Text style={styles.previewBadgeText}>🥊 Boxing</Text>
              </View>
              <View style={styles.previewBadge}>
                <Text style={styles.previewBadgeText}>🥋 Wushu</Text>
              </View>
              <View style={styles.previewBadge}>
                <Text style={styles.previewBadgeText}>🦵 Kickboxing</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.resultsContainer}>
            {/* Location Search Bar (Compact) */}
            <View style={styles.searchBarContainer}>
              <Search size={16} color={COLORS.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Filter by ground or area (e.g. Indiranagar)..."
                placeholderTextColor={COLORS.textMuted}
                value={locationFilter}
                onChangeText={setLocationFilter}
                autoCapitalize="none"
                testID="input-location-filter"
              />
              {locationFilter.length > 0 ? (
                <TouchableOpacity
                  onPress={() => setLocationFilter('')}
                  style={styles.clearSearchBtn}
                  testID="button-clear-location-filter"
                >
                  <Text style={styles.clearSearchText}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Loading Indicator */}
            {isLoading && !isRefreshing ? (
              <View style={styles.centerBox} testID="loading-coaches-indicator">
                <ActivityIndicator size="large" color={COLORS.navy} />
                <Text style={styles.loadingText}>Finding {selectedDiscipline} coaches...</Text>
              </View>
            ) : error ? (
              /* Error State */
              <View style={styles.centerBox} testID="coaches-error-state">
                <AlertCircle size={32} color="#DC2626" />
                <Text style={styles.errorTitle}>Unable to Load Coaches</Text>
                <Text style={styles.errorDescription}>{error}</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={handleRetry}
                  testID="button-retry-coaches"
                >
                  <RefreshCw size={14} color={COLORS.navy} />
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : coaches.length === 0 ? (
              /* Empty Discipline State */
              <View style={styles.centerBox} testID="empty-coaches-state">
                <Award size={36} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>No Coaches Found</Text>
                <Text style={styles.emptySubtitle}>
                  No coaches are currently offering {selectedDiscipline}. Please check back soon or try another discipline.
                </Text>
              </View>
            ) : filteredCoaches.length === 0 ? (
              /* Location No Matches State */
              <View style={styles.centerBox} testID="no-location-matches">
                <MapPin size={32} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>No Matching Locations</Text>
                <Text style={styles.emptySubtitle}>
                  No {selectedDiscipline} coaches found matching "{locationFilter}". Try clearing your search.
                </Text>
              </View>
            ) : (
              /* Coach Cards List */
              <ScrollView
                style={styles.cardsScroll}
                contentContainerStyle={styles.cardsScrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={handleRefresh}
                    tintColor={COLORS.navy}
                  />
                }
              >
                {filteredCoaches.map((coach) => {
                  const profile = coach.profile;
                  const coachPhoto = getPublicCoachPhotoUrl(coach._id);
                  const disciplines = profile?.disciplines || [];
                  const specialties = profile?.specialties || [];
                  const locations = profile?.locations || [];

                  // Bio truncation
                  const rawBio = profile?.bio?.trim() || '';
                  const shortBio =
                    rawBio.length > 90 ? `${rawBio.slice(0, 90)}...` : rawBio;

                  return (
                    <TouchableOpacity
                      key={coach._id}
                      style={styles.coachCard}
                      onPress={() => handleOpenDetail(coach)}
                      activeOpacity={0.8}
                      testID={`coach-card-${coach._id}`}
                    >
                      {/* Top Row: Avatar & Basic Info */}
                      <View style={styles.cardHeaderRow}>
                        <ProfileAvatar
                          name={coach.name}
                          imageUri={coachPhoto || null}
                          size={54}
                          showHelperText={false}
                          disabled={true}
                          testID={`coach-card-avatar-${coach._id}`}
                        />
                        <View style={styles.cardHeaderText}>
                          <Text
                            style={styles.coachName}
                            numberOfLines={1}
                            testID={`coach-name-${coach._id}`}
                          >
                            {coach.name}
                          </Text>
                          {profile?.hourlyRate !== undefined && profile.hourlyRate !== null ? (
                            <Text
                              style={styles.coachRate}
                              testID={`coach-rate-${coach._id}`}
                            >
                              ₹{profile.hourlyRate}
                              <Text style={styles.coachRateSub}> / hr</Text>
                            </Text>
                          ) : null}
                          {/* Discipline Chips */}
                          <View style={styles.cardDisciplinesRow}>
                            {disciplines.map((d) => {
                              const isMatch = d === selectedDiscipline;
                              return (
                                <View
                                  key={d}
                                  style={[
                                    styles.cardDisciplineChip,
                                    isMatch && styles.cardDisciplineChipMatch,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.cardDisciplineChipText,
                                      isMatch && styles.cardDisciplineChipTextMatch,
                                    ]}
                                  >
                                    {d}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      </View>

                      {/* Bio */}
                      {shortBio ? (
                        <Text
                          style={styles.coachBio}
                          numberOfLines={2}
                          testID={`coach-bio-${coach._id}`}
                        >
                          {shortBio}
                        </Text>
                      ) : null}

                      {/* Specialties Row (up to 3) */}
                      {specialties.length > 0 ? (
                        <View style={styles.cardSpecialtiesRow}>
                          {specialties.slice(0, 3).map((spec, sIdx) => (
                            <View key={`${spec}-${sIdx}`} style={styles.cardSpecialtyPill}>
                              <Text style={styles.cardSpecialtyPillText}>{spec}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}

                      {/* Card Footer: Locations & View Profile CTA */}
                      <View style={styles.cardFooter}>
                        <View style={styles.cardLocationsWrap}>
                          {locations.length > 0 ? (
                            <View style={styles.cardLocationItem}>
                              <MapPin size={12} color={COLORS.textSecondary} />
                              <Text
                                style={styles.cardLocationText}
                                numberOfLines={1}
                              >
                                {locations[0]}
                                {locations.length > 1 ? ` +${locations.length - 1}` : ''}
                              </Text>
                            </View>
                          ) : (
                            <Text style={styles.cardLocationNone}>Location on request</Text>
                          )}
                        </View>

                        <View style={styles.cardActionRow}>
                          <Text style={styles.cardActionText}>View Profile</Text>
                          <ChevronRight size={14} color={COLORS.navy} />
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}

        {/* Coach Detail Pop-up Modal */}
        <CoachDetailModal
          visible={isDetailModalOpen}
          coach={selectedCoachForDetail}
          selectedDiscipline={selectedDiscipline}
          onClose={() => setIsDetailModalOpen(false)}
          onChooseCoach={handleChooseCoachFromDetail}
        />

        {/* Booking Request Modal (Reused) */}
        <BookingRequestModal
          visible={isBookingModalOpen}
          onClose={() => setIsBookingModalOpen(false)}
          token={effectiveToken}
          initialCoachId={bookingCoachId}
          initialSport={bookingSport}
          onSuccess={(newBooking) => {
            setIsBookingModalOpen(false);
            if (onBookingSuccess) onBookingSuccess(newBooking);
          }}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.mist,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.lg : SPACING.sm,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.white,
  },
  headerTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 22,
    color: COLORS.navy,
    fontWeight: '800',
  },
  headerSubtitle: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  disciplineSection: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  disciplineSectionLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.6,
    marginBottom: SPACING.xs,
  },
  disciplineRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  disciplineChip: {
    flex: 1,
    backgroundColor: COLORS.mist,
    paddingVertical: 10,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disciplineChipSelected: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
  },
  disciplineChipText: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 13,
    color: COLORS.navy,
  },
  disciplineChipTextSelected: {
    color: COLORS.white,
  },
  initialPromptContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  sparkleIconCircle: {
    width: 60,
    height: 60,
    borderRadius: RADII.full,
    backgroundColor: COLORS.limeSubtle,
    borderWidth: 1,
    borderColor: '#D9F99D',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  initialPromptTitle: {
    ...TYPOGRAPHY.h3,
    fontSize: 18,
    color: COLORS.navy,
    fontWeight: '700',
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  initialPromptSubtitle: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: SPACING.lg,
  },
  disciplinePreviews: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  previewBadge: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  previewBadgeText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.navy,
  },
  resultsContainer: {
    flex: 1,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 40,
  },
  searchIcon: {
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.navy,
    paddingVertical: 0,
  },
  clearSearchBtn: {
    paddingHorizontal: SPACING.xs,
  },
  clearSearchText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  loadingText: {
    ...TYPOGRAPHY.caption,
    fontSize: 13,
    color: COLORS.navy,
    marginTop: SPACING.sm,
  },
  errorTitle: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 15,
    color: '#991B1B',
    marginTop: SPACING.sm,
  },
  errorDescription: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: SPACING.md,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.sm,
  },
  retryButtonText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.navy,
  },
  emptyTitle: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 15,
    color: COLORS.navy,
    marginTop: SPACING.sm,
  },
  emptySubtitle: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
    maxWidth: 280,
  },
  cardsScroll: {
    flex: 1,
  },
  cardsScrollContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  coachCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  cardHeaderText: {
    flex: 1,
  },
  coachName: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 16,
    color: COLORS.navy,
  },
  coachRate: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.navy,
    marginTop: 2,
  },
  coachRateSub: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: 'normal',
    color: COLORS.textSecondary,
  },
  cardDisciplinesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  cardDisciplineChip: {
    backgroundColor: COLORS.mist,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADII.xs,
  },
  cardDisciplineChipMatch: {
    backgroundColor: COLORS.limeSubtle,
    borderWidth: 1,
    borderColor: '#D9F99D',
  },
  cardDisciplineChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  cardDisciplineChipTextMatch: {
    color: COLORS.navy,
    fontWeight: '700',
  },
  coachBio: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  cardSpecialtiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: SPACING.sm,
  },
  cardSpecialtyPill: {
    backgroundColor: COLORS.mist,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADII.full,
  },
  cardSpecialtyPillText: {
    fontSize: 11,
    color: COLORS.navy,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cardLocationsWrap: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  cardLocationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardLocationText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  cardLocationNone: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  cardActionText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.navy,
  },
});
