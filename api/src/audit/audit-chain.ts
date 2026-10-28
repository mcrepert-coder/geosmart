import { createHash } from 'node:crypto';

export const GENESIS_HASH = '0'.repeat(64);

export type AuditResult = 'SUCCESS' | 'REJECTED' | 'DENIED';

export interface AuditContent {
  seq: number;
  at: Date;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: AuditResult;
  details: Record<string, unknown>;
}

export interface ChainedAuditEntry extends AuditContent {
  prevHash: string;
  hash: string;
}

const SECRET_KEY = /pass(word)?|token|secret|authorization|cookie/i;

// Retire recursivement toute valeur dont la cle ressemble a un secret.
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? '[retire]' : redactSecrets(inner);
    }
    return out;
  }
  return value;
}

// JSON a cles triees : la meme ligne donne toujours la meme chaine.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const parts = Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${parts.join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function computeHash(prevHash: string, content: AuditContent): string {
  const body = canonicalJson({
    seq: content.seq,
    at: content.at.toISOString(),
    actorId: content.actorId,
    actorRole: content.actorRole,
    action: content.action,
    resourceType: content.resourceType,
    resourceId: content.resourceId,
    result: content.result,
    details: content.details,
  });
  return createHash('sha256').update(`${prevHash}\n${body}`).digest('hex');
}

export interface ChainCheck {
  valid: boolean;
  checked: number;
  firstBrokenSeq: number | null;
}

// Les lignes arrivent triees par seq croissant, depuis la premiere.
// Detecte une ligne modifiee, supprimee ou inseree ; ne protege pas contre
// une reecriture complete de la chaine par quelqu'un qui a acces a la base.
export function verifyChain(entries: ChainedAuditEntry[]): ChainCheck {
  let prevHash = GENESIS_HASH;
  let expectedSeq = 1;
  for (const entry of entries) {
    if (
      entry.seq !== expectedSeq ||
      entry.prevHash !== prevHash ||
      entry.hash !== computeHash(prevHash, entry)
    ) {
      return {
        valid: false,
        checked: expectedSeq - 1,
        firstBrokenSeq: entry.seq,
      };
    }
    prevHash = entry.hash;
    expectedSeq += 1;
  }
  return { valid: true, checked: entries.length, firstBrokenSeq: null };
}
