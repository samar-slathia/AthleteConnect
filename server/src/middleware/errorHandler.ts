import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

export interface AppErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    stack?: string;
  };
}

export function errorHandler(
  err: Error & { statusCode?: number; code?: string },
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || (res.statusCode >= 400 ? res.statusCode : 500);
  const errorCode = err.code || (statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR');

  // In production, mask internal error details and omit stack trace
  const message = config.isProduction && statusCode >= 500
    ? 'An unexpected error occurred. Please try again later.'
    : err.message || 'An unexpected error occurred.';

  const responsePayload: AppErrorResponse = {
    success: false,
    error: {
      code: errorCode,
      message,
      ...(config.isDevelopment || config.isTest ? { stack: err.stack } : {}),
    },
  };

  if (!config.isTest && statusCode >= 500) {
    console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(statusCode).json(responsePayload);
}
