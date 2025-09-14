import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { authenticateToken, requireSuperAdmin, AuthenticatedRequest } from '../middleware/auth';
import { pool, query } from '../database';

const router = express.Router();

// Require auth + super admin for everything in this router
router.use(authenticateToken, requireSuperAdmin);

// Optional kill-switch for prod safety
function ensureDbAdminEnabled(req: express.Request, res: express.Response): boolean {
  if ((process.env.ENABLE_DB_ADMIN || '').toLowerCase() !== 'true') {
    res.status(403).json({ error: 'DB admin endpoints disabled. Set ENABLE_DB_ADMIN=true to enable.' });
    return false;
  }
  return true;
}

// Utility: resolve migration directory mounted into backend container
function getMigrationsDir(): string {
  // docker-compose will mount ./database at /app/database
  const base = path.resolve('/app/database/migrations');
  return base;
}

function getRunScriptsDir(): string {
  return path.resolve('/app/database');
}

// GET /api/admin/db/migrations – list available migrations and run_*.sql helpers
router.get('/migrations', async (req: AuthenticatedRequest, res: express.Response) => {
  if (!ensureDbAdminEnabled(req, res)) return;
  try {
    const migrationsDir = getMigrationsDir();
    const runDir = getRunScriptsDir();

    const migrations = fs.existsSync(migrationsDir)
      ? fs
          .readdirSync(migrationsDir)
          .filter((f) => f.endsWith('.sql'))
          .sort()
      : [];

    const runScripts = fs.existsSync(runDir)
      ? fs
          .readdirSync(runDir)
          .filter((f) => f.startsWith('run_') && f.endsWith('.sql'))
          .sort()
      : [];

    res.json({
      migrations,
      runScripts,
      basePath: '/app/database',
    });
  } catch (err) {
    console.error('❌ [DB-ADMIN] List migrations failed:', err);
    res.status(500).json({ error: 'Failed to list migrations' });
  }
});

// POST /api/admin/db/migrate – run a migration file
// Body: { file: string } where file is relative to /app/database (e.g., "migrations/017_add_aeries_permissions.sql" or "run_aeries_permissions_migration.sql")
router.post('/migrate', async (req: AuthenticatedRequest, res: express.Response) => {
  if (!ensureDbAdminEnabled(req, res)) return;
  try {
    const { file } = req.body || {};
    if (!file || typeof file !== 'string') {
      res.status(400).json({ error: 'Missing "file" in body' });
      return;
    }

    const baseDir = '/app/database';
    const fullPath = path.resolve(baseDir, file);
    if (!fullPath.startsWith(baseDir) || !fs.existsSync(fullPath)) {
      res.status(400).json({ error: 'Invalid migration path' });
      return;
    }

    let sqlToRun = fs.readFileSync(fullPath, 'utf8');

    // If a run_*.sql wrapper is provided, try to extract the referenced migration from "\i migrations/..."
    if (path.basename(fullPath).startsWith('run_')) {
      const includeMatch = sqlToRun.match(/\\i\s+migrations\/(\S+\.sql)/);
      if (includeMatch) {
        const migPath = path.resolve(baseDir, 'migrations', includeMatch[1]);
        if (fs.existsSync(migPath)) {
          sqlToRun = fs.readFileSync(migPath, 'utf8');
        }
      }
    }

    // Execute as a single transaction; most DDL is transactional in PostgreSQL
    if (!pool) {
      res.status(500).json({ error: 'Database not initialized' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sqlToRun);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('❌ [DB-ADMIN] Migration failed:', e);
      res.status(500).json({ error: 'Migration failed', details: e instanceof Error ? e.message : String(e) });
      return;
    } finally {
      client.release();
    }

    res.json({ success: true, file });
  } catch (err) {
    console.error('❌ [DB-ADMIN] Migrate error:', err);
    res.status(500).json({ error: 'Migration error' });
  }
});

// GET /api/admin/db/backup – stream pg_dumpall output as a download
router.get('/backup', async (req: AuthenticatedRequest, res: express.Response) => {
  if (!ensureDbAdminEnabled(req, res)) return;

  const host = process.env.DB_HOST || 'localhost';
  const port = String(process.env.DB_PORT || '5432');
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || '';

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `athena_backup_${timestamp}.sql`;
  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // Use pg_dumpall to capture roles + all DBs (closest to requested workflow)
  const env = { ...process.env, PGPASSWORD: password };
  const args = ['-h', host, '-p', port, '-U', user, '-c', '--if-exists'];
  const dump = spawn('pg_dumpall', args, { env });

  dump.stdout.pipe(res);
  dump.stderr.on('data', (d) => {
    // Log but do not expose details to client
    console.error('[pg_dumpall]', d.toString());
  });

  dump.on('error', (err) => {
    console.error('❌ [DB-ADMIN] pg_dumpall spawn error:', err);
    if (!res.headersSent) {
      res.status(500).end('Backup failed to start');
    } else {
      res.end();
    }
  });

  dump.on('close', (code) => {
    if (code !== 0) {
      console.error(`❌ [DB-ADMIN] pg_dumpall exited with code ${code}`);
    }
    res.end();
  });
});

// POST /api/admin/db/restore – apply SQL sent as raw text
// Request: text/plain body contains full SQL; query param dropSchema=true|false
router.post('/restore', express.text({ type: '*/*', limit: '1gb' }), async (req: AuthenticatedRequest, res: express.Response) => {
  if (!ensureDbAdminEnabled(req, res)) return;
  const sqlText = typeof req.body === 'string' ? req.body : '';
  if (!sqlText || sqlText.trim().length === 0) {
    res.status(400).json({ error: 'Missing SQL text body' });
    return;
  }

  const host = process.env.DB_HOST || 'localhost';
  const port = String(process.env.DB_PORT || '5432');
  const dbname = process.env.DB_NAME || 'postgres';
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || '';
  const dropSchema = (req.query?.dropSchema ?? 'true').toString().toLowerCase() !== 'false';

  try {
    if (dropSchema) {
      // Clear current schema similar to your workflow
      await query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    }

    // Use psql to apply the SQL via stdin to avoid temp files
    const env = { ...process.env, PGPASSWORD: password };
    const args = ['-h', host, '-p', port, '-U', user, '-d', dbname];
    const psql = spawn('psql', args, { env });

    let stderr = '';
    psql.stderr.on('data', (d) => { stderr += d.toString(); });

    psql.on('error', (err) => {
      console.error('❌ [DB-ADMIN] psql spawn error:', err);
    });

    psql.on('close', (code) => {
      if (code !== 0) {
        console.error(`❌ [DB-ADMIN] psql exited with code ${code}`);
        res.status(500).json({ error: 'Restore failed', details: stderr.trim().split('\n').slice(-10).join('\n') });
        return;
      }
      res.json({ success: true });
    });

    // Write SQL to psql stdin
    psql.stdin.write(sqlText);
    psql.stdin.end();
  } catch (err) {
    console.error('❌ [DB-ADMIN] Restore error:', err);
    res.status(500).json({ error: 'Restore error' });
  }
});

export default router;
