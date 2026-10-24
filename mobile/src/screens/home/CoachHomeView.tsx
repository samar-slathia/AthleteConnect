import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Users, Sparkles, Edit3 } from 'lucide-react-native';
import { UserProfile } from '../../services/authApi';
import { OnboardingStepCard } from './components/OnboardingStepCard';
import { EmptyStateSection } from './components/EmptyStateSection';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { CoachProfileEditScreen } from '../CoachProfileEditScreen';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../theme/tokens';

export interface CoachHomeViewProps {
  user: UserProfile;
  initialEditing?: boolean;
}

export const CoachHomeView: React.FC<CoachHomeViewProps> = ({ initialEditing = false }) => {
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(initialEditing);

  if (isEditingProfile) {
    return <CoachProfileEditScreen onBack={() => setIsEditingProfile(false)} />;
  }

  return (
    <View style={styles.container}>
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
            onPress={() => setIsEditingProfile(true)}
            icon={<Edit3 size={16} color={COLORS.navy} />}
          />
        </View>
      </View>

      {/* Upcoming Setup Roadmap */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>UPCOMING SETUP ROADMAP</Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setIsEditingProfile(true)}
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
    marginBottom: SPACING.md,
  },
  editorActionWrap: {
    marginTop: SPACING.xs,
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
