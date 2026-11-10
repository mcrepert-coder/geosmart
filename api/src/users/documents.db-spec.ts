import type { PGlite } from '@electric-sql/pglite' with {
  'resolution-mode': 'import',
};
import { randomUUID } from 'node:crypto';
import type { DataSource, QueryRunner } from 'typeorm';
import type { CurrentActorValue } from '../audit/current-actor.decorator';
import type { SqlRunner } from '../audit/sql-runner';
import { AuthAccounts1793104000000 } from '../auth/migrations/1793104000000-auth-accounts';
import { DocumentsService, maxDocumentBytes } from './documents.service';
import { UserDocuments1793106000000 } from './migrations/1793106000000-user-documents';

jest.setTimeout(60000);

const owner: CurrentActorValue = {
  id: randomUUID(),
  role: 'CLIENT',
  registeredSurveyor: false,
  accountActive: true,
};
const other: CurrentActorValue = {
  id: randomUUID(),
  role: 'AGENT',
  registeredSurveyor: false,
  accountActive: true,
};
const admin: CurrentActorValue = {
  id: randomUUID(),
  role: 'ADMIN',
  registeredSurveyor: false,
  accountActive: true,
};

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pdf = Buffer.from('%PDF-1.4 faux pdf de test');

describe('DocumentsService (PostgreSQL)', () => {
  let db: PGlite;
  let service: DocumentsService;

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    db = new PGlite();
    const runner: SqlRunner = {
      query: (sql, params) => db.query(sql, params),
    };
    const qr = runner as unknown as QueryRunner;
    await new AuthAccounts1793104000000().up(qr);
    await new UserDocuments1793106000000().up(qr);
    for (const account of [owner, other, admin]) {
      await db.query(
        `INSERT INTO accounts (id, phone, password_hash, status, role)
         VALUES ($1, $2, 'x', 'ACTIF', $3)`,
        [account.id, `+22892${account.id.slice(0, 8)}`, account.role],
      );
    }
    const dataSource = {
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
      transaction: <T>(work: (tx: SqlRunner) => Promise<T>) =>
        db.transaction((tx) =>
          work({ query: (sql, params) => tx.query(sql, params) }),
        ),
    } as unknown as DataSource;
    service = new DocumentsService(dataSource);
  });

  afterAll(async () => {
    await db.close();
  });

  it('depose une piece d identite JPEG (EF-403)', async () => {
    const doc = await service.upload(owner, 'IDENTITY', {
      buffer: jpeg,
      mimetype: 'image/jpeg',
      size: jpeg.length,
    });
    expect(doc.category).toBe('IDENTITY');
    expect(doc.contentType).toBe('image/jpeg');
    expect(doc.sizeBytes).toBe(jpeg.length);
  });

  it('accepte PNG et PDF', async () => {
    const pngDoc = await service.upload(owner, 'PROFESSIONAL_CARD', {
      buffer: png,
      mimetype: 'image/png',
      size: png.length,
    });
    expect(pngDoc.contentType).toBe('image/png');
    const pdfDoc = await service.upload(owner, 'RCCM', {
      buffer: pdf,
      mimetype: 'application/pdf',
      size: pdf.length,
    });
    expect(pdfDoc.contentType).toBe('application/pdf');
  });

  it('refuse un fichier au-dela de 5 Mo (413)', async () => {
    const buffer = Buffer.alloc(maxDocumentBytes() + 1, 0xff);
    await expect(
      service.upload(owner, 'IDENTITY', {
        buffer,
        mimetype: 'image/jpeg',
        size: buffer.length,
      }),
    ).rejects.toMatchObject({
      status: 413,
      response: { code: 'FILE_TOO_LARGE' },
    });
  });

  it('refuse un format non admis (415)', async () => {
    await expect(
      service.upload(owner, 'IDENTITY', {
        buffer: Buffer.from('gif89a'),
        mimetype: 'image/gif',
        size: 6,
      }),
    ).rejects.toMatchObject({
      status: 415,
      response: { code: 'UNSUPPORTED_MEDIA_TYPE' },
    });
  });

  it('refuse un contenu qui ne correspond pas au format declare (415)', async () => {
    await expect(
      service.upload(owner, 'IDENTITY', {
        buffer: jpeg,
        mimetype: 'application/pdf',
        size: jpeg.length,
      }),
    ).rejects.toMatchObject({
      status: 415,
      response: { code: 'UNSUPPORTED_MEDIA_TYPE' },
    });
  });

  it('refuse une categorie inconnue et un fichier vide', async () => {
    await expect(
      service.upload(owner, 'PERMIS_DE_CONDUIRE', {
        buffer: jpeg,
        mimetype: 'image/jpeg',
        size: jpeg.length,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.upload(owner, 'IDENTITY', undefined),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('reserve la piece au proprietaire et a l administrateur', async () => {
    const doc = await service.upload(owner, 'IDENTITY', {
      buffer: pdf,
      mimetype: 'application/pdf',
      size: pdf.length,
    });
    const mine = await service.getFor(owner, doc.id);
    expect(mine.content.toString()).toBe(pdf.toString());
    const asAdmin = await service.getFor(admin, doc.id);
    expect(asAdmin.metadata.id).toBe(doc.id);
    await expect(service.getFor(other, doc.id)).rejects.toMatchObject({
      status: 404,
      response: { code: 'NOT_FOUND' },
    });
    await expect(service.getFor(owner, randomUUID())).rejects.toMatchObject({
      status: 404,
    });
  });

  it('liste seulement les pieces du compte demande', async () => {
    const list = await service.listFor(owner.id);
    expect(list.length).toBeGreaterThanOrEqual(4);
    expect(await service.listFor(other.id)).toHaveLength(0);
  });
});
