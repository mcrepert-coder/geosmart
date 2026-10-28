import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  AuditResult,
  ChainCheck,
  ChainedAuditEntry,
  GENESIS_HASH,
  computeHash,
  redactSecrets,
  verifyChain,
} from './audit-chain';
import { SqlRunner, TransactionRunner, rowsOf } from './sql-runner';

export interface AuditLogInput {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  result: AuditResult;
  details?: Record<string, unknown>;
}

interface AuditRow {
  seq: number | string;
  at: Date | string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  result: AuditResult;
  details: Record<string, unknown> | string;
  prev_hash: string;
  hash: string;
}

// Cle du verrou PostgreSQL qui serialise l'ajout des lignes au journal.
export const AUDIT_LOCK_KEY = 726381001;

function fromRow(row: AuditRow): ChainedAuditEntry {
  return {
    seq: Number(row.seq),
    at: new Date(row.at),
    actorId: row.actor_id,
    actorRole: row.actor_role,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    result: row.result,
    details:
      typeof row.details === 'string'
        ? (JSON.parse(row.details) as Record<string, unknown>)
        : row.details,
    prevHash: row.prev_hash,
    hash: row.hash,
  };
}

@Injectable()
export class AuditService {
  constructor(private readonly dataSource: DataSource) {}

  private get db(): TransactionRunner {
    return this.dataSource;
  }

  // Avec le runner de la transaction metier, la ligne est annulee avec elle.
  // Sans runner, une transaction propre est ouverte.
  async log(
    input: AuditLogInput,
    runner?: SqlRunner,
  ): Promise<ChainedAuditEntry> {
    if (!runner) {
      return this.db.transaction((tx) => this.log(input, tx));
    }
    await runner.query('SELECT pg_advisory_xact_lock($1)', [AUDIT_LOCK_KEY]);
    const [last] = rowsOf<{ seq: number | string; hash: string }>(
      await runner.query(
        'SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1',
      ),
    );

    const content = {
      seq: last ? Number(last.seq) + 1 : 1,
      at: new Date(),
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      result: input.result,
      details: redactSecrets(input.details ?? {}) as Record<string, unknown>,
    };
    const prevHash = last?.hash ?? GENESIS_HASH;
    const entry: ChainedAuditEntry = {
      ...content,
      prevHash,
      hash: computeHash(prevHash, content),
    };
    await runner.query(
      `INSERT INTO audit_log (seq, at, actor_id, actor_role, action,
         resource_type, resource_id, result, details, prev_hash, hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
      [
        entry.seq,
        entry.at.toISOString(),
        entry.actorId,
        entry.actorRole,
        entry.action,
        entry.resourceType,
        entry.resourceId,
        entry.result,
        JSON.stringify(entry.details),
        entry.prevHash,
        entry.hash,
      ],
    );
    return entry;
  }

  // Consultation (ADMIN, controle fait par le controleur), plus recent d'abord.
  async list(filters: {
    resourceType?: string;
    resourceId?: string;
    from?: string;
    limit?: string | number;
  }): Promise<ChainedAuditEntry[]> {
    const limit =
      filters.limit === undefined || filters.limit === ''
        ? 100
        : Number(filters.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Le parametre limit doit etre un entier entre 1 et 500.',
      });
    }
    if (filters.from !== undefined && Number.isNaN(Date.parse(filters.from))) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Le parametre from doit etre une date ISO 8601.',
      });
    }
    const rows = rowsOf<AuditRow>(
      await this.dataSource.query(
        `SELECT * FROM audit_log
          WHERE ($1::text IS NULL OR resource_type = $1)
            AND ($2::text IS NULL OR resource_id = $2)
            AND ($3::timestamptz IS NULL OR at >= $3)
          ORDER BY seq DESC
          LIMIT $4`,
        [
          filters.resourceType ?? null,
          filters.resourceId ?? null,
          filters.from ?? null,
          limit,
        ],
      ),
    );
    return rows.map(fromRow);
  }

  async verify(runner?: SqlRunner): Promise<ChainCheck> {
    const source = runner ?? this.dataSource;
    const rows = rowsOf<AuditRow>(
      await source.query('SELECT * FROM audit_log ORDER BY seq ASC'),
    );
    return verifyChain(rows.map(fromRow));
  }
}
