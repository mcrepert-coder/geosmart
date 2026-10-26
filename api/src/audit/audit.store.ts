import { AuditEntry } from './audit-chain';

// Le stockage execute `build` en exclusion mutuelle avec le dernier element connu,
// puis enregistre son resultat : deux ecritures concurrentes ne peuvent pas avoir
// le meme predecesseur.
export interface AuditStore {
  append(build: (last: AuditEntry | null) => AuditEntry): Promise<AuditEntry>;
  list(): Promise<AuditEntry[]>;
}

export const AUDIT_STORE = Symbol('AUDIT_STORE');

// Stockage en memoire pour les tests et le developpement sans base.
export class InMemoryAuditStore implements AuditStore {
  readonly entries: AuditEntry[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  append(build: (last: AuditEntry | null) => AuditEntry): Promise<AuditEntry> {
    const run = this.queue.then(() => {
      const entry = build(this.entries[this.entries.length - 1] ?? null);
      this.entries.push(structuredClone(entry));
      return entry;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list(): Promise<AuditEntry[]> {
    return structuredClone(this.entries);
  }
}
