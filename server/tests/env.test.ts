import { describe, it, expect } from 'vitest';
import { validateAndLoadConfig } from '../src/config/env';

describe('Environment Configuration Validation', () => {
  it('loads valid development configuration with defaults and provided JWT secret', () => {
    const config = validateAndLoadConfig({
      NODE_ENV: 'development',
      PORT: '5000',
      JWT_SECRET: 'valid_development_jwt_secret_with_minimum_32_characters',
    });

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(5000);
    expect(config.isDevelopment).toBe(true);
    expect(config.isProduction).toBe(false);
    expect(config.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/athleteconnect');
    expect(config.JWT_SECRET).toBe('valid_development_jwt_secret_with_minimum_32_characters');
    expect(config.JWT_EXPIRES_IN).toBe('7d');
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
        JWT_SECRET: 'production_secure_jwt_secret_with_at_least_32_chars',
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
        JWT_SECRET: 'production_secure_jwt_secret_with_at_least_32_chars',
      })
    ).toThrow(/Wildcard "\*" origin is not permitted in production/);
  });

  it('enforces required JWT_SECRET in production', () => {
    expect(() =>
      validateAndLoadConfig({
        NODE_ENV: 'production',
        PORT: '5000',
        MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/prod',
        CORS_ORIGIN: 'https://admin.athleteconnect.com',
        JWT_SECRET: '',
      })
    ).toThrow(/Missing required environment variable: JWT_SECRET/);
  });

  it('enforces required JWT_SECRET in development', () => {
    expect(() =>
      validateAndLoadConfig({
        NODE_ENV: 'development',
        PORT: '5000',
        JWT_SECRET: '',
      })
    ).toThrow(/Missing required environment variable: JWT_SECRET/);
  });

  it('rejects JWT_SECRET shorter than 32 characters', () => {
    expect(() =>
      validateAndLoadConfig({
        NODE_ENV: 'development',
        PORT: '5000',
        JWT_SECRET: 'too-short-secret',
      })
    ).toThrow(/Secret must be at least 32 characters long/);
  });

  it('rejects placeholder JWT_SECRET values', () => {
    expect(() =>
      validateAndLoadConfig({
        NODE_ENV: 'development',
        PORT: '5000',
        JWT_SECRET: 'replace_with_a_secure_random_jwt_secret_at_least_32_chars',
      })
    ).toThrow(/Placeholder or default values are not permitted/);

    expect(() =>
      validateAndLoadConfig({
        NODE_ENV: 'development',
        PORT: '5000',
        JWT_SECRET: 'your_super_secret_jwt_key_here_min_32_chars_now',
      })
    ).toThrow(/Placeholder or default values are not permitted/);
  });

  it('rejects invalid JWT_EXPIRES_IN format', () => {
    expect(() =>
      validateAndLoadConfig({
        NODE_ENV: 'development',
        PORT: '5000',
        JWT_SECRET: 'valid_development_jwt_secret_with_minimum_32_characters',
        JWT_EXPIRES_IN: 'invalid-expiration-format',
      })
    ).toThrow(/Invalid JWT_EXPIRES_IN/);
  });
});
