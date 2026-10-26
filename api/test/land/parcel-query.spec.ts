import type { Pool } from 'pg';
import { ParcelQueryService } from '../../src/land/parcel-query.service';
import { inTransaction, landTestDbAvailable, LandTestDb, migrate, openLandTestDb } from './support/land-test-db';
import { insertParcelWithVersion, insertAttestation, insertVersion, versionRow, ParcelRow } from './support/land-fixtures';

const describeDb = landTestDbAvailable() ? describe : describe.skip;
describeDb('consultation des parcelles', () => {
  let db: LandTestDb;
  let service: ParcelQueryService;
  let registered: Set<string>;
  let first: ParcelRow;
  const reader = { id: 'client', role: 'client', active: true };
  const certification = { registeredAuthors: jest.fn(async (_ids: string[]) => registered) };
  const clock = () => new Date('2026-10-24T12:00:00.000Z');
  beforeAll(async () => {
    db = (await openLandTestDb())!;
    await migrate(db);
    await inTransaction(db, async () => {
      first = await insertParcelWithVersion(db, { id: 'a', author_id: 'registered',
        label: 'Libelle prive pour les comptes', legal_status: 'TITRE' });
      await insertParcelWithVersion(db, { id: 'b', author_id: 'unregistered', label: null,
        geometry: 'SRID=4326;POLYGON((2.2 6.1,2.3 6.1,2.3 6.2,2.2 6.2,2.2 6.1))' });
      const floatVertices = structuredClone(first.vertices) as { source: { fixMode: string } }[];
      floatVertices[0].source.fixMode = 'RTK_FLOAT';
      await insertParcelWithVersion(db, { id: 'c', author_id: 'registered', vertices: floatVertices,
        legal_status: 'EN_LITIGE', geometry: 'SRID=4326;POLYGON((3.2 6.1,3.3 6.1,3.3 6.2,3.2 6.2,3.2 6.1))' });
    });
    const pool = { query: async (sql: string, params?: unknown[]) => ({ rows: await db.query(sql, params) }) };
    service = new ParcelQueryService(pool as unknown as Pool, certification, clock);
  }, 120_000);
  beforeEach(() => { registered = new Set(['registered']); certification.registeredAuthors.mockClear(); });
  afterAll(async () => { await db?.close(); });

  it('liste les parcelles par identifiant avec des champs de carte explicites', async () => {
    const page = await service.list({}, reader);
    expect(page.total).toBe(3);
    expect(page.items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(page.items.map((item) => item.certified)).toEqual([true, false, false]);
    expect(page.items[2].inConflict).toBe(true);
    expect(page.items[1]).not.toHaveProperty('label');
    expect(page.items[0]).not.toHaveProperty('authorId');
    expect(page.items[0]).not.toHaveProperty('vertices');
    expect(page.items[0]).not.toHaveProperty('creation_payload');
  });

  it('pagine sans perdre le total, meme pour une page vide', async () => {
    expect(await service.list({ page: 2, pageSize: 1 }, reader)).toMatchObject({ total: 3, items: [{ id: 'b' }] });
    expect(await service.list({ page: 10, pageSize: 1 }, reader)).toEqual({ total: 3, items: [] });
  });

  it('combine emprise, statut et certification avant pagination', async () => {
    const page = await service.list({ bbox: '1.2,6.1,1.3,6.2', legalStatus: 'TITRE', certified: true }, reader);
    expect(page.total).toBe(1);
    expect(page.items[0].id).toBe('a');
    expect((await service.list({ certified: false }, reader)).items.map((item) => item.id)).toEqual(['b', 'c']);
    expect(await service.list({ bbox: '10,10,11,11' }, reader)).toEqual({ total: 0, items: [] });
  });

  it('utilise la certification courante et non la reponse initiale conservee', async () => {
    registered = new Set();
    expect(await service.list({ certified: true }, reader)).toEqual({ total: 0, items: [] });
    expect((await service.status('a')).certified).toBe(false);
  });

  it('renvoie un statut sans aucun identifiant de personne, libelle ou geometrie', async () => {
    const status = await service.status('a');
    expect(status).toEqual({ parcelId: 'a', legalStatus: 'TITRE', certified: true,
      hasAttestation: false, inConflict: false, version: 1, areaM2: first.area_m2,
      perimeterM: first.perimeter_m, surveyedAt: '2026-10-24T08:12:00.000Z',
      checkedAt: '2026-10-24T12:00:00.000Z', notice: 'Ne vaut pas titre foncier' });
    expect(Object.keys(status).sort()).toEqual(['parcelId','legalStatus','certified','hasAttestation',
      'inConflict','version','areaM2','perimeterM','surveyedAt','checkedAt','notice'].sort());
  });

  it('ne certifie pas une parcelle dont une borne est Float', async () => {
    expect(await service.status('c')).toMatchObject({ certified: false, inConflict: true });
  });

  it('consulte l etat courant et signale une attestation historique', async () => {
    await inTransaction(db, async () => {
      await insertAttestation(db, { parcelId: 'a', version: 1 });
      await insertVersion(db, versionRow(first, { version: 2, legal_status: 'EN_LITIGE',
        in_conflict: true, reason: 'Contestation', changed_at: '2026-10-24T11:00:00Z' }));
      await db.query("UPDATE parcels SET version=2,legal_status='EN_LITIGE',in_conflict=true WHERE id='a'");
    });
    expect(await service.status('a')).toMatchObject({ version: 2, legalStatus: 'EN_LITIGE',
      inConflict: true, hasAttestation: true });
  });

  it('refuse une parcelle inconnue sans appeler le module comptes', async () => {
    await expect(service.status('unknown')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(certification.registeredAuthors).not.toHaveBeenCalled();
  });

  it('refuse la liste sans compte actif', async () => {
    await expect(service.list({})).rejects.toMatchObject({ status: 401 });
    await expect(service.list({}, { ...reader, active: false })).rejects.toMatchObject({ status: 403 });
    await expect(service.list({}, { ...reader, role: 'inconnu' })).rejects.toMatchObject({ status: 403 });
  });

  it.each([
    { page: 0 }, { page: 1.5 }, { pageSize: 501 }, { pageSize: '10' },
    { legalStatus: 'AUTRE' }, { certified: 'false' }, { bbox: '0,0,0,1' },
    { bbox: '0,,1,1' }, { bbox: '181,0,182,1' }, { bbox: '0,-91,1,1' },
    { bbox: '0,0,NaN,1' }, { bbox: '170,0,-170,1' }, { authorId: 'autre' },
  ])('refuse les filtres invalides (%j)', async (options) => {
    await expect(service.list(options, reader)).rejects.toMatchObject({ status: 400 });
  });
});
