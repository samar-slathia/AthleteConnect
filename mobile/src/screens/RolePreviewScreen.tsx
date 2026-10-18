import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle2, Compass, Star } from 'lucide-react-native';
import { ROLES } from '../data/roles';
import { SAMPLE_SPORTS } from '../data/sports';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { NoticeBanner } from '../components/NoticeBanner';
import { COLORS, SPACING, RADII, TYPOGRAPHY } from '../theme/tokens';
import { RolePreviewScreenProps } from '../navigation/types';

export const RolePreviewScreen: React.FC<RolePreviewScreenProps> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { roleId } = route.params;
  const role = ROLES.find((r) => r.id === roleId) || ROLES[0];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top Navigation Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to Role Selection"
        >
          <ArrowLeft size={20} color={COLORS.navy} />
          <Text style={styles.backText}>Change Role</Text>
        </TouchableOpacity>
        <Badge label="Phase 1 Preview" variant="lime" />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Role Confirmation Card */}
        <View style={styles.roleHeaderCard}>
          <View style={styles.badgeRow}>
            <Badge label={role.badge} variant="navy" />
            <Text style={styles.previewTag}>Selected Role</Text>
          </View>

          <Text style={styles.roleTitle}>{role.title}</Text>
          <Text style={styles.roleDescription}>{role.description}</Text>

          <View style={styles.plannedFeaturesBox}>
            <Text style={styles.plannedFeaturesTitle}>Planned Features for this Role:</Text>
            {role.highlights.map((item, idx) => (
              <View key={idx} style={styles.featureRow}>
                <CheckCircle2 size={16} color={COLORS.success} />
                <Text style={styles.featureText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <NoticeBanner message="You are previewing this role in Phase 1 Foundation mode. Registration, live coach bookings, and payments will be unlocked after backend integration in later phases." />

        {/* Sports Discovery Preview */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Compass size={20} color={COLORS.navy} />
            <Text style={styles.sectionTitle}>Sports Discovery (Sample Preview)</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Sample sports categories designated for initial coach onboarding.
          </Text>
        </View>

        <View style={styles.sportsList}>
          {SAMPLE_SPORTS.map((sport) => (
            <View key={sport.id} style={styles.sportCard}>
              <View style={styles.sportCardHeader}>
                <View>
                  <Text style={styles.sportName}>{sport.name}</Text>
                  <Text style={styles.sportTagline}>{sport.tagline}</Text>
                </View>
                <Badge label={`${sport.demoCoachCount} Demo Coaches`} variant="demo" />
              </View>

              {/* Specialties */}
              <View style={styles.specialtiesRow}>
                {sport.sampleSpecialties.map((spec, sIdx) => (
                  <View key={sIdx} style={styles.specTag}>
                    <Text style={styles.specTagText}>{spec}</Text>
                  </View>
                ))}
              </View>

              {/* Sample coach preview box */}
              <View style={styles.demoCoachBox}>
                <View style={styles.demoCoachHeader}>
                  <Text style={styles.demoCoachLabel}>SAMPLE COACH LISTING (DEMO)</Text>
                  <View style={styles.demoRating}>
                    <Star size={12} color="#D97706" fill="#D97706" />
                    <Text style={styles.demoRatingText}>{sport.demoCoachPreview.sampleRating}</Text>
                  </View>
                </View>
                <View style={styles.demoCoachDetails}>
                  <View>
                    <Text style={styles.demoCoachName}>{sport.demoCoachPreview.name}</Text>
                    <Text style={styles.demoCoachMeta}>{sport.demoCoachPreview.experience}</Text>
                  </View>
                  <Text style={styles.demoCoachPrice}>{sport.demoCoachPreview.samplePrice}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.footerAction}>
          <Button
            title="Return to Role Selection"
            variant="outline"
            onPress={() => navigation.goBack()}
            icon={<ArrowLeft size={16} color={COLORS.navy} />}
          />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.mist,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  backText: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 14,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  roleHeaderCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  previewTag: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  roleTitle: {
    ...TYPOGRAPHY.h2,
    marginBottom: SPACING.xs,
  },
  roleDescription: {
    ...TYPOGRAPHY.body,
    marginBottom: SPACING.lg,
  },
  plannedFeaturesBox: {
    backgroundColor: COLORS.mist,
    borderRadius: RADII.md,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  plannedFeaturesTitle: {
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 2,
  },
  featureText: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  sectionHeader: {
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  sectionTitle: {
    ...TYPOGRAPHY.h3,
  },
  sectionSubtitle: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    marginTop: 2,
  },
  sportsList: {
    gap: SPACING.md,
  },
  sportCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sportCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  sportName: {
    ...TYPOGRAPHY.h3,
    fontSize: 17,
  },
  sportTagline: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
    maxWidth: 200,
  },
  specialtiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: SPACING.sm,
  },
  specTag: {
    backgroundColor: COLORS.mist,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADII.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  specTagText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  demoCoachBox: {
    marginTop: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADII.sm,
    backgroundColor: '#FAFBFD',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
  },
  demoCoachHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  demoCoachLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  demoRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  demoRatingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  demoCoachDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  demoCoachName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.navy,
  },
  demoCoachMeta: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  demoCoachPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.success,
  },
  footerAction: {
    marginTop: SPACING.xl,
  },
});
