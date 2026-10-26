// Tests d'integration de api/migrations/202610241300_land_parcels.sql sur PostGIS.
// Moteur et isolation : voir support/land-test-db.ts.
import {
  inTransaction,
  LandTestDb,
  landTestDbAvailable,
  migrate,
  openLandTestDb,
  rejectsAtCommit,
  rejectsInIsolation,
} from './support/land-test-db';
import {
  insertAttestation,
  insertParcel,
  insertParcelWithVersion,
  insertVersion,
  NOTICE,
  ParcelRow,
  parcelRow,
  uniqueId,
  versionRow,
} from './support/land-fixtures';

const SQLSTATE = {
  checkViolation: '23514',
  foreignKeyViolation: '23503',
  uniqueViolation: '23505',
  raiseException: 'P0001',
};

const describeDb = landTestDbAvailable() ? describe : describe.skip;
if (!landTestDbAvailable()) {
  // eslint-disable-next-line no-console
  console.warn(
    'Tests de migration fonciere ignores : definir LAND_TEST_DATABASE_URL ' +
      'ou installer @electric-sql/pglite et @electric-sql/pglite-postgis ' +
      'et lancer Node avec --experimental-vm-modules.',
  );
}

describeDb('migration fonciere 202610241300_land_parcels', () => {
  let db: LandTestDb;

  beforeAll(async () => {
    const opened = await openLandTestDb();
    if (!opened) throw new Error('Base de test indisponible');
    db = opened;
    await migrate(db);
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  async function committedParcel(overrides: Partial<ParcelRow> = {}): Promise<ParcelRow> {
    let parcel!: ParcelRow;
    await inTransaction(db, async () => {
      parcel = await insertParcelWithVersion(db, overrides);
    });
    return parcel;
  }

  async function count(sql: string, params: unknown[]): Promise<number> {
    const [row] = await db.query<{ n: number | string }>(sql, params);
    return Number(row.n);
  }

  describe('schema', () => {
    it('cree les trois tables', async () => {
      const rows = await db.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = current_schema() ORDER BY table_name`,
      );
      expect(rows.map((r) => r.table_name)).toEqual(
        expect.arrayContaining(['attestations', 'parcel_versions', 'parcels']),
      );
    });

    it('cree l index GIST sur la geometrie des parcelles', async () => {
      const rows = await db.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
         WHERE schemaname = current_schema() AND indexname = 'land_parcels_geometry_idx'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].indexdef).toMatch(/USING gist \(geometry\)/i);
    });

    it('declare la geometrie en Polygon SRID 4326', async () => {
      const rows = await db.query<{ f_table_name: string; type: string; srid: number }>(
        `SELECT f_table_name, type, srid FROM geometry_columns
         WHERE f_table_schema = current_schema() ORDER BY f_table_name`,
      );
      expect(rows).toEqual([
        { f_table_name: 'parcel_versions', type: 'POLYGON', srid: 4326 },
        { f_table_name: 'parcels', type: 'POLYGON', srid: 4326 },
      ]);
    });

    it('rend differee la cle vers la version courante', async () => {
      const rows = await db.query<{ condeferrable: boolean; condeferred: boolean }>(
        `SELECT condeferrable, condeferred FROM pg_constraint
         WHERE conname = 'land_parcels_current_version_fk'`,
      );
      expect(rows).toEqual([{ condeferrable: true, condeferred: true }]);
    });
  });

  describe('parcelle et version courante', () => {
    it('valide atomiquement une parcelle et sa version 1', async () => {
      const parcel = await committedParcel();
      expect(await count('SELECT count(*) AS n FROM parcels WHERE id = $1', [parcel.id])).toBe(1);
      expect(
        await count('SELECT count(*) AS n FROM parcel_versions WHERE parcel_id = $1 AND version = 1', [
          parcel.id,
        ]),
      ).toBe(1);
    });

    it('refuse au COMMIT une parcelle sans version, sans rien laisser', async () => {
      const parcel = parcelRow();
      const error = await rejectsAtCommit(db, () => insertParcel(db, parcel));
      expect(error.code).toBe(SQLSTATE.foreignKeyViolation);
      expect(error.message).toMatch(/land_parcels_current_version_fk/);
      expect(await count('SELECT count(*) AS n FROM parcels WHERE id = $1', [parcel.id])).toBe(0);
    });

    it('refuse au COMMIT une version courante qui n existe pas', async () => {
      const parcel = await committedParcel();
      const error = await rejectsAtCommit(db, () =>
        db.query('UPDATE parcels SET version = 3 WHERE id = $1', [parcel.id]),
      );
      expect(error.code).toBe(SQLSTATE.foreignKeyViolation);
      const [row] = await db.query<{ version: number }>(
        'SELECT version FROM parcels WHERE id = $1',
        [parcel.id],
      );
      expect(row.version).toBe(1);
    });

    it('refuse une version rattachee a une parcelle inconnue', async () => {
      const ghost = parcelRow();
      const error = await rejectsInIsolation(db, () => insertVersion(db, versionRow(ghost)));
      expect(error.code).toBe(SQLSTATE.foreignKeyViolation);
    });
  });

  describe('geometrie', () => {
    const cases: Array<[string, string]> = [
      ['vide', 'SRID=4326;POLYGON EMPTY'],
      ['auto-intersectee (noeud papillon)', 'SRID=4326;POLYGON((1.2 6.1,1.3 6.2,1.3 6.1,1.2 6.2,1.2 6.1))'],
      ['de surface nulle', 'SRID=4326;POLYGON((1.2 6.1,1.3 6.1,1.4 6.1,1.2 6.1))'],
      ['de mauvais type (ligne)', 'SRID=4326;LINESTRING(1.2 6.1,1.3 6.1,1.3 6.2)'],
      ['de mauvais type (multipolygone)', 'SRID=4326;MULTIPOLYGON(((1.2 6.1,1.3 6.1,1.3 6.2,1.2 6.1)))'],
      ['de mauvais SRID (3857)', 'SRID=3857;POLYGON((0 0,10 0,10 10,0 10,0 0))'],
      ['hors longitude WGS84', 'SRID=4326;POLYGON((179.5 6.1,180.5 6.1,180.5 6.2,179.5 6.1))'],
      ['hors latitude WGS84', 'SRID=4326;POLYGON((1.2 89.5,1.3 89.5,1.3 90.5,1.2 89.5))'],
      ['trouee (le contrat ne prevoit qu un contour exterieur)',
        'SRID=4326;POLYGON((1.2 6.1,1.3 6.1,1.3 6.2,1.2 6.2,1.2 6.1),(1.22 6.12,1.28 6.12,1.28 6.18,1.22 6.12))'],
    ];

    it.each(cases)('refuse sur parcels une geometrie %s', async (_label, geometry) => {
      const error = await rejectsInIsolation(db, () =>
        insertParcelWithVersion(db, { geometry }),
      );
      expect(error.message).toBeTruthy();
    });

    it.each(cases)('refuse sur parcel_versions une geometrie %s', async (_label, geometry) => {
      const error = await rejectsInIsolation(db, async () => {
        const parcel = parcelRow();
        await insertParcel(db, parcel);
        await insertVersion(db, versionRow(parcel, { geometry }));
      });
      expect(error.message).toBeTruthy();
    });

    // Comportement PostGIS : une geometrie sans SRID (0) recoit celui de la colonne.
    // La base garantit donc un SRID stocke de 4326 ; le service doit toujours
    // construire la geometrie avec un SRID explicite.
    it('stocke en 4326 une geometrie fournie sans SRID', async () => {
      const parcel = await committedParcel({
        geometry: 'POLYGON((1.2123 6.1724,1.2126 6.1724,1.2126 6.1721,1.2123 6.1724))',
      });
      const [row] = await db.query<{ srid: number }>(
        'SELECT ST_SRID(geometry) AS srid FROM parcels WHERE id = $1',
        [parcel.id],
      );
      expect(row.srid).toBe(4326);
    });

    it('accepte une geometrie valide en bordure du domaine WGS84', async () => {
      await committedParcel({
        geometry: 'SRID=4326;POLYGON((179 89,180 89,180 90,179 90,179 89))',
      });
    });
  });

  describe('champs controles par la base', () => {
    const parcelCases: Array<[string, Partial<ParcelRow>]> = [
      ['statut inconnu', { legal_status: 'INCONNU' }],
      ['statut en minuscules', { legal_status: 'titre' }],
      ['empreinte en majuscules', { geometry_hash: 'A'.repeat(64) }],
      ['empreinte trop courte', { geometry_hash: 'a'.repeat(63) }],
      ['empreinte non hexadecimale', { geometry_hash: 'g'.repeat(64) }],
      ['surface nulle', { area_m2: 0 }],
      ['surface negative', { area_m2: -1 }],
      ['surface NaN', { area_m2: 'NaN' }],
      ['surface infinie', { area_m2: 'Infinity' }],
      ['perimetre nul', { perimeter_m: 0 }],
      ['perimetre NaN', { perimeter_m: 'NaN' }],
      ['perimetre infini', { perimeter_m: 'Infinity' }],
      ['bornes en objet', { vertices: { B1: {} } }],
      ['bornes en texte', { vertices: 'B1,B2,B3' }],
      ['moins de trois bornes', { vertices: [{}, {}] }],
      ['version 0', { version: 0 }],
      ['identifiant vide', { id: '' }],
      ['auteur vide', { author_id: '' }],
      ['requete initiale non objet', { creation_payload: [] }],
      ['reponse initiale non objet', { creation_response: 'ok' }],
      ['mise a jour avant creation', { updated_at: '2026-10-24T08:59:59.999Z' }],
      ['libelle de plus de 120 caracteres', { label: 'x'.repeat(121) }],
    ];

    it.each(parcelCases)('refuse sur parcels : %s', async (_label, overrides) => {
      const error = await rejectsInIsolation(db, () => insertParcel(db, parcelRow(overrides)));
      expect(error.message).toBeTruthy();
    });

    it.each(parcelCases.filter(([label]) => /statut|empreinte|surface|perimetre|bornes/.test(label)))(
      'refuse sur parcel_versions : %s',
      async (_label, overrides) => {
        const error = await rejectsInIsolation(db, async () => {
          const parcel = parcelRow();
          await insertParcel(db, parcel);
          const { legal_status, geometry_hash, area_m2, perimeter_m, vertices } = parcelRow(overrides);
          await insertVersion(
            db,
            versionRow(parcel, { legal_status, geometry_hash, area_m2, perimeter_m, vertices }),
          );
        });
        expect(error.code).toBe(SQLSTATE.checkViolation);
      },
    );

    it('refuse un auteur de version vide', async () => {
      const error = await rejectsInIsolation(db, async () => {
        const parcel = parcelRow();
        await insertParcel(db, parcel);
        await insertVersion(db, versionRow(parcel, { changed_by: '' }));
      });
      expect(error.code).toBe(SQLSTATE.checkViolation);
    });

    it('accepte les trois statuts juridiques du contrat', async () => {
      for (const legal_status of ['TITRE', 'COUTUMIER_NON_TITRE', 'EN_LITIGE']) {
        await committedParcel({ legal_status });
      }
    });
  });

  describe('cle de rejeu (author_id, client_id)', () => {
    it('refuse le meme clientId pour le meme auteur', async () => {
      const first = await committedParcel();
      const error = await rejectsInIsolation(db, () =>
        insertParcelWithVersion(db, { client_id: first.client_id }),
      );
      expect(error.code).toBe(SQLSTATE.uniqueViolation);
      expect(error.message).toMatch(/land_parcels_client_unique/);
    });

    it('accepte le meme clientId pour un autre auteur', async () => {
      const first = await committedParcel();
      await committedParcel({ client_id: first.client_id, author_id: 'usr_geo_autre' });
    });
  });

  describe('versions', () => {
    it('cree une version 2 et conserve la version 1', async () => {
      const parcel = await committedParcel();
      await inTransaction(db, async () => {
        await insertVersion(
          db,
          versionRow(parcel, {
            version: 2,
            legal_status: 'EN_LITIGE',
            changed_at: '2026-10-25T10:00:00.000Z',
            reason: 'Contestation deposee par un voisin',
          }),
        );
        await db.query(
          `UPDATE parcels SET version = 2, legal_status = 'EN_LITIGE',
             updated_at = '2026-10-25T10:00:00.000Z' WHERE id = $1`,
          [parcel.id],
        );
      });
      const versions = await db.query<{ version: number; legal_status: string; reason: string | null }>(
        'SELECT version, legal_status, reason FROM parcel_versions WHERE parcel_id = $1 ORDER BY version',
        [parcel.id],
      );
      expect(versions).toEqual([
        { version: 1, legal_status: 'COUTUMIER_NON_TITRE', reason: null },
        { version: 2, legal_status: 'EN_LITIGE', reason: 'Contestation deposee par un voisin' },
      ]);
      const [current] = await db.query<{ version: number; legal_status: string }>(
        'SELECT version, legal_status FROM parcels WHERE id = $1',
        [parcel.id],
      );
      expect(current).toEqual({ version: 2, legal_status: 'EN_LITIGE' });
    });

    it.each<[string, string | null]>([
      ['sans motif', null],
      ['avec un motif trop court', 'ok'],
    ])('refuse une version 2 %s', async (_label, reason) => {
      const parcel = await committedParcel();
      const error = await rejectsInIsolation(db, () =>
        insertVersion(db, versionRow(parcel, { version: 2, reason })),
      );
      expect(error.code).toBe(SQLSTATE.checkViolation);
    });

    it('refuse deux fois le meme numero de version', async () => {
      const parcel = await committedParcel();
      const error = await rejectsInIsolation(db, () => insertVersion(db, versionRow(parcel)));
      expect(error.code).toBe(SQLSTATE.uniqueViolation);
    });
  });

  describe('historique en ajout seul', () => {
    let parcel: ParcelRow;
    let attestationNumber: string;

    beforeAll(async () => {
      parcel = await committedParcel();
      attestationNumber = uniqueId('ATL-TEST');
      await inTransaction(db, async () => {
        await insertAttestation(db, { number: attestationNumber, parcelId: parcel.id, version: 1 });
      });
    });

    it.each([
      ['modifier une version', () => `UPDATE parcel_versions SET label = 'autre' WHERE parcel_id = '${parcel.id}'`],
      ['supprimer une version', () => `DELETE FROM parcel_versions WHERE parcel_id = '${parcel.id}'`],
      ['tronquer les versions', () => 'TRUNCATE parcel_versions CASCADE'],
      ['modifier une attestation', () => `UPDATE attestations SET surveyor_name = 'autre' WHERE number = '${attestationNumber}'`],
      ['supprimer une attestation', () => `DELETE FROM attestations WHERE number = '${attestationNumber}'`],
      ['tronquer les attestations', () => 'TRUNCATE attestations'],
    ])('refuse de %s', async (_label, sql) => {
      const error = await rejectsInIsolation(db, () => db.exec(sql()));
      expect(error.code).toBe(SQLSTATE.raiseException);
      expect(error.message).toMatch(/historique foncier en ajout seul/);
    });

    it('refuse de supprimer une parcelle qui a un historique', async () => {
      const error = await rejectsInIsolation(db, () =>
        db.query('DELETE FROM parcels WHERE id = $1', [parcel.id]),
      );
      expect(error.message).toBeTruthy();
    });

    it('conserve les lignes apres ces tentatives', async () => {
      expect(
        await count('SELECT count(*) AS n FROM parcel_versions WHERE parcel_id = $1', [parcel.id]),
      ).toBe(1);
      expect(
        await count('SELECT count(*) AS n FROM attestations WHERE number = $1', [attestationNumber]),
      ).toBe(1);
    });
  });

  describe('donnees initiales de rejeu', () => {
    let parcel: ParcelRow;

    beforeAll(async () => {
      parcel = await committedParcel();
    });

    it.each([
      ['la requete initiale', `creation_payload = '{"clientId":"autre"}'::jsonb`],
      ['la reponse initiale', `creation_response = '{"certified":false}'::jsonb`],
      ['le clientId', `client_id = '00000000-0000-4000-8000-000000000000'`],
      ['l auteur', `author_id = 'usr_autre'`],
    ])('refuse de modifier %s', async (_label, assignment) => {
      const error = await rejectsInIsolation(db, () =>
        db.query(`UPDATE parcels SET ${assignment} WHERE id = $1`, [parcel.id]),
      );
      expect(error.code).toBe(SQLSTATE.raiseException);
      expect(error.message).toMatch(/donnees de creation immuables/);
    });

    it('autorise la mise a jour de l etat courant sans toucher au rejeu', async () => {
      await inTransaction(db, async () => {
        await db.query(
          `UPDATE parcels SET label = 'Nouveau libelle', in_conflict = true WHERE id = $1`,
          [parcel.id],
        );
      });
      const [row] = await db.query<{ creation_response: unknown; label: string }>(
        'SELECT creation_response, label FROM parcels WHERE id = $1',
        [parcel.id],
      );
      expect(row).toEqual({ creation_response: parcel.creation_response, label: 'Nouveau libelle' });
    });
  });

  describe('attestations', () => {
    it('rattache une attestation a une version existante et pose la mention par defaut', async () => {
      const parcel = await committedParcel();
      const number = uniqueId('ATL-TEST');
      await inTransaction(db, async () => {
        await insertAttestation(db, { number, parcelId: parcel.id, version: 1 });
      });
      const [row] = await db.query<{ notice: string }>(
        'SELECT notice FROM attestations WHERE number = $1',
        [number],
      );
      expect(row.notice).toBe(NOTICE);
    });

    it.each([
      ['une version inexistante', { version: 2 }],
      ['une parcelle inexistante', { parcelId: 'PRC-INEXISTANTE' }],
    ])('refuse une attestation sur %s', async (_label, override) => {
      const parcel = await committedParcel();
      const error = await rejectsInIsolation(db, () =>
        insertAttestation(db, { parcelId: parcel.id, version: 1, ...override }),
      );
      expect(error.code).toBe(SQLSTATE.foreignKeyViolation);
    });

    it.each(['', 'Vaut titre foncier', 'ne vaut pas titre foncier', `${NOTICE}.`])(
      'refuse la mention %j',
      async (notice) => {
        const parcel = await committedParcel();
        const error = await rejectsInIsolation(db, () =>
          insertAttestation(db, { parcelId: parcel.id, version: 1, notice }),
        );
        expect(error.code).toBe(SQLSTATE.checkViolation);
      },
    );

    it('refuse un nom de geometre vide', async () => {
      const parcel = await committedParcel();
      const error = await rejectsInIsolation(db, () =>
        insertAttestation(db, { parcelId: parcel.id, version: 1, surveyorName: '   ' }),
      );
      expect(error.code).toBe(SQLSTATE.checkViolation);
    });
  });

  describe('migration', () => {
    it('ne laisse aucun etat partiel si elle echoue (relance sur un schema existant)', async () => {
      const before = await count(
        `SELECT count(*) AS n FROM pg_proc WHERE proname IN
          ('land_preserve_creation', 'land_reject_history_change')`,
        [],
      );
      await expect(migrate(db)).rejects.toBeDefined();
      const after = await count(
        `SELECT count(*) AS n FROM pg_proc WHERE proname IN
          ('land_preserve_creation', 'land_reject_history_change')`,
        [],
      );
      expect(after).toBe(before);
      // La base reste utilisable apres l'echec.
      await committedParcel();
    });
  });
});
