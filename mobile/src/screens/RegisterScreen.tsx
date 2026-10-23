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
import { ArrowLeft, AlertCircle, Eye, EyeOff, ShieldCheck, User, Mail, Lock } from 'lucide-react-native';
import { RoleId, ROLES } from '../data/roles';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../theme/tokens';

export interface RegisterScreenProps {
  initialRole: RoleId;
  onNavigateToLogin?: () => void;
  onBack?: () => void;
}

const ALLOWED_CUSTOMER_ROLES: RoleId[] = ['parent', 'individual', 'coach'];

export const RegisterScreen: React.FC<RegisterScreenProps> = ({
  initialRole,
  onNavigateToLogin,
  onBack,
}) => {
  const insets = useSafeAreaInsets();
  const { register, isLoading: authLoading, error: authError, clearError } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validate customer role restriction
  const isAllowedRole = ALLOWED_CUSTOMER_ROLES.includes(initialRole);
  const roleInfo = ROLES.find((r) => r.id === initialRole);

  const validateForm = (): string | null => {
    if (!isAllowedRole) {
      return 'Public registration is restricted to parent, individual, and coach accounts.';
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return 'Full name is required.';
    }
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return 'Name must be between 2 and 100 characters.';
    }

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
    if (password.length < 8) {
      return 'Password must be at least 8 characters long.';
    }
    if (password.length > 72) {
      return 'Password cannot exceed 72 characters.';
    }

    return null;
  };

  const handleRegister = async () => {
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
      await register(name.trim(), email.trim().toLowerCase(), password, initialRole);
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
        <Text style={styles.topTitle}>Create Account</Text>
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
        {/* Role Display Card (Non-editable) */}
        <View style={styles.roleCard} accessibilityRole="summary" accessibilityLabel="Selected account role">
          <View style={styles.roleHeaderRow}>
            <View style={styles.roleTitleGroup}>
              <ShieldCheck size={18} color={COLORS.navy} />
              <Text style={styles.roleCardTitle}>Account Role</Text>
            </View>
            {roleInfo && <Badge label={roleInfo.badge} variant="lime" />}
          </View>
          <Text style={styles.roleName}>{roleInfo ? roleInfo.title : 'Invalid Role'}</Text>
          <Text style={styles.roleDescription}>
            {roleInfo
              ? roleInfo.description
              : 'This role is not supported for public registration.'}
          </Text>
        </View>

        {/* Error Banner */}
        {activeError ? (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <AlertCircle size={18} color="#B91C1C" style={styles.errorIcon} />
            <Text style={styles.errorText}>{activeError}</Text>
          </View>
        ) : null}

        {/* Form Fields */}
        <View style={styles.form}>
          {/* Full Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Full Name</Text>
            <View style={styles.inputWrapper}>
              <User size={18} color={COLORS.textMuted} style={styles.fieldIcon} />
              <TextInput
                style={styles.input}
                placeholder="e.g. Alex Morgan"
                placeholderTextColor={COLORS.textMuted}
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  if (clientError) setClientError(null);
                }}
                autoCapitalize="words"
                autoCorrect={false}
                editable={!isSubmitting && !authLoading}
                accessibilityLabel="Full Name input"
              />
            </View>
          </View>

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
            <Text style={styles.inputLabel}>Password (8–72 characters)</Text>
            <View style={styles.inputWrapper}>
              <Lock size={18} color={COLORS.textMuted} style={styles.fieldIcon} />
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Choose a strong password"
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
            title="Create Account"
            variant="primary"
            onPress={handleRegister}
            loading={isSubmitting || authLoading}
            disabled={isSubmitting || authLoading || !isAllowedRole}
            style={styles.submitButton}
          />

          {/* Navigation to Login */}
          {onNavigateToLogin ? (
            <View style={styles.loginRedirectRow}>
              <Text style={styles.loginPromptText}>Already have an account?</Text>
              <TouchableOpacity
                onPress={onNavigateToLogin}
                accessibilityRole="button"
                accessibilityLabel="Sign in to existing account"
                disabled={isSubmitting || authLoading}
              >
                <Text style={styles.loginLinkText}>Sign In</Text>
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
  roleCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  roleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  roleTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roleCardTitle: {
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  roleName: {
    ...TYPOGRAPHY.h2,
    fontSize: 20,
    color: COLORS.navy,
    marginBottom: 4,
  },
  roleDescription: {
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
  loginRedirectRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.lg,
    gap: 6,
  },
  loginPromptText: {
    ...TYPOGRAPHY.body,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  loginLinkText: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 14,
    color: COLORS.navy,
    textDecorationLine: 'underline',
  },
});
