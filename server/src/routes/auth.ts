import { Router } from 'express';
import { register, login, getMe } from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { customerLoginLimiter } from '../middleware/rateLimiter';

export const authRouter = Router();

authRouter.post('/register', register);
authRouter.post('/login', customerLoginLimiter, login);
authRouter.get('/me', authenticate, getMe);
