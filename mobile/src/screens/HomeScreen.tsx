import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogOut, ShieldCheck, User as UserIcon, Mail, CheckCircle2, Zap } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../data/roles';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../theme/tokens';

export type HomeScreenNavProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

export interface HomeScreenProps {
  navigation?: HomeScreenNavProps['navigation'];
  route?: HomeScreenNavProps['route'];
}

export const HomeScreen: React.FC<HomeScreenProps> = () => {
  const insets = useSafeAreaInsets();
  const { user, logout, isLoading } = useAuth();

  const roleInfo = ROLES.find((r) => r.id === user?.role);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // In-memory state is cleared safely regardless
    }
  };

  if (!user) {
    return (
      <View style={[styles.container, styles.emptyContainer, { paddingTop: insets.top }]}>
        <Text style={styles.emptyText}>No authenticated session found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Navigation Bar */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge} accessibilityLabel="AthleteConnect Logo">
            <Zap size={18} color={COLORS.navy} fill={COLORS.navy} />
          </View>
          <Text style={styles.brandName}>AthleteConnect</Text>
        </View>
        <Badge label="Authenticated" variant="success" />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + SPACING.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome Greeting Header */}
        <View style={styles.greetingHeader}>
          <Text style={styles.greetingSubtitle}>Welcome back,</Text>
          <Text style={styles.greetingName}>{user.name}</Text>
        </View>

        {/* Verified User Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardTitleGroup}>
              <ShieldCheck size={18} color={COLORS.navy} />
              <Text style={styles.cardSectionTitle}>Verified Profile</Text>
            </View>
            <View style={styles.statusIndicator}>
              <View style={[styles.statusDot, user.isActive ? styles.statusDotActive : styles.statusDotInactive]} />
              <Text style={styles.statusText}>{user.isActive ? 'Active' : 'Inactive'}</Text>
            </View>
          </View>

          {/* User Details */}
          <View style={styles.infoRow}>
            <UserIcon size={16} color={COLORS.textMuted} style={styles.infoIcon} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Full Name</Text>
              <Text style={styles.infoValue}>{user.name}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Mail size={16} color={COLORS.textMuted} style={styles.infoIcon} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Email Address</Text>
              <Text style={styles.infoValue}>{user.email}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <ShieldCheck size={16} color={COLORS.textMuted} style={styles.infoIcon} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Account Role</Text>
              <View style={styles.roleBadgeRow}>
                <Text style={styles.infoValue}>{roleInfo ? roleInfo.title : user.role}</Text>
                {roleInfo ? <Badge label={roleInfo.badge} variant="lime" /> : null}
              </View>
            </View>
          </View>
        </View>

        {/* Phase Info Box */}
        <View style={styles.noticeCard}>
          <View style={styles.noticeHeader}>
            <CheckCircle2 size={16} color={COLORS.success} />
            <Text style={styles.noticeTitle}>Session Active</Text>
          </View>
          <Text style={styles.noticeDescription}>
            Your identity has been authenticated against the AthleteConnect backend. Full role-based
            dashboards and navigation will be connected in Phase 2C.3.
          </Text>
        </View>

        {/* Sign Out Action */}
        <View style={styles.actionsContainer}>
          <Button
            title="Sign Out"
            variant="outline"
            onPress={handleLogout}
            loading={isLoading}
            disabled={isLoading}
            icon={<LogOut size={16} color={COLORS.navy} />}
          />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.mist,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
  },
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  logoBadge: {
    width: 30,
    height: 30,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.navy,
    letterSpacing: -0.3,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  greetingHeader: {
    marginBottom: SPACING.lg,
  },
  greetingSubtitle: {
    ...TYPOGRAPHY.body,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  greetingName: {
    ...TYPOGRAPHY.h1,
    fontSize: 26,
    lineHeight: 32,
    color: COLORS.navy,
  },
  profileCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.mist,
  },
  cardTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardSectionTitle: {
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotActive: {
    backgroundColor: COLORS.success,
  },
  statusDotInactive: {
    backgroundColor: '#EF4444',
  },
  statusText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  infoIcon: {
    marginTop: 2,
    marginRight: SPACING.md,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  infoValue: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 15,
    color: COLORS.navy,
  },
  roleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 2,
  },
  noticeCard: {
    backgroundColor: COLORS.successLight,
    borderColor: 'rgba(22, 128, 93, 0.2)',
    borderWidth: 1,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.xl,
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  noticeTitle: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 13,
    color: COLORS.success,
  },
  noticeDescription: {
    ...TYPOGRAPHY.body,
    fontSize: 12,
    lineHeight: 17,
    color: '#135E44',
  },
  actionsContainer: {
    marginTop: SPACING.sm,
  },
});
