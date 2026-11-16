import type { PGlite } from '@electric-sql/pglite' with {
  'resolution-mode': 'import',
};
import { randomUUID } from 'node:crypto';
import type { DataSource, QueryRunner } from 'typeorm';
import type { CurrentActorValue } from '../audit/current-actor.decorator';
import { AuditLog1793102400000 } from '../audit/migrations/1793102400000-audit-log';
import { AuditService } from '../audit/audit.service';
import type { SqlRunner } from '../audit/sql-runner';
import { AuthAccounts1793104000000 } from '../auth/migrations/1793104000000-auth-accounts';
import { SyncItems1793105000000 } from './migrations/1793105000000-sync-items';
import { SurveyProjects1793108000000 } from './migrations/1793108000000-survey-projects';
import { ProjectsService, isAssignedTopographer } from './projects.service';
import { SyncService } from './sync.service';

jest.setTimeout(60000);

function actor(role: string, accountActive = true): CurrentActorValue {
  return { id: randomUUID(), role, registeredSurveyor: false, accountActive };
}

const admin = actor('ADMIN');
const geometre = actor('GEOMETRE');
const geometre2 = actor('GEOMETRE');
const topo = actor('TOPOGRAPHE');
const topo2 = actor('TOPOGRAPHE');
const agent = actor('AGENT');
const suspendedTopo = actor('TOPOGRAPHE', false);

function mission(projectId: string) {
  const point = (n: number) => ({
    clientId: randomUUID(),
    pointNumber: n,
    latitude: 6.1372 + n * 0.0001,
    longitude: 1.2125 + n * 0.0001,
    altitude: 24.3,
    fixQuality: 'FIXED',
    satellitesCount: 18,
    pdop: 1.2,
    instrument: 'UM982',
    recordedAt: '2026-11-12T08:00:00.000Z',
  });
  return {
    clientId: randomUUID(),
    entityType: 'survey_session',
    action: 'CREATE',
    payload: {
      projectId,
      status: 'COMPLETED',
      perimeterMeters: 80,
      areaSquareMeters: 400,
      createdAt: '2026-11-12T07:00:00.000Z',
      completedAt: '2026-11-12T09:00:00.000Z',
      points: [point(1), point(2), point(3)],
    },
  };
}

describe('ProjectsService (PostgreSQL) : chantiers EF-109 et CA-7', () => {
  let db: PGlite;
  let runner: SqlRunner;
  let projects: ProjectsService;
  let sync: SyncService;

  async function lastAudit() {
    const { rows } = await db.query<{
      action: string;
      result: string;
      details: Record<string, unknown>;
    }>('SELECT * FROM audit_log ORDER BY seq DESC LIMIT 1');
    return rows[0];
  }

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    db = new PGlite();
    runner = { query: (sql, params) => db.query(sql, params) };
    const qr = runner as unknown as QueryRunner;
    await new AuditLog1793102400000().up(qr);
    await new AuthAccounts1793104000000().up(qr);
    await new SyncItems1793105000000().up(qr);
    await new SurveyProjects1793108000000().up(qr);
    let n = 0;
    for (const a of [
      admin,
      geometre,
      geometre2,
      topo,
      topo2,
      agent,
      suspendedTopo,
    ]) {
      await db.query(
        `INSERT INTO accounts (id, phone, password_hash, status, role, full_name)
         VALUES ($1, $2, 'x', $3, $4, $5)`,
        [
          a.id,
          `+2289200000${n++}`,
          a.accountActive ? 'ACTIF' : 'SUSPENDU',
          a.role,
          `Compte ${a.role} ${n}`,
        ],
      );
    }
    const dataSource = {
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
      transaction: <T>(work: (tx: SqlRunner) => Promise<T>) =>
        db.transaction((tx) =>
          work({ query: (sql, params) => tx.query(sql, params) }),
        ),
    } as unknown as DataSource;
    const audit = new AuditService(dataSource);
    projects = new ProjectsService(dataSource, audit);
    sync = new SyncService(dataSource, audit);
  });

  afterAll(async () => {
    await db.close();
  });

  it('un geometre cree un chantier ouvert, journalise', async () => {
    const project = await projects.create(geometre, {
      title: '  Leve Adakpame  ',
    });
    expect(project).toMatchObject({
      title: 'Leve Adakpame',
      status: 'OUVERT',
      createdBy: geometre.id,
      topographers: [],
      missionsCount: 0,
      pointsCount: 0,
      closedAt: null,
    });
    expect((await lastAudit()).action).toBe('PROJECT_CREATE');
  });

  it.each([
    ['un topographe', topo],
    ['un agent', agent],
  ])('refuse 403 la creation par %s', async (_label, who) => {
    await expect(
      projects.create(who, { title: 'Chantier' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('refuse 400 un titre vide', async () => {
    await expect(
      projects.create(admin, { title: '   ' }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_ERROR' },
    });
  });

  it('assigne un topographe actif, puis POST /sync accepte sa mission (CA-7)', async () => {
    const project = await projects.create(geometre, { title: 'Avepozo' });
    await expect(
      sync.processItem(topo, mission(project.id)),
    ).rejects.toMatchObject({ status: 403 });

    const assigned = await projects.assign(geometre, project.id, topo.id);
    expect(assigned.topographers.map((t) => t.id)).toEqual([topo.id]);
    expect((await lastAudit()).action).toBe('PROJECT_ASSIGN');
    expect(await isAssignedTopographer(runner, project.id, topo.id)).toBe(true);

    await expect(
      sync.processItem(topo, mission(project.id)),
    ).resolves.toMatchObject({ result: 'ACCEPTED' });
    // Suivi : la mission recue est comptee sur le chantier.
    const view = await projects.get(geometre, project.id);
    expect(view.missionsCount).toBe(1);

    // Un autre topographe, non assigne, reste refuse.
    await expect(
      sync.processItem(topo2, mission(project.id)),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('assigner deux fois ne cree pas de doublon', async () => {
    const project = await projects.create(admin, { title: 'Agoe' });
    await projects.assign(admin, project.id, topo.id);
    const again = await projects.assign(admin, project.id, topo.id);
    expect(again.topographers).toHaveLength(1);
  });

  it.each([
    ['un geometre', () => geometre.id],
    ['un topographe suspendu', () => suspendedTopo.id],
    ['un compte inconnu', () => randomUUID()],
    ['un identifiant invalide', () => 'pas-un-uuid'],
  ])('refuse 400 d assigner %s', async (_label, target) => {
    const project = await projects.create(admin, { title: 'Kegue' });
    await expect(
      projects.assign(admin, project.id, target()),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_ERROR' },
    });
  });

  it('un geometre ne gere pas le chantier d un autre geometre', async () => {
    const project = await projects.create(geometre, { title: 'Baguida' });
    await expect(
      projects.assign(geometre2, project.id, topo.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(projects.get(geometre2, project.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('retirer le topographe coupe son acces au chantier', async () => {
    const project = await projects.create(geometre, { title: 'Avedji' });
    await projects.assign(geometre, project.id, topo2.id);
    const after = await projects.unassign(geometre, project.id, topo2.id);
    expect(after.topographers).toEqual([]);
    expect((await lastAudit()).action).toBe('PROJECT_UNASSIGN');
    await expect(
      sync.processItem(topo2, mission(project.id)),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('un chantier clos refuse les envois et les assignations', async () => {
    const project = await projects.create(geometre, { title: 'Adidogome' });
    await projects.assign(geometre, project.id, topo.id);
    const closed = await projects.close(geometre, project.id);
    expect(closed.status).toBe('CLOS');
    expect(closed.closedAt).not.toBeNull();
    expect((await lastAudit()).action).toBe('PROJECT_CLOSE');

    await expect(
      sync.processItem(topo, mission(project.id)),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      projects.assign(geometre, project.id, topo2.id),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'PROJECT_CLOSED' },
    });
  });

  it('liste les topographes actifs a assigner, sans telephone', async () => {
    const list = await projects.listTopographers(geometre);
    expect(list.map((t) => t.id).sort()).toEqual([topo.id, topo2.id].sort());
    expect(JSON.stringify(list)).not.toContain('+228');
    await expect(projects.listTopographers(topo)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('chacun ne voit que ses chantiers', async () => {
    const mine = await projects.create(geometre2, { title: 'Totsi' });
    await projects.assign(geometre2, mine.id, topo2.id);

    const forGeometre2 = await projects.list(geometre2);
    expect(forGeometre2.map((p) => p.id)).toEqual([mine.id]);

    const forTopo2 = await projects.list(topo2);
    expect(forTopo2.map((p) => p.id)).toContain(mine.id);
    expect(
      forTopo2.every((p) => p.topographers.some((t) => t.id === topo2.id)),
    ).toBe(true);

    const forAdmin = await projects.list(admin);
    expect(forAdmin.length).toBeGreaterThan(forGeometre2.length);

    await expect(projects.list(agent)).rejects.toMatchObject({ status: 403 });
    await expect(projects.get(topo, mine.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(projects.get(admin, 'inconnu')).rejects.toMatchObject({
      status: 404,
    });
  });
});
