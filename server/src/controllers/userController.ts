import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { User } from '../models/User';
import {
  uploadProfilePhoto,
  getProfilePhotoReadStream,
  deleteProfilePhoto,
} from '../services/gridfsService';
import { validateImageMagicBytes } from '../utils/imageValidation';

export const MAX_PHOTO_SIZE = 2 * 1024 * 1024; // 2 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PHOTO_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are permitted.'));
    }
  },
});

const uploadSinglePhoto = upload.single('photo');

/**
 * Middleware handling file extraction and Multer limits/errors safely.
 */
export function handlePhotoUpload(req: Request, res: Response, next: NextFunction): void {
  uploadSinglePhoto(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: 'File size exceeds the 2 MB limit.',
          });
        }
        return res.status(400).json({
          error: `Upload error: ${err.message}`,
        });
      }
      return res.status(400).json({
        error: err.message || 'Invalid file upload request.',
      });
    }
    next();
  });
}

/**
 * Upload and safely replace authenticated user's profile photo.
 * POST /api/users/me/photo
 */
export async function uploadMyPhoto(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  let newlyUploadedFileId: mongoose.Types.ObjectId | null = null;

  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No photo file uploaded. Please upload a photo file.' });
    }

    // Validate actual binary signatures (magic bytes)
    const magicValidation = validateImageMagicBytes(req.file.buffer);
    if (!magicValidation.valid) {
      return res.status(400).json({
        error: magicValidation.error || 'Invalid file format. Only JPEG, PNG, and WebP images are permitted.',
      });
    }

    const detectedMime = magicValidation.detectedMime || req.file.mimetype;
    const extension = detectedMime === 'image/png' ? 'png' : detectedMime === 'image/webp' ? 'webp' : 'jpg';
    const filename = `user_${req.user.id}_${Date.now()}.${extension}`;

    // Step 1: Upload new image to GridFS
    newlyUploadedFileId = await uploadProfilePhoto({
      userId: req.user.id,
      filename,
      mimeType: detectedMime,
      data: req.file.buffer,
    });

    // Step 2: Fetch user document
    const user = await User.findById(req.user.id);
    if (!user) {
      await deleteProfilePhoto(newlyUploadedFileId);
      return res.status(404).json({ error: 'User account not found.' });
    }

    const previousFileId = user.photoFileId;

    // Step 3: Update user document reference
    user.photoFileId = newlyUploadedFileId;
    user.photoUpdatedAt = new Date();
    await user.save();

    // Step 4: Safely delete previous GridFS file only after user record update succeeds
    if (previousFileId && previousFileId.toString() !== newlyUploadedFileId.toString()) {
      try {
        await deleteProfilePhoto(previousFileId);
      } catch (cleanupErr) {
        console.error('[ProfilePhoto] Failed to delete previous GridFS photo file:', cleanupErr);
      }
    }

    return res.status(200).json({
      message: 'Profile photo uploaded successfully.',
      photoUrl: '/api/users/me/photo',
      photoUpdatedAt: user.photoUpdatedAt,
    });
  } catch (error) {
    // If saving user failed after GridFS upload, clean up orphan file
    if (newlyUploadedFileId) {
      try {
        await deleteProfilePhoto(newlyUploadedFileId);
      } catch (cleanupErr) {
        console.error('[ProfilePhoto] Failed to clean up orphan GridFS file on failure:', cleanupErr);
      }
    }
    return next(error);
  }
}

/**
 * Retrieve authenticated user's profile photo stream.
 * GET /api/users/me/photo
 */
export async function getMyPhoto(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const user = await User.findById(req.user.id);
    if (!user || !user.photoFileId) {
      return res.status(404).json({ error: 'Profile photo not found.' });
    }

    const streamResult = await getProfilePhotoReadStream(user.photoFileId);
    if (!streamResult) {
      return res.status(404).json({ error: 'Profile photo file not found in storage.' });
    }

    const etag = `"${streamResult.file._id.toString()}-${streamResult.file.uploadDate ? streamResult.file.uploadDate.getTime() : 0}"`;

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    const mimeType =
      (streamResult.file.metadata as any)?.mimeType ||
      streamResult.file.contentType ||
      'image/jpeg';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('ETag', etag);

    streamResult.stream.on('error', (_streamErr) => {
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({ error: 'Failed to stream profile photo.' });
      } else {
        res.end();
      }
    });

    streamResult.stream.pipe(res);
  } catch (error) {
    return next(error);
  }
}

/**
 * Delete authenticated user's profile photo.
 * DELETE /api/users/me/photo
 */
export async function deleteMyPhoto(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    if (!user.photoFileId) {
      return res.status(200).json({ message: 'No profile photo to delete.' });
    }

    const fileToDelete = user.photoFileId;

    user.photoFileId = null;
    user.photoUpdatedAt = null;
    await user.save();

    await deleteProfilePhoto(fileToDelete);

    return res.status(200).json({
      message: 'Profile photo deleted successfully.',
    });
  } catch (error) {
    return next(error);
  }
}
