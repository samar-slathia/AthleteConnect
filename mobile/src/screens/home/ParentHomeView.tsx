import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Users, AlertCircle } from 'lucide-react-native';
import { UserProfile } from '../../services/authApi';
import { DisciplineCard } from './components/DisciplineCard';
import { OnboardingStepCard } from './components/OnboardingStepCard';
import { EmptyStateSection } from './components/EmptyStateSection';
import { Badge } from '../../components/Badge';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../theme/tokens';

export interface ParentHomeViewProps {
  user: UserProfile;
}

export const ParentHomeView: React.FC<ParentHomeViewProps> = () => {
  return (
    <View style={styles.container}>
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

      {/* Scheduled Sessions Empty State */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>SCHEDULED SESSIONS</Text>
      </View>
      <EmptyStateSection
        icon={<AlertCircle size={22} color={COLORS.navyMuted} />}
        title="No Youth Sessions Scheduled"
        description="Session booking is not active yet. Once coach onboarding and child profiles launch, your scheduled training sessions will appear here."
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
});
