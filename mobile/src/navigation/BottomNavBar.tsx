import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Compass, Calendar, Clock, User } from 'lucide-react-native';
import { CustomerRole } from '../services/authApi';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../theme/tokens';

export interface TabItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size: number; color: string }>;
}

export interface BottomNavBarProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  role: CustomerRole;
}

const CUSTOMER_TABS: TabItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'discover', label: 'Discover', icon: Compass },
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'profile', label: 'Profile', icon: User },
];

const COACH_TABS: TabItem[] = [
  { id: 'home', label: 'Home', icon: Home },
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

          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tabButton}
              onPress={() => onTabChange(tab.id)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tab.label} tab`}
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
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  isActive ? styles.tabLabelActive : styles.tabLabelInactive,
                ]}
                numberOfLines={1}
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
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  indicatorContainer: {
    height: 3,
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIndicator: {
    width: 22,
    height: 3,
    borderRadius: RADII.full,
    backgroundColor: COLORS.lime,
  },
  inactiveIndicator: {
    width: 22,
    height: 3,
    backgroundColor: 'transparent',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
  },
  tabLabel: {
    fontSize: 11,
    letterSpacing: 0.1,
    marginTop: 2,
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
