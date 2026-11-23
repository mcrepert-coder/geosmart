import type { PGlite } from '@electric-sql/pglite' with {
  'resolution-mode': 'import',
};
import type { DataSource, QueryRunner } from 'typeorm';
import { AuditService } from './audit.service';
import { AuditLog1793102400000 } from './migrations/1793102400000-audit-log';
import { AuditLogAppendOnly1793103000000 } from './migrations/1793103000000-audit-log-append-only';
import type { SqlRunner } from './sql-runner';

jest.setTimeout(60000);

describe('journal en ajout seul (RG-10)', () => {
  let db: PGlite;
  let audit: AuditService;

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    db = new PGlite();
    const runner: SqlRunner = { query: (sql, params) => db.query(sql, params) };
    const qr = runner as unknown as QueryRunner;
    await new AuditLog1793102400000().up(qr);
    await new AuditLogAppendOnly1793103000000().up(qr);
    audit = new AuditService({
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
      transaction: <T>(work: (tx: SqlRunner) => Promise<T>) =>
        db.transaction((tx) =>
          work({ query: (sql, params) => tx.query(sql, params) }),
        ),
    } as unknown as DataSource);
    for (const action of ['PARCEL_CREATE', 'PARCEL_UPDATE']) {
      await audit.log({ action, resourceType: 'parcel', result: 'SUCCESS' });
    }
  });

  afterAll(async () => {
    await db?.close();
  });

  it.each([
    ['une modification', "UPDATE audit_log SET action = 'FAUX' WHERE seq = 1"],
    ['une suppression', 'DELETE FROM audit_log WHERE seq = 2'],
    ['un effacement complet', 'TRUNCATE audit_log'],
  ])('refuse %s, meme en SQL direct', async (_label, sql) => {
    await expect(db.query(sql)).rejects.toThrow(/ajout seul/);
  });

  it('accepte toujours les nouvelles lignes et garde la chaine intacte', async () => {
    await audit.log({
      action: 'ACCESS_DENIED',
      resourceType: 'parcel',
      result: 'DENIED',
    });
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM audit_log',
    );
    expect(rows[0].n).toBe(3);
    await expect(audit.verify()).resolves.toMatchObject({ valid: true });
  });
});
