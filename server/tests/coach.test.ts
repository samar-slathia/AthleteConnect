import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/app';
import { User } from '../src/models/User';
import {
  CoachProfile,
  COACH_DISCIPLINES,
  SESSION_FORMATS,
  VENUE_TYPES,
  MIN_HOURLY_RATE,
  MAX_HOURLY_RATE,
  MAX_BIO_LENGTH,
  calculateProfileCompleteness,
} from '../src/models/CoachProfile';
import { signToken } from '../src/utils/jwt';

describe('Coach Profile Backend Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Model Schema & In-Memory Validation Tests
  // ---------------------------------------------------------------------------
  describe('CoachProfile Model & Completeness Logic (In-Memory)', () => {
    const validUserId = new mongoose.Types.ObjectId();

    const validProfileData = {
      userId: validUserId,
      bio: 'Former national champion with 10 years of coaching experience.',
      disciplines: ['boxing', 'kickboxing'] as const,
      specialties: ['Pad Work', 'Footwork'],
      sessionFormats: ['one_on_one'] as const,
      venueTypes: ['ground', 'coach_home'] as const,
      hourlyRate: 1500,
      locations: ['Indiranagar', 'Koramangala'],
    };

    it('validates a complete, compliant profile successfully', () => {
      const profile = new CoachProfile(validProfileData);
      const validationError = profile.validateSync();
      expect(validationError).toBeUndefined();
      expect(profile.currency).toBe('INR');
      expect(profile.isPublished).toBe(false);
    });

    it('enforces required userId', () => {
      const profile = new CoachProfile({ ...validProfileData, userId: undefined });
      const error = profile.validateSync();
      expect(error?.errors.userId).toBeDefined();
    });

    it('enforces bio length boundary (maximum 1000 characters)', () => {
      const tooLongBio = 'a'.repeat(MAX_BIO_LENGTH + 1);
      const profile = new CoachProfile({ ...validProfileData, bio: tooLongBio });
      const error = profile.validateSync();
      expect(error?.errors.bio).toBeDefined();
      expect(error?.errors.bio.message).toContain('Bio cannot exceed');

      const maxBio = new CoachProfile({ ...validProfileData, bio: 'a'.repeat(MAX_BIO_LENGTH) });
      expect(maxBio.validateSync()).toBeUndefined();
    });

    it('validates disciplines against allowed enum, max length, and duplicates', () => {
      // Invalid enum
      const invalidEnum = new CoachProfile({ ...validProfileData, disciplines: ['karate' as any] });
      expect(invalidEnum.validateSync()?.errors['disciplines.0']).toBeDefined();

      // Duplicate
      const duplicate = new CoachProfile({
        ...validProfileData,
        disciplines: ['boxing', 'boxing'] as any,
      });
      expect(duplicate.validateSync()?.errors.disciplines).toBeDefined();

      // Max 3
      const allThree = new CoachProfile({
        ...validProfileData,
        disciplines: ['boxing', 'wushu', 'kickboxing'],
      });
      expect(allThree.validateSync()).toBeUndefined();
    });

    it('validates specialties limits (max 5 items, max 40 chars, no duplicates)', () => {
      // Exceeds count
      const tooMany = new CoachProfile({
        ...validProfileData,
        specialties: ['1', '2', '3', '4', '5', '6'],
      });
      expect(tooMany.validateSync()?.errors.specialties).toBeDefined();

      // Too long string
      const tooLong = new CoachProfile({
        ...validProfileData,
        specialties: ['a'.repeat(41)],
      });
      expect(tooLong.validateSync()?.errors['specialties.0']).toBeDefined();

      // Duplicate
      const dup = new CoachProfile({
        ...validProfileData,
        specialties: ['Sparring', 'sparring'],
      });
      expect(dup.validateSync()?.errors.specialties).toBeDefined();
    });

    it('validates sessionFormats against allowed enum and duplicates', () => {
      const invalid = new CoachProfile({
        ...validProfileData,
        sessionFormats: ['virtual' as any],
      });
      expect(invalid.validateSync()?.errors['sessionFormats.0']).toBeDefined();

      const dup = new CoachProfile({
        ...validProfileData,
        sessionFormats: ['one_on_one', 'one_on_one'] as any,
      });
      expect(dup.validateSync()?.errors.sessionFormats).toBeDefined();
    });

    it('validates venueTypes against allowed enum and duplicates', () => {
      const invalid = new CoachProfile({
        ...validProfileData,
        venueTypes: ['commercial_gym' as any],
      });
      expect(invalid.validateSync()?.errors['venueTypes.0']).toBeDefined();

      const dup = new CoachProfile({
        ...validProfileData,
        venueTypes: ['ground', 'ground'] as any,
      });
      expect(dup.validateSync()?.errors.venueTypes).toBeDefined();
    });

    it('enforces hourlyRate boundaries (min 100, max 20000, at most 2 decimal places)', () => {
      // Below min
      const belowMin = new CoachProfile({ ...validProfileData, hourlyRate: MIN_HOURLY_RATE - 1 });
      expect(belowMin.validateSync()?.errors.hourlyRate).toBeDefined();

      // Above max
      const aboveMax = new CoachProfile({ ...validProfileData, hourlyRate: MAX_HOURLY_RATE + 1 });
      expect(aboveMax.validateSync()?.errors.hourlyRate).toBeDefined();

      // Valid boundary values
      const atMin = new CoachProfile({ ...validProfileData, hourlyRate: MIN_HOURLY_RATE });
      expect(atMin.validateSync()).toBeUndefined();

      const atMax = new CoachProfile({ ...validProfileData, hourlyRate: MAX_HOURLY_RATE });
      expect(atMax.validateSync()).toBeUndefined();

      // Two decimal places
      const twoDecimals = new CoachProfile({ ...validProfileData, hourlyRate: 999.99 });
      expect(twoDecimals.validateSync()).toBeUndefined();

      const threeDecimals = new CoachProfile({ ...validProfileData, hourlyRate: 999.999 });
      expect(threeDecimals.validateSync()?.errors.hourlyRate).toBeDefined();
    });

    it('validates locations limits (max 5 items, max 100 chars, no duplicates)', () => {
      const tooMany = new CoachProfile({
        ...validProfileData,
        locations: ['1', '2', '3', '4', '5', '6'],
      });
      expect(tooMany.validateSync()?.errors.locations).toBeDefined();

      const tooLong = new CoachProfile({
        ...validProfileData,
        locations: ['a'.repeat(101)],
      });
      expect(tooLong.validateSync()?.errors['locations.0']).toBeDefined();

      const dup = new CoachProfile({
        ...validProfileData,
        locations: ['Dojo Central', 'dojo central'],
      });
      expect(dup.validateSync()?.errors.locations).toBeDefined();
    });

    it('calculates profile completeness accurately based on all required elements', () => {
      expect(calculateProfileCompleteness(null)).toBe(false);
      expect(calculateProfileCompleteness(undefined)).toBe(false);
      expect(calculateProfileCompleteness({})).toBe(false);

      // Complete profile
      expect(calculateProfileCompleteness(validProfileData)).toBe(true);

      // Missing bio
      expect(calculateProfileCompleteness({ ...validProfileData, bio: '' })).toBe(false);
      expect(calculateProfileCompleteness({ ...validProfileData, bio: '   ' })).toBe(false);

      // Missing disciplines
      expect(calculateProfileCompleteness({ ...validProfileData, disciplines: [] })).toBe(false);

      // Missing sessionFormats
      expect(calculateProfileCompleteness({ ...validProfileData, sessionFormats: [] })).toBe(false);

      // Missing venueTypes
      expect(calculateProfileCompleteness({ ...validProfileData, venueTypes: [] })).toBe(false);

      // Missing / invalid rate
      expect(calculateProfileCompleteness({ ...validProfileData, hourlyRate: undefined })).toBe(false);
      expect(calculateProfileCompleteness({ ...validProfileData, hourlyRate: 50 })).toBe(false);

      // Missing locations
      expect(calculateProfileCompleteness({ ...validProfileData, locations: [] })).toBe(false);
      expect(calculateProfileCompleteness({ ...validProfileData, locations: ['   '] })).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. HTTP Integration Tests for GET /api/coach/profile/me
  // ---------------------------------------------------------------------------
  describe('GET /api/coach/profile/me', () => {
    const coachId = new mongoose.Types.ObjectId();
    const mockCoachUser = new User({
      _id: coachId,
      name: 'Sensei Maya',
      email: 'maya@dojo.com',
      passwordHash: 'hash',
      role: 'coach',
      isActive: true,
    });

    const validCoachToken = signToken({
      userId: coachId.toString(),
      email: 'maya@dojo.com',
      role: 'coach',
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/coach/profile/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    it('rejects parent role with 403 Forbidden', async () => {
      const parentId = new mongoose.Types.ObjectId();
      const mockParent = new User({
        _id: parentId,
        name: 'Parent User',
        email: 'parent@example.com',
        passwordHash: 'hash',
        role: 'parent',
        isActive: true,
      });
      vi.spyOn(User, 'findById').mockResolvedValue(mockParent);

      const parentToken = signToken({
        userId: parentId.toString(),
        email: 'parent@example.com',
        role: 'parent',
      });

      const res = await request(app)
        .get('/api/coach/profile/me')
        .set('Authorization', `Bearer ${parentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access forbidden. Required role: coach');
    });

    it('rejects individual role with 403 Forbidden', async () => {
      const indId = new mongoose.Types.ObjectId();
      const mockInd = new User({
        _id: indId,
        name: 'Individual User',
        email: 'individual@example.com',
        passwordHash: 'hash',
        role: 'individual',
        isActive: true,
      });
      vi.spyOn(User, 'findById').mockResolvedValue(mockInd);

      const indToken = signToken({
        userId: indId.toString(),
        email: 'individual@example.com',
        role: 'individual',
      });

      const res = await request(app)
        .get('/api/coach/profile/me')
        .set('Authorization', `Bearer ${indToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access forbidden. Required role: coach');
    });

    it('returns HTTP 200 with { profile: null, isComplete: false } when coach has no saved profile', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockCoachUser);
      vi.spyOn(CoachProfile, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .get('/api/coach/profile/me')
        .set('Authorization', `Bearer ${validCoachToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        profile: null,
        isComplete: false,
      });
    });

    it('returns saved profile and calculated completeness when profile exists', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockCoachUser);

      const existingProfile = new CoachProfile({
        userId: coachId,
        bio: 'Professional Boxing Trainer',
        disciplines: ['boxing'],
        specialties: ['Counter-Striking'],
        sessionFormats: ['one_on_one'],
        venueTypes: ['coach_home'],
        hourlyRate: 1200,
        locations: ['Indiranagar'],
        currency: 'INR',
        isPublished: false,
      });

      vi.spyOn(CoachProfile, 'findOne').mockResolvedValue(existingProfile);

      const res = await request(app)
        .get('/api/coach/profile/me')
        .set('Authorization', `Bearer ${validCoachToken}`);

      expect(res.status).toBe(200);
      expect(res.body.profile).toBeDefined();
      expect(res.body.profile.userId).toBe(coachId.toString());
      expect(res.body.profile.bio).toBe('Professional Boxing Trainer');
      expect(res.body.profile.disciplines).toEqual(['boxing']);
      expect(res.body.profile.currency).toBe('INR');
      expect(res.body.profile.isPublished).toBe(false);
      expect(res.body.isComplete).toBe(true);
      expect(res.body.profile.passwordHash).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. HTTP Integration Tests for PUT /api/coach/profile/me
  // ---------------------------------------------------------------------------
  describe('PUT /api/coach/profile/me', () => {
    const coachId = new mongoose.Types.ObjectId();
    const mockCoachUser = new User({
      _id: coachId,
      name: 'Sensei Maya',
      email: 'maya@dojo.com',
      passwordHash: 'hash',
      role: 'coach',
      isActive: true,
    });

    const validCoachToken = signToken({
      userId: coachId.toString(),
      email: 'maya@dojo.com',
      role: 'coach',
    });

    beforeEach(() => {
      vi.spyOn(User, 'findById').mockResolvedValue(mockCoachUser);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).put('/api/coach/profile/me').send({ bio: 'Hello' });
      expect(res.status).toBe(401);
    });

    it('rejects non-coach roles with 403', async () => {
      const parentId = new mongoose.Types.ObjectId();
      const mockParent = new User({
        _id: parentId,
        name: 'Parent User',
        email: 'parent@example.com',
        passwordHash: 'hash',
        role: 'parent',
        isActive: true,
      });
      vi.spyOn(User, 'findById').mockResolvedValue(mockParent);

      const parentToken = signToken({
        userId: parentId.toString(),
        email: 'parent@example.com',
        role: 'parent',
      });

      const res = await request(app)
        .put('/api/coach/profile/me')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({ bio: 'I am a parent' });

      expect(res.status).toBe(403);
    });

    it('rejects non-object or array request bodies with 400', async () => {
      const res1 = await request(app)
        .put('/api/coach/profile/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send(['not', 'an', 'object']);
      expect(res1.status).toBe(400);
      expect(res1.body.error).toContain('JSON object expected');
    });

    it('rejects attempts to submit server-controlled fields (userId, isPublished, currency, verification)', async () => {
      const illegalPayloads = [
        { userId: new mongoose.Types.ObjectId().toString() },
        { isPublished: true },
        { currency: 'USD' },
        { isVerified: true },
        { verified: true },
        { verificationStatus: 'approved' },
        { credentialsVerified: true },
        { randomField: 'attack' },
      ];

      for (const payload of illegalPayloads) {
        const res = await request(app)
          .put('/api/coach/profile/me')
          .set('Authorization', `Bearer ${validCoachToken}`)
          .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Unexpected field(s) in request body');
      }
    });

    it('rejects invalid disciplines (invalid values, duplicates, exceeding count)', async () => {
      // Invalid enum value
      const res1 = await request(app)
        .put('/api/coach/profile/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({ disciplines: ['judo'] });
      expect(res1.status).toBe(400);
      expect(res1.body.error).toContain('Invalid discipline "judo"');

      // Duplicate
      const res2 = await request(app)
        .put('/api/coach/profile/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({ disciplines: ['boxing', 'boxing'] });
      expect(res2.status).toBe(400);
      expect(res2.body.error).toContain('Duplicate disciplines');

      // Exceeding count
      const res3 = await request(app)
        .put('/api/coach/profile/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({ disciplines: ['boxing', 'wushu', 'kickboxing', 'extra'] });
      expect(res3.status).toBe(400);
      expect(res3.body.error).toContain('cannot exceed 3 items');
    });

    it('rejects invalid sessionFormats and venueTypes', async () => {
      const res1 = await request(app)
        .put('/api/coach/profile/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({ sessionFormats: ['large_group'] });
      expect(res1.status).toBe(400);
      expect(res1.body.error).toContain('Invalid session format');

      const res2 = await request(app)
        .put('/api/coach/profile/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({ venueTypes: ['hotel_gym'] });
      expect(res2.status).toBe(400);
      expect(res2.body.error).toContain('Invalid venue type');
    });

    it('rejects invalid hourlyRate (out of bounds, non-number, excessive decimals)', async () => {
      // Below min
      const res1 = await request(app)
        .put('/api/coach/profile/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({ hourlyRate: 50 });
      expect(res1.status).toBe(400);
      expect(res1.body.error).toContain('Hourly rate must be between');

      // Above max
      const res2 = await request(app)
        .put('/api/coach/profile/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({ hourlyRate: 25000 });
      expect(res2.status).toBe(400);
      expect(res2.body.error).toContain('Hourly rate must be between');

      // Non-number
      const res3 = await request(app)
        .put('/api/coach/profile/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({ hourlyRate: '1000' as any });
      expect(res3.status).toBe(400);
      expect(res3.body.error).toContain('hourlyRate must be a valid number');

      // > 2 decimals
      const res4 = await request(app)
        .put('/api/coach/profile/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({ hourlyRate: 500.555 });
      expect(res4.status).toBe(400);
      expect(res4.body.error).toContain('at most two decimal places');
    });

    it('rejects specialties and locations that exceed length or contain duplicates', async () => {
      const res1 = await request(app)
        .put('/api/coach/profile/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({ specialties: ['Sparring', 'sparring'] });
      expect(res1.status).toBe(400);
      expect(res1.body.error).toContain('Duplicate specialties');

      const res2 = await request(app)
        .put('/api/coach/profile/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({ locations: ['Indiranagar', 'indiranagar'] });
      expect(res2.status).toBe(400);
      expect(res2.body.error).toContain('Duplicate locations');
    });

    it('creates coach profile on first save (upsert) bound strictly to req.user.id', async () => {
      vi.spyOn(CoachProfile, 'findOne').mockResolvedValue(null);
      vi.spyOn(CoachProfile.prototype, 'save').mockImplementation(async function (this: any) {
        return this;
      });

      const payload = {
        bio: 'Professional boxing coach with 12 years experience.',
        disciplines: ['boxing', 'kickboxing'],
        specialties: ['Counter-Punching', 'Pad Drills'],
        sessionFormats: ['one_on_one'],
        venueTypes: ['coach_home', 'ground'],
        hourlyRate: 1500,
        locations: ['Indiranagar', 'Whitefield'],
      };

      const res = await request(app)
        .put('/api/coach/profile/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Coach profile saved successfully');
      expect(res.body.profile.userId).toBe(coachId.toString());
      expect(res.body.profile.bio).toBe(payload.bio);
      expect(res.body.profile.disciplines).toEqual(payload.disciplines);
      expect(res.body.profile.hourlyRate).toBe(payload.hourlyRate);
      expect(res.body.profile.currency).toBe('INR');
      expect(res.body.profile.isPublished).toBe(false);
      expect(res.body.isComplete).toBe(true);
    });

    it('updates an existing profile partially, preserving omitted fields and allowing clearing', async () => {
      const existing = new CoachProfile({
        userId: coachId,
        bio: 'Original bio',
        disciplines: ['boxing'],
        specialties: ['Pads'],
        sessionFormats: ['one_on_one'],
        venueTypes: ['ground'],
        hourlyRate: 1000,
        locations: ['Indiranagar'],
        currency: 'INR',
        isPublished: false,
      });

      vi.spyOn(CoachProfile, 'findOne').mockResolvedValue(existing);
      vi.spyOn(existing, 'save').mockResolvedValue(existing);

      // Only update hourlyRate and disciplines; omit bio and locations
      const res = await request(app)
        .put('/api/coach/profile/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({
          hourlyRate: 1800,
          disciplines: ['boxing', 'wushu'],
        });

      expect(res.status).toBe(200);
      expect(res.body.profile.hourlyRate).toBe(1800);
      expect(res.body.profile.disciplines).toEqual(['boxing', 'wushu']);
      // Preserved fields
      expect(res.body.profile.bio).toBe('Original bio');
      expect(res.body.profile.locations).toEqual(['Indiranagar']);

      // Now explicitly clear bio with empty string and hourlyRate with null
      const resClear = await request(app)
        .put('/api/coach/profile/me')
        .set('Authorization', `Bearer ${validCoachToken}`)
        .send({
          bio: '',
          hourlyRate: null,
        });

      expect(resClear.status).toBe(200);
      expect(resClear.body.profile.bio).toBe('');
      expect(resClear.body.profile.hourlyRate).toBeUndefined();
      // Completeness should now be false because bio and hourlyRate are cleared
      expect(resClear.body.isComplete).toBe(false);
    });
  });
});
