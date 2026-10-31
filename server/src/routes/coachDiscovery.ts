import { Router } from 'express';
import {
  getPublicCoaches,
  getPublicCoachById,
  getPublicCoachPhoto,
} from '../controllers/coachDiscoveryController';

export const coachDiscoveryRouter = Router();

// Public / Authenticated Coach Discovery
coachDiscoveryRouter.get('/', getPublicCoaches);
coachDiscoveryRouter.get('/:id/photo', getPublicCoachPhoto);
coachDiscoveryRouter.get('/:id', getPublicCoachById);

