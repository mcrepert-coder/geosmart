import { Inject, Injectable } from '@nestjs/common';
import { canonicalize, JsonValue } from './canonical-json';
import {
  AuditEntry,
  ChainHead,
  GENESIS_HASH,
  seal,
  verifyChain,
  VerifyResult,
} from './audit-chain';
import { AUDIT_STORE, AuditStore } from './audit.store';

export const AUDIT_CLOCK = Symbol('AUDIT_CLOCK');
export type Clock = () => Date;

export interface AuditTarget {
  type: string;
  id: string;
}

const ACTION_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const NO_TARGET: AuditTarget = { type: 'system', id: '-' };

export class AuditInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditInputError';
  }
}

// Point d'entree des autres modules (RG-10) :
//   await audit.log('ACCOUNT_VALIDATED', adminId, { motif }, { type: 'user', id: userId });
@Injectable()
export class AuditService {
  constructor(
    @Inject(AUDIT_STORE) private readonly store: AuditStore,
    @Inject(AUDIT_CLOCK) private readonly clock: Clock,
  ) {}

  async log(
    action: string,
    actorId: string | null,
    details: { [key: string]: JsonValue } = {},
    target: AuditTarget = NO_TARGET,
  ): Promise<AuditEntry> {
    if (!ACTION_PATTERN.test(action)) {
      throw new AuditInputError(`Action invalide : ${action}`);
    }
    if (actorId !== null && (typeof actorId !== 'string' || actorId === '')) {
      throw new AuditInputError('Acteur invalide');
    }
    if (!target.type || !target.id) {
      throw new AuditInputError('Entite invalide');
    }
    if (details === null || typeof details !== 'object' || Array.isArray(details)) {
      throw new AuditInputError('Les details doivent etre un objet');
    }
    // Refuse avant l'ecriture ce qui ne pourrait pas etre recalcule a la verification,
    // et fige une copie : l'appelant ne peut plus modifier ce qui est scelle.
    const frozen = JSON.parse(canonicalize(details)) as { [key: string]: JsonValue };

    return this.store.append((last) =>
      seal({
        seq: last ? last.seq + 1 : 1,
        prevHash: last ? last.hash : GENESIS_HASH,
        at: this.clock().toISOString(),
        actorId,
        action,
        entityType: target.type,
        entityId: target.id,
        details: frozen,
      }),
    );
  }

  async verify(expectedHead?: ChainHead): Promise<VerifyResult> {
    return verifyChain(await this.store.list(), expectedHead);
  }
}
