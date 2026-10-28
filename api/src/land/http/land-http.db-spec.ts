import type { PGlite } from '@electric-sql/pglite' with {
  'resolution-mode': 'import',
};
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource, type QueryRunner } from 'typeorm';
import { AuditLog1793102400000 } from '../../audit/migrations/1793102400000-audit-log';
import type { SqlRunner } from '../../audit/sql-runner';
import { LandModule } from '../land.module';
import { LandAttestations1793102600000 } from '../migrations/1793102600000-land-attestations';
import { LandParcels1793102500000 } from '../migrations/1793102500000-land-parcels';
import { LandSurveyRequests1793102700000 } from '../migrations/1793102700000-land-survey-requests';

jest.setTimeout(60000);

// En attendant le module comptes (Beni), l'utilisateur est pose dans
// request.user a partir d'un en-tete de test.
function as(user: Record<string, unknown>) {
  return { 'x-test-user': JSON.stringify(user) };
}

const surveyor = {
  id: randomUUID(),
  role: 'GEOMETRE',
  registeredSurveyor: true,
};
const admin = { id: randomUUID(), role: 'ADMIN' };
const agent = { id: randomUUID(), role: 'AGENT', accountActive: true };

const square = {
  type: 'Polygon',
  coordinates: [
    [
      [1.21, 6.13],
      [1.211, 6.13],
      [1.211, 6.131],
      [1.21, 6.131],
      [1.21, 6.13],
    ],
  ],
};

const boundaries = [1, 2, 3, 4].map((n) => ({
  pointNumber: n,
  name: `B${n}`,
  surveyPointId: randomUUID(),
  fixQuality: 'FIXED',
}));

describe('Routes du module foncier (HTTP + PostGIS)', () => {
  let db: PGlite;
  let app: INestApplication;
  let parcelId: string;

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { postgis } = await import('@electric-sql/pglite-postgis');
    db = new PGlite({ extensions: { postgis } });
    const runner: SqlRunner = { query: (sql, params) => db.query(sql, params) };
    const qr = runner as unknown as QueryRunner;
    await new AuditLog1793102400000().up(qr);
    await new LandParcels1793102500000().up(qr);
    await new LandAttestations1793102600000().up(qr);
    await new LandSurveyRequests1793102700000().up(qr);

    const moduleRef = await Test.createTestingModule({ imports: [LandModule] })
      .useMocker((token) => {
        if (token === DataSource) {
          return {
            query: (sql: string, params?: unknown[]) =>
              runner.query(sql, params),
            transaction: <T>(work: (tx: SqlRunner) => Promise<T>) =>
              db.transaction((tx) =>
                work({ query: (sql, params) => tx.query(sql, params) }),
              ),
          };
        }
        return undefined;
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(
      (
        req: { headers: Record<string, string | undefined>; user?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        const header = req.headers['x-test-user'];
        if (header) req.user = JSON.parse(header) as unknown;
        next();
      },
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await db?.close();
  });

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  it('repond 401 sans connexion sur une route protegee', async () => {
    const res = await request(server()).post('/parcels').send({});
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('POST /parcels cree la parcelle (201)', async () => {
    const res = await request(server())
      .post('/parcels')
      .set(as(surveyor))
      .set('Idempotency-Key', randomUUID())
      .send({
        surveySessionId: randomUUID(),
        commune: 'AGO',
        geometry: square,
        boundaries,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ version: 1, certified: true });
    parcelId = (res.body as { id: string }).id;
  });

  it('POST /parcels refuse un chevauchement (409)', async () => {
    const res = await request(server())
      .post('/parcels')
      .set(as(surveyor))
      .set('Idempotency-Key', randomUUID())
      .send({
        surveySessionId: randomUUID(),
        commune: 'AGO',
        geometry: square,
        boundaries,
      });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'PARCEL_OVERLAP' });
  });

  it('POST /parcels refuse un agent (403)', async () => {
    const res = await request(server())
      .post('/parcels')
      .set(as(agent))
      .set('Idempotency-Key', randomUUID())
      .send({
        surveySessionId: randomUUID(),
        commune: 'AGO',
        geometry: square,
        boundaries,
      });
    expect(res.status).toBe(403);
  });

  it('GET /parcels renvoie la carte de la zone sans donnee personnelle', async () => {
    const res = await request(server())
      .get('/parcels')
      .query({ bbox: '1.2,6.12,1.25,6.18' })
      .set(as(agent));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      type: 'FeatureCollection',
      features: [{ id: parcelId, properties: { legalStatus: 'INCONNU' } }],
    });
    expect(JSON.stringify(res.body)).not.toContain(surveyor.id);
  });

  it('GET /parcels refuse une zone invalide (400)', async () => {
    const res = await request(server())
      .get('/parcels')
      .query({ bbox: '0,0,5,5' })
      .set(as(agent));
    expect(res.status).toBe(400);
  });

  it('GET /parcels/:id masque le geometre aux autres roles', async () => {
    const forAgent = await request(server())
      .get(`/parcels/${parcelId}`)
      .set(as(agent));
    expect(forAgent.status).toBe(200);
    expect(forAgent.body).not.toHaveProperty('surveyor');
    const forAuthor = await request(server())
      .get(`/parcels/${parcelId}`)
      .set(as(surveyor));
    expect(forAuthor.body).toMatchObject({ surveyor: { id: surveyor.id } });
  });

  it('PATCH /parcels/:id refuse un agent (CA-4) puis accepte l auteur', async () => {
    const body = {
      expectedVersion: 1,
      geometry: square,
      boundaries,
      reason: 'Correction',
    };
    const denied = await request(server())
      .patch(`/parcels/${parcelId}`)
      .set(as(agent))
      .send(body);
    expect(denied.status).toBe(403);
    const ok = await request(server())
      .patch(`/parcels/${parcelId}`)
      .set(as(surveyor))
      .send(body);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ version: 2 });

    const versions = await request(server())
      .get(`/parcels/${parcelId}/versions`)
      .set(as(admin));
    expect((versions.body as unknown[]).length).toBe(2);
  });

  it('GET et PUT /parcels/:id/status', async () => {
    const publicRes = await request(server()).get(
      `/parcels/${parcelId}/status`,
    );
    expect(publicRes.status).toBe(200);
    expect(publicRes.body).toMatchObject({ legalStatus: 'INCONNU' });

    const put = await request(server())
      .put(`/parcels/${parcelId}/status`)
      .set(as(admin))
      .send({
        legalStatus: 'TITRE',
        source: 'Releve ANDF n. 2026/1187',
        documentDate: '2026-10-01',
        titleNumber: 'TF 12345/RT',
      });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ legalStatus: 'TITRE' });
  });

  it('attestation : emission, PDF et verification publique', async () => {
    const issued = await request(server())
      .post(`/parcels/${parcelId}/attestations`)
      .set(as(surveyor));
    expect(issued.status).toBe(201);
    const { number, documentHash } = issued.body as {
      number: string;
      documentHash: string;
    };

    const pdf = await request(server())
      .get(`/attestations/${number}/pdf`)
      .set(as(surveyor))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(
      createHash('sha256')
        .update(pdf.body as Buffer)
        .digest('hex'),
    ).toBe(documentHash);

    const verify = await request(server())
      .get(`/attestations/${number}/verify`)
      .query({ hash: documentHash });
    expect(verify.status).toBe(200);
    expect(verify.body).toMatchObject({ valid: true });
  });

  it('demandes de leve : creation par un agent et prise par un geometre', async () => {
    const created = await request(server())
      .post('/survey-requests')
      .set(as(agent))
      .send({ locality: 'Baguida', description: 'Lot a lever.' });
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;

    const taken = await request(server())
      .post(`/survey-requests/${id}/take`)
      .set(as(surveyor));
    expect(taken.status).toBe(200);
    const again = await request(server())
      .post(`/survey-requests/${id}/take`)
      .set(as({ ...surveyor, id: randomUUID() }));
    expect(again.status).toBe(409);

    const list = await request(server()).get('/survey-requests').set(as(agent));
    expect(list.status).toBe(200);
  });

  it('GET /audit est reserve a l administrateur', async () => {
    const denied = await request(server()).get('/audit').set(as(surveyor));
    expect(denied.status).toBe(403);

    const list = await request(server())
      .get('/audit')
      .query({ resourceType: 'parcel', limit: 5 })
      .set(as(admin));
    expect(list.status).toBe(200);
    expect((list.body as unknown[]).length).toBeGreaterThan(0);

    const verify = await request(server()).get('/audit/verify').set(as(admin));
    expect(verify.body).toMatchObject({ valid: true });
  });
});
