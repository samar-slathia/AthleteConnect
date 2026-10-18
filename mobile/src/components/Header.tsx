import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Zap } from 'lucide-react-native';
import { COLORS, SPACING, RADII, TYPOGRAPHY } from '../theme/tokens';

interface HeaderProps {
  headline?: string;
  description?: string;
  benefits?: string[];
  subtitle?: string;
}

export const Header: React.FC<HeaderProps> = ({
  headline = 'Choose your role',
  description = "Select your account type to experience AthleteConnect's tailored platform features.",
  benefits,
  subtitle,
}) => {
  return (
    <View style={styles.container}>
      {/* Brand Identification */}
      <View style={styles.brandRow}>
        <View style={styles.logoBadge} accessibilityLabel="AthleteConnect Logo">
          <Zap size={18} color={COLORS.navy} fill={COLORS.navy} />
        </View>
        <Text style={styles.brandName}>AthleteConnect</Text>
      </View>

      {/* Main Punchy Headline */}
      <Text style={styles.headline}>{headline}</Text>

      {/* Value Proposition Description */}
      {description ? (
        <Text style={styles.description}>{description}</Text>
      ) : subtitle ? (
        <Text style={styles.description}>{subtitle}</Text>
      ) : null}

      {/* Three Compact Benefit Labels */}
      {benefits && benefits.length > 0 && (
        <View style={styles.benefitsRow} accessibilityRole="list">
          {benefits.map((benefit, index) => (
            <View key={index} style={styles.benefitPill} accessibilityRole="text">
              <View style={styles.benefitDot} />
              <Text style={styles.benefitText}>{benefit}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.navy,
    letterSpacing: -0.4,
  },
  headline: {
    ...TYPOGRAPHY.h2,
    fontSize: 21,
    lineHeight: 26,
    color: COLORS.navy,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  benefitsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: SPACING.xs,
  },
  benefitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 5,
  },
  benefitDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.lime,
    borderWidth: 1,
    borderColor: '#A8D83A',
  },
  benefitText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: COLORS.navy,
    letterSpacing: 0.1,
  },
});
