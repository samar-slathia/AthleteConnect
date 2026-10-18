import http from 'http';
import { app } from './app';
import { config } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/db';

export interface RunningServer {
  httpServer: http.Server;
  stop: () => Promise<void>;
}

export async function startServer(): Promise<RunningServer> {
  console.log(`[AthleteConnect] Initializing backend service (Environment: ${config.NODE_ENV})...`);

  // 1. Establish database connection (fails clearly if unreachable/invalid)
  await connectDatabase();

  // 2. Start HTTP listener
  const httpServer = http.createServer(app);

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(config.PORT, () => {
      console.log(`[AthleteConnect] HTTP server listening on port ${config.PORT}`);
      console.log(`[AthleteConnect] Health check available at http://localhost:${config.PORT}/api/health`);
      resolve();
    });

    httpServer.on('error', (err) => {
      reject(err);
    });
  });

  let isShuttingDown = false;

  const stop = async (): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('[AthleteConnect] Graceful shutdown initiated...');

    // 1. Close HTTP server to stop accepting new requests
    await new Promise<void>((resolve) => {
      httpServer.close((err) => {
        if (err) {
          console.error('[AthleteConnect] Error closing HTTP server:', err);
        } else {
          console.log('[AthleteConnect] HTTP server closed cleanly.');
        }
        resolve();
      });
    });

    // 2. Disconnect from MongoDB
    await disconnectDatabase();
    console.log('[AthleteConnect] Shutdown complete.');
  };

  // Signal traps for graceful exit
  const handleSignal = (signal: string) => {
    console.log(`\n[AthleteConnect] Received ${signal}. Starting shutdown...`);
    stop()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('[AthleteConnect] Error during graceful shutdown:', err);
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));

  return { httpServer, stop };
}
