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
    expect(config.RAZORPAY_KEY_ID).toBe('rzp_test_placeholder_key_id');
    expect(config.PLATFORM_COMMISSION_PERCENTAGE).toBe(20);
    expect(config.COACH_ALLOCATION_PERCENTAGE).toBe(80);
    expect(config.TAX_RATE_PERCENTAGE).toBe(0);
    expect(config.PAYMENT_EXPIRY_MINUTES).toBe(120);
  });

  it('rejects live Razorpay keys in non-production environments', () => {
    expect(() =>
      validateAndLoadConfig({
        NODE_ENV: 'development',
        PORT: '5000',
        JWT_SECRET: 'valid_development_jwt_secret_with_minimum_32_characters',
        RAZORPAY_KEY_ID: 'rzp_live_abc1234567890',
      })
    ).toThrow(/Live Razorpay credentials/);
  });

  it('validates financial percentage variables', () => {
    expect(() =>
      validateAndLoadConfig({
        NODE_ENV: 'development',
        PORT: '5000',
        JWT_SECRET: 'valid_development_jwt_secret_with_minimum_32_characters',
        PLATFORM_COMMISSION_PERCENTAGE: '150' as any,
      })
    ).toThrow(/Invalid PLATFORM_COMMISSION_PERCENTAGE/);
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

  it('enforces safe placeholder Razorpay credentials in test environment even if merchant keys are supplied', () => {
    const config = validateAndLoadConfig({
      NODE_ENV: 'test',
      PORT: '5000',
      RAZORPAY_KEY_ID: 'rzp_test_merchant_supplied_key',
      RAZORPAY_KEY_SECRET: 'merchant_supplied_secret_123',
      RAZORPAY_WEBHOOK_SECRET: 'merchant_supplied_webhook_secret_456',
    });

    expect(config.NODE_ENV).toBe('test');
    expect(config.isTest).toBe(true);
    // Verifies that test environment always enforces placeholder credentials
    expect(config.RAZORPAY_KEY_ID).toBe('rzp_test_placeholder_key_id');
    expect(config.RAZORPAY_KEY_SECRET).toBe('placeholder_razorpay_key_secret_test');
    expect(config.RAZORPAY_WEBHOOK_SECRET).toBe('placeholder_razorpay_webhook_secret_test');
  });

  it('unconditionally replaces supplied Razorpay credentials containing "placeholder" with fixed safe placeholders in test mode', () => {
    const config = validateAndLoadConfig({
      NODE_ENV: 'test',
      PORT: '5000',
      RAZORPAY_KEY_ID: 'rzp_test_custom_placeholder_key_override',
      RAZORPAY_KEY_SECRET: 'custom_placeholder_secret_override',
      RAZORPAY_WEBHOOK_SECRET: 'custom_placeholder_webhook_secret_override',
    });

    expect(config.NODE_ENV).toBe('test');
    expect(config.isTest).toBe(true);
    expect(config.RAZORPAY_KEY_ID).toBe('rzp_test_placeholder_key_id');
    expect(config.RAZORPAY_KEY_SECRET).toBe('placeholder_razorpay_key_secret_test');
    expect(config.RAZORPAY_WEBHOOK_SECRET).toBe('placeholder_razorpay_webhook_secret_test');
  });

  it('preserves configured Razorpay credentials during normal development', () => {
    const devConfig = validateAndLoadConfig({
      NODE_ENV: 'development',
      PORT: '5000',
      JWT_SECRET: 'valid_development_jwt_secret_with_minimum_32_characters',
      RAZORPAY_KEY_ID: 'rzp_test_valid_dev_merchant_key',
      RAZORPAY_KEY_SECRET: 'valid_dev_merchant_secret',
      RAZORPAY_WEBHOOK_SECRET: 'valid_dev_webhook_secret',
    });

    expect(devConfig.NODE_ENV).toBe('development');
    expect(devConfig.isDevelopment).toBe(true);
    expect(devConfig.RAZORPAY_KEY_ID).toBe('rzp_test_valid_dev_merchant_key');
    expect(devConfig.RAZORPAY_KEY_SECRET).toBe('valid_dev_merchant_secret');
    expect(devConfig.RAZORPAY_WEBHOOK_SECRET).toBe('valid_dev_webhook_secret');
  });

  it('enforces required Razorpay credentials in production environment', () => {
    expect(() =>
      validateAndLoadConfig({
        NODE_ENV: 'production',
        PORT: '5000',
        MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/prod',
        CORS_ORIGIN: 'https://admin.athleteconnect.com',
        JWT_SECRET: 'production_secure_jwt_secret_with_at_least_32_chars',
      })
    ).toThrow(/Missing required environment variable: RAZORPAY_KEY_ID/);

    expect(() =>
      validateAndLoadConfig({
        NODE_ENV: 'production',
        PORT: '5000',
        MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/prod',
        CORS_ORIGIN: 'https://admin.athleteconnect.com',
        JWT_SECRET: 'production_secure_jwt_secret_with_at_least_32_chars',
        RAZORPAY_KEY_ID: 'rzp_test_prod_key',
      })
    ).toThrow(/Missing required environment variable: RAZORPAY_KEY_SECRET/);

    expect(() =>
      validateAndLoadConfig({
        NODE_ENV: 'production',
        PORT: '5000',
        MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/prod',
        CORS_ORIGIN: 'https://admin.athleteconnect.com',
        JWT_SECRET: 'production_secure_jwt_secret_with_at_least_32_chars',
        RAZORPAY_KEY_ID: 'rzp_test_prod_key',
        RAZORPAY_KEY_SECRET: 'prod_secret_123',
      })
    ).toThrow(/Missing required environment variable: RAZORPAY_WEBHOOK_SECRET/);
  });
});
