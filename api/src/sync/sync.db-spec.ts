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
import { SyncService, stableStringify } from './sync.service';

jest.setTimeout(60000);

const topo: CurrentActorValue = {
  id: randomUUID(),
  role: 'TOPOGRAPHE',
  registeredSurveyor: false,
  accountActive: true,
};
const topo2: CurrentActorValue = { ...topo, id: randomUUID() };

function validPayload(projectId = randomUUID()) {
  return {
    projectId,
    pointNumber: 1,
    pointName: 'B1',
    latitude: 6.137254,
    longitude: 1.212547,
    altitude: 24.35,
    fixQuality: 'FIXED',
    satellitesCount: 18,
    pdop: 1.2,
    hdop: 0.8,
    vdop: 0.9,
    instrument: 'UM982',
    recordedAt: '2026-10-25T14:32:00.000Z',
  };
}

function item(payload: Record<string, unknown>, clientId = randomUUID()) {
  return { clientId, entityType: 'survey_point', action: 'CREATE', payload };
}

describe('SyncService (PostgreSQL)', () => {
  let db: PGlite;
  let service: SyncService;

  async function countItems(): Promise<number> {
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM sync_items',
    );
    return rows[0].n;
  }

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
    const runner: SqlRunner = {
      query: (sql, params) => db.query(sql, params),
    };
    const qr = runner as unknown as QueryRunner;
    await new AuditLog1793102400000().up(qr);
    await new AuthAccounts1793104000000().up(qr);
    await new SyncItems1793105000000().up(qr);
    for (const account of [topo, topo2]) {
      await db.query(
        `INSERT INTO accounts (id, phone, password_hash, status, role)
         VALUES ($1, $2, 'x', 'ACTIF', 'TOPOGRAPHE')`,
        [account.id, `+2289000${account.id.slice(0, 6)}`],
      );
    }
    const dataSource = {
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
      transaction: <T>(work: (tx: SqlRunner) => Promise<T>) =>
        db.transaction((tx) =>
          work({ query: (sql, params) => tx.query(sql, params) }),
        ),
    } as unknown as DataSource;
    service = new SyncService(dataSource, new AuditService(dataSource));
  });

  afterAll(async () => {
    await db.close();
  });

  it('accepte un point FIXED et le journalise (EF-405)', async () => {
    const receipt = await service.processItem(topo, item(validPayload()));
    expect(receipt.result).toBe('ACCEPTED');
    expect(await countItems()).toBe(1);
    const audit = await lastAudit();
    expect(audit.action).toBe('SYNC_ITEM');
    expect(audit.result).toBe('SUCCESS');
  });

  it('renvoyer le meme clientId ne cree pas de doublon (CA-3, RG-08)', async () => {
    const payload = validPayload();
    const first = await service.processItem(topo, item(payload));
    const resend = await service.processItem(
      topo,
      item(payload, first.clientId),
    );
    expect(resend.result).toBe('DUPLICATE');
    expect(resend.id).toBe(first.id);
    expect(await countItems()).toBe(2);
  });

  it('refuse 409 un clientId reuse avec un contenu different', async () => {
    const clientId = randomUUID();
    await service.processItem(topo, item(validPayload(), clientId));
    await expect(
      service.processItem(topo, item(validPayload(), clientId)),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'IDEMPOTENCY_CONFLICT' },
    });
    expect(await countItems()).toBe(3);
  });

  it('un meme clientId est accepte pour deux comptes differents', async () => {
    const clientId = randomUUID();
    const payload = validPayload();
    await service.processItem(topo, item(payload, clientId));
    const other = await service.processItem(topo2, item(payload, clientId));
    expect(other.result).toBe('ACCEPTED');
    expect(await countItems()).toBe(5);
  });

  it('refuse un point non FIXED comme borne officielle (RG-01)', async () => {
    for (const fixQuality of ['FLOAT', 'AUTONOME', 'INVALIDE']) {
      await expect(
        service.processItem(topo, item({ ...validPayload(), fixQuality })),
      ).rejects.toMatchObject({
        status: 400,
        response: {
          code: 'VALIDATION_ERROR',
          details: {
            reason:
              'fixQuality doit etre FIXED pour une limite fonciere officielle.',
          },
        },
      });
    }
    const audit = await lastAudit();
    expect(audit.result).toBe('REJECTED');
    expect(await countItems()).toBe(5);
  });

  it.each([
    ['un geometre', { ...topo, role: 'GEOMETRE' }],
    ['un client', { ...topo, role: 'CLIENT' }],
    ['un topographe suspendu', { ...topo, accountActive: false }],
  ])('refuse 403 %s', async (_label, actor) => {
    await expect(
      service.processItem(actor, item(validPayload())),
    ).rejects.toMatchObject({ status: 403, response: { code: 'FORBIDDEN' } });
  });

  it.each([
    [
      'un champ obligatoire manquant',
      { ...validPayload(), altitude: undefined },
    ],
    ['un champ non admis', { ...validPayload(), commentaire: 'x' }],
    ['une latitude hors limites', { ...validPayload(), latitude: 95 }],
    ['un projectId invalide', { ...validPayload(), projectId: 'chantier-1' }],
    ['une date invalide', { ...validPayload(), recordedAt: 'hier' }],
  ])('refuse 400 %s', async (_label, payload) => {
    await expect(
      service.processItem(topo, item(payload as Record<string, unknown>)),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_ERROR' },
    });
  });

  it('refuse un entityType ou une action inconnu', async () => {
    await expect(
      service.processItem(topo, {
        clientId: randomUUID(),
        entityType: 'parcel',
        action: 'CREATE',
        payload: validPayload(),
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.processItem(topo, {
        clientId: randomUUID(),
        entityType: 'survey_point',
        action: 'DELETE',
        payload: validPayload(),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('hache le payload de facon stable quel que soit lordre des cles', () => {
    const a = stableStringify({ x: 1, y: { b: 2, a: 3 } });
    const b = stableStringify({ y: { a: 3, b: 2 }, x: 1 });
    expect(a).toBe(b);
  });
});
