import mongoose from 'mongoose';
import { config } from './env';

export interface DatabaseConnectionInfo {
  host: string;
  name: string;
  readyState: number;
}

/**
 * Sanitizes MongoDB connection URI for safe console logging without leaking credentials.
 */
export function sanitizeMongoUri(uri: string): string {
  try {
    const url = new URL(uri);
    if (url.password) {
      url.password = '****';
    }
    return url.toString();
  } catch {
    // Fallback for non-standard connection strings or simple names
    return uri.replace(/:([^@/]+)@/, ':****@');
  }
}

/**
 * Connects to MongoDB using Mongoose.
 * Fails clearly if the URI is invalid or connection cannot be established.
 */
export async function connectDatabase(uri?: string): Promise<typeof mongoose> {
  const targetUri = uri || config.MONGODB_URI;

  if (!targetUri || targetUri.trim() === '') {
    throw new Error('Database connection failed: MONGODB_URI is empty or undefined.');
  }

  const safeLogUri = sanitizeMongoUri(targetUri);

  try {
    // Avoid multiple connections if already connected
    if (mongoose.connection.readyState === 1) {
      return mongoose;
    }

    const connection = await mongoose.connect(targetUri, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of hanging indefinitely
    });

    if (!config.isTest) {
      console.log(`[Database] Connected successfully to ${safeLogUri}`);
    }

    return connection;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Database] Connection error on ${safeLogUri}: ${message}`);
    throw new Error(`Failed to connect to database at ${safeLogUri}: ${message}`);
  }
}

/**
 * Gracefully disconnects from MongoDB.
 */
export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    if (!config.isTest) {
      console.log('[Database] Disconnected successfully');
    }
  }
}

/**
 * Returns current Mongoose connection state:
 * 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
 */
export function getDatabaseState(): number {
  return mongoose.connection.readyState;
}
