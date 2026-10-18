import { describe, it, expect } from 'vitest';
import { validateAndLoadConfig } from '../src/config/env';

describe('Environment Configuration Validation', () => {
  it('loads valid development configuration with defaults', () => {
    const config = validateAndLoadConfig({
      NODE_ENV: 'development',
      PORT: '5000',
    });

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(5000);
    expect(config.isDevelopment).toBe(true);
    expect(config.isProduction).toBe(false);
    expect(config.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/athleteconnect');
  });

  it('rejects invalid NODE_ENV values', () => {
    expect(() =>
      validateAndLoadConfig({
        NODE_ENV: 'invalid_stage' as any,
      })
    ).toThrow(/Invalid NODE_ENV/);
  });

  it('rejects invalid PORT numbers', () => {
    expect(() =>
      validateAndLoadConfig({
        PORT: '999999',
      })
    ).toThrow(/Invalid PORT/);

    expect(() =>
      validateAndLoadConfig({
        PORT: 'not-a-number',
      })
    ).toThrow(/Invalid PORT/);
  });

  it('enforces required MONGODB_URI in production', () => {
    expect(() =>
      validateAndLoadConfig({
        NODE_ENV: 'production',
        PORT: '5000',
        MONGODB_URI: '',
        CORS_ORIGIN: 'https://admin.athleteconnect.com',
      })
    ).toThrow(/Missing required environment variable: MONGODB_URI/);
  });

  it('rejects wildcard CORS origin in production', () => {
    expect(() =>
      validateAndLoadConfig({
        NODE_ENV: 'production',
        PORT: '5000',
        MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/prod',
        CORS_ORIGIN: '*',
      })
    ).toThrow(/Wildcard "\*" origin is not permitted in production/);
  });
});
