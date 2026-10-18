import { startServer } from './server';

startServer().catch((err) => {
  console.error('[AthleteConnect] Fatal server initialization error:', err);
  process.exit(1);
});
