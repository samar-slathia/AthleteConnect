import mongoose, { Schema, Model, ClientSession } from 'mongoose';
import crypto from 'crypto';
import { config } from '../config/env';

/**
 * Custom error class for schedule lock contention and transactional fencing conflicts.
 */
export class ScheduleConflictError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 409) {
    super(message);
    this.name = 'ScheduleConflictError';
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, ScheduleConflictError.prototype);
  }
}

/**
 * Interface for persistent, database-backed schedule lock documents.
 * Ensures mutual exclusion for booking acceptance and availability modifications
 * across distributed application workers using the unified 'coachId:SCHEDULE' key.
 */
export interface IScheduleLock {
  lockKey: string;           // "coachId:SCHEDULE"
  ownerToken: string | null; // UUID of the active lease holder
  fenceVersion: number;      // Strictly monotonic counter (never resets)
  acquiredAt: Date | null;
  expiresAt: Date;           // Purely a temporal boundary (NO TTL index)
  lastVerifiedAt?: Date | null;
  configVersion?: number;    // Tracks schedule definition versions
  lastMutationAt?: Date | null;
}

const ScheduleLockSchema = new Schema<IScheduleLock>(
  {
    lockKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    ownerToken: {
      type: String,
      default: null,
    },
    fenceVersion: {
      type: Number,
      default: 1,
      min: 1,
    },
    acquiredAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      // NOTE: NO TTL index here! Lock records must persist indefinitely across expirations.
    },
    lastVerifiedAt: {
      type: Date,
      default: null,
    },
    configVersion: {
      type: Number,
      default: 1,
      min: 1,
    },
    lastMutationAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const ScheduleLock: Model<IScheduleLock> =
  (mongoose.models.ScheduleLock as Model<IScheduleLock>) ||
  mongoose.model<IScheduleLock>('ScheduleLock', ScheduleLockSchema);

// In-process lock map for single-instance development and unit test environments
const activeInProcessLocks = new Map<string, Promise<void>>();

export const LEASE_DURATION_MS = 5000;
export const MAX_ACQUISITION_RETRIES = 3;

/**
 * Atomically acquires or reclaims a schedule lease on the coachId:SCHEDULE coordination document.
 * Guarantees monotonic fenceVersion increments and avoids resetting counters on expired leases.
 */
export async function acquireScheduleLease(
  lockKey: string,
  ownerToken: string,
  leaseDurationMs: number = LEASE_DURATION_MS
): Promise<IScheduleLock> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + leaseDurationMs);

  for (let attempt = 1; attempt <= MAX_ACQUISITION_RETRIES; attempt++) {
    try {
      const updated = await ScheduleLock.findOneAndUpdate(
        {
          lockKey,
          $or: [
            { ownerToken: null },
            { expiresAt: { $lt: now } }, // Expired lease can be safely reclaimed
          ],
        },
        {
          $set: {
            ownerToken,
            acquiredAt: now,
            expiresAt,
            lastVerifiedAt: now,
          },
          $inc: { fenceVersion: 1 }, // Strictly monotonic
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        }
      );

      if (updated) {
        return updated.toObject ? updated.toObject() : updated;
      }
    } catch (err: any) {
      // E11000 duplicate key contention on initial upsert race
      if (attempt < MAX_ACQUISITION_RETRIES) {
        const backoffMs = attempt * 50;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
    }

    if (attempt < MAX_ACQUISITION_RETRIES) {
      const backoffMs = attempt * 50;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw new ScheduleConflictError(
    'Coach schedule is currently locked by a concurrent operation. Please retry.',
    409
  );
}

/**
 * Conditionally releases a schedule lease ONLY if the caller's ownerToken matches.
 * Never deletes the persistent document and never clears a newer worker's lease.
 */
export async function releaseScheduleLease(
  lockKey: string,
  ownerToken: string
): Promise<boolean> {
  try {
    const res = await ScheduleLock.updateOne(
      { lockKey, ownerToken },
      {
        $set: {
          ownerToken: null,
          expiresAt: new Date(0), // Instantly marks lease as free for the next worker
        },
      }
    );
    return res.matchedCount === 1;
  } catch {
    return false;
  }
}

export interface TopologyInfo {
  isReplicaSet: boolean;
  setName?: string;
  isStandalone: boolean;
}

/**
 * Checks MongoDB cluster topology using the official 'hello' command (fallback 'isMaster').
 */
export async function checkMongoTopology(): Promise<TopologyInfo> {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return { isReplicaSet: false, isStandalone: true };
  }

  try {
    let res: any;
    try {
      res = await mongoose.connection.db.admin().command({ hello: 1 });
    } catch {
      res = await mongoose.connection.db.admin().command({ isMaster: 1 });
    }

    const isReplicaSet = Boolean(res.setName || res.hosts || res.msg === 'isdbgrid');
    return {
      isReplicaSet,
      setName: res.setName,
      isStandalone: !isReplicaSet,
    };
  } catch {
    return { isReplicaSet: false, isStandalone: true };
  }
}

/**
 * Inspects and safely drops any legacy TTL index on 'expiresAt' in the schedulelocks collection.
 * Ensures lock records persist indefinitely as monotonic coordination anchors.
 */
export async function migrateScheduleLockIndexes(db?: mongoose.mongo.Db): Promise<void> {
  const targetDb = db || mongoose.connection.db;
  const isProduction = config.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';

  if (!targetDb) {
    if (isProduction) {
      throw new Error('FATAL: Database connection not ready for ScheduleLock index migration.');
    }
    return;
  }

  try {
    // 1. Safely check collection existence
    let collectionExists = false;
    try {
      const collections = await targetDb.listCollections({ name: 'schedulelocks' }).toArray();
      collectionExists = collections.length > 0;
    } catch {
      collectionExists = false;
    }

    if (!collectionExists) {
      // Collection does not exist yet; safe to let Mongoose create it or create collection
      try {
        await targetDb.createCollection('schedulelocks');
      } catch {
        // Race condition or existing collection is harmless
      }
    }

    const collection = targetDb.collection('schedulelocks');

    // 2. Inspect existing indexes
    let indexes: any[] = [];
    try {
      indexes = await collection.indexes();
    } catch {
      indexes = [];
    }

    // 3. Drop only legacy TTL index on expiresAt (preserving all other indexes)
    const ttlIndex = indexes.find(
      (idx: any) =>
        idx.key &&
        (idx.key.expiresAt === 1 || idx.key.expiresAt === -1) &&
        typeof idx.expireAfterSeconds === 'number'
    );

    if (ttlIndex && ttlIndex.name) {
      console.log(`[Migration] Dropping legacy TTL index "${ttlIndex.name}" on schedulelocks...`);
      await collection.dropIndex(ttlIndex.name);
      console.log(`[Migration] Successfully removed legacy TTL index.`);
    }

    // 4. Ensure persistent unique index on lockKey
    await collection.createIndex({ lockKey: 1 }, { unique: true });
  } catch (err: any) {
    if (isProduction) {
      throw new Error(
        `FATAL: ScheduleLock index migration failed in production: ${err?.message || err}`
      );
    }
    console.warn(`[Migration] Non-fatal migration warning in non-production: ${err?.message || err}`);
  }
}

/**
 * Executes a schedule mutation (availability edit or booking acceptance) inside a unified
 * database transaction with monotonic fencing and lease ownership verification.
 */
export async function executeScheduleMutationWithRetry<T>(
  coachId: string,
  mutationFn: (session: ClientSession | null, fenceVersion: number) => Promise<T>
): Promise<T> {
  const lockKey = `${coachId}:SCHEDULE`;
  const ownerToken = crypto.randomUUID();

  // In-process mutex queues operations in the same Node process
  while (activeInProcessLocks.has(lockKey)) {
    try {
      await activeInProcessLocks.get(lockKey);
    } catch {
      // Prior operation completed
    }
  }

  let resolveMutex: () => void = () => {};
  const mutexPromise = new Promise<void>((resolve) => {
    resolveMutex = resolve;
  });
  activeInProcessLocks.set(lockKey, mutexPromise);

  let lockDoc: IScheduleLock | null = null;
  let leaseAcquired = false;

  try {
    // 1. Acquire DB Lease atomically if connection is established
    if (mongoose.connection.readyState === 1) {
      lockDoc = await acquireScheduleLease(lockKey, ownerToken, LEASE_DURATION_MS);
      leaseAcquired = true;
    }

    const currentFence = lockDoc ? lockDoc.fenceVersion : 1;

    // 2. Check replica set capability for multi-document transaction
    let session: ClientSession | null = null;
    let canUseTransactions = false;

    if (mongoose.connection.readyState === 1) {
      try {
        session = await mongoose.startSession();
        canUseTransactions = true;
      } catch {
        session = null;
        canUseTransactions = false;
      }
    }

    // Production policy: Transactions on replica set are strictly mandatory in production
    const isProduction = config.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';
    if (isProduction && !canUseTransactions) {
      throw new Error(
        'FATAL: AthleteConnect requires a MongoDB Replica Set in production for transactional schedule consistency.'
      );
    }

    // 3. Execute with Transaction if supported
    if (session && canUseTransactions) {
      try {
        let result: T;
        await session.withTransaction(async () => {
          // Re-verify lease expiry during any transaction retries
          const now = new Date();
          if (lockDoc && lockDoc.expiresAt.getTime() <= now.getTime()) {
            throw new ScheduleConflictError('Schedule lease expired during transaction execution.', 409);
          }

          // Execute business mutation
          result = await mutationFn(session, currentFence);

          // Assert coordination write on the shared ScheduleLock document within the transaction
          const lockAssert = await ScheduleLock.updateOne(
            {
              lockKey,
              ownerToken,
              fenceVersion: currentFence,
              expiresAt: { $gt: new Date() },
            },
            {
              $set: { lastVerifiedAt: new Date(), lastMutationAt: new Date() },
              $inc: { configVersion: 1 },
            }
          ).session(session);

          if (lockAssert.matchedCount !== 1) {
            throw new ScheduleConflictError(
              'Schedule lock fencing verification failed at commit time (preempted by another worker).',
              409
            );
          }
        });

        return result!;
      } finally {
        await session.endSession();
      }
    } else {
      // Development standalone fallback (single-process development only)
      if (config.NODE_ENV === 'development') {
        console.warn(
          `[ScheduleLock] Running in standalone development mode without replica set transactions for ${lockKey}.`
        );
      }
      return await mutationFn(null, currentFence);
    }
  } finally {
    if (leaseAcquired) {
      await releaseScheduleLease(lockKey, ownerToken);
    }
    activeInProcessLocks.delete(lockKey);
    resolveMutex();
  }
}

/**
 * Backward-compatible wrapper for withCoachScheduleLock that routes through the unified
 * coachId:SCHEDULE coordination protocol.
 */
export async function withCoachScheduleLock<T>(
  coachId: string,
  _date: string,
  criticalSection: () => Promise<T>
): Promise<T> {
  return executeScheduleMutationWithRetry(coachId, async () => {
    return await criticalSection();
  });
}
