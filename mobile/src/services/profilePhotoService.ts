import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { getApiBaseUrl, API_ENDPOINTS } from '../config/api';
import { AuthContext } from '../context/AuthContext';
import { handleProtectedResponseError } from './authEvents';

export const PROFILE_PHOTO_KEY_PREFIX = 'athleteconnect_profile_photo_';
export const PROFILE_PHOTO_SYNC_KEY_PREFIX = 'athleteconnect_profile_photo_sync_';
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB backend limit

// In-memory storage for web testing environment (isolated per key)
let memoryPhotoStorage: Record<string, string> = {};
let memorySyncMetadataStorage: Record<string, string> = {};

/**
 * Returns the isolated SecureStore key for a specific user's local photo.
 */
export function getProfilePhotoStorageKey(userId: string): string {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('Valid user ID is required to generate profile photo storage key.');
  }
  return `${PROFILE_PHOTO_KEY_PREFIX}${userId.trim()}`;
}

/**
 * Returns the isolated SecureStore key for a specific user's sync metadata.
 */
export function getProfilePhotoSyncKey(userId: string): string {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('Valid user ID is required to generate profile photo sync key.');
  }
  return `${PROFILE_PHOTO_SYNC_KEY_PREFIX}${userId.trim()}`;
}

export interface ProfilePhotoSyncMetadata {
  photoUpdatedAt: string | null;
  syncedAt: number;
  isDeletedLocally?: boolean;
}

export interface UploadPhotoResponse {
  message: string;
  photoUrl: string;
  photoUpdatedAt: string;
}

/**
 * Reads the sync metadata for a user account from SecureStore.
 */
export async function getProfilePhotoSyncMetadata(
  userId: string
): Promise<ProfilePhotoSyncMetadata | null> {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return null;
  }

  const syncKey = getProfilePhotoSyncKey(userId);
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web') {
      raw = memorySyncMetadataStorage[syncKey] || null;
    } else {
      raw = await SecureStore.getItemAsync(syncKey);
    }

    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Persists the sync metadata for a user account into SecureStore.
 */
export async function setProfilePhotoSyncMetadata(
  userId: string,
  metadata: ProfilePhotoSyncMetadata
): Promise<void> {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return;
  }

  const syncKey = getProfilePhotoSyncKey(userId);
  const raw = JSON.stringify(metadata);

  try {
    if (Platform.OS === 'web') {
      memorySyncMetadataStorage[syncKey] = raw;
    } else {
      await SecureStore.setItemAsync(syncKey, raw);
    }
  } catch {
    // Fail silently on storage writes
  }
}

/**
 * Removes the sync metadata for a user account from SecureStore.
 */
export async function clearProfilePhotoSyncMetadata(userId: string): Promise<void> {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return;
  }

  const syncKey = getProfilePhotoSyncKey(userId);
  try {
    if (Platform.OS === 'web') {
      delete memorySyncMetadataStorage[syncKey];
    } else {
      await SecureStore.deleteItemAsync(syncKey);
    }
  } catch {
    // Fail silently on deletion
  }
}

/**
 * Constructs the public URL for a coach's photo stream.
 */
export function getPublicCoachPhotoUrl(coachId: string): string {
  if (!coachId || typeof coachId !== 'string' || !coachId.trim()) {
    return '';
  }
  return `${getApiBaseUrl()}${API_ENDPOINTS.COACH_PHOTO(coachId.trim())}`;
}

/**
 * Uploads a local photo to the authenticated user's cloud GridFS storage.
 * POST /api/users/me/photo
 */
export async function uploadProfilePhotoToCloud(
  token: string,
  localUri: string
): Promise<UploadPhotoResponse> {
  if (!token || typeof token !== 'string' || !token.trim()) {
    throw new Error('Authentication token is required to upload profile photo.');
  }
  if (!localUri || typeof localUri !== 'string' || !localUri.trim()) {
    throw new Error('Valid local image URI is required to upload profile photo.');
  }

  // Pre-validate local file size (must not exceed 2 MB)
  if (FileSystem.documentDirectory && Platform.OS !== 'web') {
    try {
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (fileInfo.exists && typeof fileInfo.size === 'number' && fileInfo.size > MAX_PHOTO_BYTES) {
        throw new Error('File size exceeds the 2 MB limit.');
      }
    } catch (err: any) {
      if (err?.message?.includes('2 MB')) {
        throw err;
      }
    }
  }

  const url = `${getApiBaseUrl()}${API_ENDPOINTS.USER_PHOTO}`;

  // On Native (iOS/Android): Use FileSystem.uploadAsync if available for streaming multipart upload
  if (FileSystem.uploadAsync && Platform.OS !== 'web') {
    const res = await FileSystem.uploadAsync(url, localUri, {
      httpMethod: 'POST',
      uploadType: (FileSystem as any).FileSystemUploadType?.MULTIPART ?? 1,
      fieldName: 'photo',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: 'application/json',
      },
    });

    if (res.status !== 200) {
      let errorMsg = `Upload failed with status ${res.status}.`;
      let code: string | undefined;
      try {
        const body = JSON.parse(res.body);
        if (body && typeof body.error === 'string') {
          errorMsg = body.error;
        }
        if (body && typeof body.code === 'string') {
          code = body.code;
        }
      } catch {}
      handleProtectedResponseError(res.status, errorMsg, token.trim(), code);
      throw new Error(errorMsg);
    }

    return JSON.parse(res.body);
  }

  // Fallback for Web / testing environments: use fetch with FormData
  const formData = new FormData();
  formData.append('photo', {
    uri: localUri,
    name: 'photo.jpg',
    type: 'image/jpeg',
  } as any);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/json',
    },
    body: formData,
  });

  if (!response.ok) {
    let errorMsg = `Upload failed with status ${response.status}.`;
    let code: string | undefined;
    try {
      const data = await response.json();
      if (data && typeof data.error === 'string') {
        errorMsg = data.error;
      }
      if (data && typeof data.code === 'string') {
        code = data.code;
      }
    } catch {}
    handleProtectedResponseError(response.status, errorMsg, token.trim(), code);
    throw new Error(errorMsg);
  }

  return (await response.json()) as UploadPhotoResponse;
}

/**
 * Downloads the authenticated user's photo from cloud GridFS storage and saves it locally.
 * GET /api/users/me/photo
 */
export async function downloadProfilePhotoFromCloud(
  userId: string,
  token: string,
  remotePhotoUpdatedAt?: string | null
): Promise<string | null> {
  if (!userId || !token) return null;

  const url = `${getApiBaseUrl()}${API_ENDPOINTS.USER_PHOTO}`;

  // On native platforms with documentDirectory:
  if (FileSystem.documentDirectory && Platform.OS !== 'web') {
    const photosDir = `${FileSystem.documentDirectory}profile_photos/`;
    try {
      const dirInfo = await FileSystem.getInfoAsync(photosDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(photosDir, { intermediates: true });
      }
    } catch {}

    const targetFilename = `photo_${userId.trim()}_${Date.now()}.jpg`;
    const targetPath = `${photosDir}${targetFilename}`;

    if (FileSystem.downloadAsync) {
      const downloadRes = await FileSystem.downloadAsync(url, targetPath, {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
        },
      });

      if (downloadRes.status === 200) {
        // Persist new local URI into SecureStore
        const storageKey = getProfilePhotoStorageKey(userId);
        await SecureStore.setItemAsync(storageKey, targetPath);

        // Update sync metadata
        await setProfilePhotoSyncMetadata(userId, {
          photoUpdatedAt: remotePhotoUpdatedAt || new Date().toISOString(),
          syncedAt: Date.now(),
        });

        return targetPath;
      } else if (downloadRes.status === 404) {
        return null;
      } else {
        handleProtectedResponseError(
          downloadRes.status,
          `Download failed with status ${downloadRes.status}.`,
          token.trim()
        );
        throw new Error(`Download failed with status ${downloadRes.status}.`);
      }
    }
  }

  // Web / testing fallback using fetch
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
    },
  });

  if (res.status === 200) {
    let objectUrl = url;
    if (typeof URL !== 'undefined' && URL.createObjectURL && typeof res.blob === 'function') {
      try {
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
      } catch {}
    }

    const storageKey = getProfilePhotoStorageKey(userId);
    memoryPhotoStorage[storageKey] = objectUrl;

    await setProfilePhotoSyncMetadata(userId, {
      photoUpdatedAt: remotePhotoUpdatedAt || new Date().toISOString(),
      syncedAt: Date.now(),
    });

    return objectUrl;
  } else if (res.status === 404) {
    return null;
  } else {
    let errorMsg = `Download failed with status ${res.status}.`;
    let code: string | undefined;
    try {
      const data = await res.json();
      if (data && typeof data.error === 'string') errorMsg = data.error;
      if (data && typeof data.code === 'string') code = data.code;
    } catch {}
    handleProtectedResponseError(res.status, errorMsg, token.trim(), code);
    throw new Error(errorMsg);
  }
}

/**
 * Deletes the authenticated user's photo from cloud GridFS storage.
 * DELETE /api/users/me/photo
 */
export async function deleteProfilePhotoFromCloud(token: string): Promise<void> {
  if (!token || typeof token !== 'string' || !token.trim()) {
    return;
  }

  const url = `${getApiBaseUrl()}${API_ENDPOINTS.USER_PHOTO}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok && res.status !== 404) {
    let errorMsg = `Delete failed with status ${res.status}.`;
    let code: string | undefined;
    try {
      const data = await res.json();
      if (data && typeof data.error === 'string') {
        errorMsg = data.error;
      }
      if (data && typeof data.code === 'string') {
        code = data.code;
      }
    } catch {}
    handleProtectedResponseError(res.status, errorMsg, token.trim(), code);
    throw new Error(errorMsg);
  }
}

export interface PickPhotoOptions {
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
}

export interface PhotoSelectionResult {
  canceled: boolean;
  uri?: string;
  error?: string;
}

/**
 * Launches the device photo library with secure permissions check,
 * single-selection constraint, square cropping, and compression.
 */
export async function pickProfilePhoto(
  options: PickPhotoOptions = {}
): Promise<PhotoSelectionResult> {
  const {
    allowsEditing = true,
    aspect = [1, 1],
    quality = 0.8,
  } = options;

  try {
    // 1. Request media library permissions safely
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      return {
        canceled: true,
        error:
          'Photo library permission is required to choose a profile photo. Please enable it in your device settings.',
      };
    }

    // 2. Launch image picker configured for profile photo
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing,
      aspect,
      quality,
      allowsMultipleSelection: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { canceled: true };
    }

    const selectedAsset = result.assets[0];
    if (!selectedAsset.uri || typeof selectedAsset.uri !== 'string') {
      return { canceled: true, error: 'No valid image URI was returned from the photo picker.' };
    }

    return {
      canceled: false,
      uri: selectedAsset.uri,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'An unexpected error occurred while selecting a photo.';
    return {
      canceled: true,
      error: message,
    };
  }
}

/**
 * Copies selected photo to persistent application storage and updates SecureStore.
 * Guarantees that existing photo is NOT deleted if replacement copy/save fails.
 */
export async function persistProfilePhoto(
  userId: string,
  sourceUri: string
): Promise<string> {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('Valid user ID is required to persist profile photo.');
  }
  if (!sourceUri || typeof sourceUri !== 'string' || !sourceUri.trim()) {
    throw new Error('Valid source image URI is required to persist profile photo.');
  }

  const storageKey = getProfilePhotoStorageKey(userId);
  let persistentUri = sourceUri.trim();

  // On native platforms with documentDirectory, copy image to permanent storage
  if (FileSystem.documentDirectory && Platform.OS !== 'web') {
    const photosDir = `${FileSystem.documentDirectory}profile_photos/`;

    // Ensure persistent profile photos directory exists
    try {
      const dirInfo = await FileSystem.getInfoAsync(photosDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(photosDir, { intermediates: true });
      }
    } catch {
      // Directory creation attempt failed; proceed to attempt copy or fallback
    }

    const targetFilename = `photo_${userId.trim()}_${Date.now()}.jpg`;
    const targetPath = `${photosDir}${targetFilename}`;

    // Copy to persistent document storage
    await FileSystem.copyAsync({
      from: persistentUri,
      to: targetPath,
    });

    persistentUri = targetPath;
  }

  // Retrieve any existing saved photo URI before updating
  let previousUri: string | null = null;
  try {
    if (Platform.OS === 'web') {
      previousUri = memoryPhotoStorage[storageKey] || null;
    } else {
      previousUri = await SecureStore.getItemAsync(storageKey);
    }
  } catch {
    // Ignore read errors for previous URI
  }

  // Update SecureStore with new URI
  if (Platform.OS === 'web') {
    memoryPhotoStorage[storageKey] = persistentUri;
  } else {
    await SecureStore.setItemAsync(storageKey, persistentUri);
  }

  // Safe replacement: Only delete previous photo file if it was successfully replaced and differs
  if (
    previousUri &&
    previousUri !== persistentUri &&
    FileSystem.documentDirectory &&
    Platform.OS !== 'web'
  ) {
    try {
      await FileSystem.deleteAsync(previousUri, { idempotent: true });
    } catch {
      // Non-critical cleanup failure, silently continue
    }
  }

  return persistentUri;
}

/**
 * Retrieves the saved profile photo URI for a specific user ID.
 * Verifies that the file actually exists on disk. If missing/corrupt, clears key and returns null.
 */
export async function getPersistedProfilePhoto(
  userId: string
): Promise<string | null> {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return null;
  }

  const storageKey = getProfilePhotoStorageKey(userId);
  let storedUri: string | null = null;

  try {
    if (Platform.OS === 'web') {
      storedUri = memoryPhotoStorage[storageKey] || null;
    } else {
      storedUri = await SecureStore.getItemAsync(storageKey);
    }
  } catch {
    return null;
  }

  if (!storedUri || typeof storedUri !== 'string' || !storedUri.trim()) {
    return null;
  }

  // Verify file existence on native platforms
  if (FileSystem.documentDirectory && Platform.OS !== 'web') {
    try {
      const fileInfo = await FileSystem.getInfoAsync(storedUri);
      if (!fileInfo.exists) {
        // Stale URI pointing to missing file: clear key and fall back gracefully
        await deletePersistedProfilePhoto(userId);
        return null;
      }
    } catch {
      return null;
    }
  }

  return storedUri;
}

/**
 * Deletes the stored photo file and removes the key from SecureStore.
 */
export async function deletePersistedProfilePhoto(userId: string): Promise<void> {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return;
  }

  const storageKey = getProfilePhotoStorageKey(userId);

  let existingUri: string | null = null;
  try {
    if (Platform.OS === 'web') {
      existingUri = memoryPhotoStorage[storageKey] || null;
      delete memoryPhotoStorage[storageKey];
    } else {
      existingUri = await SecureStore.getItemAsync(storageKey);
      await SecureStore.deleteItemAsync(storageKey);
    }
  } catch {
    // Fail silently on storage removal
  }

  if (existingUri && FileSystem.documentDirectory && Platform.OS !== 'web') {
    try {
      await FileSystem.deleteAsync(existingUri, { idempotent: true });
    } catch {
      // Non-critical file deletion failure
    }
  }
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'local_only' | 'error';

export interface UseProfilePhotoOptions {
  userId?: string | null;
  token?: string | null;
  remotePhotoUpdatedAt?: string | null;
}

/**
 * React hook to manage photo selection, local persistence, cloud sync, and state for a user.
 */
export function useProfilePhoto(
  userIdOrOptions?: string | null | UseProfilePhotoOptions,
  tokenParam?: string | null,
  remotePhotoUpdatedAtParam?: string | null
) {
  const authContext = useContext(AuthContext);

  let userId: string | null | undefined;
  let token: string | null | undefined;
  let remotePhotoUpdatedAt: string | null | undefined;

  if (typeof userIdOrOptions === 'object' && userIdOrOptions !== null) {
    userId = userIdOrOptions.userId;
    token = userIdOrOptions.token !== undefined ? userIdOrOptions.token : authContext?.token;
    remotePhotoUpdatedAt =
      userIdOrOptions.remotePhotoUpdatedAt !== undefined
        ? userIdOrOptions.remotePhotoUpdatedAt
        : authContext?.user?._id === userId
        ? authContext?.user?.photoUpdatedAt
        : null;
  } else {
    userId = userIdOrOptions;
    token = tokenParam !== undefined ? tokenParam : authContext?.token;
    remotePhotoUpdatedAt =
      remotePhotoUpdatedAtParam !== undefined
        ? remotePhotoUpdatedAtParam
        : authContext?.user?._id === userId
        ? authContext?.user?.photoUpdatedAt
        : null;
  }

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const activeLoadIdRef = useRef<number>(0);

  const loadPhoto = useCallback(async () => {
    const currentLoadId = ++activeLoadIdRef.current;

    if (!userId) {
      setPhotoUri(null);
      setSyncStatus('idle');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const localSaved = await getPersistedProfilePhoto(userId);
      const syncMeta = await getProfilePhotoSyncMetadata(userId);

      if (activeLoadIdRef.current !== currentLoadId || !isMountedRef.current) {
        return;
      }

      if (localSaved) {
        setPhotoUri(localSaved);

        // Check if an offline deletion was queued
        if (syncMeta?.isDeletedLocally && token) {
          try {
            await deleteProfilePhotoFromCloud(token);
            await clearProfilePhotoSyncMetadata(userId);
            await deletePersistedProfilePhoto(userId);
            if (activeLoadIdRef.current === currentLoadId && isMountedRef.current) {
              setPhotoUri(null);
              setSyncStatus('idle');
            }
            return;
          } catch {
            // Keep local deletion flag if offline
          }
        }

        // Check if remote version is newer than local sync metadata
        if (
          token &&
          remotePhotoUpdatedAt &&
          syncMeta?.photoUpdatedAt &&
          remotePhotoUpdatedAt !== syncMeta.photoUpdatedAt
        ) {
          setSyncStatus('syncing');
          try {
            const freshPath = await downloadProfilePhotoFromCloud(
              userId,
              token,
              remotePhotoUpdatedAt
            );
            if (activeLoadIdRef.current === currentLoadId && isMountedRef.current) {
              if (freshPath) {
                setPhotoUri(freshPath);
                setSyncStatus('synced');
              }
            }
          } catch {
            if (activeLoadIdRef.current === currentLoadId && isMountedRef.current) {
              setSyncStatus('local_only');
            }
          }
        } else {
          setSyncStatus('synced');
        }
      } else {
        // No local photo exists: check if account has a cloud photo to restore
        if (token && (remotePhotoUpdatedAt || syncMeta?.isDeletedLocally !== true)) {
          setSyncStatus('syncing');
          try {
            const downloaded = await downloadProfilePhotoFromCloud(
              userId,
              token,
              remotePhotoUpdatedAt
            );
            if (activeLoadIdRef.current === currentLoadId && isMountedRef.current) {
              if (downloaded) {
                setPhotoUri(downloaded);
                setSyncStatus('synced');
              } else {
                setSyncStatus('idle');
              }
            }
          } catch {
            if (activeLoadIdRef.current === currentLoadId && isMountedRef.current) {
              setSyncStatus('idle');
            }
          }
        } else {
          setSyncStatus('idle');
        }
      }
    } catch {
      if (activeLoadIdRef.current === currentLoadId && isMountedRef.current) {
        setError('Failed to restore saved profile photo.');
      }
    } finally {
      if (activeLoadIdRef.current === currentLoadId && isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [userId, token, remotePhotoUpdatedAt]);

  useEffect(() => {
    isMountedRef.current = true;
    loadPhoto();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadPhoto]);

  const triggerCloudUpload = useCallback(
    async (targetUserId: string, targetToken: string, localPath: string): Promise<void> => {
      if (isMountedRef.current) {
        setSyncStatus('syncing');
      }

      try {
        const uploadResult = await uploadProfilePhotoToCloud(targetToken, localPath);
        if (isMountedRef.current) {
          setSyncStatus('synced');
          setError(null);
        }
        await setProfilePhotoSyncMetadata(targetUserId, {
          photoUpdatedAt: uploadResult.photoUpdatedAt,
          syncedAt: Date.now(),
        });
      } catch (err: any) {
        if (isMountedRef.current) {
          // SAFE RETENTION: Never delete working local photo on upload error!
          setSyncStatus('local_only');
          const msg =
            err instanceof Error ? err.message : 'Photo saved locally, but cloud sync failed.';
          setError(msg);
        }
      }
    },
    []
  );

  const pickAndSavePhoto = useCallback(async (): Promise<string | null> => {
    if (!userId) {
      setError('Cannot save photo: No authenticated user.');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const selection = await pickProfilePhoto();
      if (selection.canceled) {
        if (selection.error && isMountedRef.current) {
          setError(selection.error);
        }
        return null;
      }

      if (!selection.uri) {
        return null;
      }

      // Step 1: Save locally immediately
      const persistentPath = await persistProfilePhoto(userId, selection.uri);
      if (isMountedRef.current) {
        setPhotoUri(persistentPath);
        setError(null);
      }

      // Step 2: Trigger cloud upload asynchronously (non-blocking for UI)
      if (token) {
        triggerCloudUpload(userId, token, persistentPath);
      } else {
        setSyncStatus('local_only');
      }

      return persistentPath;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save profile photo.';
      if (isMountedRef.current) {
        setError(msg);
      }
      return null;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [userId, token, triggerCloudUpload]);

  const retrySync = useCallback(async (): Promise<void> => {
    if (!userId || !token || !photoUri) return;
    await triggerCloudUpload(userId, token, photoUri);
  }, [userId, token, photoUri, triggerCloudUpload]);

  const clearPhoto = useCallback(async (): Promise<void> => {
    if (!userId) return;
    setIsLoading(true);

    try {
      // 1. Delete local photo
      await deletePersistedProfilePhoto(userId);
      if (isMountedRef.current) {
        setPhotoUri(null);
        setSyncStatus('idle');
        setError(null);
      }

      // 2. Delete cloud photo if online
      if (token) {
        try {
          await deleteProfilePhotoFromCloud(token);
          await clearProfilePhotoSyncMetadata(userId);
        } catch {
          // If offline, record local deletion flag so it syncs when back online
          await setProfilePhotoSyncMetadata(userId, {
            photoUpdatedAt: null,
            syncedAt: Date.now(),
            isDeletedLocally: true,
          });
        }
      } else {
        await clearProfilePhotoSyncMetadata(userId);
      }
    } catch {
      if (isMountedRef.current) {
        setError('Failed to remove profile photo.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [userId, token]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    photoUri,
    isLoading,
    syncStatus,
    error,
    pickAndSavePhoto,
    retrySync,
    clearPhoto,
    reloadPhoto: loadPhoto,
    clearError,
  };
}

/**
 * Resets memory storage for unit test isolation.
 */
export function _resetProfilePhotoStorageForTesting(): void {
  memoryPhotoStorage = {};
  memorySyncMetadataStorage = {};
}
