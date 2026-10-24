import { Router } from 'express';
import { getProfileMe, updateProfileMe } from '../controllers/coachController';
import { authenticate, requireRole } from '../middleware/auth';

export const coachRouter = Router();

coachRouter.get('/profile/me', authenticate, requireRole('coach'), getProfileMe);
coachRouter.put('/profile/me', authenticate, requireRole('coach'), updateProfileMe);
