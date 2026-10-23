import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Platform } from 'react-native';
import { getApiBaseUrl, API_ENDPOINTS, DEFAULT_SERVER_PORT } from '../api';

describe('API Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('honors explicit EXPO_PUBLIC_API_BASE_URL override in development', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://custom-staging.athleteconnect.com/';
    process.env.NODE_ENV = 'development';

    const url = getApiBaseUrl();
    expect(url).toBe('https://custom-staging.athleteconnect.com');
  });

  it('honors explicit EXPO_PUBLIC_API_BASE_URL in production', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://live-api.athleteconnect.com/';
    process.env.NODE_ENV = 'production';

    const url = getApiBaseUrl();
    expect(url).toBe('https://live-api.athleteconnect.com');
  });

  it('fails safely with configuration error in production when EXPO_PUBLIC_API_BASE_URL is missing', () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    process.env.NODE_ENV = 'production';

    expect(() => getApiBaseUrl()).toThrow(
      'Missing required production configuration: EXPO_PUBLIC_API_BASE_URL. In production builds, an explicit production API base URL must be configured.'
    );
  });

  it('fails safely with configuration error in production when EXPO_PUBLIC_API_BASE_URL is whitespace', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = '   ';
    process.env.NODE_ENV = 'production';

    expect(() => getApiBaseUrl()).toThrow(
      'Missing required production configuration: EXPO_PUBLIC_API_BASE_URL. In production builds, an explicit production API base URL must be configured.'
    );
  });

  it('strictly prevents fallback to localhost or emulator addresses in production', () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    process.env.NODE_ENV = 'production';

    // Must throw on Android rather than silently returning 10.0.2.2
    Platform.OS = 'android';
    expect(() => getApiBaseUrl()).toThrow(/Missing required production configuration/);

    // Must throw on iOS rather than silently returning localhost
    Platform.OS = 'ios';
    expect(() => getApiBaseUrl()).toThrow(/Missing required production configuration/);

    // Must throw on Web rather than silently returning localhost
    Platform.OS = 'web';
    expect(() => getApiBaseUrl()).toThrow(/Missing required production configuration/);
  });

  it('returns 10.0.2.2 alias for Android platform in local development', () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    process.env.NODE_ENV = 'development';
    Platform.OS = 'android';

    const url = getApiBaseUrl();
    expect(url).toBe(`http://10.0.2.2:${DEFAULT_SERVER_PORT}`);
  });

  it('returns localhost for iOS and Web in local development', () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    process.env.NODE_ENV = 'development';

    Platform.OS = 'ios';
    expect(getApiBaseUrl()).toBe(`http://localhost:${DEFAULT_SERVER_PORT}`);

    Platform.OS = 'web';
    expect(getApiBaseUrl()).toBe(`http://localhost:${DEFAULT_SERVER_PORT}`);
  });

  it('defines correct backend endpoint paths matching Phase 2B server routes', () => {
    expect(API_ENDPOINTS.REGISTER).toBe('/api/auth/register');
    expect(API_ENDPOINTS.LOGIN).toBe('/api/auth/login');
    expect(API_ENDPOINTS.ME).toBe('/api/auth/me');
  });
});
