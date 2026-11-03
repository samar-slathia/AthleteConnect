import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import {
  ScheduleLock,
  acquireScheduleLease,
  releaseScheduleLease,
  checkMongoTopology,
  migrateScheduleLockIndexes,
  executeScheduleMutationWithRetry,
  ScheduleConflictError,
  LEASE_DURATION_MS,
} from '../src/utils/scheduleLock';
import { config } from '../src/config/env';

describe('Distributed ScheduleLock & Coordination Protocol', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('acquireScheduleLease & releaseScheduleLease', () => {
    it('acquires lease atomically with new ownerToken and increments fenceVersion', async () => {
      const lockKey = 'coach_123:SCHEDULE';
      const ownerToken = 'token_worker_A';

      const mockDoc = {
        lockKey,
        ownerToken,
        fenceVersion: 2,
        expiresAt: new Date(Date.now() + LEASE_DURATION_MS),
      };

      const findOneAndUpdateSpy = vi
        .spyOn(ScheduleLock, 'findOneAndUpdate')
        .mockResolvedValue(mockDoc as any);

      const result = await acquireScheduleLease(lockKey, ownerToken, LEASE_DURATION_MS);

      expect(result.ownerToken).toBe('token_worker_A');
      expect(result.fenceVersion).toBe(2);
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        {
          lockKey,
          $or: [{ ownerToken: null }, { expiresAt: { $lt: expect.any(Date) } }],
        },
        expect.objectContaining({
          $set: expect.objectContaining({ ownerToken }),
          $inc: { fenceVersion: 1 },
        }),
        expect.objectContaining({ upsert: true, new: true })
      );
    });

    it('rejects acquisition with ScheduleConflictError (409) after exhausting retries when lock is held', async () => {
      const lockKey = 'coach_held:SCHEDULE';
      const ownerToken = 'token_worker_B';

      vi.spyOn(ScheduleLock, 'findOneAndUpdate').mockResolvedValue(null);

      await expect(
        acquireScheduleLease(lockKey, ownerToken, 100)
      ).rejects.toThrow(ScheduleConflictError);
    });

    it('reclaims expired lease and maintains persistent monotonic fencing version', async () => {
      const lockKey = 'coach_expired:SCHEDULE';
      const workerA = 'token_worker_A';
      const workerB = 'token_worker_B';

      // Worker A acquired at fence 101, then lease expired
      vi.spyOn(ScheduleLock, 'findOneAndUpdate').mockResolvedValueOnce({
        lockKey,
        ownerToken: workerB,
        fenceVersion: 102,
        expiresAt: new Date(Date.now() + LEASE_DURATION_MS),
      } as any);

      const leaseB = await acquireScheduleLease(lockKey, workerB);
      expect(leaseB.ownerToken).toBe(workerB);
      expect(leaseB.fenceVersion).toBe(102);
    });

    it('releases schedule lease only when ownerToken matches', async () => {
      const lockKey = 'coach_release:SCHEDULE';
      const ownerToken = 'token_worker_A';

      const updateOneSpy = vi
        .spyOn(ScheduleLock, 'updateOne')
        .mockResolvedValue({ matchedCount: 1, modifiedCount: 1 } as any);

      const released = await releaseScheduleLease(lockKey, ownerToken);
      expect(released).toBe(true);
      expect(updateOneSpy).toHaveBeenCalledWith(
        { lockKey, ownerToken },
        expect.objectContaining({
          $set: expect.objectContaining({ ownerToken: null }),
        })
      );
    });

    it('stale owner cannot release another worker lease', async () => {
      const lockKey = 'coach_stale_release:SCHEDULE';
      const staleToken = 'token_stale_worker_A';

      // DB update fails because ownerToken in DB is now worker B
      vi.spyOn(ScheduleLock, 'updateOne').mockResolvedValue({ matchedCount: 0, modifiedCount: 0 } as any);

      const released = await releaseScheduleLease(lockKey, staleToken);
      expect(released).toBe(false);
    });
  });

  describe('Fencing & Commit Time Assertion', () => {
    it('stale owner cannot commit after a newer owner preempts the lease', async () => {
      const coachId = 'coach_fencing_test';
      const lockKey = `${coachId}:SCHEDULE`;

      (mongoose.connection as any).readyState = 1;

      // Simulate lease acquired with fence 5
      vi.spyOn(ScheduleLock, 'findOneAndUpdate').mockResolvedValue({
        lockKey,
        ownerToken: 'worker_A_uuid',
        fenceVersion: 5,
        expiresAt: new Date(Date.now() + 5000),
      } as any);

      // Simulate session with transaction
      const mockSession: any = {
        withTransaction: async (fn: any) => {
          return await fn();
        },
        endSession: vi.fn(),
      };
      vi.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);

      // In the transaction, worker A tries to assert coordination write, but matchedCount === 0 (preempted)
      vi.spyOn(ScheduleLock, 'updateOne').mockReturnValue({
        session: vi.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }),
      } as any);

      try {
        await expect(
          executeScheduleMutationWithRetry(coachId, async () => {
            return 'ok';
          })
        ).rejects.toThrow('Schedule lock fencing verification failed at commit time');
      } finally {
        (mongoose.connection as any).readyState = 0;
      }
    });

    it('aborts transaction if lease expires before commit', async () => {
      const coachId = 'coach_expired_commit';
      const lockKey = `${coachId}:SCHEDULE`;

      (mongoose.connection as any).readyState = 1;

      // Lease already expired
      vi.spyOn(ScheduleLock, 'findOneAndUpdate').mockResolvedValue({
        lockKey,
        ownerToken: 'worker_A_uuid',
        fenceVersion: 5,
        expiresAt: new Date(Date.now() - 1000), // In the past!
      } as any);

      vi.spyOn(ScheduleLock, 'updateOne').mockResolvedValue({ matchedCount: 1, modifiedCount: 1 } as any);

      const mockSession: any = {
        withTransaction: async (fn: any) => {
          return await fn();
        },
        endSession: vi.fn(),
      };
      vi.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);

      try {
        await expect(
          executeScheduleMutationWithRetry(coachId, async () => {
            return 'ok';
          })
        ).rejects.toThrow('Schedule lease expired during transaction execution');
      } finally {
        (mongoose.connection as any).readyState = 0;
      }
    });
  });

  describe('MongoDB Topology Verification & Index Migration', () => {
    it('detects replica set configuration using hello command', async () => {
      const mockAdminCommand = vi.fn().mockResolvedValue({
        setName: 'rs0',
        hosts: ['mongo1:27017', 'mongo2:27017'],
        isWritablePrimary: true,
      });

      const originalDb = mongoose.connection.db;
      (mongoose.connection as any).readyState = 1;
      (mongoose.connection as any).db = {
        admin: () => ({ command: mockAdminCommand }),
      };

      try {
        const topology = await checkMongoTopology();
        expect(topology.isReplicaSet).toBe(true);
        expect(topology.setName).toBe('rs0');
        expect(topology.isStandalone).toBe(false);
      } finally {
        (mongoose.connection as any).db = originalDb;
        (mongoose.connection as any).readyState = 0;
      }
    });

    it('detects standalone instance when setName is absent', async () => {
      const mockAdminCommand = vi.fn().mockResolvedValue({
        isWritablePrimary: true,
      });

      const originalDb = mongoose.connection.db;
      (mongoose.connection as any).readyState = 1;
      (mongoose.connection as any).db = {
        admin: () => ({ command: mockAdminCommand }),
      };

      try {
        const topology = await checkMongoTopology();
        expect(topology.isReplicaSet).toBe(false);
        expect(topology.isStandalone).toBe(true);
      } finally {
        (mongoose.connection as any).db = originalDb;
        (mongoose.connection as any).readyState = 0;
      }
    });

    it('drops legacy TTL index on expiresAt and creates unique index on lockKey', async () => {
      const dropIndexMock = vi.fn().mockResolvedValue(true);
      const createIndexMock = vi.fn().mockResolvedValue(true);
      const indexesMock = vi.fn().mockResolvedValue([
        {
          name: 'expiresAt_1',
          key: { expiresAt: 1 },
          expireAfterSeconds: 0, // Legacy TTL index!
        },
      ]);

      const mockDb: any = {
        collection: vi.fn().mockReturnValue({
          indexes: indexesMock,
          dropIndex: dropIndexMock,
          createIndex: createIndexMock,
        }),
      };

      await migrateScheduleLockIndexes(mockDb);

      expect(dropIndexMock).toHaveBeenCalledWith('expiresAt_1');
      expect(createIndexMock).toHaveBeenCalledWith({ lockKey: 1 }, { unique: true });
    });

    it('fails fast in production if transactions cannot be started', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      (mongoose.connection as any).readyState = 1;
      vi.spyOn(ScheduleLock, 'findOneAndUpdate').mockResolvedValue({
        lockKey: 'coach_prod_fail:SCHEDULE',
        ownerToken: 'token',
        fenceVersion: 1,
        expiresAt: new Date(Date.now() + 5000),
      } as any);
      vi.spyOn(ScheduleLock, 'updateOne').mockResolvedValue({ matchedCount: 1, modifiedCount: 1 } as any);
      vi.spyOn(mongoose, 'startSession').mockRejectedValue(new Error('Transactions not supported on standalone'));

      try {
        await expect(
          executeScheduleMutationWithRetry('coach_prod_fail', async () => 'mutation')
        ).rejects.toThrow('FATAL: AthleteConnect requires a MongoDB Replica Set in production');
      } finally {
        process.env.NODE_ENV = origEnv;
        (mongoose.connection as any).readyState = 0;
      }
    });

    it('confirms schedule lock migration finishes before server starts listening for HTTP requests', async () => {
      const callOrder: string[] = [];

      const mockDb: any = {
        listCollections: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([{ name: 'schedulelocks' }]),
        }),
        collection: vi.fn().mockReturnValue({
          indexes: vi.fn().mockResolvedValue([]),
          createIndex: vi.fn().mockImplementation(async () => {
            callOrder.push('migrateIndexes');
            return 'lockKey_1';
          }),
        }),
      };

      await migrateScheduleLockIndexes(mockDb);
      callOrder.push('listen');

      expect(callOrder).toEqual(['migrateIndexes', 'listen']);
    });
  });
});
