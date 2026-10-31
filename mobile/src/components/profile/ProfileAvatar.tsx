import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Camera } from 'lucide-react-native';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../theme/tokens';

export interface ProfileAvatarProps {
  /** Full name of the user used to extract up to 2 uppercase initials */
  name?: string | null;
  /**
   * Optional image URI (local file URI or remote URL).
   * Note: Supplying a local URI indicates a selected photo, not that the image
   * has been permanently synchronized or uploaded to cloud storage.
   */
  imageUri?: string | null;
  /** Callback invoked when tapping the camera button or the avatar */
  onPress?: () => void;
  /** Diameter size in pixels (default: 72) */
  size?: number;
  /** Whether the avatar interaction is disabled */
  disabled?: boolean;
  /** Whether to render the helper caption underneath (default: true) */
  showHelperText?: boolean;
  /** Optional container style override */
  style?: StyleProp<ViewStyle>;
  /** Optional testID for testing */
  testID?: string;
}

/**
 * Extracts up to two initials from a user's name.
 * Falls back to 'U' if name is missing, null, empty, or whitespace.
 */
export function getInitials(name?: string | null): string {
  if (!name || typeof name !== 'string') {
    return 'U';
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return 'U';
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'U';
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  name,
  imageUri,
  onPress,
  size = 72,
  disabled = false,
  showHelperText = true,
  style,
  testID = 'profile-avatar',
}) => {
  const [hasImageError, setHasImageError] = useState<boolean>(false);

  // Reset error state whenever the provided image URI changes
  useEffect(() => {
    setHasImageError(false);
  }, [imageUri]);

  const initials = getInitials(name);
  const hasValidImage = Boolean(imageUri && imageUri.trim() && !hasImageError);

  const avatarSize = Math.max(36, size);
  const initialsFontSize = Math.round(avatarSize * 0.35);
  const cameraButtonSize = Math.max(28, Math.round(avatarSize * 0.38));
  const cameraIconSize = Math.max(12, Math.round(cameraButtonSize * 0.5));

  const handlePress = () => {
    if (!disabled && onPress) {
      onPress();
    }
  };

  return (
    <View style={[styles.container, style]} testID={testID}>
      {/* Avatar Circle Container with Camera Button Overlay */}
      <View style={[styles.avatarWrapper, { width: avatarSize, height: avatarSize }]}>
        <TouchableOpacity
          activeOpacity={onPress && !disabled ? 0.8 : 1}
          onPress={handlePress}
          disabled={disabled || !onPress}
          style={[
            styles.avatarCircle,
            {
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarSize / 2,
            },
          ]}
          accessibilityRole={onPress ? 'button' : 'image'}
          accessibilityLabel={
            hasValidImage
              ? `Profile photo for ${name?.trim() || 'user'}`
              : `Profile avatar initials ${initials} for ${name?.trim() || 'user'}`
          }
          testID="profile-avatar-touchable"
        >
          {hasValidImage ? (
            <Image
              source={{ uri: imageUri!.trim() }}
              style={[
                styles.avatarImage,
                {
                  width: avatarSize,
                  height: avatarSize,
                  borderRadius: avatarSize / 2,
                },
              ]}
              resizeMode="cover"
              onError={() => setHasImageError(true)}
              testID="profile-avatar-image"
            />
          ) : (
            <View
              style={[
                styles.initialsContainer,
                {
                  width: avatarSize,
                  height: avatarSize,
                  borderRadius: avatarSize / 2,
                },
              ]}
              testID="profile-avatar-initials-container"
            >
              <Text
                style={[styles.avatarInitials, { fontSize: initialsFontSize }]}
                testID="profile-avatar-initials"
                numberOfLines={1}
              >
                {initials}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Camera Icon Action Overlay */}
        {onPress ? (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handlePress}
            disabled={disabled}
            style={[
              styles.cameraButton,
              {
                width: cameraButtonSize,
                height: cameraButtonSize,
                borderRadius: cameraButtonSize / 2,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            accessibilityHint="Select a new photo for your profile"
            testID="change-photo-button"
          >
            <Camera size={cameraIconSize} color={COLORS.white} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Helper text directly below photo */}
      {showHelperText ? (
        <Text style={styles.helperText} testID="profile-avatar-helper-text">
          Recommended for better visibility.
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    backgroundColor: COLORS.lime,
    borderWidth: 2,
    borderColor: '#BFE75F',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  initialsContainer: {
    backgroundColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    backgroundColor: COLORS.mist,
  },
  avatarInitials: {
    fontWeight: '800',
    color: COLORS.navy,
    letterSpacing: -0.5,
  },
  cameraButton: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    backgroundColor: COLORS.navy,
    borderWidth: 2,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  helperText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
});
