import { Router } from 'express';
import { getPublicCoaches, getPublicCoachById } from '../controllers/coachDiscoveryController';

export const coachDiscoveryRouter = Router();

// Public / Authenticated Coach Discovery
coachDiscoveryRouter.get('/', getPublicCoaches);
coachDiscoveryRouter.get('/:id', getPublicCoachById);
