import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADII } from '../theme/tokens';

interface BadgeProps {
  label: string;
  variant?: 'lime' | 'navy' | 'demo' | 'success';
}

export const Badge: React.FC<BadgeProps> = ({ label, variant = 'demo' }) => {
  const getBadgeStyle = () => {
    switch (variant) {
      case 'lime':
        return {
          container: { backgroundColor: COLORS.limeSubtle, borderColor: 'rgba(200, 241, 105, 0.6)' },
          text: { color: '#2B4200' },
        };
      case 'navy':
        return {
          container: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
          text: { color: COLORS.white },
        };
      case 'success':
        return {
          container: { backgroundColor: COLORS.successLight, borderColor: COLORS.success },
          text: { color: COLORS.success },
        };
      case 'demo':
      default:
        return {
          container: { backgroundColor: COLORS.mist, borderColor: COLORS.border },
          text: { color: COLORS.textSecondary },
        };
    }
  };

  const current = getBadgeStyle();

  return (
    <View style={[styles.container, current.container]}>
      <Text style={[styles.text, current.text]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
