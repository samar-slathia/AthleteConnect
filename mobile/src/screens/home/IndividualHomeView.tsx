import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Target } from 'lucide-react-native';
import { UserProfile } from '../../services/authApi';
import { DisciplineCard } from './components/DisciplineCard';
import { OnboardingStepCard } from './components/OnboardingStepCard';
import { EmptyStateSection } from './components/EmptyStateSection';
import { COLORS, SPACING, TYPOGRAPHY } from '../../theme/tokens';

export interface IndividualHomeViewProps {
  user: UserProfile;
}

export const IndividualHomeView: React.FC<IndividualHomeViewProps> = () => {
  return (
    <View style={styles.container}>
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

      {/* Scheduled Sessions Empty State */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>SCHEDULED SESSIONS</Text>
      </View>
      <EmptyStateSection
        icon={<Target size={22} color={COLORS.navyMuted} />}
        title="No Scheduled Sessions"
        description="Direct session booking is currently in development. Once coaches join and bookings open, your upcoming workouts will appear here."
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
});
