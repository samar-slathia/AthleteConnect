import { vi } from 'vitest';

export enum Accuracy {
  Lowest = 1,
  Low = 2,
  Balanced = 3,
  High = 4,
  Highest = 5,
  BestForNavigation = 6,
}

export enum PermissionStatus {
  UNDETERMINED = 'undetermined',
  GRANTED = 'granted',
  DENIED = 'denied',
}

export const requestForegroundPermissionsAsync = vi.fn().mockResolvedValue({
  status: PermissionStatus.GRANTED,
  granted: true,
  canAskAgain: true,
  expires: 'never',
});

export const getForegroundPermissionsAsync = vi.fn().mockResolvedValue({
  status: PermissionStatus.GRANTED,
  granted: true,
  canAskAgain: true,
  expires: 'never',
});

export const hasServicesEnabledAsync = vi.fn().mockResolvedValue(true);

export const getLastKnownPositionAsync = vi.fn().mockResolvedValue(null);

export const getCurrentPositionAsync = vi.fn().mockResolvedValue({
  coords: {
    latitude: 12.9716,
    longitude: 77.5946,
    altitude: null,
    accuracy: 10,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: Date.now(),
});

export const reverseGeocodeAsync = vi.fn().mockResolvedValue([
  {
    streetNumber: '100',
    street: 'Indiranagar 100ft Road',
    district: 'Indiranagar',
    city: 'Bengaluru',
    subregion: 'Bengaluru Urban',
    region: 'Karnataka',
    postalCode: '560038',
    country: 'India',
    name: '100, Indiranagar 100ft Road',
  },
]);

export default {
  Accuracy,
  PermissionStatus,
  requestForegroundPermissionsAsync,
  getForegroundPermissionsAsync,
  hasServicesEnabledAsync,
  getLastKnownPositionAsync,
  getCurrentPositionAsync,
  reverseGeocodeAsync,
};
