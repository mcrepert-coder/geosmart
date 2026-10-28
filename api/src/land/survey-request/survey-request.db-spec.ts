import type { PGlite } from '@electric-sql/pglite' with {
  'resolution-mode': 'import',
};
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource, QueryRunner } from 'typeorm';
import { AuditLog1793102400000 } from '../../audit/migrations/1793102400000-audit-log';
import { AuditService } from '../../audit/audit.service';
import type { SqlRunner } from '../../audit/sql-runner';
import { LandParcels1793102500000 } from '../migrations/1793102500000-land-parcels';
import { LandSurveyRequests1793102700000 } from '../migrations/1793102700000-land-survey-requests';
import type { LandActor } from '../parcel.service';
import {
  SurveyRequestInput,
  SurveyRequestService,
} from './survey-request.service';

jest.setTimeout(60000);

const agent: LandActor = {
  id: randomUUID(),
  role: 'AGENT',
  accountActive: true,
};
const otherAgent: LandActor = {
  id: randomUUID(),
  role: 'AGENT',
  accountActive: true,
};
const surveyorA: LandActor = { id: randomUUID(), role: 'GEOMETRE' };
const surveyorB: LandActor = { id: randomUUID(), role: 'GEOMETRE' };
const admin: LandActor = { id: randomUUID(), role: 'ADMIN' };

const request: SurveyRequestInput = {
  locality: ' Agoe, Lome ',
  description: 'Terrain de 600 m2 a borner avant vente.',
  approxLocation: { longitude: 1.2105, latitude: 6.1305 },
};

describe('SurveyRequestService (PostGIS)', () => {
  let db: PGlite;
  let runner: SqlRunner;
  let audit: AuditService;
  let service: SurveyRequestService;

  async function lastAudit() {
    const { rows } = await db.query<{ action: string; result: string }>(
      'SELECT * FROM audit_log ORDER BY seq DESC LIMIT 1',
    );
    return rows[0];
  }

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { postgis } = await import('@electric-sql/pglite-postgis');
    db = new PGlite({ extensions: { postgis } });
    runner = { query: (sql, params) => db.query(sql, params) };
    const qr = runner as unknown as QueryRunner;
    await new AuditLog1793102400000().up(qr);
    await new LandParcels1793102500000().up(qr);
    await new LandSurveyRequests1793102700000().up(qr);
    const dataSource = {
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
      transaction: <T>(work: (tx: SqlRunner) => Promise<T>) =>
        db.transaction((tx) =>
          work({ query: (sql, params) => tx.query(sql, params) }),
        ),
    } as unknown as DataSource;
    audit = new AuditService(dataSource);
    service = new SurveyRequestService(dataSource, audit);
  });

  afterAll(async () => {
    await db?.close();
  });

  it('cree une demande ouverte pour un agent actif et journalise', async () => {
    const created = await service.create(agent, request);

    expect(created).toMatchObject({
      state: 'OUVERTE',
      agentId: agent.id,
      surveyorId: null,
      parcelId: null,
      locality: 'Agoe, Lome',
      approxLocation: { longitude: 1.2105, latitude: 6.1305 },
    });
    expect(await lastAudit()).toMatchObject({
      action: 'SURVEY_REQUEST_CREATED',
      result: 'SUCCESS',
    });
  });

  it('accepte une demande sans position', async () => {
    const created = await service.create(agent, {
      locality: 'Baguida',
      description: 'Lot familial a lever.',
    });
    expect(created.approxLocation).toBeUndefined();
  });

  it.each<[string, LandActor]>([
    ['un agent non active', { ...agent, accountActive: false }],
    ['un client', { id: randomUUID(), role: 'CLIENT' }],
    ['un geometre', surveyorA],
    ['un administrateur', admin],
  ])('refuse la creation par %s (403)', async (_label, actor) => {
    await expect(service.create(actor, request)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(await lastAudit()).toMatchObject({ action: 'ACCESS_DENIED' });
  });

  it.each<[string, SurveyRequestInput]>([
    ['une localite vide', { ...request, locality: '   ' }],
    [
      'une description trop longue',
      { ...request, description: 'x'.repeat(1001) },
    ],
    [
      'une position hors limites',
      { ...request, approxLocation: { longitude: 1.2, latitude: 95 } },
    ],
  ])('refuse %s (400)', async (_label, input) => {
    await expect(service.create(agent, input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('montre a chacun ce qu il a le droit de voir', async () => {
    await service.create(otherAgent, request);

    const mine = await service.list(agent);
    expect(mine.every((r) => r.agentId === agent.id)).toBe(true);
    expect(mine).toHaveLength(2);
    expect(await service.list(surveyorA)).toHaveLength(3);
    expect(await service.list(admin)).toHaveLength(3);
    await expect(
      service.list({ id: randomUUID(), role: 'CLIENT' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.list(admin, 'FINIE' as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('laisse un seul geometre prendre une demande', async () => {
    const [open] = await service.list(otherAgent);
    const taken = await service.take(surveyorA, open.id);

    expect(taken).toMatchObject({ state: 'PRISE', surveyorId: surveyorA.id });
    expect(await lastAudit()).toMatchObject({ action: 'SURVEY_REQUEST_TAKEN' });
    const error: unknown = await service
      .take(surveyorB, open.id)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'REQUEST_ALREADY_TAKEN',
    });
  });

  it('ne donne qu une demande a deux geometres simultanes', async () => {
    const created = await service.create(agent, request);
    const results = await Promise.allSettled([
      service.take(surveyorA, created.id),
      service.take(surveyorB, created.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('masque aux autres geometres les demandes deja prises', async () => {
    const visibleToB = await service.list(surveyorB, 'PRISE');
    expect(visibleToB.every((r) => r.surveyorId === surveyorB.id)).toBe(true);
    const visibleToA = await service.list(surveyorA, 'PRISE');
    expect(visibleToA.every((r) => r.surveyorId === surveyorA.id)).toBe(true);
  });

  it.each(['AGENT', 'ADMIN', 'CLIENT', 'TOPOGRAPHE'])(
    'refuse la prise par le role %s (403)',
    async (role) => {
      const created = await service.create(agent, request);
      await expect(
        service.take({ id: randomUUID(), role }, created.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it.each([randomUUID(), 'pas-un-uuid'])(
    'repond 404 pour la demande %p',
    async (id) => {
      await expect(service.take(surveyorA, id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    },
  );

  it('laisse un journal dont la chaine est intacte', async () => {
    await expect(audit.verify(runner)).resolves.toMatchObject({ valid: true });
  });
});
