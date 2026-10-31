import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { Readable, PassThrough } from 'stream';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { CoachProfile } from '../src/models/CoachProfile';
import { signToken } from '../src/utils/jwt';
import { validateImageMagicBytes } from '../src/utils/imageValidation';
import * as gridfsService from '../src/services/gridfsService';

// Sample Valid Image Buffers (header bytes match binary specifications)
const VALID_JPEG_BUFFER = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
  Buffer.alloc(100, 0xaa),
]);

const VALID_PNG_BUFFER = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
  Buffer.alloc(100, 0xbb),
]);

const VALID_WEBP_BUFFER = Buffer.concat([
  Buffer.from([0x52, 0x49, 0x46, 0x46]), // 'RIFF'
  Buffer.from([0x00, 0x00, 0x00, 0x00]), // length placeholder
  Buffer.from([0x57, 0x45, 0x42, 0x50]), // 'WEBP'
  Buffer.alloc(100, 0xcc),
]);

const SPOOFED_IMAGE_BUFFER = Buffer.concat([
  Buffer.from('NOT_AN_IMAGE_FILE_PAYLOAD'),
  Buffer.alloc(100, 0x00),
]);

describe('Profile Photo Management & GridFS Storage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    gridfsService._setGridFSBucketForTesting(null);
  });

  // =========================================================================
  // 1. Magic Bytes Image Signature Validation
  // =========================================================================
  describe('validateImageMagicBytes', () => {
    it('detects genuine JPEG images', () => {
      const result = validateImageMagicBytes(VALID_JPEG_BUFFER);
      expect(result.valid).toBe(true);
      expect(result.detectedMime).toBe('image/jpeg');
    });

    it('detects genuine PNG images', () => {
      const result = validateImageMagicBytes(VALID_PNG_BUFFER);
      expect(result.valid).toBe(true);
      expect(result.detectedMime).toBe('image/png');
    });

    it('detects genuine WebP images', () => {
      const result = validateImageMagicBytes(VALID_WEBP_BUFFER);
      expect(result.valid).toBe(true);
      expect(result.detectedMime).toBe('image/webp');
    });

    it('rejects buffers shorter than 12 bytes', () => {
      const shortBuffer = Buffer.from([0xff, 0xd8, 0xff]);
      const result = validateImageMagicBytes(shortBuffer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('insufficient byte length');
    });

    it('rejects spoofed images with invalid signatures', () => {
      const result = validateImageMagicBytes(SPOOFED_IMAGE_BUFFER);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported or spoofed image signature');
    });
  });

  // =========================================================================
  // 2. User Model Schema Compatibility
  // =========================================================================
  describe('User Model Compatibility', () => {
    it('defaults photoFileId and photoUpdatedAt to null', () => {
      const user = new User({
        name: 'New Athlete',
        email: 'athlete@example.com',
        passwordHash: '$2b$12$e80Yv8XlU0J5v7N1d7W7aOBXW7u7q9x7U1F1M1L1K1J1H1G1F1E1D',
        role: 'individual',
      });

      expect(user.photoFileId).toBeNull();
      expect(user.photoUpdatedAt).toBeNull();
      expect(user.validateSync()).toBeUndefined();
    });

    it('allows valid ObjectId for photoFileId and Date for photoUpdatedAt', () => {
      const photoId = new mongoose.Types.ObjectId();
      const now = new Date();
      const user = new User({
        name: 'Photo Athlete',
        email: 'photo.athlete@example.com',
        passwordHash: '$2b$12$e80Yv8XlU0J5v7N1d7W7aOBXW7u7q9x7U1F1M1L1K1J1H1G1F1E1D',
        role: 'parent',
        photoFileId: photoId,
        photoUpdatedAt: now,
      });

      expect(user.photoFileId?.toString()).toBe(photoId.toString());
      expect(user.photoUpdatedAt).toEqual(now);
      expect(user.validateSync()).toBeUndefined();
    });
  });

  // =========================================================================
  // 3. GridFS Service Unit Operations
  // =========================================================================
  describe('gridfsService', () => {
    it('throws when MongoDB connection is not ready', () => {
      // Mock mongoose.connection.readyState = 0 (disconnected)
      const origReadyState = mongoose.connection.readyState;
      Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

      expect(() => gridfsService.getGridFSBucket()).toThrow(
        /Database connection is not active/
      );

      Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
    });

    it('returns null when reading with an invalid ObjectId', async () => {
      const result = await gridfsService.getProfilePhotoReadStream('not-a-valid-id');
      expect(result).toBeNull();
    });

    it('returns false when deleting with an invalid ObjectId', async () => {
      const result = await gridfsService.deleteProfilePhoto('not-a-valid-id');
      expect(result).toBe(false);
    });

    it('uploadProfilePhoto pipes buffer to upload stream', async () => {
      const testFileId = new mongoose.Types.ObjectId();
      const fakeUploadStream = new PassThrough() as any;
      fakeUploadStream.id = testFileId;

      const mockBucket = {
        openUploadStream: vi.fn().mockImplementation(() => {
          process.nextTick(() => {
            fakeUploadStream.emit('finish');
          });
          return fakeUploadStream;
        }),
      } as any;

      gridfsService._setGridFSBucketForTesting(mockBucket);

      const userId = new mongoose.Types.ObjectId();
      const fileId = await gridfsService.uploadProfilePhoto({
        userId,
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
        data: VALID_JPEG_BUFFER,
      });

      expect(fileId.toString()).toBe(testFileId.toString());
      expect(mockBucket.openUploadStream).toHaveBeenCalledWith(
        'test.jpg',
        expect.objectContaining({
          contentType: 'image/jpeg',
          metadata: expect.objectContaining({ mimeType: 'image/jpeg' }),
        })
      );
    });

    it('getProfilePhotoReadStream returns null if file not found in bucket', async () => {
      const mockBucket = {
        find: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      } as any;

      gridfsService._setGridFSBucketForTesting(mockBucket);

      const result = await gridfsService.getProfilePhotoReadStream(new mongoose.Types.ObjectId());
      expect(result).toBeNull();
    });

    it('getProfilePhotoReadStream returns stream and file when found', async () => {
      const fakeFile = {
        _id: new mongoose.Types.ObjectId(),
        filename: 'avatar.png',
        contentType: 'image/png',
      };
      const fakeStream = new PassThrough();

      const mockBucket = {
        find: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([fakeFile]),
        }),
        openDownloadStream: vi.fn().mockReturnValue(fakeStream),
      } as any;

      gridfsService._setGridFSBucketForTesting(mockBucket);

      const result = await gridfsService.getProfilePhotoReadStream(fakeFile._id);
      expect(result).not.toBeNull();
      expect(result?.file).toEqual(fakeFile);
      expect(result?.stream).toEqual(fakeStream);
    });

    it('deleteProfilePhoto deletes file and returns true when found', async () => {
      const fileId = new mongoose.Types.ObjectId();
      const mockBucket = {
        find: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([{ _id: fileId }]),
        }),
        delete: vi.fn().mockResolvedValue(undefined),
      } as any;

      gridfsService._setGridFSBucketForTesting(mockBucket);

      const deleted = await gridfsService.deleteProfilePhoto(fileId);
      expect(deleted).toBe(true);
      expect(mockBucket.delete).toHaveBeenCalledWith(fileId);
    });

    it('uploadProfilePhoto rejects if upload stream emits error', async () => {
      const fakeUploadStream = new PassThrough() as any;
      fakeUploadStream.id = new mongoose.Types.ObjectId();

      const mockBucket = {
        openUploadStream: vi.fn().mockImplementation(() => {
          process.nextTick(() => {
            fakeUploadStream.emit('error', new Error('Simulated GridFS write failure'));
          });
          return fakeUploadStream;
        }),
      } as any;

      gridfsService._setGridFSBucketForTesting(mockBucket);

      const userId = new mongoose.Types.ObjectId();
      await expect(
        gridfsService.uploadProfilePhoto({
          userId,
          filename: 'fail.jpg',
          mimeType: 'image/jpeg',
          data: VALID_JPEG_BUFFER,
        })
      ).rejects.toThrow('Simulated GridFS write failure');
    });

    it('uploadProfilePhoto rejects if input readable stream emits error', async () => {
      const fakeUploadStream = new PassThrough() as any;
      fakeUploadStream.id = new mongoose.Types.ObjectId();

      const mockBucket = {
        openUploadStream: vi.fn().mockReturnValue(fakeUploadStream),
      } as any;

      gridfsService._setGridFSBucketForTesting(mockBucket);

      const faultyReadable = new Readable({
        read() {
          this.destroy(new Error('Readable read failure'));
        },
      });

      const userId = new mongoose.Types.ObjectId();
      await expect(
        gridfsService.uploadProfilePhoto({
          userId,
          filename: 'fail.jpg',
          mimeType: 'image/jpeg',
          data: faultyReadable,
        })
      ).rejects.toThrow('Readable read failure');
    });
  });

  // =========================================================================
  // 4. POST /api/users/me/photo (Upload & Safe Replacement)
  // =========================================================================
  describe('POST /api/users/me/photo', () => {
    const parentUserId = new mongoose.Types.ObjectId().toString();
    const parentToken = signToken({
      userId: parentUserId,
      email: 'parent@example.com',
      role: 'parent',
    });

    const coachUserId = new mongoose.Types.ObjectId().toString();
    const coachToken = signToken({
      userId: coachUserId,
      email: 'coach@example.com',
      role: 'coach',
    });

    const individualUserId = new mongoose.Types.ObjectId().toString();
    const individualToken = signToken({
      userId: individualUserId,
      email: 'individual@example.com',
      role: 'individual',
    });

    const adminUserId = new mongoose.Types.ObjectId().toString();
    const adminToken = signToken({
      userId: adminUserId,
      email: 'admin@example.com',
      role: 'admin',
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/users/me/photo')
        .attach('photo', VALID_JPEG_BUFFER, 'test.jpg');

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    it('rejects admin accounts with 403', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue({
        _id: adminUserId,
        email: 'admin@example.com',
        role: 'admin',
        isActive: true,
      } as any);

      const res = await request(app)
        .post('/api/users/me/photo')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('photo', VALID_JPEG_BUFFER, 'test.jpg');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access forbidden');
    });

    it('allows successful upload for parent, coach, and individual accounts', async () => {
      const testCases = [
        { token: parentToken, userId: parentUserId, role: 'parent', buffer: VALID_JPEG_BUFFER, name: 'avatar.jpg' },
        { token: coachToken, userId: coachUserId, role: 'coach', buffer: VALID_PNG_BUFFER, name: 'avatar.png' },
        { token: individualToken, userId: individualUserId, role: 'individual', buffer: VALID_WEBP_BUFFER, name: 'avatar.webp' },
      ];

      for (const tc of testCases) {
        const newFileId = new mongoose.Types.ObjectId();
        vi.spyOn(gridfsService, 'uploadProfilePhoto').mockResolvedValue(newFileId);
        vi.spyOn(gridfsService, 'deleteProfilePhoto').mockResolvedValue(true);

        const mockUser = {
          _id: tc.userId,
          email: `${tc.role}@example.com`,
          role: tc.role,
          isActive: true,
          photoFileId: null,
          photoUpdatedAt: null,
          save: vi.fn().mockResolvedValue(true),
        };
        vi.spyOn(User, 'findById').mockResolvedValue(mockUser as any);

        const res = await request(app)
          .post('/api/users/me/photo')
          .set('Authorization', `Bearer ${tc.token}`)
          .attach('photo', tc.buffer, tc.name);

        expect(res.status).toBe(200);
        expect(res.body.message).toContain('Profile photo uploaded successfully');
        expect(res.body.photoUrl).toBe('/api/users/me/photo');
        expect(res.body.photoUpdatedAt).toBeDefined();
        expect(mockUser.photoFileId).toEqual(newFileId);
        expect(mockUser.save).toHaveBeenCalled();
      }
    });

    it('rejects request with missing file (400)', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue({
        _id: parentUserId,
        email: 'parent@example.com',
        role: 'parent',
        isActive: true,
      } as any);

      const res = await request(app)
        .post('/api/users/me/photo')
        .set('Authorization', `Bearer ${parentToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No photo file uploaded');
    });

    it('rejects invalid MIME type such as text or pdf (400)', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue({
        _id: parentUserId,
        email: 'parent@example.com',
        role: 'parent',
        isActive: true,
      } as any);

      const res = await request(app)
        .post('/api/users/me/photo')
        .set('Authorization', `Bearer ${parentToken}`)
        .attach('photo', Buffer.from('plain text file'), 'notes.txt');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid file type');
    });

    it('rejects spoofed images with invalid magic bytes (400)', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue({
        _id: parentUserId,
        email: 'parent@example.com',
        role: 'parent',
        isActive: true,
      } as any);

      const res = await request(app)
        .post('/api/users/me/photo')
        .set('Authorization', `Bearer ${parentToken}`)
        .attach('photo', SPOOFED_IMAGE_BUFFER, 'fake.jpg');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Unsupported or spoofed image signature');
    });

    it('rejects oversized images greater than 2 MB (400)', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue({
        _id: parentUserId,
        email: 'parent@example.com',
        role: 'parent',
        isActive: true,
      } as any);

      const oversizedBuffer = Buffer.alloc(2 * 1024 * 1024 + 100);

      const res = await request(app)
        .post('/api/users/me/photo')
        .set('Authorization', `Bearer ${parentToken}`)
        .attach('photo', oversizedBuffer, 'oversized.jpg');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('exceeds the 2 MB limit');
    });

    it('safely replaces photo: deletes old GridFS file only after user update succeeds', async () => {
      const oldFileId = new mongoose.Types.ObjectId();
      const newFileId = new mongoose.Types.ObjectId();

      const uploadSpy = vi.spyOn(gridfsService, 'uploadProfilePhoto').mockResolvedValue(newFileId);
      const deleteSpy = vi.spyOn(gridfsService, 'deleteProfilePhoto').mockResolvedValue(true);

      const mockUser = {
        _id: parentUserId,
        email: 'parent@example.com',
        role: 'parent',
        isActive: true,
        photoFileId: oldFileId,
        photoUpdatedAt: new Date(Date.now() - 100000),
        save: vi.fn().mockImplementation(async function () {
          // Verify that at save time, deleteSpy has NOT yet been called with oldFileId
          expect(deleteSpy).not.toHaveBeenCalled();
          return this;
        }),
      };

      vi.spyOn(User, 'findById').mockResolvedValue(mockUser as any);

      const res = await request(app)
        .post('/api/users/me/photo')
        .set('Authorization', `Bearer ${parentToken}`)
        .attach('photo', VALID_JPEG_BUFFER, 'new.jpg');

      expect(res.status).toBe(200);
      expect(uploadSpy).toHaveBeenCalled();
      expect(mockUser.save).toHaveBeenCalled();
      // Old file deleted AFTER save succeeded
      expect(deleteSpy).toHaveBeenCalledWith(oldFileId);
    });

    it('preserves old photo and cleans up new orphan GridFS file if user.save() fails', async () => {
      const oldFileId = new mongoose.Types.ObjectId();
      const newFileId = new mongoose.Types.ObjectId();

      vi.spyOn(gridfsService, 'uploadProfilePhoto').mockResolvedValue(newFileId);
      const deleteSpy = vi.spyOn(gridfsService, 'deleteProfilePhoto').mockResolvedValue(true);

      const mockUser = {
        _id: parentUserId,
        email: 'parent@example.com',
        role: 'parent',
        isActive: true,
        photoFileId: oldFileId,
        save: vi.fn().mockRejectedValue(new Error('Simulated database write error')),
      };

      vi.spyOn(User, 'findById').mockResolvedValue(mockUser as any);

      const res = await request(app)
        .post('/api/users/me/photo')
        .set('Authorization', `Bearer ${parentToken}`)
        .attach('photo', VALID_JPEG_BUFFER, 'new.jpg');

      expect(res.status).toBe(500);
      // New file cleaned up
      expect(deleteSpy).toHaveBeenCalledWith(newFileId);
      // Old file was NOT deleted
      expect(deleteSpy).not.toHaveBeenCalledWith(oldFileId);
    });

    it('succeeds and preserves new photo even if previous GridFS file deletion fails', async () => {
      const oldFileId = new mongoose.Types.ObjectId();
      const newFileId = new mongoose.Types.ObjectId();

      vi.spyOn(gridfsService, 'uploadProfilePhoto').mockResolvedValue(newFileId);
      vi.spyOn(gridfsService, 'deleteProfilePhoto').mockRejectedValue(new Error('GridFS delete error'));

      const mockUser = {
        _id: parentUserId,
        email: 'parent@example.com',
        role: 'parent',
        isActive: true,
        photoFileId: oldFileId,
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(User, 'findById').mockResolvedValue(mockUser as any);

      const res = await request(app)
        .post('/api/users/me/photo')
        .set('Authorization', `Bearer ${parentToken}`)
        .attach('photo', VALID_JPEG_BUFFER, 'new.jpg');

      expect(res.status).toBe(200);
      expect(mockUser.photoFileId).toEqual(newFileId);
    });

    it('returns 404 and cleans up new GridFS file if user is deleted after token check', async () => {
      const newFileId = new mongoose.Types.ObjectId();
      vi.spyOn(gridfsService, 'uploadProfilePhoto').mockResolvedValue(newFileId);
      const deleteSpy = vi.spyOn(gridfsService, 'deleteProfilePhoto').mockResolvedValue(true);

      // Auth succeeds on first call, but second call in controller returns null
      let callCount = 0;
      vi.spyOn(User, 'findById').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            _id: parentUserId,
            email: 'parent@example.com',
            role: 'parent',
            isActive: true,
          } as any;
        }
        return null;
      });

      const res = await request(app)
        .post('/api/users/me/photo')
        .set('Authorization', `Bearer ${parentToken}`)
        .attach('photo', VALID_JPEG_BUFFER, 'new.jpg');

      expect(res.status).toBe(404);
      expect(deleteSpy).toHaveBeenCalledWith(newFileId);
    });
  });

  // =========================================================================
  // 5. GET /api/users/me/photo (Authenticated Retrieval)
  // =========================================================================
  describe('GET /api/users/me/photo', () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const token = signToken({
      userId,
      email: 'member@example.com',
      role: 'parent',
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/users/me/photo');
      expect(res.status).toBe(401);
    });

    it('returns 404 when user has no photo', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue({
        _id: userId,
        email: 'member@example.com',
        role: 'parent',
        isActive: true,
        photoFileId: null,
      } as any);

      const res = await request(app)
        .get('/api/users/me/photo')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Profile photo not found');
    });

    it('returns 404 when photo file does not exist in GridFS', async () => {
      const photoId = new mongoose.Types.ObjectId();
      vi.spyOn(User, 'findById').mockResolvedValue({
        _id: userId,
        email: 'member@example.com',
        role: 'parent',
        isActive: true,
        photoFileId: photoId,
      } as any);

      vi.spyOn(gridfsService, 'getProfilePhotoReadStream').mockResolvedValue(null);

      const res = await request(app)
        .get('/api/users/me/photo')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('storage');
    });

    it('streams photo with correct Content-Type, private Cache-Control, and ETag', async () => {
      const photoId = new mongoose.Types.ObjectId();
      vi.spyOn(User, 'findById').mockResolvedValue({
        _id: userId,
        email: 'member@example.com',
        role: 'parent',
        isActive: true,
        photoFileId: photoId,
      } as any);

      const stream = Readable.from(VALID_JPEG_BUFFER) as any;
      const file = {
        _id: photoId,
        contentType: 'image/jpeg',
        uploadDate: new Date('2026-01-01T00:00:00Z'),
      } as any;

      vi.spyOn(gridfsService, 'getProfilePhotoReadStream').mockResolvedValue({ stream, file });

      const res = await request(app)
        .get('/api/users/me/photo')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('image/jpeg');
      expect(res.header['cache-control']).toBe('private, max-age=3600');
      expect(res.header['etag']).toBeDefined();
      expect(res.body).toEqual(VALID_JPEG_BUFFER);
    });

    it('supports 304 Not Modified when ETag matches If-None-Match', async () => {
      const photoId = new mongoose.Types.ObjectId();
      const uploadDate = new Date('2026-01-01T00:00:00Z');
      const expectedEtag = `"${photoId.toString()}-${uploadDate.getTime()}"`;

      vi.spyOn(User, 'findById').mockResolvedValue({
        _id: userId,
        email: 'member@example.com',
        role: 'parent',
        isActive: true,
        photoFileId: photoId,
      } as any);

      const stream = Readable.from(VALID_JPEG_BUFFER) as any;
      const file = {
        _id: photoId,
        contentType: 'image/jpeg',
        uploadDate,
      } as any;

      vi.spyOn(gridfsService, 'getProfilePhotoReadStream').mockResolvedValue({ stream, file });

      const res = await request(app)
        .get('/api/users/me/photo')
        .set('Authorization', `Bearer ${token}`)
        .set('If-None-Match', expectedEtag);

      expect(res.status).toBe(304);
    });

    it('handles stream error safely without crashing', async () => {
      const photoId = new mongoose.Types.ObjectId();
      vi.spyOn(User, 'findById').mockResolvedValue({
        _id: userId,
        email: 'member@example.com',
        role: 'parent',
        isActive: true,
        photoFileId: photoId,
      } as any);

      const errorStream = new Readable({
        read() {
          this.destroy(new Error('Simulated stream read failure'));
        },
      });

      const file = {
        _id: photoId,
        contentType: 'image/jpeg',
        uploadDate: new Date(),
      } as any;

      vi.spyOn(gridfsService, 'getProfilePhotoReadStream').mockResolvedValue({
        stream: errorStream as any,
        file,
      });

      const res = await request(app)
        .get('/api/users/me/photo')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Failed to stream');
    });
  });

  // =========================================================================
  // 6. GET /api/coaches/:id/photo (Public Coach Retrieval & Access Control)
  // =========================================================================
  describe('GET /api/coaches/:id/photo', () => {
    const coachId = new mongoose.Types.ObjectId().toString();
    const photoId = new mongoose.Types.ObjectId();
    const uploadDate = new Date('2026-02-01T00:00:00Z');

    it('rejects invalid ObjectId formats with 404', async () => {
      const res = await request(app).get('/api/coaches/invalid-coach-id/photo');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Coach photo not found');
    });

    it('rejects non-existent coach with 404', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue(null);

      const res = await request(app).get(`/api/coaches/${coachId}/photo`);
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Coach photo not found');
    });

    it('rejects parent account photo access via public coach endpoint (404)', async () => {
      // User exists in system but has role: 'parent', so User.findOne with role: 'coach' returns null
      vi.spyOn(User, 'findOne').mockImplementation((query: any) => {
        if (query?.role === 'coach') return Promise.resolve(null);
        return Promise.resolve({ _id: coachId, role: 'parent', isActive: true, photoFileId: photoId } as any);
      });

      const res = await request(app).get(`/api/coaches/${coachId}/photo`);
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Coach photo not found');
    });

    it('rejects individual customer account photo access via public coach endpoint (404)', async () => {
      // User exists in system but has role: 'individual', so User.findOne with role: 'coach' returns null
      vi.spyOn(User, 'findOne').mockImplementation((query: any) => {
        if (query?.role === 'coach') return Promise.resolve(null);
        return Promise.resolve({ _id: coachId, role: 'individual', isActive: true, photoFileId: photoId } as any);
      });

      const res = await request(app).get(`/api/coaches/${coachId}/photo`);
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Coach photo not found');
    });

    it('rejects deactivated coach account with 404', async () => {
      // User is inactive (isActive: false) so User.findOne with isActive: true returns null
      vi.spyOn(User, 'findOne').mockResolvedValue(null);

      const res = await request(app).get(`/api/coaches/${coachId}/photo`);
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Coach photo not found');
    });

    it('rejects coach account with missing photo (404)', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue({
        _id: coachId,
        role: 'coach',
        isActive: true,
        photoFileId: null,
      } as any);

      const res = await request(app).get(`/api/coaches/${coachId}/photo`);
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Coach photo not found');
    });

    it('allows active coach with photoFileId to retrieve photo when CoachProfile.isPublished is false', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue({
        _id: coachId,
        role: 'coach',
        isActive: true,
        photoFileId: photoId,
      } as any);

      vi.spyOn(CoachProfile, 'findOne').mockResolvedValue({
        userId: coachId,
        isPublished: false,
      } as any);

      const stream = Readable.from(VALID_PNG_BUFFER) as any;
      const file = {
        _id: photoId,
        contentType: 'image/png',
        uploadDate,
      } as any;

      vi.spyOn(gridfsService, 'getProfilePhotoReadStream').mockResolvedValue({ stream, file });

      const res = await request(app).get(`/api/coaches/${coachId}/photo`);

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('image/png');
      expect(res.header['cache-control']).toBe('public, max-age=86400');
      expect(res.header['etag']).toBeDefined();
      expect(res.body).toEqual(VALID_PNG_BUFFER);
    });

    it('allows active coach with photoFileId to retrieve photo when no CoachProfile document exists', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue({
        _id: coachId,
        role: 'coach',
        isActive: true,
        photoFileId: photoId,
      } as any);

      vi.spyOn(CoachProfile, 'findOne').mockResolvedValue(null);

      const stream = Readable.from(VALID_JPEG_BUFFER) as any;
      const file = {
        _id: photoId,
        contentType: 'image/jpeg',
        uploadDate,
      } as any;

      vi.spyOn(gridfsService, 'getProfilePhotoReadStream').mockResolvedValue({ stream, file });

      const res = await request(app).get(`/api/coaches/${coachId}/photo`);

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('image/jpeg');
      expect(res.header['cache-control']).toBe('public, max-age=86400');
      expect(res.header['etag']).toBeDefined();
      expect(res.body).toEqual(VALID_JPEG_BUFFER);
    });

    it('publicly streams photo with correct image Content-Type, public Cache-Control, and ETag', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue({
        _id: coachId,
        role: 'coach',
        isActive: true,
        photoFileId: photoId,
      } as any);

      const stream = Readable.from(VALID_PNG_BUFFER) as any;
      const file = {
        _id: photoId,
        contentType: 'image/png',
        uploadDate,
      } as any;

      vi.spyOn(gridfsService, 'getProfilePhotoReadStream').mockResolvedValue({ stream, file });

      const res = await request(app).get(`/api/coaches/${coachId}/photo`);

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('image/png');
      expect(res.header['cache-control']).toBe('public, max-age=86400');
      expect(res.header['etag']).toBeDefined();
      expect(res.body).toEqual(VALID_PNG_BUFFER);
    });

    it('returns 304 when client sends matching ETag in If-None-Match header', async () => {
      const expectedEtag = `"${photoId.toString()}-${uploadDate.getTime()}"`;

      vi.spyOn(User, 'findOne').mockResolvedValue({
        _id: coachId,
        role: 'coach',
        isActive: true,
        photoFileId: photoId,
      } as any);

      const stream = Readable.from(VALID_PNG_BUFFER) as any;
      const file = {
        _id: photoId,
        contentType: 'image/png',
        uploadDate,
      } as any;

      vi.spyOn(gridfsService, 'getProfilePhotoReadStream').mockResolvedValue({ stream, file });

      const res = await request(app)
        .get(`/api/coaches/${coachId}/photo`)
        .set('If-None-Match', expectedEtag);

      expect(res.status).toBe(304);
    });
  });

  // =========================================================================
  // 7. DELETE /api/users/me/photo (Delete Profile Photo)
  // =========================================================================
  describe('DELETE /api/users/me/photo', () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const token = signToken({
      userId,
      email: 'athlete@example.com',
      role: 'individual',
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).delete('/api/users/me/photo');
      expect(res.status).toBe(401);
    });

    it('returns 200 without error when user has no photo', async () => {
      vi.spyOn(User, 'findById').mockResolvedValue({
        _id: userId,
        email: 'athlete@example.com',
        role: 'individual',
        isActive: true,
        photoFileId: null,
      } as any);

      const res = await request(app)
        .delete('/api/users/me/photo')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('No profile photo to delete');
    });

    it('clears photo reference and deletes GridFS file when user has photo', async () => {
      const photoId = new mongoose.Types.ObjectId();
      const deleteSpy = vi.spyOn(gridfsService, 'deleteProfilePhoto').mockResolvedValue(true);

      const mockUser = {
        _id: userId,
        email: 'athlete@example.com',
        role: 'individual',
        isActive: true,
        photoFileId: photoId,
        photoUpdatedAt: new Date(),
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(User, 'findById').mockResolvedValue(mockUser as any);

      const res = await request(app)
        .delete('/api/users/me/photo')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Profile photo deleted successfully');
      expect(mockUser.photoFileId).toBeNull();
      expect(mockUser.photoUpdatedAt).toBeNull();
      expect(mockUser.save).toHaveBeenCalled();
      expect(deleteSpy).toHaveBeenCalledWith(photoId);
    });
  });
});
