import { DataSource } from 'typeorm';
import { GENESIS_HASH, computeHash } from './audit-chain';
import { AUDIT_LOCK_KEY, AuditService } from './audit.service';
import { SqlRunner } from './sql-runner';

// Faux runner en memoire : il comprend les trois requetes du service.
function fakeRunner() {
  const rows: Record<string, unknown>[] = [];
  const query = jest.fn((sql: string, params: unknown[] = []) => {
    if (sql.startsWith('SELECT pg_advisory_xact_lock')) {
      return Promise.resolve([]);
    }
    if (sql.startsWith('SELECT seq, hash')) {
      return Promise.resolve(rows.slice(-1));
    }
    if (sql.startsWith('SELECT *')) return Promise.resolve([...rows]);
    const [seq, at, actorId, actorRole, action, type, id, result, details] =
      params;
    rows.push({
      seq,
      at,
      actor_id: actorId,
      actor_role: actorRole,
      action,
      resource_type: type,
      resource_id: id,
      result,
      details,
      prev_hash: params[9],
      hash: params[10],
    });
    return Promise.resolve([]);
  });
  return { runner: { query } as SqlRunner, query, rows };
}

describe('AuditService.log', () => {
  it('chaine chaque ligne sur la precedente et pose le verrou', async () => {
    const { runner, query } = fakeRunner();
    const service = new AuditService({} as DataSource);

    const first = await service.log(
      {
        actorId: '11111111-1111-4111-8111-111111111111',
        actorRole: 'GEOMETRE',
        action: 'PARCEL_CREATE',
        resourceType: 'parcel',
        resourceId: 'GS-2026-000001',
        result: 'SUCCESS',
      },
      runner,
    );
    const second = await service.log(
      {
        action: 'ATTESTATION_VERIFIED',
        resourceType: 'attestation',
        result: 'SUCCESS',
      },
      runner,
    );

    expect(query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1)', [
      AUDIT_LOCK_KEY,
    ]);
    expect(first.seq).toBe(1);
    expect(first.prevHash).toBe(GENESIS_HASH);
    expect(first.hash).toBe(computeHash(GENESIS_HASH, first));
    expect(second.seq).toBe(2);
    expect(second.prevHash).toBe(first.hash);
    expect(second.actorId).toBeNull();
    await expect(service.verify(runner)).resolves.toEqual({
      valid: true,
      checked: 2,
      firstBrokenSeq: null,
    });
  });

  it("n'enregistre jamais de secret dans les details", async () => {
    const { runner } = fakeRunner();
    const service = new AuditService({} as DataSource);

    const entry = await service.log(
      {
        action: 'ACCESS_DENIED',
        resourceType: 'parcel',
        result: 'DENIED',
        details: { token: 'eyJ...', route: 'PATCH /parcels/GS-2026-000001' },
      },
      runner,
    );

    expect(entry.details).toEqual({
      token: '[retire]',
      route: 'PATCH /parcels/GS-2026-000001',
    });
  });

  it('ouvre sa propre transaction sans runner', async () => {
    const { runner } = fakeRunner();
    const transaction = jest.fn((work: (tx: SqlRunner) => Promise<unknown>) =>
      work(runner),
    );
    const service = new AuditService({ transaction } as unknown as DataSource);

    const entry = await service.log({
      action: 'PARCEL_CREATE',
      resourceType: 'parcel',
      result: 'SUCCESS',
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(entry.seq).toBe(1);
  });
});
