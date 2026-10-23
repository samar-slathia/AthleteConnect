import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  saveToken,
  getToken,
  removeToken,
  AUTH_TOKEN_KEY,
  _resetMemoryStorageForTesting,
} from '../storage';

describe('Secure Token Storage Utility', () => {
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
  });
});
