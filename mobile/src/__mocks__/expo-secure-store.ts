import { vi } from 'vitest';

export const setItemAsync = vi.fn().mockResolvedValue(undefined);
export const getItemAsync = vi.fn().mockResolvedValue(null);
export const deleteItemAsync = vi.fn().mockResolvedValue(undefined);

export default {
  setItemAsync,
  getItemAsync,
  deleteItemAsync,
};
