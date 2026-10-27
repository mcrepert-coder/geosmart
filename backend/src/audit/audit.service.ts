import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  AuditResult,
  ChainCheck,
  GENESIS_HASH,
  computeHash,
  redactSecrets,
  verifyChain,
} from './audit-chain';
import { AuditEntryEntity } from './audit-entry.entity';

export interface AuditLogInput {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  result: AuditResult;
  details?: Record<string, unknown>;
}

// Cle du verrou PostgreSQL qui serialise l'ajout des lignes au journal.
export const AUDIT_LOCK_KEY = 726381001;

@Injectable()
export class AuditService {
  constructor(private readonly dataSource: DataSource) {}

  // Avec le manager de la transaction metier, la ligne est annulee avec elle.
  // Sans manager, une transaction propre est ouverte.
  async log(
    input: AuditLogInput,
    manager?: EntityManager,
  ): Promise<AuditEntryEntity> {
    if (!manager) {
      return this.dataSource.transaction((tx) => this.log(input, tx));
    }
    await manager.query('SELECT pg_advisory_xact_lock($1)', [AUDIT_LOCK_KEY]);
    const repo = manager.getRepository(AuditEntryEntity);
    const [last] = await repo.find({ order: { seq: 'DESC' }, take: 1 });

    const entry = repo.create({
      seq: (last?.seq ?? 0) + 1,
      at: new Date(),
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      result: input.result,
      details: redactSecrets(input.details ?? {}) as Record<string, unknown>,
      prevHash: last?.hash ?? GENESIS_HASH,
    });
    entry.hash = computeHash(entry.prevHash, entry);
    return repo.save(entry);
  }

  async verify(): Promise<ChainCheck> {
    const entries = await this.dataSource
      .getRepository(AuditEntryEntity)
      .find({ order: { seq: 'ASC' } });
    return verifyChain(entries);
  }
}
