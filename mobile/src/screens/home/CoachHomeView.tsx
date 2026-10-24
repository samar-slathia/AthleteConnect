import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Users, Sparkles } from 'lucide-react-native';
import { UserProfile } from '../../services/authApi';
import { OnboardingStepCard } from './components/OnboardingStepCard';
import { EmptyStateSection } from './components/EmptyStateSection';
import { Badge } from '../../components/Badge';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../theme/tokens';

export interface CoachHomeViewProps {
  user: UserProfile;
}

export const CoachHomeView: React.FC<CoachHomeViewProps> = () => {
  return (
    <View style={styles.container}>
      {/* Introduction */}
      <View style={styles.introHeader}>
        <Text style={styles.introTitle}>Coach Studio</Text>
        <Text style={styles.introText}>
          Welcome to your coaching workstation. AthleteConnect coaching and scheduling tools are
          currently in development. Review the setup roadmap below to see what features are
          coming.
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
          Coaching profiles, credentials submission, rate configuration, and scheduling tools are
          actively being built. Below is the upcoming setup roadmap for coach onboarding.
        </Text>
      </View>

      {/* Upcoming Setup Roadmap */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>UPCOMING SETUP ROADMAP</Text>
      </View>

      <OnboardingStepCard
        stepNumber={1}
        title="Profile Details & Coaching Bio"
        description="Share your martial arts background, competitive experience, and coaching philosophy."
        statusLabel="In Development"
      />

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

      <OnboardingStepCard
        stepNumber={4}
        title="Availability & Locations"
        description="Configure recurring weekly schedule slots and gym or studio training locations."
        statusLabel="Planned"
      />

      {/* Trainee Requests & Sessions Empty State */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>TRAINEE REQUESTS & SESSIONS</Text>
      </View>
      <EmptyStateSection
        icon={<Users size={22} color={COLORS.navyMuted} />}
        title="No Active Trainee Requests"
        description="Coaching profile tools and trainee request management are currently in development. Trainee inquiries will appear here once coaching launches."
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
});
