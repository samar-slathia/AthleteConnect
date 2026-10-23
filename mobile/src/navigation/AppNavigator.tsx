import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Zap } from 'lucide-react-native';
import { RootStackParamList } from './types';
import { useAuth } from '../context/AuthContext';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { RoleSelectionScreen } from '../screens/RoleSelectionScreen';
import { RolePreviewScreen } from '../screens/RolePreviewScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../theme/tokens';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const { user, isInitializing } = useAuth();

  // Session initialization state: display branded loading indicator while validating stored token
  if (isInitializing) {
    return (
      <View
        style={styles.loadingContainer}
        accessibilityRole="progressbar"
        accessibilityLabel="Initializing session"
        testID="session-loading"
      >
        <View style={styles.loadingLogoBadge} accessibilityLabel="AthleteConnect Logo">
          <Zap size={32} color={COLORS.navy} fill={COLORS.navy} />
        </View>
        <Text style={styles.loadingBrandName}>AthleteConnect</Text>
        <Text style={styles.loadingTagline}>Your Sport. Your Coach. Your Space.</Text>
        <ActivityIndicator
          size="small"
          color={COLORS.navy}
          style={styles.loadingSpinner}
          testID="loading-spinner"
        />
      </View>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName={user ? 'Home' : 'Welcome'}
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: COLORS.mist },
      }}
    >
      {user ? (
        // Authenticated Stack
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ animation: 'fade' }}
        />
      ) : (
        // Unauthenticated Onboarding & Authentication Stack
        <>
          <Stack.Screen
            name="Welcome"
            component={WelcomeScreen}
            options={{ animation: 'fade' }}
          />
          <Stack.Screen
            name="RoleSelection"
            component={RoleSelectionScreen}
            options={{ animation: 'fade' }}
          />
          <Stack.Screen
            name="RolePreview"
            component={RolePreviewScreen}
          />
          <Stack.Screen
            name="Register"
            component={RegisterScreen}
          />
          <Stack.Screen
            name="Login"
            component={LoginScreen}
          />
        </>
      )}
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.mist,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  loadingLogoBadge: {
    width: 64,
    height: 64,
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
  loadingBrandName: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.navy,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  loadingTagline: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },
  loadingSpinner: {
    marginTop: SPACING.sm,
  },
});
