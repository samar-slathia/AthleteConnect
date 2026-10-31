import mongoose from 'mongoose';
import { Readable } from 'stream';

export const PROFILE_PHOTO_BUCKET = 'profile_photos';

let customBucketInstance: mongoose.mongo.GridFSBucket | null = null;

/**
 * Retrieves the singleton GridFSBucket instance bound to the active MongoDB connection.
 * Fails clearly if the database is disconnected.
 */
export function getGridFSBucket(): mongoose.mongo.GridFSBucket {
  if (customBucketInstance) {
    return customBucketInstance;
  }

  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new Error('Database connection is not active. GridFSBucket is unavailable.');
  }

  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: PROFILE_PHOTO_BUCKET,
  });
}

export interface UploadPhotoParams {
  userId: string | mongoose.Types.ObjectId;
  filename: string;
  mimeType: string;
  data: Buffer | Readable;
}

export interface ProfilePhotoStreamResult {
  stream: mongoose.mongo.GridFSBucketReadStream;
  file: mongoose.mongo.GridFSFile;
}

/**
 * Uploads an image stream or buffer into the profile_photos GridFS bucket.
 * Attaches metadata linking the photo strictly to the user.
 */
export async function uploadProfilePhoto(
  params: UploadPhotoParams
): Promise<mongoose.Types.ObjectId> {
  const { userId, filename, mimeType, data } = params;
  const bucket = getGridFSBucket();

  const userObjectId =
    userId instanceof mongoose.Types.ObjectId ? userId : new mongoose.Types.ObjectId(userId);

  const uploadStream = bucket.openUploadStream(filename, {
    contentType: mimeType,
    metadata: {
      userId: userObjectId,
      mimeType,
      uploadedAt: new Date(),
    },
  });

  const readableStream: Readable = Buffer.isBuffer(data) ? Readable.from(data) : data;

  return new Promise<mongoose.Types.ObjectId>((resolve, reject) => {
    readableStream.pipe(uploadStream);

    uploadStream.on('finish', () => {
      resolve(uploadStream.id as mongoose.Types.ObjectId);
    });

    uploadStream.on('error', (err) => {
      reject(err);
    });

    readableStream.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Opens a download stream for a verified photo file ID.
 * Returns null if the file does not exist in the bucket.
 */
export async function getProfilePhotoReadStream(
  fileId: string | mongoose.Types.ObjectId
): Promise<ProfilePhotoStreamResult | null> {
  if (!fileId || !mongoose.Types.ObjectId.isValid(fileId)) {
    return null;
  }

  const objectId = fileId instanceof mongoose.Types.ObjectId ? fileId : new mongoose.Types.ObjectId(fileId);
  const bucket = getGridFSBucket();

  const files = await bucket.find({ _id: objectId }).toArray();
  if (!files || files.length === 0) {
    return null;
  }

  const file = files[0];
  const stream = bucket.openDownloadStream(objectId);

  return { stream, file };
}

/**
 * Deletes a photo file from the GridFS bucket by its file ID.
 * Returns true if deleted, false if file was not found.
 */
export async function deleteProfilePhoto(
  fileId: string | mongoose.Types.ObjectId
): Promise<boolean> {
  if (!fileId || !mongoose.Types.ObjectId.isValid(fileId)) {
    return false;
  }

  const objectId = fileId instanceof mongoose.Types.ObjectId ? fileId : new mongoose.Types.ObjectId(fileId);
  const bucket = getGridFSBucket();

  try {
    const files = await bucket.find({ _id: objectId }).toArray();
    if (!files || files.length === 0) {
      return false;
    }

    await bucket.delete(objectId);
    return true;
  } catch (err) {
    console.error(`[GridFS] Failed to delete file ${objectId.toString()}:`, err);
    return false;
  }
}

/**
 * Allows injecting a mock bucket for testing isolation.
 */
export function _setGridFSBucketForTesting(bucket: mongoose.mongo.GridFSBucket | null): void {
  customBucketInstance = bucket;
}
