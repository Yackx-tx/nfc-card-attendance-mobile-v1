import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  const client = await pool.connect();
  try {
    // 1. Ensure migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Discover migration files
    let migrationsDir = path.join(__dirname, 'migrations');
    try {
      await fs.access(migrationsDir);
    } catch {
      // Fallback to src/db/migrations if running from dist
      migrationsDir = path.resolve(__dirname, '../../src/db/migrations');
    }

    const files = (await fs.readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    // 3. Check already applied migrations
    const { rows: applied } = await client.query('SELECT version FROM schema_migrations');
    const appliedSet = new Set(applied.map((r) => r.version));

    for (const file of files) {
      if (!appliedSet.has(file)) {
        console.log(`Applying migration: ${file}`);
        const sql = await fs.readFile(path.join(migrationsDir, file), 'utf-8');

        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
          await client.query('COMMIT');
          console.log(`Successfully applied: ${file}`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`Migration ${file} failed:`, err);
          throw err;
        }
      }
    }
    console.log('All database migrations are up to date.');
  } finally {
    client.release();
  }
}

// Allow running directly
if (process.argv[1] && (process.argv[1].endsWith('migrator.ts') || process.argv[1].endsWith('migrator.js'))) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal migration failure:', err);
      process.exit(1);
    });
}
