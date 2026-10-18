import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file in the server directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export type NodeEnv = 'development' | 'production' | 'test';

export interface EnvConfig {
  NODE_ENV: NodeEnv;
  PORT: number;
  MONGODB_URI: string;
  CORS_ORIGIN: string | string[];
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

  return Object.freeze({
    NODE_ENV,
    PORT,
    MONGODB_URI,
    CORS_ORIGIN,
    isProduction,
    isTest,
    isDevelopment,
  });
}

export const config = validateAndLoadConfig();
