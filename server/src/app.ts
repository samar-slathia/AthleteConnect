import express, { Application } from 'express';
import cors, { CorsOptions } from 'cors';
import { config } from './config/env';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { notFoundHandler } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';

export function createApp(): Application {
  const app = express();

  // Explicit CORS configuration
  const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      const allowed = Array.isArray(config.CORS_ORIGIN)
        ? config.CORS_ORIGIN
        : [config.CORS_ORIGIN];

      if (allowed.includes(origin) || allowed.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error(`Origin "${origin}" is not allowed by AthleteConnect CORS policy.`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  };

  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);

  // Catch-all 404 handler for undefined endpoints
  app.use(notFoundHandler);

  // Global centralized error handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
