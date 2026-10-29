import * as Location from 'expo-location';
import { Linking } from 'react-native';
import { BookingCoordinates } from './bookingApi';

export type { BookingCoordinates };

export interface DetectedAddressComponents {
  streetNumber?: string;
  street?: string;
  district?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  formattedAddress: string;
}

export interface DeviceLocationResult {
  success: boolean;
  coordinates?: BookingCoordinates;
  suggestedAddress?: string;
  addressComponents?: DetectedAddressComponents;
  error?: string;
}

export interface DetectLocationOptions {
  timeoutMs?: number;
  maxLastKnownAgeMs?: number;
  reverseGeocodeTimeoutMs?: number;
  onCoordinates?: (coords: BookingCoordinates) => void;
  onAddressResolved?: (address: DetectedAddressComponents) => void;
}

/**
 * Formats a geocoded address object into readable structured components
 * and a cohesive address line using ONLY returned non-empty fields.
 * Never invents house numbers, streets, localities, or PIN codes.
 */
export function formatGeocodedAddress(item: Location.LocationGeocodedAddress): DetectedAddressComponents {
  const streetNumber =
    item.streetNumber && typeof item.streetNumber === 'string' && item.streetNumber.trim()
      ? item.streetNumber.trim()
      : undefined;

  const rawStreet =
    item.street && typeof item.street === 'string' && item.street.trim()
      ? item.street.trim()
      : undefined;

  const name =
    item.name && typeof item.name === 'string' && item.name.trim()
      ? item.name.trim()
      : undefined;

  const street = rawStreet || (name && name !== streetNumber ? name : undefined);

  let district =
    item.district && typeof item.district === 'string' && item.district.trim()
      ? item.district.trim()
      : undefined;
  if (!district && item.subregion && typeof item.subregion === 'string' && item.subregion.trim()) {
    district = item.subregion.trim();
  }

  const city =
    item.city && typeof item.city === 'string' && item.city.trim() ? item.city.trim() : undefined;
  const region =
    item.region && typeof item.region === 'string' && item.region.trim()
      ? item.region.trim()
      : undefined;
  const postalCode =
    item.postalCode && typeof item.postalCode === 'string' && item.postalCode.trim()
      ? item.postalCode.trim()
      : undefined;
  const country =
    item.country && typeof item.country === 'string' && item.country.trim()
      ? item.country.trim()
      : undefined;

  // Build street/premise line
  let streetLine: string | undefined = undefined;
  if (streetNumber && rawStreet) {
    if (rawStreet.toLowerCase().startsWith(streetNumber.toLowerCase())) {
      streetLine = rawStreet;
    } else {
      streetLine = `${streetNumber} ${rawStreet}`;
    }
  } else if (rawStreet) {
    streetLine = rawStreet;
  } else if (streetNumber) {
    streetLine = streetNumber;
  }

  // If a distinct premise or building name is present (e.g. '12th Main', 'Galaxy Apt'), prepend it
  if (name && name !== streetNumber && name.toLowerCase() !== rawStreet?.toLowerCase()) {
    if (streetLine && !streetLine.toLowerCase().includes(name.toLowerCase())) {
      streetLine = `${name}, ${streetLine}`;
    } else if (!streetLine) {
      streetLine = name;
    }
  }

  // Build state & postal code line
  let statePostalLine: string | undefined = undefined;
  if (region && postalCode) {
    statePostalLine = `${region} ${postalCode}`;
  } else if (region) {
    statePostalLine = region;
  } else if (postalCode) {
    statePostalLine = postalCode;
  }

  const segments = [streetLine, district, city, statePostalLine, country].filter(
    (s): s is string => Boolean(s && s.trim().length > 0)
  );

  const formattedAddress = segments.join(', ');

  return {
    streetNumber,
    street,
    district,
    city,
    region,
    postalCode,
    country,
    formattedAddress,
  };
}

/**
 * Helper to race a promise against a finite JavaScript timeout.
 * Guaranteed to clean up timer upon completion or rejection.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(errorMsg));
    }, ms);
  });
  return Promise.race([
    promise.then((res) => {
      if (timer) clearTimeout(timer);
      return res;
    }),
    timeoutPromise,
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Requests device foreground location permission and fetches current GPS coordinates.
 * 1. Checks device location services status (if available).
 * 2. Requests foreground location permissions.
 * 3. Tries Location.getLastKnownPositionAsync() first for fast recent location.
 * 4. Falls back to Location.getCurrentPositionAsync({ accuracy: Balanced }) with finite JS timeout.
 * 5. Calls options.onCoordinates immediately upon acquiring valid coordinates.
 * 6. Reverse geocodes best-effort with a timeout so it never blocks or keeps spinner active indefinitely.
 * 7. Zero paid APIs required.
 */
export async function detectDeviceLocation(
  options?: DetectLocationOptions
): Promise<DeviceLocationResult> {
  try {
    // 1. Check if location services are enabled on the device (if API available)
    if (typeof Location.hasServicesEnabledAsync === 'function') {
      try {
        const isEnabled = await Location.hasServicesEnabledAsync();
        if (!isEnabled) {
          return {
            success: false,
            error: 'Device location services are disabled. Please enable location or enter your address manually.',
          };
        }
      } catch {
        // Fall through to permission check
      }
    }

    // 2. Request foreground permission
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return {
        success: false,
        error: 'Location permission was denied. You can enter your address manually.',
      };
    }

    const timeoutMs = typeof options?.timeoutMs === 'number' ? options.timeoutMs : 8000;
    const maxLastKnownAgeMs =
      typeof options?.maxLastKnownAgeMs === 'number'
        ? options.maxLastKnownAgeMs
        : 10 * 60 * 1000; // 10 minutes
    const reverseGeocodeTimeoutMs =
      typeof options?.reverseGeocodeTimeoutMs === 'number'
        ? options.reverseGeocodeTimeoutMs
        : 3000; // 3 seconds max for reverse geocode

    let position: Location.LocationObject | null = null;

    // 3. Try getLastKnownPositionAsync first
    if (typeof Location.getLastKnownPositionAsync === 'function') {
      try {
        const lastKnown = await Location.getLastKnownPositionAsync({});
        if (
          lastKnown &&
          lastKnown.coords &&
          typeof lastKnown.coords.latitude === 'number' &&
          !isNaN(lastKnown.coords.latitude) &&
          typeof lastKnown.coords.longitude === 'number' &&
          !isNaN(lastKnown.coords.longitude)
        ) {
          const age =
            typeof lastKnown.timestamp === 'number' ? Date.now() - lastKnown.timestamp : 0;
          if (age >= 0 && age <= maxLastKnownAgeMs) {
            position = lastKnown;
          }
        }
      } catch {
        // Fall back to fresh position
      }
    }

    // 4. Fresh location request with finite timeout and balanced accuracy
    if (!position) {
      const freshPositionPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      position = await withTimeout(
        freshPositionPromise,
        timeoutMs,
        'Location request timed out. Please enter your address manually.'
      );
    }

    if (
      !position ||
      !position.coords ||
      typeof position.coords.latitude !== 'number' ||
      isNaN(position.coords.latitude) ||
      typeof position.coords.longitude !== 'number' ||
      isNaN(position.coords.longitude)
    ) {
      return {
        success: false,
        error: 'Unable to acquire valid GPS coordinates. Please enter your address manually.',
      };
    }

    const coordinates: BookingCoordinates = {
      latitude: Number(position.coords.latitude.toFixed(6)),
      longitude: Number(position.coords.longitude.toFixed(6)),
    };

    // 5. Notify caller immediately as soon as coordinates are obtained
    if (typeof options?.onCoordinates === 'function') {
      try {
        options.onCoordinates(coordinates);
      } catch {
        // Non-fatal callback error
      }
    }

    // 6. Reverse geocode is best-effort and bounded by timeout
    let suggestedAddress: string | undefined = undefined;
    let addressComponents: DetectedAddressComponents | undefined = undefined;

    if (typeof Location.reverseGeocodeAsync === 'function') {
      try {
        const reversePromise = Location.reverseGeocodeAsync(coordinates);
        const reverseResults = await withTimeout(
          reversePromise,
          reverseGeocodeTimeoutMs,
          'Reverse geocoding timed out'
        );

        if (Array.isArray(reverseResults) && reverseResults.length > 0) {
          const components = formatGeocodedAddress(reverseResults[0]);
          if (components.formattedAddress) {
            addressComponents = components;
            suggestedAddress = components.formattedAddress;

            if (typeof options?.onAddressResolved === 'function') {
              try {
                options.onAddressResolved(components);
              } catch {
                // Non-fatal callback error
              }
            }
          }
        }
      } catch {
        // Reverse geocoding failure or timeout must never invalidate coordinates
      }
    }

    return {
      success: true,
      coordinates,
      suggestedAddress,
      addressComponents,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Unable to detect device location. Please enter your address manually.',
    };
  }
}

export interface MapDestination {
  coordinates?: BookingCoordinates;
  address?: string;
}

/**
 * Builds an external Google Maps directions link without any paid API keys.
 * Priority:
 * 1. If coordinates available: destination=lat,lng
 * 2. If address available: destination=urlEncodedAddress
 * 3. Else null.
 */
export function buildGoogleMapsUrl(destination: MapDestination): string | null {
  if (
    destination.coordinates &&
    typeof destination.coordinates.latitude === 'number' &&
    !isNaN(destination.coordinates.latitude) &&
    typeof destination.coordinates.longitude === 'number' &&
    !isNaN(destination.coordinates.longitude)
  ) {
    return `https://www.google.com/maps/dir/?api=1&destination=${destination.coordinates.latitude},${destination.coordinates.longitude}`;
  }

  if (destination.address && typeof destination.address === 'string' && destination.address.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination.address.trim())}`;
  }

  return null;
}

/**
 * Opens the destination in the device's Google Maps app or browser fallback.
 */
export async function openInGoogleMaps(destination: MapDestination): Promise<{ success: boolean; error?: string }> {
  const url = buildGoogleMapsUrl(destination);
  if (!url) {
    return {
      success: false,
      error: 'No valid location coordinates or address available for this session.',
    };
  }

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return { success: true };
    } else {
      await Linking.openURL(url);
      return { success: true };
    }
  } catch {
    return {
      success: false,
      error: 'Unable to launch Google Maps on this device.',
    };
  }
}
