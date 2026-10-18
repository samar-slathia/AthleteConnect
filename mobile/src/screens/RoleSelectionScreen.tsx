import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight } from 'lucide-react-native';
import { Header } from '../components/Header';
import { RoleCard } from '../components/RoleCard';
import { Button } from '../components/Button';
import { NoticeBanner } from '../components/NoticeBanner';
import { ROLES, RoleId } from '../data/roles';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme/tokens';
import { RoleSelectionScreenProps } from '../navigation/types';

export const RoleSelectionScreen: React.FC<RoleSelectionScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [selectedRole, setSelectedRole] = useState<RoleId>('parent');

  const selectedRoleData = ROLES.find((r) => r.id === selectedRole);

  const handleContinue = () => {
    if (selectedRole) {
      navigation.navigate('RolePreview', { roleId: selectedRole });
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 85 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Role Selection Header */}
        <Header
          headline="Choose your role"
          description="Select your account type to experience AthleteConnect's tailored platform features."
        />

        {/* Section Heading */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderText}>SELECT YOUR PROFILE</Text>
        </View>

        {/* Role Cards List */}
        <View style={styles.rolesContainer} accessibilityRole="radiogroup">
          {ROLES.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              isSelected={selectedRole === role.id}
              onSelect={setSelectedRole}
            />
          ))}
        </View>

        {/* Phase 1 Notice Banner */}
        <NoticeBanner message="Phase 1 Preview: Demonstrates client-side role workflows. Registration, authentication, and database persistence will be implemented in Phase 2." />
      </ScrollView>

      {/* Floating bottom action bar with safe-area spacing */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}>
        <Button
          title={selectedRoleData ? `Continue as ${selectedRoleData.title}` : 'Select a role to continue'}
          onPress={handleContinue}
          disabled={!selectedRole}
          icon={<ArrowRight size={18} color={COLORS.navy} />}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.mist,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
  },
  sectionHeaderRow: {
    marginTop: 4,
    marginBottom: 4,
  },
  sectionHeaderText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: COLORS.navyMuted,
    textTransform: 'uppercase',
  },
  rolesContainer: {
    marginVertical: 2,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 8,
  },
});
