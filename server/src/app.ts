import express, { Application } from 'express';
import helmet from 'helmet';
import cors, { CorsOptions } from 'cors';
import { config } from './config/env';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { coachRouter } from './routes/coach';
import { availabilityRouter } from './routes/availability';
import { bookingRouter } from './routes/booking';
import { coachDiscoveryRouter } from './routes/coachDiscovery';
import { userRouter } from './routes/user';
import { adminRouter } from './routes/admin';
import { paymentRouter } from './routes/payment';
import { notFoundHandler } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';

export function createApp(): Application {
  const app = express();

  // Trusted proxy configuration (honored when explicitly configured in production environment)
  if (config.TRUST_PROXY) {
    app.set('trust proxy', config.TRUST_PROXY);
  }

  // HTTP Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: config.isProduction
        ? {
            maxAge: 31536000, // 1 year HSTS policy in production
            includeSubDomains: true,
          }
        : false, // Disabled in non-production development and tests to preserve HTTP compatibility
    })
  );

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
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/coach', coachRouter);
  app.use('/api/coach/availability', availabilityRouter);
  app.use('/api/bookings', bookingRouter);
  app.use('/api/coaches', coachDiscoveryRouter);
  app.use('/api/users', userRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/payments', paymentRouter);

  // Catch-all 404 handler for undefined endpoints
  app.use(notFoundHandler);

  // Global centralized error handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
