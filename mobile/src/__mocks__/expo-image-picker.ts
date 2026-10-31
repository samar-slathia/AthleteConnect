import { vi } from 'vitest';

export enum PermissionStatus {
  UNDETERMINED = 'undetermined',
  GRANTED = 'granted',
  DENIED = 'denied',
}

export const MediaTypeOptions = {
  All: 'all',
  Videos: 'videos',
  Images: 'images',
};

export const requestMediaLibraryPermissionsAsync = vi.fn().mockResolvedValue({
  status: PermissionStatus.GRANTED,
  granted: true,
  canAskAgain: true,
  expires: 'never',
});

export const getMediaLibraryPermissionsAsync = vi.fn().mockResolvedValue({
  status: PermissionStatus.GRANTED,
  granted: true,
  canAskAgain: true,
  expires: 'never',
});

export const launchImageLibraryAsync = vi.fn().mockResolvedValue({
  canceled: false,
  assets: [
    {
      uri: 'file:///mock/picker/selected_photo.jpg',
      width: 500,
      height: 500,
      mimeType: 'image/jpeg',
      fileName: 'selected_photo.jpg',
    },
  ],
});

export default {
  PermissionStatus,
  MediaTypeOptions,
  requestMediaLibraryPermissionsAsync,
  getMediaLibraryPermissionsAsync,
  launchImageLibraryAsync,
};
