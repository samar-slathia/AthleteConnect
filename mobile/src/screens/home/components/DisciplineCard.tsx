import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Badge } from '../../../components/Badge';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../../theme/tokens';

export interface DisciplineCardProps {
  title: string;
  tagline: string;
  description: string;
  specialties: string[];
  audienceFocus?: string;
}

export const DisciplineCard: React.FC<DisciplineCardProps> = ({
  title,
  tagline,
  description,
  specialties,
  audienceFocus,
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {audienceFocus ? <Badge label={audienceFocus} variant="lime" /> : null}
      </View>

      <Text style={styles.tagline}>{tagline}</Text>
      <Text style={styles.description}>{description}</Text>

      {specialties && specialties.length > 0 && (
        <View style={styles.specialtiesRow}>
          {specialties.map((item, index) => (
            <View key={index} style={styles.specialtyPill}>
              <Text style={styles.specialtyText}>{item}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  title: {
    ...TYPOGRAPHY.h3,
    fontSize: 17,
    color: COLORS.navy,
  },
  tagline: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  description: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  specialtiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  specialtyPill: {
    backgroundColor: COLORS.mist,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  specialtyText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.navyMuted,
  },
});
