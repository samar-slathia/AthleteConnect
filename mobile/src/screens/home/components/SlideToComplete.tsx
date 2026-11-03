import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Animated,
  LayoutChangeEvent,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { ChevronRight, Check, Lock, CheckCircle } from 'lucide-react-native';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../../theme/tokens';

export interface SlideToCompleteProps {
  onComplete: () => Promise<void> | void;
  disabled?: boolean;
  disabledMessage?: string;
  isCompleting?: boolean;
  testID?: string;
}

const TRACK_HEIGHT = 54;
const THUMB_SIZE = 46;
const THUMB_MARGIN = 4;
const COMPLETION_THRESHOLD = 0.85;

export const SlideToComplete: React.FC<SlideToCompleteProps> = ({
  onComplete,
  disabled = false,
  disabledMessage = 'SESSION IN PROGRESS',
  isCompleting = false,
  testID = 'slide-to-complete',
}) => {
  const [trackWidth, setTrackWidth] = useState<number>(300);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const maxSlideDistance = Math.max(1, trackWidth - THUMB_SIZE - THUMB_MARGIN * 2);

  const panResponder = useRef(
    PanResponder && typeof PanResponder.create === 'function'
      ? PanResponder.create({
          onStartShouldSetPanResponder: () => !disabled && !isCompleting && !isCompleted,
          onMoveShouldSetPanResponder: (_, gesture) =>
            !disabled && !isCompleting && !isCompleted && Math.abs(gesture.dx) > 5,
          onPanResponderMove: (_, gesture) => {
            if (disabled || isCompleting || isCompleted) return;
            const boundedDx = Math.max(0, Math.min(gesture.dx, maxSlideDistance));
            slideAnim.setValue(boundedDx);
          },
          onPanResponderRelease: (_, gesture) => {
            if (disabled || isCompleting || isCompleted) return;
            const progress = gesture.dx / maxSlideDistance;
            if (progress >= COMPLETION_THRESHOLD) {
              // Snap to end
              Animated.timing(slideAnim, {
                toValue: maxSlideDistance,
                duration: 120,
                useNativeDriver: false,
              }).start(async () => {
                setIsCompleted(true);
                try {
                  await onComplete();
                } catch {
                  // Reset if complete handler throws
                  setIsCompleted(false);
                  Animated.spring(slideAnim, {
                    toValue: 0,
                    useNativeDriver: false,
                  }).start();
                }
              });
            } else {
              // Spring back to start
              Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: false,
                bounciness: 4,
              }).start();
            }
          },
          onPanResponderTerminate: () => {
            Animated.spring(slideAnim, {
              toValue: 0,
              useNativeDriver: false,
            }).start();
          },
        })
      : { panHandlers: {} }
  ).current;

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0) {
      setTrackWidth(width);
    }
  };

  // Alternative accessible action for screen readers or accessibility needs
  const handleAccessiblePress = async () => {
    if (disabled || isCompleting || isCompleted) return;
    setIsCompleted(true);
    try {
      await onComplete();
    } catch {
      setIsCompleted(false);
    }
  };

  const fillWidth = slideAnim.interpolate({
    inputRange: [0, maxSlideDistance],
    outputRange: [THUMB_SIZE + THUMB_MARGIN * 2, trackWidth],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.outerContainer} testID={testID}>
      {/* Visual Slider Track */}
      <View
        style={[styles.track, disabled && styles.trackDisabled]}
        onLayout={handleLayout}
      >
        {/* Animated fill indicator */}
        {!disabled ? (
          <Animated.View
            style={[
              styles.fillBar,
              {
                width: fillWidth,
              },
            ]}
          />
        ) : null}

        {/* Center Track Label */}
        <View style={styles.labelContainer} pointerEvents="none">
          {disabled ? (
            <View style={styles.disabledLabelRow}>
              <Lock size={15} color={COLORS.textMuted} style={styles.lockIcon} />
              <Text style={styles.disabledLabelText} numberOfLines={1}>
                {disabledMessage}
              </Text>
            </View>
          ) : isCompleting ? (
            <View style={styles.disabledLabelRow}>
              <ActivityIndicator size="small" color={COLORS.navy} />
              <Text style={styles.completingLabelText}>COMPLETING SESSION...</Text>
            </View>
          ) : (
            <View style={styles.activeLabelRow}>
              <Text style={styles.activeLabelText}>SLIDE TO COMPLETE</Text>
              <View style={styles.chevronsRow}>
                <ChevronRight size={16} color={COLORS.navy} />
                <ChevronRight size={16} color="rgba(16, 28, 44, 0.4)" style={styles.offsetChevron} />
              </View>
            </View>
          )}
        </View>

        {/* Slider Thumb Handle */}
        {!disabled ? (
          <Animated.View
            style={[
              styles.thumb,
              {
                transform: [{ translateX: slideAnim }],
              },
            ]}
            {...panResponder.panHandlers}
            testID={`${testID}-thumb`}
          >
            {isCompleting ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : isCompleted ? (
              <Check size={22} color={COLORS.white} strokeWidth={3} />
            ) : (
              <ChevronRight size={24} color={COLORS.white} strokeWidth={2.5} />
            )}
          </Animated.View>
        ) : (
          <View style={styles.thumbDisabled}>
            <Lock size={18} color={COLORS.textMuted} />
          </View>
        )}
      </View>

      {/* Accessible button fallback (Accessibility Mode) */}
      <TouchableOpacity
        style={styles.accessibleButton}
        onPress={handleAccessiblePress}
        disabled={disabled || isCompleting || isCompleted}
        accessibilityRole="button"
        accessibilityLabel="Slide to complete session"
        accessibilityHint="Alternative tap button to complete session when duration has elapsed"
        accessibilityState={{ disabled: disabled || isCompleting || isCompleted }}
        testID={`${testID}-accessible-button`}
      >
        <Text style={[styles.accessibleButtonText, disabled && styles.accessibleButtonTextDisabled]}>
          Tap to complete (Accessible mode)
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    width: '100%',
    marginVertical: SPACING.xs,
  },
  track: {
    height: TRACK_HEIGHT,
    backgroundColor: '#FED7AA', // Warm subtle orange track background
    borderRadius: RADII.full,
    borderWidth: 1.5,
    borderColor: COLORS.orange,
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  trackDisabled: {
    backgroundColor: COLORS.mist,
    borderColor: COLORS.border,
  },
  fillBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: COLORS.orange,
    borderRadius: RADII.full,
  },
  labelContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
  },
  activeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeLabelText: {
    ...TYPOGRAPHY.caption,
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.navy,
    letterSpacing: 1,
  },
  chevronsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  offsetChevron: {
    marginLeft: -10,
  },
  disabledLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lockIcon: {
    marginRight: 2,
  },
  disabledLabelText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  completingLabelText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.navy,
    letterSpacing: 0.5,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: THUMB_MARGIN,
    elevation: 4,
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  thumbDisabled: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: THUMB_MARGIN,
  },
  accessibleButton: {
    marginTop: 4,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accessibleButtonText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.textSecondary,
    textDecorationLine: 'underline',
  },
  accessibleButtonTextDisabled: {
    color: COLORS.textMuted,
    textDecorationLine: 'none',
  },
});
