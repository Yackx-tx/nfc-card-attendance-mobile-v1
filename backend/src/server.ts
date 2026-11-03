import { buildApp } from './app.js';
import { runMigrations } from './db/migrator.js';
import { getOrCreateSigningKeys } from './modules/sessions/offlinePackageService.js';

async function start() {
  try {
    console.log('Running database migrations...');
    await runMigrations();

    console.log('Initializing Ed25519 signing keys...');
    getOrCreateSigningKeys();

    const app = buildApp();
    const port = Number(process.env.PORT) || 4000;
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    console.log(`AMAS Backend Server running at http://${host}:${port}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
