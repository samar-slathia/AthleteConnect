import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, AlertCircle, Eye, EyeOff, Mail, Lock, Zap } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../theme/tokens';

export interface LoginScreenProps {
  onNavigateToRegister?: () => void;
  onBack?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onNavigateToRegister,
  onBack,
}) => {
  const insets = useSafeAreaInsets();
  const { login, isLoading: authLoading, error: authError, clearError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateForm = (): string | null => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return 'Email address is required.';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return 'Please enter a valid email address.';
    }

    if (!password) {
      return 'Password is required.';
    }

    return null;
  };

  const handleLogin = async () => {
    if (isSubmitting || authLoading) {
      return;
    }

    clearError();
    setClientError(null);

    const validationMsg = validateForm();
    if (validationMsg) {
      setClientError(validationMsg);
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch {
      // Error message is stored in AuthContext and displayed safely
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeError = clientError || authError;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            disabled={isSubmitting || authLoading}
          >
            <ArrowLeft size={20} color={COLORS.navy} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholderBox} />
        )}
        <Text style={styles.topTitle}>Sign In</Text>
        <View style={styles.placeholderBox} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + SPACING.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome Branding Card */}
        <View style={styles.welcomeCard}>
          <View style={styles.brandRow}>
            <View style={styles.logoBadge} accessibilityLabel="AthleteConnect Logo">
              <Zap size={20} color={COLORS.navy} fill={COLORS.navy} />
            </View>
            <Text style={styles.brandName}>AthleteConnect</Text>
          </View>
          <Text style={styles.welcomeTitle}>Welcome Back</Text>
          <Text style={styles.welcomeDescription}>
            Sign in to access your sessions, messages, and profile.
          </Text>
        </View>

        {/* Error Banner */}
        {activeError ? (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <AlertCircle size={18} color="#B91C1C" style={styles.errorIcon} />
            <Text style={styles.errorText}>{activeError}</Text>
          </View>
        ) : null}

        {/* Login Form Card */}
        <View style={styles.form}>
          {/* Email Address */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <Mail size={18} color={COLORS.textMuted} style={styles.fieldIcon} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={COLORS.textMuted}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (clientError) setClientError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!isSubmitting && !authLoading}
                accessibilityLabel="Email Address input"
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputWrapper}>
              <Lock size={18} color={COLORS.textMuted} style={styles.fieldIcon} />
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Enter your password"
                placeholderTextColor={COLORS.textMuted}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (clientError) setClientError(null);
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isSubmitting && !authLoading}
                accessibilityLabel="Password input"
              />
              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
                style={styles.eyeButton}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff size={18} color={COLORS.textSecondary} />
                ) : (
                  <Eye size={18} color={COLORS.textSecondary} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Submit Action */}
          <Button
            title="Sign In"
            variant="primary"
            onPress={handleLogin}
            loading={isSubmitting || authLoading}
            disabled={isSubmitting || authLoading}
            style={styles.submitButton}
          />

          {/* Navigation to Register */}
          {onNavigateToRegister ? (
            <View style={styles.registerRedirectRow}>
              <Text style={styles.registerPromptText}>Don't have an account?</Text>
              <TouchableOpacity
                onPress={onNavigateToRegister}
                accessibilityRole="button"
                accessibilityLabel="Create a new account"
                disabled={isSubmitting || authLoading}
              >
                <Text style={styles.registerLinkText}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.mist,
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
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  backText: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 14,
    color: COLORS.navy,
  },
  topTitle: {
    ...TYPOGRAPHY.h3,
    fontSize: 16,
    color: COLORS.navy,
  },
  placeholderBox: {
    width: 60,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  welcomeCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.navy,
    letterSpacing: -0.4,
  },
  welcomeTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 22,
    color: COLORS.navy,
    marginBottom: 4,
  },
  welcomeDescription: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  errorIcon: {
    flexShrink: 0,
  },
  errorText: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    color: '#991B1B',
    flex: 1,
  },
  form: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputGroup: {
    marginBottom: SPACING.lg,
  },
  inputLabel: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    color: COLORS.navy,
    marginBottom: SPACING.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
  },
  fieldIcon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    height: '100%',
    ...TYPOGRAPHY.body,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  passwordInput: {
    paddingRight: SPACING.sm,
  },
  eyeButton: {
    padding: SPACING.xs,
  },
  submitButton: {
    marginTop: SPACING.xs,
  },
  registerRedirectRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.lg,
    gap: 6,
  },
  registerPromptText: {
    ...TYPOGRAPHY.body,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  registerLinkText: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 14,
    color: COLORS.navy,
    textDecorationLine: 'underline',
  },
});
