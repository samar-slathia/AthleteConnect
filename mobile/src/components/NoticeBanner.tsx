import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { COLORS, SPACING, RADII } from '../theme/tokens';

interface NoticeBannerProps {
  message?: string;
}

export const NoticeBanner: React.FC<NoticeBannerProps> = ({
  message = 'Phase 1 Preview: This prototype demonstrates role selection and navigation. No personal data is stored, and backend APIs are not connected.'
}) => {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <View style={styles.iconContainer}>
        <AlertCircle size={18} color={COLORS.warning} />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>Phase 1 Foundation Preview</Text>
        <Text style={styles.description}>{message}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    backgroundColor: COLORS.warningBg,
    borderColor: COLORS.warningBorder,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
    borderRadius: RADII.sm,
    padding: SPACING.md,
    marginVertical: SPACING.sm,
    alignItems: 'flex-start',
  },
  iconContainer: {
    marginRight: SPACING.sm,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#78350F',
    marginBottom: 2,
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
    color: '#92400E',
  },
});
