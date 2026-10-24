// Base de test isolee pour les tests d'integration du stockage foncier.
//
// Deux moteurs, choisis dans cet ordre :
// 1. LAND_TEST_DATABASE_URL : un PostgreSQL/PostGIS de test. Le nom de la base doit
//    contenir "test". Un schema jetable land_it_<horodatage>_<pid> est cree puis
//    supprime. DATABASE_URL n'est jamais utilisee.
// 2. Sinon PGlite (PostgreSQL embarque, en memoire) avec son extension PostGIS,
//    si les paquets @electric-sql/pglite et @electric-sql/pglite-postgis sont installes.
// Sans l'un ni l'autre, les tests sont ignores avec un message explicite.
import { readFileSync } from 'fs';
import { join } from 'path';

export const LAND_MIGRATION = join(
  __dirname,
  '..',
  '..',
  '..',
  'migrations',
  '202610241300_land_parcels.sql',
);

export interface DbError {
  code?: string;
  message: string;
}

export interface LandTestDb {
  readonly label: string;
  exec(sql: string): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
function optionalRequire(name: string): any {
  try {
    return require(name);
  } catch {
    return null;
  }
}

async function openPostgres(url: string): Promise<LandTestDb> {
  const pg = optionalRequire('pg');
  if (!pg) throw new Error('LAND_TEST_DATABASE_URL defini mais le paquet pg est absent');
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(dbName)) {
    throw new Error(`Base "${dbName}" refusee : son nom doit contenir "test"`);
  }
  const schema = `land_it_${Date.now()}_${process.pid}`;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('CREATE EXTENSION IF NOT EXISTS postgis');
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}, public`);
  return {
    label: `PostgreSQL ${dbName}, schema ${schema}`,
    exec: async (sql) => {
      await client.query(sql);
    },
    query: async (sql, params) => (await client.query(sql, params)).rows,
    close: async () => {
      try {
        await client.query('ROLLBACK').catch(() => undefined);
        await client.query(`DROP SCHEMA ${schema} CASCADE`);
      } finally {
        await client.end();
      }
    },
  };
}

async function openPglite(): Promise<LandTestDb | null> {
  const lite = optionalRequire('@electric-sql/pglite');
  const gis = optionalRequire('@electric-sql/pglite-postgis');
  if (!lite || !gis) return null;
  const db = new lite.PGlite({ extensions: { postgis: gis.postgis } });
  await db.exec('CREATE EXTENSION IF NOT EXISTS postgis');
  return {
    label: 'PGlite en memoire avec PostGIS',
    exec: async (sql) => {
      await db.exec(sql);
    },
    query: async (sql, params) => (await db.query(sql, params)).rows,
    close: () => db.close(),
  };
}
/* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */

export async function openLandTestDb(): Promise<LandTestDb | null> {
  const url = process.env.LAND_TEST_DATABASE_URL;
  return url ? openPostgres(url) : openPglite();
}

// PGlite charge son moteur WASM par import dynamique : sous Jest, il faut lancer
// Node avec --experimental-vm-modules, sinon le processus s'arrete brutalement.
function vmModulesEnabled(): boolean {
  const flags = `${process.env.NODE_OPTIONS ?? ''} ${process.execArgv.join(' ')}`;
  return flags.includes('--experimental-vm-modules');
}

export function landTestDbAvailable(): boolean {
  if (process.env.LAND_TEST_DATABASE_URL) return true;
  return Boolean(
    vmModulesEnabled() &&
      optionalRequire('@electric-sql/pglite') &&
      optionalRequire('@electric-sql/pglite-postgis'),
  );
}

// La migration est executee dans une transaction, comme le fera le moteur commun.
export async function migrate(db: LandTestDb): Promise<void> {
  const sql = readFileSync(LAND_MIGRATION, 'utf8');
  await db.exec('BEGIN');
  try {
    await db.exec(sql);
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

// Execute fn dans une transaction validee par un vrai COMMIT.
export async function inTransaction(db: LandTestDb, fn: () => Promise<void>): Promise<void> {
  await db.exec('BEGIN');
  try {
    await fn();
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
  await db.exec('COMMIT');
}

// Capture l'erreur d'une promesse, ou echoue si elle reussit.
export async function captureError(promise: Promise<unknown>): Promise<DbError> {
  try {
    await promise;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return { code: e.code, message: String(e.message ?? err) };
  }
  throw new Error('Refus attendu, mais l operation a reussi');
}

// Refus isole : fn s'execute dans sa propre transaction, toujours annulee ensuite,
// pour qu'un echec n'affecte pas les verifications suivantes.
export async function rejectsInIsolation(
  db: LandTestDb,
  fn: () => Promise<unknown>,
): Promise<DbError> {
  await db.exec('BEGIN');
  try {
    return await captureError(fn());
  } finally {
    await db.exec('ROLLBACK');
  }
}

// Refus au COMMIT : les ecritures reussissent, le COMMIT est rejete.
export async function rejectsAtCommit(
  db: LandTestDb,
  fn: () => Promise<unknown>,
): Promise<DbError> {
  await db.exec('BEGIN');
  try {
    await fn();
  } catch (err) {
    await db.exec('ROLLBACK');
    throw new Error(`Refus attendu au COMMIT, obtenu avant : ${String(err)}`);
  }
  const error = await captureError(db.exec('COMMIT'));
  // Selon le moteur, un COMMIT refuse peut laisser la session en transaction annulee.
  await db.exec('ROLLBACK').catch(() => undefined);
  return error;
}
