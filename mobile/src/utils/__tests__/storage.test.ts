import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  saveToken,
  getToken,
  removeToken,
  saveUserProfile,
  getUserProfile,
  removeUserProfile,
  saveRememberedPhone,
  getRememberedPhone,
  clearRememberedPhone,
  AUTH_TOKEN_KEY,
  USER_PROFILE_KEY,
  REMEMBERED_PHONE_KEY,
  _resetMemoryStorageForTesting,
} from '../storage';
import { UserProfile } from '../../services/authApi';

describe('Secure Storage Utility', () => {
  const sampleProfile: UserProfile = {
    _id: 'usr_999',
    name: 'Maya Coach',
    email: 'maya@athleteconnect.test',
    role: 'coach',
    isActive: true,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    _resetMemoryStorageForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetMemoryStorageForTesting();
  });

  describe('Native storage (Android and iOS)', () => {
    beforeEach(() => {
      // Simulate native platform
      Platform.OS = 'ios';
    });

    it('saves token using SecureStore on native platforms', async () => {
      const setItemSpy = vi.spyOn(SecureStore, 'setItemAsync').mockResolvedValue();

      await saveToken('sample_jwt_token_value_abc123');

      expect(setItemSpy).toHaveBeenCalledTimes(1);
      expect(setItemSpy).toHaveBeenCalledWith(AUTH_TOKEN_KEY, 'sample_jwt_token_value_abc123');
    });

    it('retrieves token using SecureStore on native platforms', async () => {
      vi.spyOn(SecureStore, 'getItemAsync').mockResolvedValue('sample_jwt_token_value_abc123');

      const token = await getToken();

      expect(token).toBe('sample_jwt_token_value_abc123');
    });

    it('removes token using SecureStore on native platforms', async () => {
      const deleteItemSpy = vi.spyOn(SecureStore, 'deleteItemAsync').mockResolvedValue();

      await removeToken();

      expect(deleteItemSpy).toHaveBeenCalledTimes(1);
      expect(deleteItemSpy).toHaveBeenCalledWith(AUTH_TOKEN_KEY);
    });

    it('handles SecureStore save errors without leaking secrets', async () => {
      vi.spyOn(SecureStore, 'setItemAsync').mockRejectedValue(new Error('Hardware Keystore Failure'));

      await expect(saveToken('secret_token')).rejects.toThrow(
        'Failed to save authentication token to secure storage.'
      );
    });

    it('handles SecureStore read errors by returning null safely', async () => {
      vi.spyOn(SecureStore, 'getItemAsync').mockRejectedValue(new Error('Keychain locked'));

      const token = await getToken();
      expect(token).toBeNull();
    });

    it('rejects empty or invalid token strings', async () => {
      await expect(saveToken('')).rejects.toThrow('Cannot save empty or invalid authentication token.');
      await expect(saveToken(null as any)).rejects.toThrow('Cannot save empty or invalid authentication token.');
    });

    it('saves, retrieves, and removes user profile snapshot via SecureStore', async () => {
      const setItemSpy = vi.spyOn(SecureStore, 'setItemAsync').mockResolvedValue();
      const getItemSpy = vi
        .spyOn(SecureStore, 'getItemAsync')
        .mockResolvedValue(JSON.stringify(sampleProfile));
      const deleteItemSpy = vi.spyOn(SecureStore, 'deleteItemAsync').mockResolvedValue();

      await saveUserProfile(sampleProfile);
      expect(setItemSpy).toHaveBeenCalledWith(USER_PROFILE_KEY, JSON.stringify(sampleProfile));

      const retrieved = await getUserProfile();
      expect(retrieved).toEqual(sampleProfile);
      expect(getItemSpy).toHaveBeenCalledWith(USER_PROFILE_KEY);

      await removeUserProfile();
      expect(deleteItemSpy).toHaveBeenCalledWith(USER_PROFILE_KEY);
    });

    it('saves, retrieves, and clears remembered phone via SecureStore', async () => {
      const setItemSpy = vi.spyOn(SecureStore, 'setItemAsync').mockResolvedValue();
      const getItemSpy = vi.spyOn(SecureStore, 'getItemAsync').mockResolvedValue('+1 555-019-2834');
      const deleteItemSpy = vi.spyOn(SecureStore, 'deleteItemAsync').mockResolvedValue();

      await saveRememberedPhone('+1 555-019-2834');
      expect(setItemSpy).toHaveBeenCalledWith(REMEMBERED_PHONE_KEY, '+1 555-019-2834');

      const phone = await getRememberedPhone();
      expect(phone).toBe('+1 555-019-2834');
      expect(getItemSpy).toHaveBeenCalledWith(REMEMBERED_PHONE_KEY);

      await clearRememberedPhone();
      expect(deleteItemSpy).toHaveBeenCalledWith(REMEMBERED_PHONE_KEY);
    });

    it('rejects invalid or empty remembered phone inputs', async () => {
      await expect(saveRememberedPhone('')).rejects.toThrow('Cannot save empty or invalid phone number.');
      await expect(saveRememberedPhone(null as any)).rejects.toThrow('Cannot save empty or invalid phone number.');
    });
  });

  describe('Web storage (Memory-only, zero persistence)', () => {
    beforeEach(() => {
      Platform.OS = 'web';
    });

    it('stores token strictly in memory on web without calling SecureStore', async () => {
      const setItemSpy = vi.spyOn(SecureStore, 'setItemAsync');
      const getItemSpy = vi.spyOn(SecureStore, 'getItemAsync');

      await saveToken('web_session_token');

      expect(setItemSpy).not.toHaveBeenCalled();

      const retrieved = await getToken();
      expect(retrieved).toBe('web_session_token');
      expect(getItemSpy).not.toHaveBeenCalled();
    });

    it('clears in-memory token on web on removeToken', async () => {
      await saveToken('web_session_token');
      expect(await getToken()).toBe('web_session_token');

      await removeToken();
      expect(await getToken()).toBeNull();
    });

    it('stores and retrieves user profile in memory on web', async () => {
      await saveUserProfile(sampleProfile);
      const retrieved = await getUserProfile();
      expect(retrieved).toEqual(sampleProfile);

      await removeUserProfile();
      expect(await getUserProfile()).toBeNull();
    });

    it('stores, retrieves, and clears remembered phone in memory on web', async () => {
      await saveRememberedPhone('+91 9876543210');
      const retrieved = await getRememberedPhone();
      expect(retrieved).toBe('+91 9876543210');

      await clearRememberedPhone();
      expect(await getRememberedPhone()).toBeNull();
    });
  });
});
