import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const AUTH_TOKEN_KEY = 'athleteconnect_auth_token';

// In-memory token storage for web testing environment (never persisted to localStorage or unencrypted storage)
let memoryTokenStorage: string | null = null;

/**
 * Saves the authentication token securely.
 * On native platforms (iOS/Android): encrypted via Expo SecureStore (Keychain / Keystore).
 * On web: kept strictly in memory without local persistence.
 */
export async function saveToken(token: string): Promise<void> {
  if (!token || typeof token !== 'string') {
    throw new Error('Cannot save empty or invalid authentication token.');
  }

  if (Platform.OS === 'web') {
    memoryTokenStorage = token;
    return;
  }

  try {
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
  } catch {
    // Never print, log, or interpolate the token value
    throw new Error('Failed to save authentication token to secure storage.');
  }
}

/**
 * Retrieves the stored authentication token.
 * Returns null if no token exists or if a read error occurs.
 */
export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return memoryTokenStorage;
  }

  try {
    return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  } catch {
    // Fail closed safely without exposing details
    return null;
  }
}

/**
 * Deletes the stored authentication token.
 */
export async function removeToken(): Promise<void> {
  if (Platform.OS === 'web') {
    memoryTokenStorage = null;
    return;
  }

  try {
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  } catch {
    // Fail safely without logging secrets
    throw new Error('Failed to remove authentication token from secure storage.');
  }
}

/**
 * Internal helper to reset memory storage for test isolation.
 */
export function _resetMemoryStorageForTesting(): void {
  memoryTokenStorage = null;
}
