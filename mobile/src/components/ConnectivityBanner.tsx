import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ViewStyle } from 'react-native';
import { WifiOff, AlertCircle, RefreshCw } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING, RADII } from '../theme/tokens';

export interface ConnectivityBannerProps {
  style?: ViewStyle;
}

export const ConnectivityBanner: React.FC<ConnectivityBannerProps> = ({ style }) => {
  const {
    backendReachability = 'reachable',
    sessionValidationState = 'validated',
    isUsingCachedProfile = false,
    revalidateSession = async () => {},
  } = useAuth();
  const [isRetrying, setIsRetrying] = useState(false);

  // When fully online and validated with a fresh profile, no banner is needed
  if (backendReachability === 'reachable' && sessionValidationState === 'validated' && !isUsingCachedProfile) {
    return null;
  }

  // When unauthenticated / no cached profile in use and reachable, don't show an offline banner
  if (backendReachability === 'reachable' && !isUsingCachedProfile && sessionValidationState === 'unvalidated') {
    return null;
  }

  const handleRetry = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      await revalidateSession();
    } finally {
      setIsRetrying(false);
    }
  };

  const isOffline = backendReachability === 'unreachable';
  const isChecking = backendReachability === 'checking' || isRetrying;

  const message = isChecking
    ? 'Checking connection to AthleteConnect...'
    : isOffline
    ? 'You are offline. Showing cached profile.'
    : 'Server is temporarily unavailable. Showing cached profile.';

  return (
    <View
      style={[
        styles.banner,
        isOffline ? styles.offlineBanner : styles.degradedBanner,
        style,
      ]}
      testID="connectivity-banner"
      accessibilityRole="alert"
    >
      <View style={styles.iconContainer}>
        {isChecking ? (
          <ActivityIndicator size="small" color={COLORS.navy} />
        ) : isOffline ? (
          <WifiOff size={16} color={COLORS.warning} />
        ) : (
          <AlertCircle size={16} color={COLORS.orange} />
        )}
      </View>
      <View style={styles.textContainer}>
        <Text
          style={[styles.message, isOffline ? styles.offlineText : styles.degradedText]}
          testID="connectivity-banner-message"
        >
          {message}
        </Text>
      </View>
      {!isChecking && (
        <TouchableOpacity
          onPress={handleRetry}
          style={styles.retryButton}
          testID="connectivity-banner-retry-button"
          accessibilityLabel="Retry connection"
          accessibilityRole="button"
          activeOpacity={0.7}
        >
          <RefreshCw size={13} color={COLORS.navy} style={styles.retryIcon} />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: 1,
  },
  offlineBanner: {
    backgroundColor: COLORS.warningBg,
    borderBottomColor: COLORS.warningBorder,
  },
  degradedBanner: {
    backgroundColor: COLORS.orangeSubtle,
    borderBottomColor: '#FDBA74',
  },
  iconContainer: {
    marginRight: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  message: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  offlineText: {
    color: '#92400E',
  },
  degradedText: {
    color: '#9A3412',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  retryIcon: {
    marginRight: 4,
  },
  retryText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.navy,
  },
});
