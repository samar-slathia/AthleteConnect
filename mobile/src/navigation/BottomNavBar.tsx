import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Users, Calendar, Clock, User, Inbox } from 'lucide-react-native';
import { CustomerRole } from '../services/authApi';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../theme/tokens';

export type NavTab =
  | 'home'
  | 'coaches'
  | 'bookings'
  | 'requests'
  | 'sessions'
  | 'availability'
  | 'profile';

export interface TabItem {
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  badge?: number | string;
}

export interface BottomNavBarProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  role: CustomerRole;
  badges?: Partial<Record<NavTab, number | string>>;
}

const CUSTOMER_TABS: TabItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'coaches', label: 'Coaches', icon: Users },
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'profile', label: 'Profile', icon: User },
];

const COACH_TABS: TabItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'requests', label: 'Requests', icon: Inbox },
  { id: 'sessions', label: 'Sessions', icon: Calendar },
  { id: 'availability', label: 'Availability', icon: Clock },
  { id: 'profile', label: 'Profile', icon: User },
];

export const getTabsForRole = (role: CustomerRole): TabItem[] => {
  if (role === 'coach') {
    return COACH_TABS;
  }
  return CUSTOMER_TABS;
};

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onTabChange,
  role,
  badges,
}) => {
  const insets = useSafeAreaInsets();
  const tabs = getTabsForRole(role);

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom, SPACING.xs) },
      ]}
      accessibilityRole="tablist"
      testID="bottom-nav-bar"
    >
      <View style={styles.tabsRow}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          const rawBadge = badges?.[tab.id];
          const badgeContent =
            rawBadge !== undefined && rawBadge !== 0 && rawBadge !== '0'
              ? typeof rawBadge === 'number' && rawBadge > 9
                ? '9+'
                : String(rawBadge)
              : null;

          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tabButton}
              onPress={() => onTabChange(tab.id)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={
                badgeContent
                  ? `${tab.label} tab, ${badgeContent} pending`
                  : `${tab.label} tab`
              }
              testID={`tab-${tab.id}`}
            >
              <View style={styles.indicatorContainer}>
                {isActive ? (
                  <View style={styles.activeIndicator} testID={`indicator-${tab.id}`} />
                ) : (
                  <View style={styles.inactiveIndicator} />
                )}
              </View>
              <View style={styles.iconWrap}>
                <Icon
                  size={20}
                  color={isActive ? COLORS.navy : COLORS.textMuted}
                />
                {badgeContent ? (
                  <View style={styles.badgeWrap} testID={`tab-badge-${tab.id}`}>
                    <Text style={styles.badgeText}>{badgeContent}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  isActive ? styles.tabLabelActive : styles.tabLabelInactive,
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 4,
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 8,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 52,
    paddingHorizontal: 2,
  },
  tabButton: {
    flex: 1,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 1,
  },
  indicatorContainer: {
    height: 3,
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIndicator: {
    width: 18,
    height: 3,
    borderRadius: RADII.full,
    backgroundColor: COLORS.orange,
  },
  inactiveIndicator: {
    width: 18,
    height: 3,
    backgroundColor: 'transparent',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
    width: 24,
    position: 'relative',
  },
  badgeWrap: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: '#DC2626',
    borderRadius: RADII.full,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 9.5,
    fontWeight: '700',
    lineHeight: 11,
    textAlign: 'center',
  },
  tabLabel: {
    fontSize: 10.5,
    letterSpacing: 0,
    marginTop: 2,
    textAlign: 'center',
  },
  tabLabelActive: {
    fontWeight: '700',
    color: COLORS.navy,
  },
  tabLabelInactive: {
    fontWeight: '500',
    color: COLORS.textMuted,
  },
});
