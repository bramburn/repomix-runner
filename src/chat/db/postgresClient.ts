import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runner } from 'node-pg-migrate';
import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import { logger } from '../../shared/logger.js';

let pool: Pool | null = null;
let poolPromise: Promise<Pool> | null = null;

const MIGRATIONS_TABLE = 'chat_schema_migrations';

const REQUIRED_TABLES = [
  'chat_threads',
  'chat_messages',
  'chat_memory',
  'batch_jobs',
  'repo_architecture',
] as const;

type RequiredTableName = (typeof REQUIRED_TABLES)[number];

type TableStatus = Record<RequiredTableName, boolean>;

function getMigrationCandidates(): string[] {
  return [
    path.join(__dirname, 'migrations'),
    path.join(process.cwd(), 'dist', 'chat', 'db', 'migrations'),
    path.join(process.cwd(), 'src', 'chat', 'db', 'migrations'),
  ];
}

function isMigrationFilename(fileName: string): boolean {
  return /\.(sql|js|cjs|mjs|ts)$/.test(fileName) && !fileName.startsWith('.');
}

async function resolveMigrationDir(): Promise<string> {
  const candidates = getMigrationCandidates();

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isDirectory()) {
        continue;
      }

      const fileNames = await fs.readdir(candidate);
      if (fileNames.some(isMigrationFilename)) {
        return candidate;
      }
    } catch {
      // Ignore and continue searching.
    }
  }

  throw new Error(
    `Migration directory not found. Checked: ${candidates.join(', ')}`
  );
}

async function listMigrationNames(migrationDir: string): Promise<string[]> {
  const fileNames = await fs.readdir(migrationDir);
  return fileNames.filter(isMigrationFilename).sort((a, b) => a.localeCompare(b));
}

async function doesTableExist(client: Pool, tableName: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT FROM pg_tables
      WHERE schemaname = 'public' AND tablename = $1
    ) AS exists`,
    [tableName]
  );

  return result.rows[0]?.exists ?? false;
}

async function checkTablesExist(activePool: Pool): Promise<TableStatus> {
  const status: Partial<TableStatus> = {};

  for (const tableName of REQUIRED_TABLES) {
    status[tableName] = await doesTableExist(activePool, tableName);
  }

  return status as TableStatus;
}

async function checkColumnExists(
  activePool: Pool,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const result = await activePool.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
    ) AS exists`,
    [tableName, columnName]
  );

  return result.rows[0]?.exists ?? false;
}

async function getAppliedMigrationNames(activePool: Pool): Promise<Set<string>> {
  const result = await activePool.query<{ name: string }>(
    `SELECT name FROM public.${MIGRATIONS_TABLE}`
  );

  return new Set(result.rows.map((row) => row.name));
}

async function runMigrations(connectionString: string): Promise<void> {
  const migrationDir = await resolveMigrationDir();
  const migrationNames = await listMigrationNames(migrationDir);

  if (migrationNames.length === 0) {
    throw new Error(`No migration files found in ${migrationDir}`);
  }

  logger.both.info(
    `[PostgresClient] Running migrations via node-pg-migrate (${migrationNames.length} files) from ${migrationDir}`
  );

  await runner({
    databaseUrl: connectionString,
    dir: migrationDir,
    direction: 'up',
    migrationsTable: MIGRATIONS_TABLE,
    migrationsSchema: 'public',
    schema: 'public',
    checkOrder: true,
    singleTransaction: true,
    createSchema: false,
    createMigrationsSchema: false,
    logger: {
      debug: (msg) => logger.both.debug(`[node-pg-migrate] ${msg}`),
      info: (msg) => logger.both.info(`[node-pg-migrate] ${msg}`),
      warn: (msg) => logger.both.warn(`[node-pg-migrate] ${msg}`),
      error: (msg) => logger.both.error(`[node-pg-migrate] ${msg}`),
    },
  });

  logger.both.info('[PostgresClient] Migrations completed');
}

export async function initPool(connectionString: string): Promise<Pool> {
  const startTime = Date.now();
  console.log('[PostgreSQL] Starting pool initialization...');

  if (!poolPromise) {
    console.log('[PostgreSQL] Creating new pool promise...');
    poolPromise = _initPoolImpl(connectionString);
  }

  try {
    const result = await poolPromise;
    console.log(`[PostgreSQL] Pool initialized in ${Date.now() - startTime}ms`);
    return result;
  } catch (error) {
    console.error(`[PostgreSQL] Pool initialization failed after ${Date.now() - startTime}ms:`, error);
    poolPromise = null;
    pool = null;
    throw error;
  }
}

async function _initPoolImpl(connectionString: string): Promise<Pool> {
  const config: PoolConfig = {
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

  pool = new Pool(config);
  pool.on('error', (error) => {
    logger.both.error('[PostgresClient] Unexpected idle client error:', error);
  });

  await runMigrations(connectionString);

  return pool;
}

function isRetryablePoolError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('connection terminated') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('could not connect')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error(
      'PostgreSQL pool not initialized. Configure the PostgreSQL connection string in the Repomix Runner Control Panel settings.'
    );
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    poolPromise = null;
    logger.both.info('[PostgresClient] Pool closed');
  }
}

export async function queryWithRetry<T extends QueryResultRow = any>(
  text: string,
  values: unknown[] = []
): Promise<QueryResult<T>> {
  const activePool = getPool();
  try {
    return await activePool.query<T>(text, values);
  } catch (error) {
    if (!isRetryablePoolError(error)) {
      throw error;
    }
    logger.both.warn('[PostgresClient] Query failed, retrying once:', error);
    await sleep(250);
    return activePool.query<T>(text, values);
  }
}

export async function verifyMigration(): Promise<{
  success: boolean;
  missingTables: string[];
  message: string;
}> {
  const activePool = getPool();

  try {
    const migrationTableExists = await doesTableExist(activePool, MIGRATIONS_TABLE);
    if (!migrationTableExists) {
      return {
        success: false,
        missingTables: [MIGRATIONS_TABLE],
        message: `${MIGRATIONS_TABLE} table does not exist`,
      };
    }

    const tableStatus = await checkTablesExist(activePool);
    const missingTables = REQUIRED_TABLES.filter((tableName) => !tableStatus[tableName]);
    if (missingTables.length > 0) {
      return {
        success: false,
        missingTables,
        message: `Missing tables: ${missingTables.join(', ')}`,
      };
    }

    const sourceColumnExists = await checkColumnExists(activePool, 'chat_memory', 'source');
    if (!sourceColumnExists) {
      return {
        success: false,
        missingTables: [],
        message: 'Missing required column: chat_memory.source',
      };
    }

    const migrationDir = await resolveMigrationDir();
    const expectedMigrations = await listMigrationNames(migrationDir);
    const appliedMigrations = await getAppliedMigrationNames(activePool);

    const missingMigrations = expectedMigrations.filter((name) => !appliedMigrations.has(name));
    if (missingMigrations.length > 0) {
      return {
        success: false,
        missingTables: [],
        message: `Pending migrations: ${missingMigrations.join(', ')}`,
      };
    }

    return {
      success: true,
      missingTables: [],
      message: `All tables and ${expectedMigrations.length} migrations are applied`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      missingTables: [],
      message: `Verification failed: ${errorMessage}`,
    };
  }
}

export async function testConnection(): Promise<{ success: boolean; message: string }> {
  if (!pool) {
    return {
      success: false,
      message:
        'PostgreSQL is not configured yet. Set the connection string in the Repomix Runner Control Panel → Settings tab.',
    };
  }

  try {
    const result = await queryWithRetry('SELECT version()');
    const version = result.rows[0].version as string;

    const verification = await verifyMigration();

    return {
      success: true,
      message: `${version}\nMigration Status: ${verification.message}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message };
  }
}

export async function testConnectionString(connectionString: string): Promise<{ success: boolean; message: string }> {
  if (!connectionString || connectionString.trim().length === 0) {
    return {
      success: false,
      message: 'Connection string is empty',
    };
  }

  let tempPool: Pool | null = null;
  try {
    const config: PoolConfig = {
      connectionString,
      max: 1,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 5000,
    };

    tempPool = new Pool(config);

    const result = await tempPool.query('SELECT version()');
    const version = result.rows[0].version as string;

    const migrationTableExists = await doesTableExist(tempPool, MIGRATIONS_TABLE);
    const tableStatus = await checkTablesExist(tempPool);
    const allTablesExist = Object.values(tableStatus).every((status) => status === true);

    let migrationStatus = '';

    if (!migrationTableExists) {
      migrationStatus = `\n⚠️ ${MIGRATIONS_TABLE} table not found (migrations will run on first use)`;
    } else if (!allTablesExist) {
      migrationStatus = '\n⚠️ Some chat tables are missing (migrations will run on first use)';
    } else {
      const sourceColumnExists = await checkColumnExists(tempPool, 'chat_memory', 'source');

      if (!sourceColumnExists) {
        migrationStatus = '\n⚠️ chat_memory.source column missing (migrations will run on first use)';
      } else {
        const migrationDir = await resolveMigrationDir();
        const expectedMigrations = await listMigrationNames(migrationDir);
        const appliedMigrations = await getAppliedMigrationNames(tempPool);
        const pendingCount = expectedMigrations.filter((name) => !appliedMigrations.has(name)).length;

        if (pendingCount > 0) {
          migrationStatus = `\n⚠️ ${pendingCount} migrations pending (will run on first use)`;
        } else {
          migrationStatus = '\n✅ All migrations applied';
        }
      }
    }

    return {
      success: true,
      message: `${version}${migrationStatus}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message,
    };
  } finally {
    if (tempPool) {
      await tempPool.end();
    }
  }
}
