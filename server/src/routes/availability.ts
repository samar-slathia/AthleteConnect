import { Router } from 'express';
import { getAvailabilityMe, updateAvailabilityMe } from '../controllers/availabilityController';
import { authenticate, requireRole } from '../middleware/auth';

export const availabilityRouter = Router();

availabilityRouter.get('/me', authenticate, requireRole('coach'), getAvailabilityMe);
availabilityRouter.put('/me', authenticate, requireRole('coach'), updateAvailabilityMe);
