import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Location from 'expo-location';
import { Linking } from 'react-native';
import {
  detectDeviceLocation,
  buildGoogleMapsUrl,
  openInGoogleMaps,
  formatGeocodedAddress,
} from '../locationService';

vi.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: vi.fn(),
  getForegroundPermissionsAsync: vi.fn(),
  hasServicesEnabledAsync: vi.fn(),
  getLastKnownPositionAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
  reverseGeocodeAsync: vi.fn(),
  Accuracy: {
    Balanced: 3,
  },
}));

describe('locationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Location.hasServicesEnabledAsync as any).mockResolvedValue(true);
    (Location.getLastKnownPositionAsync as any).mockResolvedValue(null);
  });

  describe('detectDeviceLocation', () => {
    it('returns error when device location services are disabled', async () => {
      (Location.hasServicesEnabledAsync as any).mockResolvedValue(false);

      const result = await detectDeviceLocation();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Device location services are disabled');
      expect(result.coordinates).toBeUndefined();
    });

    it('returns error when location permission is denied', async () => {
      (Location.requestForegroundPermissionsAsync as any).mockResolvedValue({
        status: 'denied',
      });

      const result = await detectDeviceLocation();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Location permission was denied');
      expect(result.coordinates).toBeUndefined();
    });

    it('fast last-known location success: uses recent last-known position without calling fresh getCurrentPositionAsync', async () => {
      (Location.requestForegroundPermissionsAsync as any).mockResolvedValue({
        status: 'granted',
      });
      (Location.getLastKnownPositionAsync as any).mockResolvedValue({
        coords: {
          latitude: 12.9715987,
          longitude: 77.5945627,
          altitude: null,
          accuracy: 8,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now() - 60000, // 1 minute old
      });
      (Location.reverseGeocodeAsync as any).mockResolvedValue([
        {
          name: '12th Main',
          street: 'Indiranagar',
          district: 'East',
          city: 'Bangalore',
        },
      ]);

      const onCoords = vi.fn();
      const result = await detectDeviceLocation({ onCoordinates: onCoords });

      expect(result.success).toBe(true);
      expect(result.coordinates).toEqual({
        latitude: 12.971599,
        longitude: 77.594563,
      });
      expect(result.suggestedAddress).toBe('12th Main, Indiranagar, East, Bangalore');
      expect(onCoords).toHaveBeenCalledWith({
        latitude: 12.971599,
        longitude: 77.594563,
      });
      // Crucial: fresh getCurrentPositionAsync was NOT called because fast last-known was available
      expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    });

    it('fresh location success: queries getCurrentPositionAsync when last-known is absent', async () => {
      (Location.requestForegroundPermissionsAsync as any).mockResolvedValue({
        status: 'granted',
      });
      (Location.getLastKnownPositionAsync as any).mockResolvedValue(null);
      (Location.getCurrentPositionAsync as any).mockResolvedValue({
        coords: {
          latitude: 12.9715987,
          longitude: 77.5945627,
          altitude: null,
          accuracy: 10,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      });
      (Location.reverseGeocodeAsync as any).mockResolvedValue([
        {
          name: '12th Main',
          street: 'Indiranagar',
          district: 'East',
          city: 'Bangalore',
        },
      ]);

      const result = await detectDeviceLocation();

      expect(result.success).toBe(true);
      expect(result.coordinates).toEqual({
        latitude: 12.971599,
        longitude: 77.594563,
      });
      expect(result.suggestedAddress).toBe('12th Main, Indiranagar, East, Bangalore');
      expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({
        accuracy: Location.Accuracy.Balanced,
      });
    });

    it('skips stale last-known position and falls back to fresh location fix', async () => {
      (Location.requestForegroundPermissionsAsync as any).mockResolvedValue({
        status: 'granted',
      });
      // 2 hours old, beyond maxLastKnownAgeMs
      (Location.getLastKnownPositionAsync as any).mockResolvedValue({
        coords: {
          latitude: 10.0,
          longitude: 20.0,
        },
        timestamp: Date.now() - 2 * 60 * 60 * 1000,
      });
      (Location.getCurrentPositionAsync as any).mockResolvedValue({
        coords: {
          latitude: 12.9716,
          longitude: 77.5946,
        },
      });

      const result = await detectDeviceLocation();

      expect(result.success).toBe(true);
      expect(result.coordinates).toEqual({
        latitude: 12.9716,
        longitude: 77.5946,
      });
      expect(Location.getCurrentPositionAsync).toHaveBeenCalled();
    });

    it('fresh-location timeout: times out gracefully with non-blocking error when position request hangs', async () => {
      (Location.requestForegroundPermissionsAsync as any).mockResolvedValue({
        status: 'granted',
      });
      (Location.getLastKnownPositionAsync as any).mockResolvedValue(null);
      // Simulate hanging position request that never resolves
      (Location.getCurrentPositionAsync as any).mockReturnValue(new Promise(() => {}));

      const result = await detectDeviceLocation({ timeoutMs: 30 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
      expect(result.coordinates).toBeUndefined();
    });

    it('location API exception: handles unexpected failure during position acquisition', async () => {
      (Location.requestForegroundPermissionsAsync as any).mockResolvedValue({
        status: 'granted',
      });
      (Location.getLastKnownPositionAsync as any).mockResolvedValue(null);
      (Location.getCurrentPositionAsync as any).mockRejectedValue(
        new Error('GPS provider unavailable')
      );

      const result = await detectDeviceLocation();

      expect(result.success).toBe(false);
      expect(result.error).toContain('GPS provider unavailable');
    });

    it('reverse geocoding delay: invokes onCoordinates callback immediately before reverse geocode finishes', async () => {
      (Location.requestForegroundPermissionsAsync as any).mockResolvedValue({
        status: 'granted',
      });
      (Location.getCurrentPositionAsync as any).mockResolvedValue({
        coords: {
          latitude: 12.9716,
          longitude: 77.5946,
        },
      });

      let resolveReverse: any;
      (Location.reverseGeocodeAsync as any).mockReturnValue(
        new Promise((resolve) => {
          resolveReverse = resolve;
        })
      );

      const onCoords = vi.fn();
      const detectPromise = detectDeviceLocation({ onCoordinates: onCoords });

      // Allow microtasks to run so position resolves and onCoords is invoked
      await new Promise((r) => setTimeout(r, 10));

      expect(onCoords).toHaveBeenCalledWith({
        latitude: 12.9716,
        longitude: 77.5946,
      });

      // Now resolve reverse geocoding
      resolveReverse([
        {
          name: '12th Main',
          street: 'Indiranagar',
          district: 'East',
          city: 'Bangalore',
        },
      ]);

      const result = await detectPromise;
      expect(result.success).toBe(true);
      expect(result.suggestedAddress).toBe('12th Main, Indiranagar, East, Bangalore');
    });

    it('reverse geocoding failure or throw does not invalidate coordinates or fail detection', async () => {
      (Location.requestForegroundPermissionsAsync as any).mockResolvedValue({
        status: 'granted',
      });
      (Location.getCurrentPositionAsync as any).mockResolvedValue({
        coords: {
          latitude: 12.9716,
          longitude: 77.5946,
        },
      });
      (Location.reverseGeocodeAsync as any).mockRejectedValue(new Error('Network error'));

      const result = await detectDeviceLocation();

      expect(result.success).toBe(true);
      expect(result.coordinates).toEqual({
        latitude: 12.9716,
        longitude: 77.5946,
      });
      expect(result.suggestedAddress).toBeUndefined();
    });

    it('reverse geocoding timeout does not fail detection and preserves coordinates', async () => {
      (Location.requestForegroundPermissionsAsync as any).mockResolvedValue({
        status: 'granted',
      });
      (Location.getCurrentPositionAsync as any).mockResolvedValue({
        coords: {
          latitude: 12.9716,
          longitude: 77.5946,
        },
      });
      // Hanging reverse geocode
      (Location.reverseGeocodeAsync as any).mockReturnValue(new Promise(() => {}));

      const result = await detectDeviceLocation({ reverseGeocodeTimeoutMs: 30 });

      expect(result.success).toBe(true);
      expect(result.coordinates).toEqual({
        latitude: 12.9716,
        longitude: 77.5946,
      });
      expect(result.suggestedAddress).toBeUndefined();
    });

    it('invokes onAddressResolved callback and populates addressComponents when reverse geocode succeeds', async () => {
      (Location.requestForegroundPermissionsAsync as any).mockResolvedValue({
        status: 'granted',
      });
      (Location.getCurrentPositionAsync as any).mockResolvedValue({
        coords: {
          latitude: 12.9716,
          longitude: 77.5946,
        },
      });
      (Location.reverseGeocodeAsync as any).mockResolvedValue([
        {
          streetNumber: '15',
          street: 'Indiranagar 100ft Road',
          district: 'East',
          city: 'Bangalore',
          region: 'KA',
          postalCode: '560038',
          country: 'India',
        },
      ]);

      const onAddress = vi.fn();
      const result = await detectDeviceLocation({ onAddressResolved: onAddress });

      expect(result.success).toBe(true);
      expect(result.addressComponents).toBeDefined();
      expect(result.addressComponents?.streetNumber).toBe('15');
      expect(result.addressComponents?.street).toBe('Indiranagar 100ft Road');
      expect(result.addressComponents?.postalCode).toBe('560038');
      expect(onAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          streetNumber: '15',
          street: 'Indiranagar 100ft Road',
          postalCode: '560038',
          formattedAddress: expect.stringContaining('Indiranagar 100ft Road'),
        })
      );
    });
  });

  describe('formatGeocodedAddress', () => {
    it('populates all available components without inventing data', () => {
      const components = formatGeocodedAddress({
        streetNumber: '101',
        street: 'MG Road',
        district: 'Central',
        city: 'Bengaluru',
        region: 'Karnataka',
        postalCode: '560001',
        country: 'India',
        name: 'Prestige Plaza',
      } as any);

      expect(components.streetNumber).toBe('101');
      expect(components.street).toBe('MG Road');
      expect(components.district).toBe('Central');
      expect(components.city).toBe('Bengaluru');
      expect(components.region).toBe('Karnataka');
      expect(components.postalCode).toBe('560001');
      expect(components.country).toBe('India');
      expect(components.formattedAddress).toBe(
        'Prestige Plaza, 101 MG Road, Central, Bengaluru, Karnataka 560001, India'
      );
    });

    it('leaves missing fields undefined and does not invent house number or PIN code', () => {
      const components = formatGeocodedAddress({
        city: 'Bengaluru',
        country: 'India',
      } as any);

      expect(components.streetNumber).toBeUndefined();
      expect(components.street).toBeUndefined();
      expect(components.district).toBeUndefined();
      expect(components.postalCode).toBeUndefined();
      expect(components.region).toBeUndefined();
      expect(components.city).toBe('Bengaluru');
      expect(components.country).toBe('India');
      expect(components.formattedAddress).toBe('Bengaluru, India');
    });

    it('handles street already prefixed with streetNumber without duplicating', () => {
      const components = formatGeocodedAddress({
        streetNumber: '42',
        street: '42 Brigade Road',
        city: 'Bengaluru',
      } as any);

      expect(components.streetNumber).toBe('42');
      expect(components.street).toBe('42 Brigade Road');
      expect(components.formattedAddress).toBe('42 Brigade Road, Bengaluru');
    });

    it('uses subregion when district is absent', () => {
      const components = formatGeocodedAddress({
        street: 'Ring Road',
        subregion: 'South Zone',
        city: 'Bengaluru',
      } as any);

      expect(components.district).toBe('South Zone');
      expect(components.formattedAddress).toBe('Ring Road, South Zone, Bengaluru');
    });
  });

  describe('buildGoogleMapsUrl', () => {
    it('builds URL prioritizing coordinates when available', () => {
      const url = buildGoogleMapsUrl({
        coordinates: { latitude: 12.9716, longitude: 77.5946 },
        address: 'Indiranagar, Bangalore',
      });

      expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=12.9716,77.5946');
    });

    it('builds URL using encoded address when coordinates are absent', () => {
      const url = buildGoogleMapsUrl({
        address: 'FitZone Studio, 12th Main, Bangalore',
      });

      expect(url).toBe(
        'https://www.google.com/maps/dir/?api=1&destination=FitZone%20Studio%2C%2012th%20Main%2C%20Bangalore'
      );
    });

    it('returns null when neither coordinates nor address are provided', () => {
      expect(buildGoogleMapsUrl({})).toBeNull();
      expect(buildGoogleMapsUrl({ address: '   ' })).toBeNull();
    });

    it('ignores invalid NaN coordinates and falls back to address', () => {
      const url = buildGoogleMapsUrl({
        coordinates: { latitude: NaN, longitude: 77.5946 },
        address: 'Kanteerava Stadium',
      });

      expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=Kanteerava%20Stadium');
    });
  });

  describe('openInGoogleMaps', () => {
    it('returns error when destination has no valid location', async () => {
      const openSpy = vi.spyOn(Linking, 'openURL');
      const result = await openInGoogleMaps({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('No valid location coordinates or address');
      expect(openSpy).not.toHaveBeenCalled();
    });

    it('launches Linking.openURL with correct maps URL', async () => {
      vi.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
      const openSpy = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);

      const result = await openInGoogleMaps({
        coordinates: { latitude: 12.9716, longitude: 77.5946 },
      });

      expect(result.success).toBe(true);
      expect(openSpy).toHaveBeenCalledWith(
        'https://www.google.com/maps/dir/?api=1&destination=12.9716,77.5946'
      );
    });

    it('handles linking failure gracefully', async () => {
      vi.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
      vi.spyOn(Linking, 'openURL').mockRejectedValue(new Error('Cannot open URL'));

      const result = await openInGoogleMaps({
        address: 'Indiranagar',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unable to launch Google Maps');
    });
  });
});
