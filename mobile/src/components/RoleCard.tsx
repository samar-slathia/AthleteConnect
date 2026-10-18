import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Users, User, Award, Check } from 'lucide-react-native';
import { RoleOption, RoleId } from '../data/roles';
import { COLORS, SPACING, RADII, TYPOGRAPHY } from '../theme/tokens';
import { Badge } from './Badge';

interface RoleCardProps {
  role: RoleOption;
  isSelected: boolean;
  onSelect: (id: RoleId) => void;
}

export const RoleCard: React.FC<RoleCardProps> = ({ role, isSelected, onSelect }) => {
  const getRoleIcon = () => {
    switch (role.id) {
      case 'parent':
        return <Users size={22} color={isSelected ? COLORS.navy : COLORS.navyLight} />;
      case 'individual':
        return <User size={22} color={isSelected ? COLORS.navy : COLORS.navyLight} />;
      case 'coach':
        return <Award size={22} color={isSelected ? COLORS.navy : COLORS.navyLight} />;
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onSelect(role.id)}
      style={[
        styles.card,
        isSelected && styles.cardSelected,
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${role.title}. ${role.description}`}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconWrapper, isSelected && styles.iconWrapperSelected]}>
          {getRoleIcon()}
        </View>

        <View style={styles.titleArea}>
          <View style={styles.titleBadgeRow}>
            <Text style={[styles.title, isSelected && styles.titleSelected]}>
              {role.title}
            </Text>
          </View>
          <Badge label={role.badge} variant={isSelected ? 'lime' : 'demo'} />
        </View>

        <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
          {isSelected ? <Check size={14} color={COLORS.navy} strokeWidth={3} /> : null}
        </View>
      </View>

      <Text style={styles.description}>{role.description}</Text>

      {/* Feature highlights */}
      <View style={styles.highlightsContainer}>
        {role.highlights.map((highlight, index) => (
          <View key={index} style={styles.highlightRow}>
            <View style={[styles.bullet, isSelected && styles.bulletSelected]} />
            <Text style={styles.highlightText}>{highlight}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginVertical: 4,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardSelected: {
    borderColor: COLORS.navy,
    backgroundColor: '#FAFCF5',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  iconWrapper: {
    width: 38,
    height: 38,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.mist,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  iconWrapperSelected: {
    backgroundColor: COLORS.lime,
  },
  titleArea: {
    flex: 1,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  title: {
    ...TYPOGRAPHY.h3,
    fontSize: 16,
    lineHeight: 20,
  },
  titleSelected: {
    color: COLORS.navy,
    fontWeight: '700',
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.xs,
  },
  radioCircleSelected: {
    borderColor: COLORS.navy,
    backgroundColor: COLORS.lime,
  },
  description: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: SPACING.xs,
  },
  highlightsContainer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.mist,
    paddingTop: 4,
    gap: 3,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.textMuted,
    marginRight: 6,
  },
  bulletSelected: {
    backgroundColor: COLORS.navy,
  },
  highlightText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11.5,
    lineHeight: 15,
    color: COLORS.textSecondary,
    flex: 1,
  },
});
