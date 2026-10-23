import { Platform } from 'react-native';

export const DEFAULT_SERVER_PORT = 5000;

/**
 * Resolves the backend API base URL based on runtime environment and platform.
 *
 * Requirements:
 * 1. Production builds: EXPO_PUBLIC_API_BASE_URL is strictly required. If missing, throws a clear configuration error when requested.
 *    Never falls back to unverified domains, localhost, or emulator addresses.
 * 2. Development with explicit override: EXPO_PUBLIC_API_BASE_URL is honored if provided.
 * 3. Development automatic host detection: attempts to read Metro/Expo host URI to reach host machine from physical devices.
 * 4. Development platform fallbacks:
 *    - Android emulator: http://10.0.2.2:5000 (Android's standard alias for host machine loopback)
 *    - iOS simulator / Web: http://localhost:5000
 */
export function getApiBaseUrl(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const envOverride = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

  // 1. Production check: explicit production API base URL is strictly required.
  // Fail safely with a clear configuration error if unconfigured. Never guess or fall back to localhost/emulator.
  if (isProduction) {
    if (!envOverride) {
      throw new Error(
        'Missing required production configuration: EXPO_PUBLIC_API_BASE_URL. In production builds, an explicit production API base URL must be configured.'
      );
    }
    return envOverride.replace(/\/+$/, '');
  }

  // 2. Explicit development override (trimmed of trailing slashes)
  if (envOverride) {
    return envOverride.replace(/\/+$/, '');
  }

  // 3. Development: Attempt to derive host from Expo runtime information (for physical devices over LAN)
  try {
    // Dynamically check for expo-constants if installed or available in Expo Go
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants')?.default;
    const hostUri =
      Constants?.expoConfig?.hostUri ||
      Constants?.manifest2?.extra?.expoGo?.debuggerHost ||
      Constants?.manifest?.debuggerHost;

    if (hostUri && typeof hostUri === 'string') {
      const host = hostUri.split(':')[0];
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return `http://${host}:${DEFAULT_SERVER_PORT}`;
      }
    }
  } catch {
    // expo-constants not present or not running in Expo host context; proceed to platform fallback
  }

  // 4. Platform-specific local development defaults:
  // Android emulator maps 10.0.2.2 to the development host machine's 127.0.0.1
  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${DEFAULT_SERVER_PORT}`;
  }

  // iOS simulator and Web browser share localhost with the host machine
  return `http://localhost:${DEFAULT_SERVER_PORT}`;
}

export const API_ENDPOINTS = {
  REGISTER: '/api/auth/register',
  LOGIN: '/api/auth/login',
  ME: '/api/auth/me',
} as const;
