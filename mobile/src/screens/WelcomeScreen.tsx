import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  AccessibilityInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Zap, ArrowRight, Sparkles, Home, Target, ShieldCheck } from 'lucide-react-native';
import { COLORS, SPACING, RADII, TYPOGRAPHY } from '../theme/tokens';
import { WelcomeScreenProps } from '../navigation/types';

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<1 | 2>(1);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(6)).current;

  // Refs for tracking transitions and preventing race conditions or duplicate navigation
  const isTransitioningRef = useRef(false);
  const hasNavigatedRef = useRef(false);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const reduceMotionRef = useRef(false);

  // Check reduced-motion preferences on mount and run initial entrance fade
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        reduceMotionRef.current = enabled;
        if (enabled) {
          fadeAnim.setValue(1);
          slideAnim.setValue(0);
        }
      })
      .catch(() => {
        reduceMotionRef.current = false;
      });

    // Initial entrance fade for Step 1
    if (!reduceMotionRef.current) {
      animRef.current = Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
      ]);
      animRef.current.start();
    } else {
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
    }

    return () => {
      if (animRef.current) {
        animRef.current.stop();
        animRef.current = null;
      }
    };
  }, [fadeAnim, slideAnim]);

  // Safe navigation handler to role selection (Step 3)
  const navigateToRoleSelection = useCallback(() => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;

    if (animRef.current) {
      animRef.current.stop();
      animRef.current = null;
    }

    navigation.replace('RoleSelection');
  }, [navigation]);

  // Advance handler: Step 1 -> Step 2, and Step 2 -> RoleSelection
  const handleAdvance = useCallback(() => {
    if (hasNavigatedRef.current || isTransitioningRef.current) return;

    if (step === 1) {
      // First tap: Welcome -> Coaching description
      isTransitioningRef.current = true;

      if (reduceMotionRef.current) {
        setStep(2);
        fadeAnim.setValue(1);
        slideAnim.setValue(0);
        isTransitioningRef.current = false;
        return;
      }

      // Smooth fade out Step 1
      animRef.current = Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      });

      animRef.current.start(({ finished }) => {
        if (!finished || hasNavigatedRef.current) return;

        // Mount Step 2 and smoothly fade it in
        setStep(2);
        slideAnim.setValue(6);

        animRef.current = Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 280,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 280,
            useNativeDriver: true,
          }),
        ]);

        animRef.current.start(() => {
          isTransitioningRef.current = false;
        });
      });
    } else {
      // Second tap: Coaching description -> Role selection
      isTransitioningRef.current = true;

      if (reduceMotionRef.current) {
        navigateToRoleSelection();
        return;
      }

      animRef.current = Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      });

      animRef.current.start(({ finished }) => {
        if (finished) {
          navigateToRoleSelection();
        }
      });
    }
  }, [step, fadeAnim, slideAnim, navigateToRoleSelection]);

  // Skip handler: immediately proceeds to RoleSelection
  const handleSkip = useCallback(() => {
    navigateToRoleSelection();
  }, [navigateToRoleSelection]);

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      {/* Top Navigation Bar: Mini brand mark & isolated Skip button */}
      <View style={styles.topNav}>
        <View style={styles.topNavBrand}>
          <View style={styles.miniLogoBadge}>
            <Zap size={14} color={COLORS.navy} fill={COLORS.navy} />
          </View>
          <Text style={styles.miniBrandText}>AthleteConnect</Text>
        </View>

        <TouchableOpacity
          onPress={handleSkip}
          activeOpacity={0.7}
          style={styles.skipButton}
          accessibilityRole="button"
          accessibilityLabel="Skip welcome introduction and go to role selection"
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Main Interactive Tap Area: Tapping anywhere advances the step */}
      <TouchableOpacity
        style={styles.mainContentTouchable}
        activeOpacity={0.94}
        onPress={handleAdvance}
        accessibilityRole="button"
        accessibilityLabel={
          step === 1
            ? 'Welcome to AthleteConnect. Tap anywhere to learn about personal coaching.'
            : 'Coaching introduction: Your Sport. Your Coach. Your Space. Tap anywhere to choose your profile.'
        }
      >
        <Animated.View
          style={[
            styles.animatedContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {step === 1 ? (
            /* STEP 1: Brand Welcome */
            <View style={styles.stepContent}>
              <View style={styles.brandHeroBadge}>
                <Zap size={36} color={COLORS.navy} fill={COLORS.navy} />
              </View>

              <Text style={styles.brandNameTitle}>AthleteConnect</Text>

              <Text style={styles.step1Headline}>Welcome to AthleteConnect</Text>

              <Text style={styles.step1Subtitle}>
                Your journey to better training starts here.
              </Text>

              <View style={styles.trustPill}>
                <ShieldCheck size={14} color={COLORS.success} />
                <Text style={styles.trustPillText}>Verified Coaches • Tailored Training</Text>
              </View>

              <View style={styles.tapPromptRow}>
                <Text style={styles.tapPromptText}>Tap anywhere to continue</Text>
                <ArrowRight size={13} color={COLORS.textMuted} />
              </View>
            </View>
          ) : (
            /* STEP 2: Coaching Description */
            <View style={styles.stepContent}>
              <View style={styles.introHeaderTag}>
                <Sparkles size={13} color={COLORS.navy} />
                <Text style={styles.introHeaderTagText}>COACHING THAT COMES TO YOU</Text>
              </View>

              <Text style={styles.step2Headline}>
                Your Sport. Your Coach. Your Space.
              </Text>

              <Text style={styles.step2Description}>
                Personal coaching that fits your goals, your schedule, and your space. Train one-on-one with a coach who comes to your home or meet at a suitable sports venue. Build skills, boost confidence, and achieve your goals — one session at a time.
              </Text>

              {/* Three Compact Benefit Labels */}
              <View style={styles.benefitsContainer} accessibilityRole="list">
                <View style={styles.benefitCard} accessibilityRole="text">
                  <View style={styles.benefitDot} />
                  <Target size={14} color={COLORS.navy} style={styles.benefitIcon} />
                  <Text style={styles.benefitLabel}>1-on-1 Coaching</Text>
                </View>

                <View style={styles.benefitCard} accessibilityRole="text">
                  <View style={styles.benefitDot} />
                  <Home size={14} color={COLORS.navy} style={styles.benefitIcon} />
                  <Text style={styles.benefitLabel}>At-Home Training</Text>
                </View>

                <View style={styles.benefitCard} accessibilityRole="text">
                  <View style={styles.benefitDot} />
                  <Sparkles size={14} color={COLORS.navy} style={styles.benefitIcon} />
                  <Text style={styles.benefitLabel}>Your Goals, Your Pace</Text>
                </View>
              </View>

              <View style={styles.tapPromptRow}>
                <Text style={styles.tapPromptText}>Tap anywhere to choose your profile</Text>
                <ArrowRight size={13} color={COLORS.textMuted} />
              </View>
            </View>
          )}
        </Animated.View>
      </TouchableOpacity>

      {/* Bottom Controls: Step Indicators & Action Button */}
      <View style={styles.bottomControls}>
        <View
          style={styles.stepIndicatorsRow}
          accessibilityRole="progressbar"
          accessibilityValue={{ now: step, min: 1, max: 2 }}
        >
          <View style={[styles.stepDot, step === 1 ? styles.stepDotActive : styles.stepDotInactive]} />
          <View style={[styles.stepDot, step === 2 ? styles.stepDotActive : styles.stepDotInactive]} />
        </View>

        <TouchableOpacity
          onPress={handleAdvance}
          activeOpacity={0.85}
          style={styles.continueButton}
          accessibilityRole="button"
          accessibilityLabel={
            step === 1
              ? 'Continue to coaching introduction'
              : 'Continue to role selection'
          }
        >
          <Text style={styles.continueButtonText}>
            {step === 1 ? 'Continue' : 'Get Started'}
          </Text>
          <ArrowRight size={18} color={COLORS.navy} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.mist,
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  topNavBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniLogoBadge: {
    width: 24,
    height: 24,
    borderRadius: RADII.xs,
    backgroundColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBrandText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.navy,
    letterSpacing: -0.3,
  },
  skipButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: RADII.full,
    backgroundColor: 'rgba(16, 28, 44, 0.05)',
  },
  skipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.navyMuted,
  },
  mainContentTouchable: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
    paddingVertical: SPACING.md,
  },
  animatedContainer: {
    width: '100%',
  },
  stepContent: {
    alignItems: 'flex-start',
  },
  // Step 1 styling
  brandHeroBadge: {
    width: 60,
    height: 60,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: '#BFE75F',
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  brandNameTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: COLORS.navyMuted,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
  },
  step1Headline: {
    ...TYPOGRAPHY.h1,
    fontSize: 26,
    lineHeight: 32,
    color: COLORS.navy,
    marginBottom: SPACING.sm,
    letterSpacing: -0.5,
  },
  step1Subtitle: {
    ...TYPOGRAPHY.body,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  trustPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
    marginBottom: SPACING.md,
  },
  trustPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.navy,
  },
  tapPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: SPACING.xs,
  },
  tapPromptText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  // Step 2 styling
  introHeaderTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.limeSubtle,
    borderWidth: 1,
    borderColor: 'rgba(200, 241, 105, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADII.full,
    marginBottom: SPACING.sm,
  },
  introHeaderTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#2F4800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  step2Headline: {
    ...TYPOGRAPHY.h2,
    fontSize: 23,
    lineHeight: 29,
    color: COLORS.navy,
    marginBottom: SPACING.sm,
    letterSpacing: -0.4,
  },
  step2Description: {
    fontSize: 13.5,
    lineHeight: 19,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  benefitsContainer: {
    width: '100%',
    gap: 7,
    marginBottom: SPACING.xs,
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  benefitDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.lime,
    borderWidth: 1,
    borderColor: '#A8D83A',
    marginRight: 8,
  },
  benefitIcon: {
    marginRight: 8,
  },
  benefitLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.navy,
    letterSpacing: 0.1,
  },
  // Bottom controls
  bottomControls: {
    paddingVertical: SPACING.sm,
    gap: SPACING.md,
  },
  stepIndicatorsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  stepDot: {
    height: 5,
    borderRadius: 3,
  },
  stepDotActive: {
    width: 22,
    backgroundColor: COLORS.navy,
  },
  stepDotInactive: {
    width: 6,
    backgroundColor: 'rgba(16, 28, 44, 0.2)',
  },
  continueButton: {
    height: 50,
    borderRadius: RADII.md,
    backgroundColor: COLORS.lime,
    borderWidth: 1,
    borderColor: '#B8E35A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  continueButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.navy,
    fontSize: 15,
  },
});
