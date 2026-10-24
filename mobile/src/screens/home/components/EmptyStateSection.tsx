import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../../theme/tokens';

export interface EmptyStateSectionProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  testID?: string;
  accessibilityLabel?: string;
}

export const EmptyStateSection: React.FC<EmptyStateSectionProps> = ({
  title,
  description,
  icon,
  testID,
  accessibilityLabel,
}) => {
  return (
    <View
      style={styles.container}
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel || `${title}. ${description}`}
    >
      {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.mist,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  title: {
    ...TYPOGRAPHY.h3,
    fontSize: 15,
    color: COLORS.navy,
    textAlign: 'center',
    marginBottom: 4,
  },
  description: {
    ...TYPOGRAPHY.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
