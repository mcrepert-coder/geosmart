// Chainage du journal (EF-205, RG-10) : chaque ligne contient l'empreinte de la precedente.
import { createHash } from 'crypto';
import { canonicalize, JsonValue } from './canonical-json';

export const GENESIS_HASH = '0'.repeat(64);

export interface AuditEntry {
  seq: number;
  at: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  details: { [key: string]: JsonValue };
  prevHash: string;
  hash: string;
}

export type UnsealedEntry = Omit<AuditEntry, 'hash'>;

export function computeHash(entry: UnsealedEntry): string {
  const payload = {
    seq: entry.seq,
    prevHash: entry.prevHash,
    at: entry.at,
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    details: entry.details,
  };
  return createHash('sha256').update(canonicalize(payload), 'utf8').digest('hex');
}

export function seal(entry: UnsealedEntry): AuditEntry {
  return { ...entry, hash: computeHash(entry) };
}

export interface ChainHead {
  seq: number;
  hash: string;
}

export interface VerifyResult {
  valid: boolean;
  checked: number;
  firstBrokenSeq: number | null;
  reason?: string;
}

// expectedHead : empreinte de reference conservee hors de la base. Sans elle, une
// suppression des dernieres lignes ou une reecriture complete reste indetectable.
export function verifyChain(
  entries: Iterable<AuditEntry>,
  expectedHead?: ChainHead,
): VerifyResult {
  let expectedSeq = 1;
  let prevHash = GENESIS_HASH;
  let checked = 0;

  for (const entry of entries) {
    const broken = (reason: string): VerifyResult => ({
      valid: false,
      checked,
      firstBrokenSeq: expectedSeq,
      reason,
    });
    if (entry.seq !== expectedSeq) return broken('SEQUENCE_GAP');
    if (entry.prevHash !== prevHash) return broken('PREV_HASH_MISMATCH');
    let recomputed: string;
    try {
      recomputed = computeHash(entry);
    } catch {
      return broken('UNHASHABLE_ENTRY');
    }
    if (entry.hash !== recomputed) return broken('HASH_MISMATCH');
    if (expectedHead && entry.seq === expectedHead.seq && entry.hash !== expectedHead.hash) {
      return broken('HEAD_MISMATCH');
    }
    checked++;
    prevHash = entry.hash;
    expectedSeq++;
  }

  if (expectedHead) {
    const lastSeq = expectedSeq - 1;
    if (lastSeq < expectedHead.seq) {
      return { valid: false, checked, firstBrokenSeq: lastSeq + 1, reason: 'TRUNCATED' };
    }
  }
  return { valid: true, checked, firstBrokenSeq: null };
}
