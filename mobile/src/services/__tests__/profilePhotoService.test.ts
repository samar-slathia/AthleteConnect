import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import React from 'react';
import {
  pickProfilePhoto,
  persistProfilePhoto,
  getPersistedProfilePhoto,
  deletePersistedProfilePhoto,
  getProfilePhotoStorageKey,
  getProfilePhotoSyncKey,
  getProfilePhotoSyncMetadata,
  setProfilePhotoSyncMetadata,
  clearProfilePhotoSyncMetadata,
  uploadProfilePhotoToCloud,
  downloadProfilePhotoFromCloud,
  deleteProfilePhotoFromCloud,
  getPublicCoachPhotoUrl,
  useProfilePhoto,
  PROFILE_PHOTO_KEY_PREFIX,
  PROFILE_PHOTO_SYNC_KEY_PREFIX,
  MAX_PHOTO_BYTES,
  _resetProfilePhotoStorageForTesting,
} from '../profilePhotoService';
import { getApiBaseUrl } from '../../config/api';

// Hook harness to test React hook lifecycle in Node environment without heavy DOM dependencies
function createHookHarness<T>(hookFn: (props: any) => T, initialProps: any) {
  const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  let hooks: any[] = [];
  let hookIdx = 0;
  const effects: Array<() => void | (() => void)> = [];
  const cleanups: Array<(() => void) | void> = [];
  let currentProps = initialProps;
  let latestResult: T;

  const dispatcher = {
    useState(initial: any) {
      const idx = hookIdx++;
      if (hooks[idx] === undefined) {
        hooks[idx] = typeof initial === 'function' ? initial() : initial;
      }
      const setState = (action: any) => {
        hooks[idx] = typeof action === 'function' ? action(hooks[idx]) : action;
      };
      return [hooks[idx], setState];
    },
    useRef(initial: any) {
      const idx = hookIdx++;
      if (hooks[idx] === undefined) {
        hooks[idx] = { current: initial };
      }
      return hooks[idx];
    },
    useCallback(fn: any) {
      const idx = hookIdx++;
      hooks[idx] = fn;
      return fn;
    },
    useEffect(fn: any, deps?: any[]) {
      const idx = hookIdx++;
      const prev = hooks[idx];
      const hasChanged =
        !prev ||
        !deps ||
        deps.some((dep: any, i: number) => !Object.is(dep, prev.deps?.[i]));
      if (hasChanged) {
        hooks[idx] = { deps };
        effects.push(fn);
      }
    },
    useContext() {
      return null;
    },
  };

  const originalDispatcher = internals.H;

  const render = async (newProps?: any): Promise<T> => {
    internals.H = dispatcher;
    hookIdx = 0;
    if (newProps !== undefined) {
      currentProps = newProps;
    }
    latestResult = hookFn(currentProps);

    while (effects.length > 0) {
      const effect = effects.shift()!;
      const cleanup = effect();
      if (typeof cleanup === 'function') {
        cleanups.push(cleanup);
      }
    }

    // Allow pending microtasks to resolve
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Re-run hook function with updated states
    hookIdx = 0;
    latestResult = hookFn(currentProps);
    return latestResult;
  };

  const getResult = (): T => {
    internals.H = dispatcher;
    hookIdx = 0;
    return hookFn(currentProps);
  };

  const cleanup = () => {
    cleanups.forEach((c) => c && c());
    internals.H = originalDispatcher;
  };

  return { render, getResult, cleanup };
}

describe('Profile Photo Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetProfilePhotoStorageForTesting();
    Platform.OS = 'ios';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetProfilePhotoStorageForTesting();
  });

  describe('Storage Keys and User Isolation', () => {
    it('generates user-specific storage keys using prefix and user ID', () => {
      const key1 = getProfilePhotoStorageKey('usr_parent_1');
      const key2 = getProfilePhotoStorageKey('usr_coach_2');

      expect(key1).toBe(`${PROFILE_PHOTO_KEY_PREFIX}usr_parent_1`);
      expect(key2).toBe(`${PROFILE_PHOTO_KEY_PREFIX}usr_coach_2`);
      expect(key1).not.toBe(key2);
    });

    it('rejects invalid or empty user IDs for storage key', () => {
      expect(() => getProfilePhotoStorageKey('')).toThrow(
        'Valid user ID is required to generate profile photo storage key.'
      );
      expect(() => getProfilePhotoStorageKey('   ')).toThrow(
        'Valid user ID is required to generate profile photo storage key.'
      );
      expect(() => getProfilePhotoStorageKey(null as any)).toThrow(
        'Valid user ID is required to generate profile photo storage key.'
      );
    });

    it('generates user-specific sync metadata keys using prefix and user ID', () => {
      const syncKey1 = getProfilePhotoSyncKey('usr_parent_1');
      const syncKey2 = getProfilePhotoSyncKey('usr_coach_2');

      expect(syncKey1).toBe(`${PROFILE_PHOTO_SYNC_KEY_PREFIX}usr_parent_1`);
      expect(syncKey2).toBe(`${PROFILE_PHOTO_SYNC_KEY_PREFIX}usr_coach_2`);
      expect(syncKey1).not.toBe(syncKey2);
    });

    it('rejects invalid or empty user IDs for sync key', () => {
      expect(() => getProfilePhotoSyncKey('')).toThrow(
        'Valid user ID is required to generate profile photo sync key.'
      );
    });
  });

  describe('Sync Metadata Management', () => {
    it('sets, retrieves, and clears sync metadata safely in SecureStore', async () => {
      const userId = 'usr_sync_test';
      const syncKey = getProfilePhotoSyncKey(userId);

      const metadata = {
        photoUpdatedAt: '2026-10-30T10:00:00.000Z',
        syncedAt: 1730000000000,
        isDeletedLocally: false,
      };

      const setSpy = vi.spyOn(SecureStore, 'setItemAsync').mockResolvedValue();
      const getSpy = vi.spyOn(SecureStore, 'getItemAsync').mockResolvedValue(JSON.stringify(metadata));
      const deleteSpy = vi.spyOn(SecureStore, 'deleteItemAsync').mockResolvedValue();

      await setProfilePhotoSyncMetadata(userId, metadata);
      expect(setSpy).toHaveBeenCalledWith(syncKey, JSON.stringify(metadata));

      const retrieved = await getProfilePhotoSyncMetadata(userId);
      expect(getSpy).toHaveBeenCalledWith(syncKey);
      expect(retrieved).toEqual(metadata);

      await clearProfilePhotoSyncMetadata(userId);
      expect(deleteSpy).toHaveBeenCalledWith(syncKey);
    });

    it('returns null when sync metadata does not exist or userId is invalid', async () => {
      expect(await getProfilePhotoSyncMetadata('')).toBeNull();
      vi.spyOn(SecureStore, 'getItemAsync').mockResolvedValue(null);
      expect(await getProfilePhotoSyncMetadata('usr_missing')).toBeNull();
    });
  });

  describe('Public Coach Photo URL Helper', () => {
    it('constructs public coach photo stream URL correctly', () => {
      const url = getPublicCoachPhotoUrl('coach_456');
      expect(url).toBe(`${getApiBaseUrl()}/api/coaches/coach_456/photo`);
    });

    it('returns empty string for missing or whitespace coach ID', () => {
      expect(getPublicCoachPhotoUrl('')).toBe('');
      expect(getPublicCoachPhotoUrl('   ')).toBe('');
      expect(getPublicCoachPhotoUrl(null as any)).toBe('');
    });
  });

  describe('Image Selection via ImagePicker', () => {
    it('handles permission denial gracefully with user-friendly error message', async () => {
      const reqSpy = vi
        .spyOn(ImagePicker, 'requestMediaLibraryPermissionsAsync')
        .mockResolvedValue({
          status: ImagePicker.PermissionStatus.DENIED,
          granted: false,
          canAskAgain: true,
          expires: 'never',
        });
      const launchSpy = vi.spyOn(ImagePicker, 'launchImageLibraryAsync');

      const result = await pickProfilePhoto();

      expect(reqSpy).toHaveBeenCalledTimes(1);
      expect(launchSpy).not.toHaveBeenCalled();
      expect(result.canceled).toBe(true);
      expect(result.error).toContain('Photo library permission is required');
    });

    it('handles user cancellation in image picker without throwing errors', async () => {
      vi.spyOn(ImagePicker, 'requestMediaLibraryPermissionsAsync').mockResolvedValue({
        status: ImagePicker.PermissionStatus.GRANTED,
        granted: true,
        canAskAgain: true,
        expires: 'never',
      });
      vi.spyOn(ImagePicker, 'launchImageLibraryAsync').mockResolvedValue({
        canceled: true,
        assets: null,
      });

      const result = await pickProfilePhoto();

      expect(result.canceled).toBe(true);
      expect(result.uri).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it('requests square crop, compression, and image-only media types upon selection', async () => {
      vi.spyOn(ImagePicker, 'requestMediaLibraryPermissionsAsync').mockResolvedValue({
        status: ImagePicker.PermissionStatus.GRANTED,
        granted: true,
        canAskAgain: true,
        expires: 'never',
      });

      const launchSpy = vi
        .spyOn(ImagePicker, 'launchImageLibraryAsync')
        .mockResolvedValue({
          canceled: false,
          assets: [
            {
              uri: 'file:///data/user/0/cache/picker_photo.jpg',
              width: 800,
              height: 800,
            } as any,
          ],
        });

      const result = await pickProfilePhoto();

      expect(launchSpy).toHaveBeenCalledWith({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        allowsMultipleSelection: false,
      });
      expect(result.canceled).toBe(false);
      expect(result.uri).toBe('file:///data/user/0/cache/picker_photo.jpg');
    });
  });

  describe('Local Photo Persistence', () => {
    it('copies selected image to app profile_photos directory and updates SecureStore', async () => {
      const getInfoSpy = vi.spyOn(FileSystem, 'getInfoAsync').mockResolvedValue({
        exists: false,
        isDirectory: false,
      } as any);
      const makeDirSpy = vi.spyOn(FileSystem, 'makeDirectoryAsync').mockResolvedValue();
      const copySpy = vi.spyOn(FileSystem, 'copyAsync').mockResolvedValue();
      const secureStoreSet = vi.spyOn(SecureStore, 'setItemAsync').mockResolvedValue();

      const sourceUri = 'file:///data/cache/selected_photo.jpg';
      const persistentPath = await persistProfilePhoto('usr_athlete_1', sourceUri);

      expect(persistentPath).toContain('file:///mock/app/documents/profile_photos/photo_usr_athlete_1_');
      expect(makeDirSpy).toHaveBeenCalledWith('file:///mock/app/documents/profile_photos/', {
        intermediates: true,
      });
      expect(copySpy).toHaveBeenCalledWith({
        from: sourceUri,
        to: persistentPath,
      });
      expect(secureStoreSet).toHaveBeenCalledWith(
        `${PROFILE_PHOTO_KEY_PREFIX}usr_athlete_1`,
        persistentPath
      );
    });

    it('safely replaces existing photo by copying new photo before deleting old photo', async () => {
      const previousPath = 'file:///mock/app/documents/profile_photos/photo_usr_athlete_1_old.jpg';
      vi.spyOn(SecureStore, 'getItemAsync').mockResolvedValue(previousPath);
      vi.spyOn(FileSystem, 'getInfoAsync').mockResolvedValue({ exists: true } as any);
      vi.spyOn(FileSystem, 'copyAsync').mockResolvedValue();
      vi.spyOn(SecureStore, 'setItemAsync').mockResolvedValue();
      const deleteAsyncSpy = vi.spyOn(FileSystem, 'deleteAsync').mockResolvedValue();

      const newSource = 'file:///data/cache/new_selected_photo.jpg';
      const persistentPath = await persistProfilePhoto('usr_athlete_1', newSource);

      expect(persistentPath).not.toBe(previousPath);
      expect(deleteAsyncSpy).toHaveBeenCalledWith(previousPath, { idempotent: true });
    });

    it('preserves existing photo unchanged if copying fails during replacement', async () => {
      const previousPath = 'file:///mock/app/documents/profile_photos/photo_usr_athlete_1_old.jpg';
      vi.spyOn(SecureStore, 'getItemAsync').mockResolvedValue(previousPath);
      vi.spyOn(FileSystem, 'getInfoAsync').mockResolvedValue({ exists: true } as any);
      vi.spyOn(FileSystem, 'copyAsync').mockRejectedValue(new Error('Disk full write failure'));
      const deleteAsyncSpy = vi.spyOn(FileSystem, 'deleteAsync');
      const secureStoreSet = vi.spyOn(SecureStore, 'setItemAsync');

      await expect(
        persistProfilePhoto('usr_athlete_1', 'file:///data/cache/new.jpg')
      ).rejects.toThrow('Disk full write failure');

      expect(deleteAsyncSpy).not.toHaveBeenCalled();
      expect(secureStoreSet).not.toHaveBeenCalled();
    });
  });

  describe('Retrieving Persisted Profile Photos', () => {
    it('returns verified photo path when file exists on disk', async () => {
      const storedPath = 'file:///mock/app/documents/profile_photos/photo_usr_verified.jpg';
      vi.spyOn(SecureStore, 'getItemAsync').mockResolvedValue(storedPath);
      vi.spyOn(FileSystem, 'getInfoAsync').mockResolvedValue({
        exists: true,
        isDirectory: false,
      } as any);

      const path = await getPersistedProfilePhoto('usr_verified');
      expect(path).toBe(storedPath);
    });

    it('clears stale key and returns null if referenced file is missing from disk', async () => {
      const missingPath = 'file:///mock/app/documents/profile_photos/missing_photo.jpg';
      vi.spyOn(SecureStore, 'getItemAsync').mockResolvedValue(missingPath);
      vi.spyOn(FileSystem, 'getInfoAsync').mockResolvedValue({
        exists: false,
        isDirectory: false,
      } as any);
      const deleteKeySpy = vi.spyOn(SecureStore, 'deleteItemAsync').mockResolvedValue();

      const path = await getPersistedProfilePhoto('usr_missing_file');
      expect(path).toBeNull();
      expect(deleteKeySpy).toHaveBeenCalledWith(`${PROFILE_PHOTO_KEY_PREFIX}usr_missing_file`);
    });

    it('returns null safely when userId is invalid', async () => {
      expect(await getPersistedProfilePhoto('')).toBeNull();
      expect(await getPersistedProfilePhoto(null as any)).toBeNull();
    });
  });

  describe('Deleting Persisted Profile Photos', () => {
    it('removes file from disk and deletes SecureStore key', async () => {
      const filePath = 'file:///mock/app/documents/profile_photos/photo_usr_100.jpg';
      vi.spyOn(SecureStore, 'getItemAsync').mockResolvedValue(filePath);
      const deleteKeySpy = vi.spyOn(SecureStore, 'deleteItemAsync').mockResolvedValue();
      const deleteFileSpy = vi.spyOn(FileSystem, 'deleteAsync').mockResolvedValue();

      await deletePersistedProfilePhoto('usr_100');

      expect(deleteKeySpy).toHaveBeenCalledWith(`${PROFILE_PHOTO_KEY_PREFIX}usr_100`);
      expect(deleteFileSpy).toHaveBeenCalledWith(filePath, { idempotent: true });
    });

    it('handles delete gracefully when no photo was stored', async () => {
      vi.spyOn(SecureStore, 'getItemAsync').mockResolvedValue(null);
      const deleteFileSpy = vi.spyOn(FileSystem, 'deleteAsync');

      await deletePersistedProfilePhoto('usr_none');

      expect(deleteFileSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Cloud API Operations
  // =========================================================================
  describe('uploadProfilePhotoToCloud', () => {
    const validToken = 'test-auth-token';
    const localUri = 'file:///mock/app/documents/profile_photos/avatar.jpg';

    it('rejects missing or empty token', async () => {
      await expect(uploadProfilePhotoToCloud('', localUri)).rejects.toThrow(
        'Authentication token is required'
      );
      await expect(uploadProfilePhotoToCloud(null as any, localUri)).rejects.toThrow(
        'Authentication token is required'
      );
    });

    it('rejects missing or empty localUri', async () => {
      await expect(uploadProfilePhotoToCloud(validToken, '')).rejects.toThrow(
        'Valid local image URI is required'
      );
    });

    it('rejects oversized photos exceeding 2 MB limit before upload', async () => {
      vi.spyOn(FileSystem, 'getInfoAsync').mockResolvedValue({
        exists: true,
        size: MAX_PHOTO_BYTES + 1024,
      } as any);

      await expect(uploadProfilePhotoToCloud(validToken, localUri)).rejects.toThrow(
        'File size exceeds the 2 MB limit.'
      );
    });

    it('successfully uploads photo via FileSystem.uploadAsync on native', async () => {
      vi.spyOn(FileSystem, 'getInfoAsync').mockResolvedValue({
        exists: true,
        size: 500000,
      } as any);

      const uploadSpy = vi.spyOn(FileSystem, 'uploadAsync').mockResolvedValue({
        status: 200,
        body: JSON.stringify({
          message: 'Profile photo uploaded successfully.',
          photoUrl: '/api/users/me/photo',
          photoUpdatedAt: '2026-10-30T12:00:00.000Z',
        }),
        headers: {},
      } as any);

      const response = await uploadProfilePhotoToCloud(validToken, localUri);

      expect(uploadSpy).toHaveBeenCalledWith(
        `${getApiBaseUrl()}/api/users/me/photo`,
        localUri,
        expect.objectContaining({
          httpMethod: 'POST',
          fieldName: 'photo',
          headers: {
            Authorization: `Bearer ${validToken}`,
            Accept: 'application/json',
          },
        })
      );
      expect(response.photoUpdatedAt).toBe('2026-10-30T12:00:00.000Z');
    });

    it('handles backend error responses from uploadAsync gracefully', async () => {
      vi.spyOn(FileSystem, 'getInfoAsync').mockResolvedValue({
        exists: true,
        size: 500000,
      } as any);

      vi.spyOn(FileSystem, 'uploadAsync').mockResolvedValue({
        status: 400,
        body: JSON.stringify({ error: 'Unsupported or spoofed image signature.' }),
        headers: {},
      } as any);

      await expect(uploadProfilePhotoToCloud(validToken, localUri)).rejects.toThrow(
        'Unsupported or spoofed image signature.'
      );
    });

    it('handles web platform upload via fetch', async () => {
      Platform.OS = 'web';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message: 'Profile photo uploaded successfully.',
          photoUrl: '/api/users/me/photo',
          photoUpdatedAt: '2026-10-30T12:00:00.000Z',
        }),
      } as any);

      const response = await uploadProfilePhotoToCloud(validToken, 'blob:photo');
      expect(fetchSpy).toHaveBeenCalled();
      expect(response.message).toContain('Profile photo uploaded successfully.');
    });
  });

  describe('downloadProfilePhotoFromCloud', () => {
    const validToken = 'test-auth-token';
    const userId = 'usr_cloud_download';

    it('returns null if userId or token is empty', async () => {
      expect(await downloadProfilePhotoFromCloud('', validToken)).toBeNull();
      expect(await downloadProfilePhotoFromCloud(userId, '')).toBeNull();
    });

    it('downloads photo via FileSystem.downloadAsync on native and updates storage and sync metadata', async () => {
      const downloadSpy = vi.spyOn(FileSystem, 'downloadAsync').mockResolvedValue({
        status: 200,
        uri: 'file:///mock/app/documents/profile_photos/downloaded.jpg',
        headers: {},
      } as any);
      const secureStoreSet = vi.spyOn(SecureStore, 'setItemAsync').mockResolvedValue();

      const downloaded = await downloadProfilePhotoFromCloud(
        userId,
        validToken,
        '2026-10-30T13:00:00.000Z'
      );

      expect(downloadSpy).toHaveBeenCalledWith(
        `${getApiBaseUrl()}/api/users/me/photo`,
        expect.stringContaining('photo_usr_cloud_download_'),
        {
          headers: {
            Authorization: `Bearer ${validToken}`,
          },
        }
      );
      expect(downloaded).toContain('photo_usr_cloud_download_');
      expect(secureStoreSet).toHaveBeenCalledWith(
        getProfilePhotoStorageKey(userId),
        expect.any(String)
      );
    });

    it('returns null when cloud photo does not exist (404)', async () => {
      vi.spyOn(FileSystem, 'downloadAsync').mockResolvedValue({
        status: 404,
        uri: '',
        headers: {},
      } as any);

      const downloaded = await downloadProfilePhotoFromCloud(userId, validToken);
      expect(downloaded).toBeNull();
    });

    it('throws error when download returns server error', async () => {
      vi.spyOn(FileSystem, 'downloadAsync').mockResolvedValue({
        status: 500,
        uri: '',
        headers: {},
      } as any);

      await expect(downloadProfilePhotoFromCloud(userId, validToken)).rejects.toThrow(
        'Download failed with status 500'
      );
    });
  });

  describe('deleteProfilePhotoFromCloud', () => {
    it('calls DELETE /api/users/me/photo with Bearer token', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ message: 'Profile photo deleted successfully.' }),
      } as any);

      await deleteProfilePhotoFromCloud('test-token');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${getApiBaseUrl()}/api/users/me/photo`,
        expect.objectContaining({
          method: 'DELETE',
          headers: {
            Authorization: 'Bearer test-token',
            Accept: 'application/json',
          },
        })
      );
    });

    it('succeeds silently if token is empty or server returns 404', async () => {
      await deleteProfilePhotoFromCloud('');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
      } as any);

      await expect(deleteProfilePhotoFromCloud('test-token')).resolves.not.toThrow();
    });

    it('throws descriptive error on server error during cloud delete', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal database delete error' }),
      } as any);

      await expect(deleteProfilePhotoFromCloud('test-token')).rejects.toThrow(
        'Internal database delete error'
      );
    });
  });

  // =========================================================================
  // Hook Lifecycle & Synchronization Integration Tests
  // =========================================================================
  describe('useProfilePhoto Hook Synchronization', () => {
    const parentUserId = 'usr_parent_sync';
    const coachUserId = 'usr_coach_sync';
    const individualUserId = 'usr_individual_sync';
    const token = 'active-jwt-token';

    it('local-first upload: immediately saves locally and asynchronously triggers cloud upload', async () => {
      const localFile = 'file:///mock/app/documents/profile_photos/photo_local.jpg';
      vi.spyOn(FileSystem, 'copyAsync').mockResolvedValue();
      vi.spyOn(SecureStore, 'setItemAsync').mockResolvedValue();

      vi.spyOn(ImagePicker, 'requestMediaLibraryPermissionsAsync').mockResolvedValue({
        granted: true,
        status: ImagePicker.PermissionStatus.GRANTED,
        canAskAgain: true,
        expires: 'never',
      });
      vi.spyOn(ImagePicker, 'launchImageLibraryAsync').mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///cache/selected.jpg' } as any],
      });

      const uploadAsyncSpy = vi.spyOn(FileSystem, 'uploadAsync').mockResolvedValue({
        status: 200,
        body: JSON.stringify({
          message: 'Profile photo uploaded successfully.',
          photoUrl: '/api/users/me/photo',
          photoUpdatedAt: '2026-10-30T15:00:00.000Z',
        }),
        headers: {},
      } as any);

      const harness = createHookHarness(
        (props) => useProfilePhoto(props.userId, props.token),
        { userId: parentUserId, token }
      );

      const state = await harness.render();
      expect(state.photoUri).toBeNull();

      // Pick and save
      const pickedUri = await state.pickAndSavePhoto();
      expect(pickedUri).toBeDefined();

      // Check immediate local update
      const updatedState = harness.getResult();
      expect(updatedState.photoUri).toBe(pickedUri);

      // Allow background upload to complete
      await new Promise((r) => setTimeout(r, 10));

      expect(uploadAsyncSpy).toHaveBeenCalled();
      const finalState = harness.getResult();
      expect(finalState.syncStatus).toBe('synced');
      expect(finalState.error).toBeNull();

      harness.cleanup();
    });

    it('safe retention: retains local photo when cloud upload fails and exposes retry', async () => {
      vi.spyOn(FileSystem, 'copyAsync').mockResolvedValue();
      vi.spyOn(SecureStore, 'setItemAsync').mockResolvedValue();

      vi.spyOn(ImagePicker, 'requestMediaLibraryPermissionsAsync').mockResolvedValue({
        granted: true,
        status: ImagePicker.PermissionStatus.GRANTED,
        canAskAgain: true,
        expires: 'never',
      });
      vi.spyOn(ImagePicker, 'launchImageLibraryAsync').mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///cache/selected.jpg' } as any],
      });

      // Simulated network failure on cloud upload
      vi.spyOn(FileSystem, 'uploadAsync').mockRejectedValue(new Error('Network request failed'));

      const harness = createHookHarness(
        (props) => useProfilePhoto(props.userId, props.token),
        { userId: individualUserId, token }
      );

      const state = await harness.render();
      const pickedUri = await state.pickAndSavePhoto();

      await new Promise((r) => setTimeout(r, 10));

      const finalState = harness.getResult();
      // CRITICAL: Local photo is NOT deleted!
      expect(finalState.photoUri).toBe(pickedUri);
      expect(finalState.syncStatus).toBe('local_only');
      expect(finalState.error).toContain('Network request failed');

      // Now retry upload successfully
      vi.spyOn(FileSystem, 'uploadAsync').mockResolvedValue({
        status: 200,
        body: JSON.stringify({
          message: 'Profile photo uploaded successfully.',
          photoUrl: '/api/users/me/photo',
          photoUpdatedAt: '2026-10-30T15:00:00.000Z',
        }),
        headers: {},
      } as any);

      await finalState.retrySync();
      await new Promise((r) => setTimeout(r, 10));

      const retriedState = harness.getResult();
      expect(retriedState.syncStatus).toBe('synced');
      expect(retriedState.error).toBeNull();

      harness.cleanup();
    });

    it('cross-device restoration: restores cloud photo on new device when local photo is missing', async () => {
      // Local storage has no photo
      vi.spyOn(SecureStore, 'getItemAsync').mockResolvedValue(null);

      const downloadSpy = vi.spyOn(FileSystem, 'downloadAsync').mockResolvedValue({
        status: 200,
        uri: 'file:///mock/app/documents/profile_photos/downloaded.jpg',
        headers: {},
      } as any);

      const harness = createHookHarness(
        (props) => useProfilePhoto(props.userId, props.token, props.remotePhotoUpdatedAt),
        {
          userId: coachUserId,
          token,
          remotePhotoUpdatedAt: '2026-10-30T16:00:00.000Z',
        }
      );

      const state = await harness.render();

      expect(downloadSpy).toHaveBeenCalled();
      expect(state.photoUri).toBeDefined();
      expect(state.syncStatus).toBe('synced');

      harness.cleanup();
    });

    it('remote photo replacement: downloads fresh cloud photo when remotePhotoUpdatedAt differs from local sync metadata', async () => {
      const existingLocalPath = 'file:///mock/app/documents/profile_photos/existing.jpg';
      vi.spyOn(SecureStore, 'getItemAsync').mockImplementation(async (key: string) => {
        if (key.includes(PROFILE_PHOTO_SYNC_KEY_PREFIX)) {
          return JSON.stringify({
            photoUpdatedAt: '2026-10-29T00:00:00.000Z', // older timestamp
            syncedAt: 1729000000000,
          });
        }
        return existingLocalPath;
      });
      vi.spyOn(FileSystem, 'getInfoAsync').mockResolvedValue({ exists: true } as any);

      const downloadSpy = vi.spyOn(FileSystem, 'downloadAsync').mockResolvedValue({
        status: 200,
        uri: 'file:///mock/app/documents/profile_photos/updated_remote.jpg',
        headers: {},
      } as any);

      const harness = createHookHarness(
        (props) => useProfilePhoto(props.userId, props.token, props.remotePhotoUpdatedAt),
        {
          userId: parentUserId,
          token,
          remotePhotoUpdatedAt: '2026-10-30T18:00:00.000Z', // newer timestamp from backend
        }
      );

      await harness.render();

      expect(downloadSpy).toHaveBeenCalled();
      const updatedState = harness.getResult();
      expect(updatedState.syncStatus).toBe('synced');

      harness.cleanup();
    });

    it('account switching isolation and logout: unloads previous user photo and resets on logout', async () => {
      // User A has photo A
      vi.spyOn(SecureStore, 'getItemAsync').mockImplementation(async (key: string) => {
        if (key.includes('user_A')) return 'file:///photos/user_A.jpg';
        if (key.includes('user_B')) return 'file:///photos/user_B.jpg';
        return null;
      });
      vi.spyOn(FileSystem, 'getInfoAsync').mockResolvedValue({ exists: true } as any);

      const harness = createHookHarness(
        (props) => useProfilePhoto(props.userId, props.token),
        { userId: 'user_A', token }
      );

      const stateA = await harness.render();
      expect(stateA.photoUri).toBe('file:///photos/user_A.jpg');

      // Switch to User B
      const stateB = await harness.render({ userId: 'user_B', token });
      expect(stateB.photoUri).toBe('file:///photos/user_B.jpg');

      // Logout (userId = null)
      const stateLogout = await harness.render({ userId: null, token: null });
      expect(stateLogout.photoUri).toBeNull();
      expect(stateLogout.syncStatus).toBe('idle');

      harness.cleanup();
    });

    it('cloud deletion: clearPhoto removes local photo, sync metadata, and calls cloud delete', async () => {
      const existingPath = 'file:///mock/photos/photo.jpg';
      vi.spyOn(SecureStore, 'getItemAsync').mockResolvedValue(existingPath);
      vi.spyOn(FileSystem, 'getInfoAsync').mockResolvedValue({ exists: true } as any);

      const deleteLocalSpy = vi.spyOn(FileSystem, 'deleteAsync').mockResolvedValue();
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ message: 'Deleted' }),
      } as any);

      const harness = createHookHarness(
        (props) => useProfilePhoto(props.userId, props.token),
        { userId: parentUserId, token }
      );

      const state = await harness.render();
      await state.clearPhoto();

      expect(deleteLocalSpy).toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalledWith(
        `${getApiBaseUrl()}/api/users/me/photo`,
        expect.objectContaining({ method: 'DELETE' })
      );

      const finalState = harness.getResult();
      expect(finalState.photoUri).toBeNull();
      expect(finalState.syncStatus).toBe('idle');

      harness.cleanup();
    });

    it('works seamlessly across Parent, Individual, and Coach roles', async () => {
      const roles = ['usr_parent_role', 'usr_individual_role', 'usr_coach_role'];

      for (const roleId of roles) {
        vi.spyOn(SecureStore, 'getItemAsync').mockResolvedValue(`file:///mock/photos/${roleId}.jpg`);
        vi.spyOn(FileSystem, 'getInfoAsync').mockResolvedValue({ exists: true } as any);

        const harness = createHookHarness(
          (props) => useProfilePhoto(props.userId, props.token),
          { userId: roleId, token }
        );

        const state = await harness.render();
        expect(state.photoUri).toBe(`file:///mock/photos/${roleId}.jpg`);
        expect(state.syncStatus).toBe('synced');

        harness.cleanup();
      }
    });
  });
});
