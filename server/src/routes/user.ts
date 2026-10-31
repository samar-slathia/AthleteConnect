import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  handlePhotoUpload,
  uploadMyPhoto,
  getMyPhoto,
  deleteMyPhoto,
} from '../controllers/userController';

export const userRouter = Router();

userRouter.post(
  '/me/photo',
  authenticate,
  requireRole('parent', 'individual', 'coach'),
  handlePhotoUpload,
  uploadMyPhoto
);
userRouter.get(
  '/me/photo',
  authenticate,
  requireRole('parent', 'individual', 'coach'),
  getMyPhoto
);
userRouter.delete(
  '/me/photo',
  authenticate,
  requireRole('parent', 'individual', 'coach'),
  deleteMyPhoto
);

