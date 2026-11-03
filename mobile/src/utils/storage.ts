import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { UserProfile } from '../services/authApi';

export const AUTH_TOKEN_KEY = 'athleteconnect_auth_token';
export const USER_PROFILE_KEY = 'athleteconnect_user_profile';
export const REMEMBERED_PHONE_KEY = 'athleteconnect_remembered_phone';

// In-memory token storage for web testing environment (never persisted to localStorage or unencrypted storage)
let memoryTokenStorage: string | null = null;
let memoryProfileStorage: string | null = null;
let memoryPhoneStorage: string | null = null;

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
 * Saves the user profile snapshot securely for offline session restoration.
 */
export async function saveUserProfile(profile: UserProfile): Promise<void> {
  if (!profile || typeof profile !== 'object' || !profile._id) {
    throw new Error('Cannot save empty or invalid user profile.');
  }

  const serialized = JSON.stringify(profile);

  if (Platform.OS === 'web') {
    memoryProfileStorage = serialized;
    return;
  }

  try {
    await SecureStore.setItemAsync(USER_PROFILE_KEY, serialized);
  } catch {
    throw new Error('Failed to save user profile to secure storage.');
  }
}

/**
 * Retrieves the cached user profile snapshot.
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  if (Platform.OS === 'web') {
    if (!memoryProfileStorage) return null;
    try {
      return JSON.parse(memoryProfileStorage) as UserProfile;
    } catch {
      return null;
    }
  }

  try {
    const raw = await SecureStore.getItemAsync(USER_PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

/**
 * Deletes the cached user profile snapshot.
 */
export async function removeUserProfile(): Promise<void> {
  if (Platform.OS === 'web') {
    memoryProfileStorage = null;
    return;
  }

  try {
    await SecureStore.deleteItemAsync(USER_PROFILE_KEY);
  } catch {
    throw new Error('Failed to remove user profile from secure storage.');
  }
}

/**
 * Saves a remembered phone number on this device for login convenience.
 * Never stores passwords or OTPs.
 */
export async function saveRememberedPhone(phone: string): Promise<void> {
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    throw new Error('Cannot save empty or invalid phone number.');
  }

  const cleanPhone = phone.trim();

  if (Platform.OS === 'web') {
    memoryPhoneStorage = cleanPhone;
    return;
  }

  try {
    await SecureStore.setItemAsync(REMEMBERED_PHONE_KEY, cleanPhone);
  } catch {
    throw new Error('Failed to save remembered phone number.');
  }
}

/**
 * Retrieves the remembered phone number on this device.
 */
export async function getRememberedPhone(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return memoryPhoneStorage;
  }

  try {
    return await SecureStore.getItemAsync(REMEMBERED_PHONE_KEY);
  } catch {
    return null;
  }
}

/**
 * Clears the remembered phone number on this device.
 */
export async function clearRememberedPhone(): Promise<void> {
  if (Platform.OS === 'web') {
    memoryPhoneStorage = null;
    return;
  }

  try {
    await SecureStore.deleteItemAsync(REMEMBERED_PHONE_KEY);
  } catch {
    throw new Error('Failed to clear remembered phone number.');
  }
}

/**
 * Internal helper to reset memory storage for test isolation.
 */
export function _resetMemoryStorageForTesting(): void {
  memoryTokenStorage = null;
  memoryProfileStorage = null;
  memoryPhoneStorage = null;
}
