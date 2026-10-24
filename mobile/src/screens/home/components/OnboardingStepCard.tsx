import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Badge } from '../../../components/Badge';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../../theme/tokens';

export interface OnboardingStepCardProps {
  stepNumber?: number;
  title: string;
  description: string;
  statusLabel?: string;
  icon?: React.ReactNode;
}

export const OnboardingStepCard: React.FC<OnboardingStepCardProps> = ({
  stepNumber,
  title,
  description,
  statusLabel = 'In Development',
  icon,
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.leadingContainer}>
        {stepNumber !== undefined ? (
          <View style={styles.stepCircle}>
            <Text style={styles.stepNumberText}>{stepNumber}</Text>
          </View>
        ) : icon ? (
          <View style={styles.iconCircle}>{icon}</View>
        ) : null}
      </View>

      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          <Badge label={statusLabel} variant="demo" />
        </View>
        <Text style={styles.description}>{description}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: RADII.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
    alignItems: 'flex-start',
  },
  leadingContainer: {
    marginRight: SPACING.sm,
    marginTop: 2,
  },
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.limeSubtle,
    borderWidth: 1,
    borderColor: 'rgba(200, 241, 105, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2B4200',
  },
  iconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    gap: SPACING.xs,
  },
  title: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 14,
    color: COLORS.navy,
    flex: 1,
  },
  description: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.textSecondary,
  },
});
