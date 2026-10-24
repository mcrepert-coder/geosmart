import type { Pool, PoolClient } from 'pg';
import { AuditEntry } from './audit-chain';
import { AuditStore } from './audit.store';

// Cle du verrou consultatif qui serialise les ajouts au journal.
const AUDIT_LOCK_KEY = 7_202_610_241;

interface AuditRow {
  seq: string;
  at: Date;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  details: AuditEntry['details'];
  prev_hash: string;
  hash: string;
}

const COLUMNS =
  'seq, at, actor_id, action, entity_type, entity_id, details, prev_hash, hash';

// Chaque ajout a sa propre transaction : une alerte journalisee survit au rollback
// de l'operation refusee (RG-02).
export class PgAuditStore implements AuditStore {
  constructor(private readonly pool: Pool) {}

  // Le client doit deja etre dans une transaction READ COMMITTED, geree par
  // l'appelant. Ce stockage ne commit, n'annule et ne libere jamais le client.
  // Conserver une seule instance par transaction et ne pas l'utiliser apres sa fin.
  static inTransaction(client: PoolClient): AuditStore {
    return new TransactionAuditStore(client);
  }

  async append(build: (last: AuditEntry | null) => AuditEntry): Promise<AuditEntry> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      const entry = await PgAuditStore.inTransaction(client).append(build);
      await client.query('COMMIT');
      return entry;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async list(): Promise<AuditEntry[]> {
    const { rows } = await this.pool.query<AuditRow>(
      `SELECT ${COLUMNS} FROM audit_log ORDER BY seq`,
    );
    return rows.map(toEntry);
  }

}

class TransactionAuditStore implements AuditStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly client: PoolClient) {}

  append(build: (last: AuditEntry | null) => AuditEntry): Promise<AuditEntry> {
    // Le verrou SQL protege les connexions distinctes ; la file protege plusieurs
    // appels simultanes utilisant la meme instance et donc la meme transaction.
    const run = this.queue.then(async () => {
      await this.client.query('SELECT pg_advisory_xact_lock($1)', [AUDIT_LOCK_KEY]);
      const { rows } = await this.client.query<AuditRow>(
        `SELECT ${COLUMNS} FROM audit_log ORDER BY seq DESC LIMIT 1`,
      );
      const entry = build(rows.length ? toEntry(rows[0]) : null);
      await this.client.query(
        `INSERT INTO audit_log (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [entry.seq, entry.at, entry.actorId, entry.action, entry.entityType,
          entry.entityId, JSON.stringify(entry.details), entry.prevHash, entry.hash],
      );
      return entry;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list(): Promise<AuditEntry[]> {
    await this.queue;
    const { rows } = await this.client.query<AuditRow>(
      `SELECT ${COLUMNS} FROM audit_log ORDER BY seq`,
    );
    return rows.map(toEntry);
  }
}

function toEntry(row: AuditRow): AuditEntry {
  return {
    seq: Number(row.seq),
    at: row.at.toISOString(),
    actorId: row.actor_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details: row.details,
    prevHash: row.prev_hash,
    hash: row.hash,
  };
}
