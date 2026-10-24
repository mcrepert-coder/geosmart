import { GENESIS_HASH } from '../../src/audit/audit-chain';
import { AuditInputError, AuditService } from '../../src/audit/audit.service';
import { InMemoryAuditStore } from '../../src/audit/audit.store';
import { CanonicalJsonError } from '../../src/audit/canonical-json';

describe('AuditService', () => {
  let store: InMemoryAuditStore;
  let audit: AuditService;
  let now: number;

  beforeEach(() => {
    store = new InMemoryAuditStore();
    now = Date.parse('2026-10-24T09:00:00.000Z');
    audit = new AuditService(store, () => new Date((now += 1000)));
  });

  it('enregistre une premiere ligne a partir de 64 zeros', async () => {
    const entry = await audit.log('PARCEL_CREATED', 'usr_geo_01', { areaM2: 1240.37 }, {
      type: 'parcel',
      id: 'PRC-2026-000014',
    });
    expect(entry).toMatchObject({
      seq: 1,
      prevHash: GENESIS_HASH,
      at: '2026-10-24T09:00:01.000Z',
      actorId: 'usr_geo_01',
      action: 'PARCEL_CREATED',
      entityType: 'parcel',
      entityId: 'PRC-2026-000014',
      details: { areaM2: 1240.37 },
    });
    expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(store.entries).toHaveLength(1);
  });

  it('chaine les lignes successives', async () => {
    const a = await audit.log('ACCOUNT_VALIDATED', 'usr_admin');
    const b = await audit.log('PARCEL_OVERLAP_REJECTED', 'usr_geo_02', { overlapAreaM2: 3 });
    expect(b.seq).toBe(2);
    expect(b.prevHash).toBe(a.hash);
    expect(await audit.verify()).toEqual({ valid: true, checked: 2, firstBrokenSeq: null });
  });

  it('utilise une entite systeme et des details vides par defaut', async () => {
    const entry = await audit.log('SYSTEM_STARTED', null);
    expect(entry).toMatchObject({
      actorId: null,
      entityType: 'system',
      entityId: '-',
      details: {},
    });
  });

  it('ne donne jamais le meme predecesseur a deux ecritures concurrentes', async () => {
    await Promise.all(
      Array.from({ length: 50 }, (_, i) => audit.log('PARCEL_CREATED', `usr_${i}`)),
    );
    const prevHashes = store.entries.map((e) => e.prevHash);
    expect(new Set(prevHashes).size).toBe(50);
    expect(store.entries.map((e) => e.seq)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
    expect(await audit.verify()).toMatchObject({ valid: true, checked: 50 });
  });

  it('continue la chaine apres une ecriture refusee', async () => {
    await audit.log('PARCEL_CREATED', 'usr_geo_01');
    await expect(audit.log('PARCEL_CREATED', 'usr_geo_01', { a: NaN })).rejects.toThrow(
      CanonicalJsonError,
    );
    const next = await audit.log('PARCEL_UPDATED', 'usr_geo_01');
    expect(next.seq).toBe(2);
    expect(await audit.verify()).toMatchObject({ valid: true, checked: 2 });
  });

  it('fige les details : modifier l objet de l appelant ne change pas le journal', async () => {
    const details = { motif: 'piece illisible' };
    await audit.log('ACCOUNT_REJECTED', 'usr_admin', details);
    details.motif = 'autre';
    expect(store.entries[0].details).toEqual({ motif: 'piece illisible' });
    expect(await audit.verify()).toMatchObject({ valid: true });
  });

  it('ne laisse pas modifier le journal par la ligne renvoyee', async () => {
    const entry = await audit.log('ACCOUNT_REJECTED', 'usr_admin', { motif: 'a' });
    entry.details.motif = 'b';
    expect(store.entries[0].details).toEqual({ motif: 'a' });
  });

  it('detecte une alteration faite directement dans le stockage', async () => {
    await audit.log('PARCEL_CREATED', 'usr_geo_01', { areaM2: 100 });
    await audit.log('PARCEL_CREATED', 'usr_geo_01', { areaM2: 200 });
    await audit.log('ATTESTATION_ISSUED', 'usr_geo_01');
    store.entries[1].details = { areaM2: 999 };
    expect(await audit.verify()).toMatchObject({
      valid: false,
      checked: 1,
      firstBrokenSeq: 2,
      reason: 'HASH_MISMATCH',
    });
  });

  it.each([
    ['action vide', '', 'usr', {}],
    ['action en minuscules', 'parcel_created', 'usr', {}],
    ['acteur vide', 'PARCEL_CREATED', '', {}],
    ['details en tableau', 'PARCEL_CREATED', 'usr', []],
  ])('refuse %s sans rien ecrire', async (_label, action, actor, details) => {
    await expect(
      audit.log(action, actor, details as unknown as Record<string, never>),
    ).rejects.toThrow(AuditInputError);
    expect(store.entries).toHaveLength(0);
  });

  it('refuse une entite incomplete', async () => {
    await expect(
      audit.log('PARCEL_CREATED', 'usr', {}, { type: 'parcel', id: '' }),
    ).rejects.toThrow(AuditInputError);
  });
});
