import { DataSource, EntityManager } from 'typeorm';
import { GENESIS_HASH, computeHash, verifyChain } from './audit-chain';
import { AuditEntryEntity } from './audit-entry.entity';
import { AUDIT_LOCK_KEY, AuditService } from './audit.service';

// Faux EntityManager en memoire : suffisant pour tester l'enchainement.
function fakeManager(rows: AuditEntryEntity[]) {
  const query = jest.fn().mockResolvedValue([]);
  const repo = {
    find: jest.fn(() =>
      Promise.resolve([...rows].sort((a, b) => b.seq - a.seq).slice(0, 1)),
    ),
    create: (data: Partial<AuditEntryEntity>) =>
      Object.assign(new AuditEntryEntity(), data),
    save: jest.fn((entry: AuditEntryEntity) => {
      rows.push(entry);
      return Promise.resolve(entry);
    }),
  };
  const manager = {
    query,
    getRepository: () => repo,
  } as unknown as EntityManager;
  return { manager, query, repo };
}

describe('AuditService.log', () => {
  it('chaine chaque ligne sur la precedente et pose le verrou', async () => {
    const rows: AuditEntryEntity[] = [];
    const { manager, query } = fakeManager(rows);
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
      manager,
    );
    const second = await service.log(
      {
        action: 'ATTESTATION_VERIFIED',
        resourceType: 'attestation',
        result: 'SUCCESS',
      },
      manager,
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
    expect(verifyChain(rows).valid).toBe(true);
  });

  it("n'enregistre jamais de secret dans les details", async () => {
    const { manager } = fakeManager([]);
    const service = new AuditService({} as DataSource);

    const entry = await service.log(
      {
        action: 'ACCESS_DENIED',
        resourceType: 'parcel',
        result: 'DENIED',
        details: { token: 'eyJ...', route: 'PATCH /parcels/GS-2026-000001' },
      },
      manager,
    );

    expect(entry.details).toEqual({
      token: '[retire]',
      route: 'PATCH /parcels/GS-2026-000001',
    });
  });

  it('ouvre sa propre transaction sans manager', async () => {
    const { manager } = fakeManager([]);
    const transaction = jest.fn(
      (work: (tx: EntityManager) => Promise<unknown>) => work(manager),
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
