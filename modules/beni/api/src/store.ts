import { Pool, PoolClient } from 'pg';
import { randomUUID, createHash } from 'node:crypto';

export const schema = `
CREATE TABLE IF NOT EXISTS beni_mutex (id integer PRIMARY KEY);
INSERT INTO beni_mutex(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS beni_records (
 id text PRIMARY KEY, kind text NOT NULL, data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS beni_records_kind ON beni_records(kind);
`;
export class Tx {
 constructor(private db: PoolClient) {}
 async get<T = any>(id: string): Promise<T | undefined> {
  return (await this.db.query('SELECT data FROM beni_records WHERE id=$1', [id])).rows[0]?.data;
 }
 async list<T = any>(kind: string): Promise<T[]> {
  return (await this.db.query('SELECT data FROM beni_records WHERE kind=$1 ORDER BY id', [kind])).rows.map(r => r.data);
 }
 async put(kind: string, id: string, data: any) {
  await this.db.query('INSERT INTO beni_records(id,kind,data) VALUES($1,$2,$3::jsonb) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data', [id, kind, JSON.stringify(data)]);
 }
 async audit(actor: string, action: string, target: string) {
  const previous = await this.get('audit-head');
  const event: any = {id: randomUUID(), actor, action, target, at: new Date().toISOString(), previousHash: previous?.hash ?? ''};
  event.hash = createHash('sha256').update(JSON.stringify(event)).digest('hex');
  await this.put('audit', event.id, event);
  await this.put('system', 'audit-head', {hash: event.hash});
 }
}
export class Store {
 constructor(readonly pool: Pool) {}
 async init() { await this.pool.query(schema); }
 async run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = await this.pool.connect();
  try {
   await db.query('BEGIN');
   // Serialisation inter-processus : rotation des jetons et idempotence atomiques.
   await db.query('SELECT id FROM beni_mutex WHERE id=1 FOR UPDATE');
   const result = await fn(new Tx(db));
   await db.query('COMMIT');
   return result;
  } catch (e) { await db.query('ROLLBACK'); throw e; }
  finally { db.release(); }
 }
}
