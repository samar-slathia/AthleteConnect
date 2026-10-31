import { vi } from 'vitest';

export const documentDirectory = 'file:///mock/app/documents/';
export const cacheDirectory = 'file:///mock/app/cache/';

export const getInfoAsync = vi.fn().mockResolvedValue({
  exists: true,
  isDirectory: false,
  uri: 'file:///mock/app/documents/photo.jpg',
  size: 10240,
});

export const copyAsync = vi.fn().mockResolvedValue(undefined);
export const makeDirectoryAsync = vi.fn().mockResolvedValue(undefined);
export const deleteAsync = vi.fn().mockResolvedValue(undefined);
export const readAsStringAsync = vi.fn().mockResolvedValue('');
export const writeAsStringAsync = vi.fn().mockResolvedValue(undefined);

export const downloadAsync = vi.fn().mockResolvedValue({
  uri: 'file:///mock/app/documents/downloaded_photo.jpg',
  status: 200,
  headers: {},
});

export const uploadAsync = vi.fn().mockResolvedValue({
  status: 200,
  body: JSON.stringify({
    message: 'Profile photo uploaded successfully.',
    photoUrl: '/api/users/me/photo',
    photoUpdatedAt: '2026-10-30T14:00:00.000Z',
  }),
  headers: {},
});

export const FileSystemUploadType = {
  BINARY_CONTENT: 0,
  MULTIPART: 1,
};

export default {
  documentDirectory,
  cacheDirectory,
  getInfoAsync,
  copyAsync,
  makeDirectoryAsync,
  deleteAsync,
  readAsStringAsync,
  writeAsStringAsync,
  downloadAsync,
  uploadAsync,
  FileSystemUploadType,
};
