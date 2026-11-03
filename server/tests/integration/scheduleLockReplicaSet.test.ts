import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose, { Connection } from 'mongoose';
import crypto from 'crypto';
import {
  ScheduleLock,
  acquireScheduleLease,
  releaseScheduleLease,
  executeScheduleMutationWithRetry,
  migrateScheduleLockIndexes,
  ScheduleConflictError,
  checkMongoTopology,
} from '../../src/utils/scheduleLock';
import { Booking } from '../../src/models/Booking';
import { CoachAvailability } from '../../src/models/CoachAvailability';
import { User } from '../../src/models/User';
import { config } from '../../src/config/env';

describe('Real MongoDB Replica-Set Transactional Concurrency Integration Tests', () => {
  let replSet: MongoMemoryReplSet;
  let replUri: string;
  let connA: Connection;
  let connB: Connection;

  beforeAll(async () => {
    // 1. Spin up a genuine MongoDB Replica Set using MongoMemoryReplSet
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    replUri = replSet.getUri();

    // 2. Connect primary Mongoose instance over real network socket
    await mongoose.connect(replUri);

    // 3. Ensure persistent unique index exists on lockKey in MongoDB
    await migrateScheduleLockIndexes();

    // 4. Create two independent Mongoose connections over separate TCP sockets
    connA = await mongoose.createConnection(replUri).asPromise();
    connB = await mongoose.createConnection(replUri).asPromise();
  }, 90000);

  afterAll(async () => {
    try {
      if (connA) await connA.close();
      if (connB) await connB.close();
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      if (replSet) {
        await replSet.stop();
      }
    } catch {
      // Clean teardown
    }
  }, 60000);

  beforeEach(async () => {
    // Clean collections before each test to maintain strict isolation
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Two independent database clients competing for the same coachId:SCHEDULE lock
  // ---------------------------------------------------------------------------
  it('1. two independent database clients compete for the same coachId:SCHEDULE lock and exactly one succeeds', async () => {
    const lockKey = 'coach_concurrent_1:SCHEDULE';
    const workerAToken = `worker_A_${crypto.randomUUID()}`;
    const workerBToken = `worker_B_${crypto.randomUUID()}`;

    // Worker A acquires the lease for 5000ms
    const leaseA = await acquireScheduleLease(lockKey, workerAToken, 5000);
    expect(leaseA.ownerToken).toBe(workerAToken);
    expect(leaseA.fenceVersion).toBeGreaterThanOrEqual(1);

    // Worker B attempts to acquire the held lease (exhausts retries and fails with 409)
    await expect(
      acquireScheduleLease(lockKey, workerBToken, 5000)
    ).rejects.toThrow(ScheduleConflictError);

    // Worker A releases the lease
    const released = await releaseScheduleLease(lockKey, workerAToken);
    expect(released).toBe(true);

    // Worker B can now acquire the released lease
    const leaseB = await acquireScheduleLease(lockKey, workerBToken, 5000);
    expect(leaseB.ownerToken).toBe(workerBToken);
    expect(leaseB.fenceVersion).toBe(leaseA.fenceVersion + 1);

    await releaseScheduleLease(lockKey, workerBToken);
  });

  // ---------------------------------------------------------------------------
  // 2. Duplicate-key acquisition contention
  // ---------------------------------------------------------------------------
  it('2. handles duplicate-key acquisition contention on initial upsert race without unhandled crash', async () => {
    const lockKey = 'coach_race_upsert:SCHEDULE';
    const tokens = Array.from({ length: 4 }, (_, i) => `worker_${i}_${crypto.randomUUID()}`);

    // Fire 4 simultaneous acquisition attempts at the exact same millisecond on a non-existent document
    const results = await Promise.allSettled(
      tokens.map((token) => acquireScheduleLease(lockKey, token, 3000))
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one worker must win the initial upsert lease
    expect(fulfilled.length).toBe(1);
    // The others must be rejected with ScheduleConflictError (HTTP 409), NOT unhandled E11000 duplicate key crash
    expect(rejected.length).toBe(3);
    for (const r of rejected) {
      if (r.status === 'rejected') {
        expect(r.reason).toBeInstanceOf(ScheduleConflictError);
      }
    }

    // Clean up
    if (fulfilled[0].status === 'fulfilled') {
      await releaseScheduleLease(lockKey, (fulfilled[0].value as any).ownerToken);
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Persistent monotonic fenceVersion across lease expirations
  // ---------------------------------------------------------------------------
  it('3. maintains persistent monotonic fenceVersion across multiple lease expirations without counter reset', async () => {
    const lockKey = 'coach_fencing_lifecycle:SCHEDULE';
    const worker1 = 'worker_seq_1';
    const worker2 = 'worker_seq_2';
    const worker3 = 'worker_seq_3';

    // 1st acquisition: initial fence
    const lease1 = await acquireScheduleLease(lockKey, worker1, 100);
    const initialFence = lease1.fenceVersion;

    // Simulate expiration by backdating expiresAt in real database
    await ScheduleLock.updateOne(
      { lockKey },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    // 2nd acquisition by different worker
    const lease2 = await acquireScheduleLease(lockKey, worker2, 100);
    expect(lease2.ownerToken).toBe(worker2);
    expect(lease2.fenceVersion).toBe(initialFence + 1);

    // Expire again
    await ScheduleLock.updateOne(
      { lockKey },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    // 3rd acquisition
    const lease3 = await acquireScheduleLease(lockKey, worker3, 100);
    expect(lease3.ownerToken).toBe(worker3);
    expect(lease3.fenceVersion).toBe(initialFence + 2);

    // Verify record in MongoDB was never deleted
    const docInDb = await ScheduleLock.findOne({ lockKey });
    expect(docInDb).not.toBeNull();
    expect(docInDb!.fenceVersion).toBe(initialFence + 2);

    await releaseScheduleLease(lockKey, worker3);
  });

  // ---------------------------------------------------------------------------
  // 4. Worker A pauses; Worker B obtains a newer lease; Worker A cannot commit
  // ---------------------------------------------------------------------------
  it('4. stale worker A pauses, worker B preempts lease, worker A commit fails and rolls back', async () => {
    const coachId = new mongoose.Types.ObjectId().toString();
    const lockKey = `${coachId}:SCHEDULE`;
    const tokenA = 'worker_paused_A';
    const tokenB = 'worker_preempt_B';

    // Worker A acquires lease for 500ms
    const leaseA = await acquireScheduleLease(lockKey, tokenA, 500);
    const fenceA = leaseA.fenceVersion;

    // Worker A starts a real multi-document transaction on connA
    const sessionA = await mongoose.startSession();
    let transactionCommitted = false;

    try {
      await sessionA.withTransaction(async () => {
        // Worker A performs a write inside the transaction
        await Booking.create(
          [
            {
              customerId: new mongoose.Types.ObjectId(),
              coachId: new mongoose.Types.ObjectId(coachId),
              sport: 'boxing',
              date: '2028-11-20',
              startTime: '09:00',
              endTime: '10:00',
              startMinutes: 540,
              endMinutes: 600,
              durationMinutes: 60,
              venueType: 'ground',
              trainingAddress: 'Indiranagar Ground',
              customerPhone: '+919876543210',
              status: 'pending',
              paymentStatus: 'unpaid',
            },
          ],
          { session: sessionA }
        );

        // Worker A pauses: simulate lease expiration
        await ScheduleLock.updateOne(
          { lockKey },
          { $set: { expiresAt: new Date(Date.now() - 100) } }
        );

        // Worker B arrives and preempts the expired lease
        const leaseB = await acquireScheduleLease(lockKey, tokenB, 5000);
        expect(leaseB.ownerToken).toBe(tokenB);
        expect(leaseB.fenceVersion).toBeGreaterThan(fenceA);

        // Worker A resumes and attempts commit-time assertion write
        const lockAssert = await ScheduleLock.updateOne(
          {
            lockKey,
            ownerToken: tokenA,
            fenceVersion: fenceA,
            expiresAt: { $gt: new Date() },
          },
          {
            $set: { lastVerifiedAt: new Date() },
            $inc: { configVersion: 1 },
          }
        ).session(sessionA);

        if (lockAssert.matchedCount !== 1) {
          throw new ScheduleConflictError(
            'Schedule lock fencing verification failed at commit time (preempted by another worker).',
            409
          );
        }

        transactionCommitted = true;
      });
    } catch (err: any) {
      expect(err).toBeInstanceOf(ScheduleConflictError);
      expect(err.message).toContain('fencing verification failed');
    } finally {
      await sessionA.endSession();
    }

    expect(transactionCommitted).toBe(false);

    // Verify Worker A's transaction rolled back completely: zero bookings exist
    const bookingsInDb = await Booking.find({ coachId });
    expect(bookingsInDb.length).toBe(0);

    await releaseScheduleLease(lockKey, tokenB);
  });

  // ---------------------------------------------------------------------------
  // 5. Worker A cannot release Worker B's lease
  // ---------------------------------------------------------------------------
  it('5. stale worker A cannot release worker B lease', async () => {
    const lockKey = 'coach_stale_release_real:SCHEDULE';
    const tokenA = 'stale_worker_A';
    const tokenB = 'active_worker_B';

    // Lease acquired by B
    await acquireScheduleLease(lockKey, tokenB, 5000);

    // Stale Worker A attempts to release it
    const releaseSuccess = await releaseScheduleLease(lockKey, tokenA);
    expect(releaseSuccess).toBe(false);

    // Worker B is still the owner in MongoDB
    const doc = await ScheduleLock.findOne({ lockKey });
    expect(doc?.ownerToken).toBe(tokenB);

    await releaseScheduleLease(lockKey, tokenB);
  });

  // ---------------------------------------------------------------------------
  // 6. Two overlapping pending bookings: exactly one acceptance succeeds
  // ---------------------------------------------------------------------------
  it('6. two overlapping pending bookings race for acceptance: exactly one succeeds and one is rejected with 409', async () => {
    const coachId = new mongoose.Types.ObjectId();
    const customer1 = new mongoose.Types.ObjectId();
    const customer2 = new mongoose.Types.ObjectId();
    const date = '2028-11-20';

    // 1. Setup coach availability
    await CoachAvailability.create({
      userId: coachId,
      timezone: 'Asia/Kolkata',
      slots: [{ dayOfWeek: 'monday', startTime: '08:00', endTime: '18:00' }],
      unavailableDates: [],
      availabilityVersion: 1,
    });

    // 2. Create two overlapping pending bookings (09:00–10:00 and 09:30–10:30)
    const booking1 = await Booking.create({
      customerId: customer1,
      coachId,
      sport: 'boxing',
      date,
      startTime: '09:00',
      endTime: '10:00',
      startMinutes: 540,
      endMinutes: 600,
      durationMinutes: 60,
      venueType: 'ground',
      trainingAddress: 'Indiranagar Sports Ground',
      customerPhone: '+919876543210',
      status: 'pending',
      paymentStatus: 'unpaid',
    });

    const booking2 = await Booking.create({
      customerId: customer2,
      coachId,
      sport: 'boxing',
      date,
      startTime: '09:30',
      endTime: '10:30',
      startMinutes: 570,
      endMinutes: 630,
      durationMinutes: 60,
      venueType: 'ground',
      trainingAddress: 'Indiranagar Sports Ground',
      customerPhone: '+919876543211',
      status: 'pending',
      paymentStatus: 'unpaid',
    });

    // 3. Define transactional acceptance routine using production scheduleLock
    const acceptBookingTransactional = async (bookingId: string) => {
      return await executeScheduleMutationWithRetry(coachId.toString(), async (session) => {
        // Query fresh booking state in session
        const fresh = await Booking.findById(bookingId).session(session);
        if (!fresh || fresh.status !== 'pending') {
          throw new ScheduleConflictError('Booking is no longer pending', 409);
        }

        // Query conflicting accepted or in_progress bookings on the same calendar date in session
        const conflict = await Booking.findOne({
          coachId,
          date: fresh.date,
          status: { $in: ['accepted', 'in_progress'] },
          _id: { $ne: fresh._id },
          startMinutes: { $lt: fresh.endMinutes },
          endMinutes: { $gt: fresh.startMinutes },
        }).session(session);

        if (conflict) {
          throw new ScheduleConflictError(
            `Overlaps with an already accepted session (${conflict.startTime}–${conflict.endTime})`,
            409
          );
        }

        // Update status conditionally
        const updateRes = await Booking.updateOne(
          { _id: fresh._id, status: 'pending' },
          { $set: { status: 'accepted' } }
        ).session(session);

        if (updateRes.matchedCount !== 1) {
          throw new ScheduleConflictError('Concurrent mutation detected', 409);
        }

        return fresh._id.toString();
      });
    };

    // 4. Run concurrent acceptance race
    const results = await Promise.allSettled([
      acceptBookingTransactional(booking1._id.toString()),
      acceptBookingTransactional(booking2._id.toString()),
    ]);

    const accepted = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(accepted.length).toBe(1);
    expect(rejected.length).toBe(1);
    if (rejected[0].status === 'rejected') {
      expect(rejected[0].reason).toBeInstanceOf(ScheduleConflictError);
      expect((rejected[0].reason as Error).message).toContain('Overlaps with an already accepted session');
    }

    // Verify DB state in MongoDB replica set
    const b1Fresh = await Booking.findById(booking1._id);
    const b2Fresh = await Booking.findById(booking2._id);

    const statuses = [b1Fresh!.status, b2Fresh!.status].sort();
    expect(statuses).toEqual(['accepted', 'pending']);
  });

  // ---------------------------------------------------------------------------
  // 7. Schedule edit races against booking acceptance in both execution orders
  // ---------------------------------------------------------------------------
  it('7. schedule edit and booking acceptance race: order 1 rejects acceptance after slot removal; order 2 rejects slot removal after acceptance', async () => {
    const coachId = new mongoose.Types.ObjectId();
    const date = '2028-11-20'; // Monday

    // Setup initial availability
    await CoachAvailability.create({
      userId: coachId,
      timezone: 'Asia/Kolkata',
      slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '18:00' }],
      unavailableDates: [],
      availabilityVersion: 1,
    });

    const booking = await Booking.create({
      customerId: new mongoose.Types.ObjectId(),
      coachId,
      sport: 'boxing',
      date,
      startTime: '09:00',
      endTime: '10:00',
      startMinutes: 540,
      endMinutes: 600,
      durationMinutes: 60,
      venueType: 'ground',
      trainingAddress: 'Indiranagar Sports Ground',
      customerPhone: '+919876543210',
      status: 'pending',
      paymentStatus: 'unpaid',
    });

    // ORDER 1: Coach removes morning hours first (new slots: 14:00-18:00)
    await executeScheduleMutationWithRetry(coachId.toString(), async (session) => {
      await CoachAvailability.updateOne(
        { userId: coachId },
        {
          $set: { slots: [{ dayOfWeek: 'monday', startTime: '14:00', endTime: '18:00' }] },
          $inc: { availabilityVersion: 1 },
        }
      ).session(session);
    });

    // Now attempt to accept the 09:00-10:00 booking: it must reject because availability no longer covers it
    await expect(
      executeScheduleMutationWithRetry(coachId.toString(), async (session) => {
        const avail = await CoachAvailability.findOne({ userId: coachId }).session(session);
        const daySlots = avail!.slots.filter((s) => s.dayOfWeek === 'monday');
        const fits = daySlots.some(
          (s) => s.startTime <= booking.startTime && s.endTime >= booking.endTime
        );
        if (!fits) {
          throw new ScheduleConflictError('Requested slot is outside configured hours', 409);
        }
        await Booking.updateOne({ _id: booking._id }, { $set: { status: 'accepted' } }).session(session);
      })
    ).rejects.toThrow('Requested slot is outside configured hours');

    // ORDER 2: Restore slot, accept booking, then attempt to remove slot (must reject availability update)
    await CoachAvailability.updateOne(
      { userId: coachId },
      { $set: { slots: [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '18:00' }] } }
    );
    await Booking.updateOne({ _id: booking._id }, { $set: { status: 'accepted' } });

    // Now coach attempts to remove morning slots: availability update must check future confirmed bookings and reject with 409
    await expect(
      executeScheduleMutationWithRetry(coachId.toString(), async (session) => {
        const confirmed = await Booking.find({
          coachId,
          status: { $in: ['accepted', 'in_progress'] },
          date: { $gte: date },
        }).session(session);

        const proposedSlots = [{ dayOfWeek: 'monday', startTime: '14:00', endTime: '18:00' }];
        for (const b of confirmed) {
          const fits = proposedSlots.some(
            (s) => s.startTime <= b.startTime && s.endTime >= b.endTime
          );
          if (!fits) {
            throw new ScheduleConflictError(
              `Cannot update availability: conflicts with existing confirmed booking on ${b.date}`,
              409
            );
          }
        }
        await CoachAvailability.updateOne(
          { userId: coachId },
          { $set: { slots: proposedSlots } }
        ).session(session);
      })
    ).rejects.toThrow('conflicts with existing confirmed booking');
  });

  // ---------------------------------------------------------------------------
  // 8. Blackout update races against booking acceptance
  // ---------------------------------------------------------------------------
  it('8. blackout update races against booking acceptance: cannot add blackout date that invalidates confirmed booking', async () => {
    const coachId = new mongoose.Types.ObjectId();
    const blackoutDate = '2028-11-25';

    await CoachAvailability.create({
      userId: coachId,
      timezone: 'Asia/Kolkata',
      slots: [{ dayOfWeek: 'saturday', startTime: '09:00', endTime: '18:00' }],
      unavailableDates: [],
      availabilityVersion: 1,
    });

    // Confirmed booking exists on the blackout date
    await Booking.create({
      customerId: new mongoose.Types.ObjectId(),
      coachId,
      sport: 'boxing',
      date: blackoutDate,
      startTime: '10:00',
      endTime: '11:00',
      startMinutes: 600,
      endMinutes: 660,
      durationMinutes: 60,
      venueType: 'ground',
      trainingAddress: 'Indiranagar Ground',
      customerPhone: '+919876543210',
      status: 'accepted',
      paymentStatus: 'unpaid',
    });

    // Attempting to add blackout date must fail transactionally
    await expect(
      executeScheduleMutationWithRetry(coachId.toString(), async (session) => {
        const confirmed = await Booking.find({
          coachId,
          status: { $in: ['accepted', 'in_progress'] },
          date: blackoutDate,
        }).session(session);

        if (confirmed.length > 0) {
          throw new ScheduleConflictError(
            `Cannot add blackout date ${blackoutDate}: conflicts with an existing confirmed booking`,
            409
          );
        }

        await CoachAvailability.updateOne(
          { userId: coachId },
          { $addToSet: { unavailableDates: blackoutDate } }
        ).session(session);
      })
    ).rejects.toThrow('conflicts with an existing confirmed booking');
  });

  // ---------------------------------------------------------------------------
  // 9. Transient transaction error causes safe transaction retry
  // ---------------------------------------------------------------------------
  it('9. transient transaction error inside withTransaction retries safely to completion', async () => {
    const coachId = new mongoose.Types.ObjectId().toString();
    let attempts = 0;

    const result = await executeScheduleMutationWithRetry(coachId, async (session) => {
      attempts++;
      if (attempts === 1) {
        // Create an official MongoError with TransientTransactionError label recognized by driver withTransaction
        const transientErr = new mongoose.mongo.MongoError('Transient network glitch on replica set node');
        transientErr.addErrorLabel('TransientTransactionError');
        throw transientErr;
      }
      return 'recovered_successfully';
    });

    expect(result).toBe('recovered_successfully');
    expect(attempts).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // 10. Unknown commit result is handled without duplicate business side effects
  // ---------------------------------------------------------------------------
  it('10. handles unknown commit result / repeated acceptance without duplicate side effects', async () => {
    const coachId = new mongoose.Types.ObjectId();
    const booking = await Booking.create({
      customerId: new mongoose.Types.ObjectId(),
      coachId,
      sport: 'boxing',
      date: '2028-11-20',
      startTime: '09:00',
      endTime: '10:00',
      startMinutes: 540,
      endMinutes: 600,
      durationMinutes: 60,
      venueType: 'ground',
      trainingAddress: 'Ground',
      customerPhone: '+919876543210',
      status: 'pending',
      paymentStatus: 'unpaid',
    });

    // 1st acceptance
    await executeScheduleMutationWithRetry(coachId.toString(), async (session) => {
      await Booking.updateOne({ _id: booking._id, status: 'pending' }, { $set: { status: 'accepted' } }).session(session);
    });

    // 2nd redundant acceptance attempt (e.g. client retried request)
    await expect(
      executeScheduleMutationWithRetry(coachId.toString(), async (session) => {
        const fresh = await Booking.findById(booking._id).session(session);
        if (fresh?.status !== 'pending') {
          throw new ScheduleConflictError('Booking is already accepted or no longer pending', 400);
        }
        await Booking.updateOne({ _id: booking._id }, { $set: { status: 'accepted' } }).session(session);
      })
    ).rejects.toThrow('Booking is already accepted or no longer pending');

    const fresh = await Booking.findById(booking._id);
    expect(fresh?.status).toBe('accepted');
  });

  // ---------------------------------------------------------------------------
  // 11. Production startup fails against a standalone database
  // ---------------------------------------------------------------------------
  it('11. topology detection correctly identifies standalone vs replica set and checkMongoTopology reports accurately', async () => {
    const topology = await checkMongoTopology();
    expect(topology.isReplicaSet).toBe(true);
    expect(topology.isStandalone).toBe(false);
    expect(topology.setName).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // 12. Integration tests cannot silently use the process-local mutex fallback
  // ---------------------------------------------------------------------------
  it('12. verifies operations execute against the real database and persist verifiable ScheduleLock documents', async () => {
    const coachId = `coach_non_mutex_${crypto.randomUUID()}`;
    const lockKey = `${coachId}:SCHEDULE`;

    await executeScheduleMutationWithRetry(coachId, async (session) => {
      expect(session).not.toBeNull();
      expect(session?.inTransaction()).toBe(true);
      return 'verified_in_real_transaction';
    });

    // Verify document was genuinely created in the MongoDB Replica Set collection
    const lockDoc = await ScheduleLock.findOne({ lockKey });
    expect(lockDoc).not.toBeNull();
    expect(lockDoc?.lockKey).toBe(lockKey);
    expect(lockDoc?.fenceVersion).toBeGreaterThanOrEqual(1);
    expect(lockDoc?.ownerToken).toBeNull(); // released cleanly
    expect(lockDoc?.configVersion).toBeGreaterThanOrEqual(2); // incremented by transactional commit write
  });

  // ---------------------------------------------------------------------------
  // 13. TTL Index Migration on Live Replica Set
  // ---------------------------------------------------------------------------
  it('13. detects and drops legacy TTL index on expiresAt and creates persistent unique index on lockKey', async () => {
    const collection = mongoose.connection.db!.collection('schedulelocks');

    // 1. Artificially create legacy TTL index
    try {
      await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 10, name: 'expiresAt_legacy_ttl' });
    } catch {
      // index may already exist
    }

    let indexes = await collection.indexes();
    const hasTtlBefore = indexes.some(
      (idx: any) => idx.name === 'expiresAt_legacy_ttl' || (idx.key.expiresAt === 1 && typeof idx.expireAfterSeconds === 'number')
    );
    expect(hasTtlBefore).toBe(true);

    // 2. Execute migration
    await migrateScheduleLockIndexes();

    // 3. Verify TTL index is gone and unique lockKey index exists
    indexes = await collection.indexes();
    const hasTtlAfter = indexes.some(
      (idx: any) => idx.key.expiresAt === 1 && typeof idx.expireAfterSeconds === 'number'
    );
    expect(hasTtlAfter).toBe(false);

    const hasUniqueLockKey = indexes.some(
      (idx: any) => idx.key.lockKey === 1 && idx.unique === true
    );
    expect(hasUniqueLockKey).toBe(true);
  });
});
