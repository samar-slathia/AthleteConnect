import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file during non-test execution.
// In test environments (NODE_ENV === 'test' or process.env.VITEST), do not automatically load server/.env
// to guarantee test isolation, preserve placeholder defaults, and prevent real outbound gateway calls.
const isTestRuntime = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
if (!isTestRuntime) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

export type NodeEnv = 'development' | 'production' | 'test';

export interface EnvConfig {
  NODE_ENV: NodeEnv;
  PORT: number;
  MONGODB_URI: string;
  CORS_ORIGIN: string | string[];
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  TRUST_PROXY: boolean | number | string;
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  RAZORPAY_WEBHOOK_SECRET: string;
  PLATFORM_COMMISSION_PERCENTAGE: number;
  COACH_ALLOCATION_PERCENTAGE: number;
  TAX_RATE_PERCENTAGE: number;
  PAYMENT_EXPIRY_MINUTES: number;
  isProduction: boolean;
  isTest: boolean;
  isDevelopment: boolean;
}

export function validateAndLoadConfig(env: NodeJS.ProcessEnv = process.env): EnvConfig {
  const NODE_ENV = (env.NODE_ENV || 'development') as NodeEnv;

  if (!['development', 'production', 'test'].includes(NODE_ENV)) {
    throw new Error(
      `Invalid NODE_ENV "${env.NODE_ENV}". Must be one of: development, production, test.`
    );
  }

  const isProduction = NODE_ENV === 'production';
  const isTest = NODE_ENV === 'test';
  const isDevelopment = NODE_ENV === 'development';

  // Port parsing and validation
  const portRaw = env.PORT || '5000';
  const PORT = parseInt(portRaw, 10);
  if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error(`Invalid PORT "${portRaw}". Must be a valid integer between 1 and 65535.`);
  }

  // MongoDB URI validation
  let MONGODB_URI = env.MONGODB_URI;
  if (!MONGODB_URI || MONGODB_URI.trim() === '') {
    if (isProduction) {
      throw new Error(
        'Missing required environment variable: MONGODB_URI. In production, a secure MongoDB connection string must be configured.'
      );
    }
    // Safe local default for non-production development and tests
    MONGODB_URI = 'mongodb://127.0.0.1:27017/athleteconnect';
  }

  // CORS Origin validation
  let CORS_ORIGIN: string | string[] = env.CORS_ORIGIN || 'http://localhost:5173';
  if (typeof CORS_ORIGIN === 'string' && CORS_ORIGIN.includes(',')) {
    CORS_ORIGIN = CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
  }

  if (isProduction) {
    if (CORS_ORIGIN === '*' || (Array.isArray(CORS_ORIGIN) && CORS_ORIGIN.includes('*'))) {
      throw new Error(
        'Insecure CORS configuration: Wildcard "*" origin is not permitted in production environment.'
      );
    }
    if (!env.CORS_ORIGIN) {
      throw new Error(
        'Missing required environment variable: CORS_ORIGIN. Explicit origins must be defined in production.'
      );
    }
  }

  // JWT Secret validation
  let JWT_SECRET = env.JWT_SECRET?.trim() || '';

  if (!JWT_SECRET) {
    if (isProduction || isDevelopment) {
      throw new Error(
        `Missing required environment variable: JWT_SECRET. In ${NODE_ENV}, a secure random secret of at least 32 characters must be configured.`
      );
    }
    // Safe isolated test fallback only when NODE_ENV === 'test' and no secret is explicitly injected
    JWT_SECRET = 'athleteconnect_test_jwt_secret_value_minimum_32_characters_long';
  }

  if (JWT_SECRET.length < 32) {
    throw new Error(
      `Invalid JWT_SECRET: Secret must be at least 32 characters long (received ${JWT_SECRET.length} characters).`
    );
  }

  const isPlaceholderSecret = [
    /placeholder/i,
    /change[-_]?me/i,
    /replace[-_]?with/i,
    /your[-_]?.*secret/i,
    /default[-_]?secret/i,
    /example/i,
  ].some((pattern) => pattern.test(JWT_SECRET));

  if (isPlaceholderSecret) {
    throw new Error(
      'Invalid JWT_SECRET: Placeholder or default values are not permitted. A cryptographically secure random secret of at least 32 characters is required.'
    );
  }

  // JWT Expiration validation
  const JWT_EXPIRES_IN = env.JWT_EXPIRES_IN?.trim() || '7d';
  if (!/^(\d+[smhdwy]|\d+)$/i.test(JWT_EXPIRES_IN)) {
    throw new Error(
      `Invalid JWT_EXPIRES_IN "${JWT_EXPIRES_IN}". Must be a valid duration string (e.g., "7d", "24h", "60m").`
    );
  }

  // Trusted proxy validation (disabled by default for direct connection security)
  let TRUST_PROXY: boolean | number | string = false;
  if (env.TRUST_PROXY !== undefined && env.TRUST_PROXY.trim() !== '') {
    const rawProxy = env.TRUST_PROXY.trim().toLowerCase();
    if (rawProxy === 'true' || rawProxy === '1') {
      TRUST_PROXY = true;
    } else if (rawProxy === 'false' || rawProxy === '0') {
      TRUST_PROXY = false;
    } else if (!isNaN(Number(rawProxy))) {
      TRUST_PROXY = Number(rawProxy);
    } else {
      TRUST_PROXY = env.TRUST_PROXY.trim();
    }
  }

  // Razorpay Test Mode Configuration & Security Validation
  let RAZORPAY_KEY_ID = env.RAZORPAY_KEY_ID?.trim() || '';
  let RAZORPAY_KEY_SECRET = env.RAZORPAY_KEY_SECRET?.trim() || '';
  let RAZORPAY_WEBHOOK_SECRET = env.RAZORPAY_WEBHOOK_SECRET?.trim() || '';

  // Strict prevention of live Razorpay credentials in non-production
  if (RAZORPAY_KEY_ID.startsWith('rzp_live_')) {
    throw new Error(
      'CRITICAL SECURITY ERROR: Live Razorpay credentials (rzp_live_*) detected! Live credentials are strictly forbidden in this environment.'
    );
  }

  // In test mode, guarantee safe placeholder credentials to enforce test isolation
  // and prevent accidental real outbound gateway requests using merchant credentials.
  // All three Razorpay credentials are unconditionally replaced with fixed safe placeholders.
  if (isTest) {
    RAZORPAY_KEY_ID = 'rzp_test_placeholder_key_id';
    RAZORPAY_KEY_SECRET = 'placeholder_razorpay_key_secret_test';
    RAZORPAY_WEBHOOK_SECRET = 'placeholder_razorpay_webhook_secret_test';
  } else {
    if (!RAZORPAY_KEY_ID) {
      if (isProduction) {
        throw new Error('Missing required environment variable: RAZORPAY_KEY_ID.');
      }
      RAZORPAY_KEY_ID = 'rzp_test_placeholder_key_id';
    }

    if (!RAZORPAY_KEY_SECRET) {
      if (isProduction) {
        throw new Error('Missing required environment variable: RAZORPAY_KEY_SECRET.');
      }
      RAZORPAY_KEY_SECRET = 'placeholder_razorpay_key_secret_test';
    }

    if (!RAZORPAY_WEBHOOK_SECRET) {
      if (isProduction) {
        throw new Error('Missing required environment variable: RAZORPAY_WEBHOOK_SECRET.');
      }
      RAZORPAY_WEBHOOK_SECRET = 'placeholder_razorpay_webhook_secret_test';
    }
  }

  // Marketplace Financial Configuration
  const rawComm = env.PLATFORM_COMMISSION_PERCENTAGE ?? '20';
  const PLATFORM_COMMISSION_PERCENTAGE = Number(rawComm);
  if (isNaN(PLATFORM_COMMISSION_PERCENTAGE) || PLATFORM_COMMISSION_PERCENTAGE < 0 || PLATFORM_COMMISSION_PERCENTAGE > 100) {
    throw new Error(`Invalid PLATFORM_COMMISSION_PERCENTAGE "${rawComm}". Must be a number between 0 and 100.`);
  }

  const rawAlloc = env.COACH_ALLOCATION_PERCENTAGE ?? '80';
  const COACH_ALLOCATION_PERCENTAGE = Number(rawAlloc);
  if (isNaN(COACH_ALLOCATION_PERCENTAGE) || COACH_ALLOCATION_PERCENTAGE < 0 || COACH_ALLOCATION_PERCENTAGE > 100) {
    throw new Error(`Invalid COACH_ALLOCATION_PERCENTAGE "${rawAlloc}". Must be a number between 0 and 100.`);
  }

  const rawTax = env.TAX_RATE_PERCENTAGE ?? '0';
  const TAX_RATE_PERCENTAGE = Number(rawTax);
  if (isNaN(TAX_RATE_PERCENTAGE) || TAX_RATE_PERCENTAGE < 0 || TAX_RATE_PERCENTAGE > 100) {
    throw new Error(`Invalid TAX_RATE_PERCENTAGE "${rawTax}". Must be a number between 0 and 100.`);
  }

  const rawExpiry = env.PAYMENT_EXPIRY_MINUTES ?? '120';
  const PAYMENT_EXPIRY_MINUTES = parseInt(String(rawExpiry), 10);
  if (isNaN(PAYMENT_EXPIRY_MINUTES) || PAYMENT_EXPIRY_MINUTES < 5 || PAYMENT_EXPIRY_MINUTES > 1440) {
    throw new Error(`Invalid PAYMENT_EXPIRY_MINUTES "${rawExpiry}". Must be an integer between 5 and 1440 minutes.`);
  }

  return Object.freeze({
    NODE_ENV,
    PORT,
    MONGODB_URI,
    CORS_ORIGIN,
    JWT_SECRET,
    JWT_EXPIRES_IN,
    TRUST_PROXY,
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET,
    PLATFORM_COMMISSION_PERCENTAGE,
    COACH_ALLOCATION_PERCENTAGE,
    TAX_RATE_PERCENTAGE,
    PAYMENT_EXPIRY_MINUTES,
    isProduction,
    isTest,
    isDevelopment,
  });
}

export const config = validateAndLoadConfig();
