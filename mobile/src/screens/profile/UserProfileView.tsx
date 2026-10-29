import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  User as UserIcon,
  Mail,
  ShieldCheck,
  LogOut,
  Edit3,
  MapPin,
  Sparkles,
  Award,
  DollarSign,
  Layers,
  AlertCircle,
} from 'lucide-react-native';
import { UserProfile } from '../../services/authApi';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../data/roles';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { CoachProfileEditScreen } from '../CoachProfileEditScreen';
import {
  getCoachProfile,
  CoachProfile,
  CoachDiscipline,
  SessionFormat,
} from '../../services/coachApi';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../theme/tokens';

export interface UserProfileViewProps {
  user: UserProfile;
  token?: string | null;
  onLogout?: () => Promise<void> | void;
  isLoading?: boolean;
}

const DISCIPLINE_LABELS: Record<CoachDiscipline, string> = {
  boxing: 'Boxing',
  wushu: 'Wushu',
  kickboxing: 'Kickboxing',
};

const SESSION_FORMAT_LABELS: Record<SessionFormat, string> = {
  one_on_one: '1-on-1 Private',
  small_group: 'Small Group',
};

export const UserProfileView: React.FC<UserProfileViewProps> = ({
  user,
  token,
  onLogout,
  isLoading = false,
}) => {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const effectiveToken = token !== undefined ? token : auth?.token ?? null;

  const [isEditingCoach, setIsEditingCoach] = useState<boolean>(false);
  const [coachProfile, setCoachProfile] = useState<CoachProfile | null>(null);
  const [isLoadingCoachProfile, setIsLoadingCoachProfile] = useState<boolean>(false);
  const [coachProfileError, setCoachProfileError] = useState<string | null>(null);

  const roleInfo = ROLES.find((r) => r.id === user?.role);

  const loadCoachProfile = useCallback(async () => {
    if (user.role !== 'coach' || !effectiveToken) return;
    setIsLoadingCoachProfile(true);
    setCoachProfileError(null);
    try {
      const response = await getCoachProfile(effectiveToken);
      setCoachProfile(response.profile);
    } catch (err: any) {
      setCoachProfileError(err?.message || 'Failed to load coaching profile');
    } finally {
      setIsLoadingCoachProfile(false);
    }
  }, [user.role, effectiveToken]);

  useEffect(() => {
    if (user.role === 'coach' && effectiveToken) {
      loadCoachProfile();
    }
  }, [user.role, effectiveToken, loadCoachProfile]);

  const handleSignOut = async () => {
    if (onLogout) {
      await onLogout();
    } else if (auth?.logout) {
      await auth.logout();
    }
  };

  if (isEditingCoach) {
    return (
      <CoachProfileEditScreen
        onBack={() => {
          setIsEditingCoach(false);
          loadCoachProfile();
        }}
      />
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: insets.bottom + 88 },
      ]}
      showsVerticalScrollIndicator={false}
      testID="user-profile-view"
    >
      {/* Profile Header Greeting */}
      <View style={styles.header}>
        <View style={styles.avatarBadge}>
          <Text style={styles.avatarInitials}>
            {user.name
              ? user.name
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()
              : 'U'}
          </Text>
        </View>
        <Text style={styles.headerName}>{user.name}</Text>
        <View style={styles.rolePillWrap}>
          <Badge label={roleInfo ? roleInfo.title : user.role} variant="lime" />
        </View>
      </View>

      {/* Your Account Details Card */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardTitleGroup}>
            <UserIcon size={18} color={COLORS.navy} />
            <Text style={styles.cardSectionTitle}>Your Account</Text>
          </View>
          <View style={styles.statusIndicator}>
            <View
              style={[
                styles.statusDot,
                user.isActive ? styles.statusDotActive : styles.statusDotInactive,
              ]}
            />
            <Text style={styles.statusText}>{user.isActive ? 'Active' : 'Inactive'}</Text>
          </View>
        </View>

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

      {/* Coach-Specific Profile Summary & Edit Section */}
      {user.role === 'coach' ? (
        <View style={styles.card} testID="coach-profile-summary">
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardTitleGroup}>
              <Award size={18} color={COLORS.navy} />
              <Text style={styles.cardSectionTitle}>Coaching Profile</Text>
            </View>
            <Badge label="Active" variant="success" />
          </View>

          {isLoadingCoachProfile ? (
            <View style={styles.coachLoadingWrap}>
              <ActivityIndicator size="small" color={COLORS.navy} />
              <Text style={styles.coachLoadingText}>Loading coach profile...</Text>
            </View>
          ) : coachProfileError ? (
            <View style={styles.coachErrorWrap}>
              <AlertCircle size={16} color="#DC2626" />
              <Text style={styles.coachErrorText}>{coachProfileError}</Text>
            </View>
          ) : (
            <View style={styles.coachDetailsBody}>
              {/* Bio */}
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Coaching Philosophy & Bio</Text>
                <Text style={styles.summaryText}>
                  {coachProfile?.bio && coachProfile.bio.trim().length > 0
                    ? coachProfile.bio
                    : 'No coaching bio configured yet.'}
                </Text>
              </View>

              {/* Disciplines */}
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Disciplines Coached</Text>
                <View style={styles.chipsRow}>
                  {coachProfile?.disciplines && coachProfile.disciplines.length > 0 ? (
                    coachProfile.disciplines.map((d) => (
                      <View key={d} style={styles.chip}>
                        <Text style={styles.chipText}>{DISCIPLINE_LABELS[d] || d}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.summaryMuted}>No disciplines configured.</Text>
                  )}
                </View>
              </View>

              {/* Specialties */}
              {coachProfile?.specialties && coachProfile.specialties.length > 0 ? (
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Specialties</Text>
                  <View style={styles.chipsRow}>
                    {coachProfile.specialties.map((s, idx) => (
                      <View key={idx} style={styles.chipSecondary}>
                        <Text style={styles.chipSecondaryText}>{s}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Hourly Rate */}
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Hourly Rate</Text>
                <View style={styles.rateRow}>
                  <DollarSign size={16} color={COLORS.navy} />
                  <Text style={styles.rateValue}>
                    {coachProfile?.hourlyRate ? `₹${coachProfile.hourlyRate} / hour` : 'Not set'}
                  </Text>
                </View>
              </View>

              {/* Session Formats */}
              {coachProfile?.sessionFormats && coachProfile.sessionFormats.length > 0 ? (
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Session Formats</Text>
                  <View style={styles.chipsRow}>
                    {coachProfile.sessionFormats.map((f) => (
                      <View key={f} style={styles.chipFormat}>
                        <Layers size={12} color={COLORS.navy} />
                        <Text style={styles.chipFormatText}>
                          {SESSION_FORMAT_LABELS[f] || f}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Training Locations */}
              {coachProfile?.locations && coachProfile.locations.length > 0 ? (
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Configured Locations</Text>
                  {coachProfile.locations.map((loc, idx) => (
                    <View key={idx} style={styles.locationItemRow}>
                      <MapPin size={14} color={COLORS.textMuted} />
                      <Text style={styles.locationItemText}>{loc}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Edit Coach Profile Action Button */}
              <View style={styles.coachEditButtonWrap}>
                <Button
                  title="Edit Coach Profile"
                  variant="primary"
                  onPress={() => setIsEditingCoach(true)}
                  icon={<Edit3 size={16} color={COLORS.navy} />}
                  testID="edit-coach-profile-btn"
                />
              </View>
            </View>
          )}
        </View>
      ) : null}

      {/* Sign Out Action */}
      <View style={styles.actionsContainer}>
        <Button
          title="Sign Out"
          variant="outline"
          onPress={handleSignOut}
          loading={isLoading}
          disabled={isLoading}
          icon={<LogOut size={16} color={COLORS.navy} />}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.mist,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  avatarBadge: {
    width: 64,
    height: 64,
    borderRadius: RADII.full,
    backgroundColor: COLORS.lime,
    borderWidth: 2,
    borderColor: '#BFE75F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarInitials: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.navy,
    letterSpacing: -0.5,
  },
  headerName: {
    ...TYPOGRAPHY.h2,
    fontSize: 22,
    color: COLORS.navy,
    marginBottom: 4,
  },
  rolePillWrap: {
    marginTop: 2,
  },
  card: {
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
  coachLoadingWrap: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  coachLoadingText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  coachErrorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  coachErrorText: {
    ...TYPOGRAPHY.caption,
    color: '#DC2626',
  },
  coachDetailsBody: {
    gap: SPACING.md,
  },
  summaryItem: {
    gap: 4,
  },
  summaryLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  summaryText: {
    ...TYPOGRAPHY.body,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.navy,
  },
  summaryMuted: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  chip: {
    backgroundColor: COLORS.limeSubtle,
    borderWidth: 1,
    borderColor: '#BFE75F',
    borderRadius: RADII.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
    color: COLORS.navy,
  },
  chipSecondary: {
    backgroundColor: COLORS.mist,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipSecondaryText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  chipFormat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.mist,
    borderRadius: RADII.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipFormatText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.navy,
    fontWeight: '600',
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  rateValue: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 16,
    color: COLORS.navy,
  },
  locationItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  locationItemText: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    color: COLORS.navy,
  },
  coachEditButtonWrap: {
    marginTop: SPACING.sm,
  },
  actionsContainer: {
    marginTop: SPACING.xs,
    marginBottom: SPACING.lg,
  },
});
