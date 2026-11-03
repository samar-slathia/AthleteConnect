import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  X,
  MapPin,
  ShieldCheck,
  CheckCircle,
  Home,
  Navigation,
  Star,
} from 'lucide-react-native';
import { CoachDiscoveryItem, CoachDiscipline } from '../../services/bookingApi';
import { ProfileAvatar } from '../../components/profile/ProfileAvatar';
import { getPublicCoachPhotoUrl } from '../../services/profilePhotoService';
import { Button } from '../../components/Button';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../theme/tokens';

export interface CoachDetailModalProps {
  visible: boolean;
  coach: CoachDiscoveryItem | null;
  selectedDiscipline?: CoachDiscipline | null;
  onClose: () => void;
  onChooseCoach: (coach: CoachDiscoveryItem, discipline?: CoachDiscipline | null) => void;
}

export const CoachDetailModal: React.FC<CoachDetailModalProps> = ({
  visible,
  coach,
  selectedDiscipline,
  onClose,
  onChooseCoach,
}) => {
  if (!coach) return null;

  const profile = coach.profile;
  const disciplines = profile?.disciplines || [];
  const specialties = profile?.specialties || [];
  const locations = profile?.locations || [];

  // Active training venues (exclude legacy coach_home)
  const venueTypes = (profile?.venueTypes || []).filter(
    (v) => v === 'customer_home' || v === 'ground'
  );

  const photoUrl = getPublicCoachPhotoUrl(coach._id);

  const scheduleStatus =
    coach.schedule?.dateStatus ??
    (coach.isConfiguredAvailability !== undefined
      ? (coach.isConfiguredAvailability ? 'online' : 'offline')
      : 'unknown');

  const handleChoose = () => {
    onChooseCoach(coach, selectedDiscipline);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalContent} testID="coach-detail-modal">
          {/* Header Bar */}
          <View style={styles.headerBar}>
            <Text style={styles.headerTitle}>Coach Profile</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close coach detail modal"
              testID="button-close-coach-detail"
            >
              <X size={20} color={COLORS.navy} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollArea}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Coach Profile Hero */}
            <View style={styles.heroSection}>
              <ProfileAvatar
                name={coach.name}
                imageUri={photoUrl || null}
                size={76}
                showHelperText={false}
                disabled={true}
                testID="coach-detail-avatar"
              />
              <Text style={styles.coachName} testID="coach-detail-name">
                {coach.name}
              </Text>

              {/* Schedule Status Badge */}
              <View
                style={[
                  styles.scheduleBadge,
                  scheduleStatus === 'online' && styles.scheduleBadgeOnline,
                  scheduleStatus === 'offline' && styles.scheduleBadgeOffline,
                  scheduleStatus === 'fully_booked' && styles.scheduleBadgeFullyBooked,
                  scheduleStatus === 'unknown' && styles.scheduleBadgeUnknown,
                ]}
                testID="coach-detail-schedule-badge"
              >
                {scheduleStatus === 'online' && <View style={styles.dotOnline} />}
                {scheduleStatus === 'offline' && <View style={styles.dotOffline} />}
                <Text
                  style={[
                    styles.scheduleBadgeText,
                    scheduleStatus === 'online' && styles.scheduleTextOnline,
                    scheduleStatus === 'offline' && styles.scheduleTextOffline,
                    scheduleStatus === 'fully_booked' && styles.scheduleTextFullyBooked,
                    scheduleStatus === 'unknown' && styles.scheduleTextUnknown,
                  ]}
                  testID="coach-detail-schedule-text"
                >
                  {scheduleStatus === 'online'
                    ? 'ONLINE'
                    : scheduleStatus === 'offline'
                    ? 'OFFLINE'
                    : scheduleStatus === 'fully_booked'
                    ? 'FULLY BOOKED'
                    : 'UNKNOWN'}
                </Text>
              </View>

              {/* Rating Summary (shown only when reviews exist) */}
              {coach.rating && coach.rating.reviewCount > 0 ? (
                <View
                  style={styles.ratingHeroRow}
                  testID="coach-detail-rating-summary"
                >
                  <Star size={15} color="#F59E0B" fill="#F59E0B" />
                  <Text style={styles.ratingHeroAverage}>
                    {coach.rating.averageRating.toFixed(1)}
                  </Text>
                  <Text style={styles.ratingHeroReviews}>
                    • {coach.rating.reviewCount}{' '}
                    {coach.rating.reviewCount === 1 ? 'Review' : 'Reviews'}
                  </Text>
                </View>
              ) : null}

              {profile?.hourlyRate !== undefined && profile.hourlyRate !== null ? (
                <View style={styles.rateContainer} testID="coach-detail-rate">
                  <Text style={styles.rateAmount}>
                    ₹{profile.hourlyRate}
                  </Text>
                  <Text style={styles.ratePerSession}> / session hour</Text>
                </View>
              ) : null}

              {/* Disciplines Chips */}
              {disciplines.length > 0 ? (
                <View style={styles.disciplinesRow} testID="coach-detail-disciplines">
                  {disciplines.map((disc) => {
                    const isSelected = disc === selectedDiscipline;
                    return (
                      <View
                        key={disc}
                        style={[
                          styles.disciplineChip,
                          isSelected && styles.disciplineChipSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.disciplineChipText,
                            isSelected && styles.disciplineChipTextSelected,
                          ]}
                        >
                          {disc.toUpperCase()}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>

            {/* About / Bio Section */}
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionHeading}>ABOUT THE COACH</Text>
              <Text style={styles.bioText} testID="coach-detail-bio">
                {profile?.bio && profile.bio.trim().length > 0
                  ? profile.bio.trim()
                  : 'Professional martial arts and combat sports coach.'}
              </Text>
            </View>

            {/* Specialties Section */}
            {specialties.length > 0 ? (
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionHeading}>SPECIALTIES</Text>
                <View style={styles.tagsWrap} testID="coach-detail-specialties">
                  {specialties.map((spec, idx) => (
                    <View key={`${spec}-${idx}`} style={styles.specialtyTag}>
                      <Text style={styles.specialtyTagText}>{spec}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Training Venues Section */}
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionHeading}>TRAINING VENUES</Text>
              <View style={styles.venuesContainer} testID="coach-detail-venues">
                {venueTypes.includes('customer_home') ? (
                  <View style={styles.venueRow}>
                    <View style={styles.venueIconCircle}>
                      <Home size={16} color={COLORS.navy} />
                    </View>
                    <View style={styles.venueInfo}>
                      <Text style={styles.venueTitle}>Customer's Home</Text>
                      <Text style={styles.venueSubtext}>
                        Coach travels to your confirmed home address for private training.
                      </Text>
                    </View>
                  </View>
                ) : null}

                {venueTypes.includes('ground') ? (
                  <View style={styles.venueRow}>
                    <View style={styles.venueIconCircle}>
                      <Navigation size={16} color={COLORS.navy} />
                    </View>
                    <View style={styles.venueInfo}>
                      <Text style={styles.venueTitle}>Sports Ground / Facility</Text>
                      <Text style={styles.venueSubtext}>
                        Sessions take place at a designated ground or facility.
                      </Text>
                    </View>
                  </View>
                ) : null}

                {venueTypes.length === 0 ? (
                  <Text style={styles.emptyNote}>
                    Available at Customer's Home and designated Sports Grounds upon request.
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Training Locations Section */}
            {locations.length > 0 ? (
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionHeading}>TRAINING LOCATIONS & GROUNDS</Text>
                <View style={styles.locationsList} testID="coach-detail-locations">
                  {locations.map((loc, idx) => (
                    <View key={`${loc}-${idx}`} style={styles.locationItem}>
                      <MapPin size={14} color={COLORS.navy} />
                      <Text style={styles.locationItemText}>{loc}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Availability Indicator */}
            <View style={styles.availabilityRow} testID="coach-detail-availability">
              <CheckCircle
                size={16}
                color={coach.isConfiguredAvailability ? COLORS.success : COLORS.textMuted}
              />
              <Text style={styles.availabilityText}>
                {coach.isConfiguredAvailability
                  ? 'Weekly availability schedule active'
                  : 'Flexible scheduling upon request'}
              </Text>
            </View>

            {/* Customer Reviews Section */}
            {coach.rating && coach.rating.reviewCount > 0 ? (
              <View style={styles.sectionContainer} testID="coach-detail-reviews-section">
                <Text style={styles.sectionHeading}>
                  CUSTOMER REVIEWS ({coach.rating.reviewCount})
                </Text>
                {coach.reviews && coach.reviews.length > 0 ? (
                  <View style={styles.reviewsList}>
                    {coach.reviews.map((rev) => (
                      <View
                        key={rev._id}
                        style={styles.reviewCard}
                        testID={`coach-review-card-${rev._id}`}
                      >
                        <View style={styles.reviewCardHeader}>
                          <Text style={styles.reviewerName}>
                            {rev.customerName || 'Verified Athlete'}
                          </Text>
                          <View style={styles.reviewStarsRow}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                size={12}
                                color={star <= rev.rating ? '#F59E0B' : '#E5E7EB'}
                                fill={star <= rev.rating ? '#F59E0B' : 'transparent'}
                              />
                            ))}
                          </View>
                        </View>
                        {rev.reviewText ? (
                          <Text style={styles.reviewCardText}>{rev.reviewText}</Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyNote}>No written comments yet.</Text>
                )}
              </View>
            ) : null}

            {/* Safety & Quality Notice */}
            <View style={styles.noticeCard}>
              <ShieldCheck size={16} color={COLORS.navy} />
              <Text style={styles.noticeText}>
                Sessions are covered by AthleteConnect safety protocols. Address and contact details are only shared upon booking confirmation.
              </Text>
            </View>
          </ScrollView>

          {/* Primary CTA */}
          <View style={styles.footerContainer}>
            <Button
              title="Choose This Coach"
              variant="primary"
              onPress={handleChoose}
              testID="button-choose-coach"
              style={styles.chooseButton}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16, 28, 44, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    maxHeight: '92%',
    paddingTop: SPACING.md,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    ...TYPOGRAPHY.h3,
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.navy,
  },
  closeBtn: {
    padding: 6,
    borderRadius: RADII.full,
    backgroundColor: COLORS.mist,
  },
  scrollArea: {
    maxHeight: '100%',
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  coachName: {
    ...TYPOGRAPHY.h2,
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.navy,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  scheduleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADII.full,
    gap: 4,
    marginTop: 6,
  },
  scheduleBadgeOnline: {
    backgroundColor: '#ECFDF5',
  },
  scheduleBadgeOffline: {
    backgroundColor: '#F3F4F6',
  },
  scheduleBadgeFullyBooked: {
    backgroundColor: '#FEF3C7',
  },
  scheduleBadgeUnknown: {
    backgroundColor: '#F3F4F6',
  },
  dotOnline: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  dotOffline: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#9CA3AF',
  },
  scheduleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scheduleTextOnline: {
    color: '#065F46',
  },
  scheduleTextOffline: {
    color: '#6B7280',
  },
  scheduleTextFullyBooked: {
    color: '#92400E',
  },
  scheduleTextUnknown: {
    color: '#6B7280',
  },
  rateContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  rateAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.navy,
  },
  ratePerSession: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  disciplinesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    marginTop: SPACING.sm,
  },
  disciplineChip: {
    backgroundColor: COLORS.mist,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  disciplineChipSelected: {
    backgroundColor: COLORS.orange,
    borderColor: COLORS.orangePressed,
  },
  disciplineChipText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.navy,
    letterSpacing: 0.5,
  },
  disciplineChipTextSelected: {
    color: COLORS.navy,
  },
  sectionContainer: {
    marginBottom: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionHeading: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.6,
    marginBottom: SPACING.xs,
  },
  bioText: {
    ...TYPOGRAPHY.body,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.navy,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  specialtyTag: {
    backgroundColor: COLORS.mist,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
  },
  specialtyTagText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.navy,
    fontWeight: '600',
  },
  venuesContainer: {
    gap: SPACING.sm,
    marginTop: 2,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  venueIconCircle: {
    width: 28,
    height: 28,
    borderRadius: RADII.full,
    backgroundColor: COLORS.mist,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  venueInfo: {
    flex: 1,
  },
  venueTitle: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 13,
    color: COLORS.navy,
  },
  venueSubtext: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 15,
  },
  emptyNote: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  locationsList: {
    gap: 6,
    marginTop: 2,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.mist,
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  locationItemText: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    color: COLORS.navy,
    flex: 1,
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.mist,
    padding: SPACING.sm,
    borderRadius: RADII.sm,
    marginBottom: SPACING.md,
  },
  availabilityText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.navy,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: RADII.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  noticeText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
  footerContainer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: Platform.OS === 'ios' ? SPACING.xl : SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chooseButton: {
    width: '100%',
  },
  ratingHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    marginBottom: 2,
  },
  ratingHeroAverage: {
    ...TYPOGRAPHY.body,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.navy,
  },
  ratingHeroReviews: {
    ...TYPOGRAPHY.caption,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  reviewsList: {
    gap: 8,
    marginTop: 4,
  },
  reviewCard: {
    backgroundColor: COLORS.mist,
    padding: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  reviewCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  reviewerName: {
    ...TYPOGRAPHY.caption,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.navy,
  },
  reviewStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  reviewCardText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12.5,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
});
