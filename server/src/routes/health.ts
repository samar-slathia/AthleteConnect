import { Router, Request, Response } from 'express';
import { config } from '../config/env';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'athleteconnect-api',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime() * 100) / 100,
    environment: config.NODE_ENV,
  });
});
