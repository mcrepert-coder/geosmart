import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { type CurrentActorValue } from '../audit/current-actor.decorator';
import { sha256 } from '../auth/accounts.service';
import { rowsOf } from '../audit/sql-runner';
import { stableStringify } from '../sync/sync.service';
import { maxDocumentBytes } from '../users/documents.service';

// EF-306 : etats des lieux d'entree et de sortie, photos horodatees, notes
// et signature du locataire en image. Ils passent par la file de
// synchronisation : un renvoi du meme clientId ne cree pas de doublon.
const KINDS = ['ENTRY', 'EXIT'] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InspectionPhotoInput {
  takenAt: string;
  dataBase64: string;
}

export interface InspectionInput {
  clientId: string;
  kind: string;
  notes?: string;
  photos?: InspectionPhotoInput[];
  tenantSignatureBase64: string;
}

export interface InspectionPhotoView {
  id: string;
  takenAt: string;
  sizeBytes: number;
}

export interface InspectionView {
  id: string;
  leaseId: string;
  kind: (typeof KINDS)[number];
  clientId: string;
  notes: string | null;
  photos: InspectionPhotoView[];
  createdAt: string;
}

interface InspectionRow {
  id: string;
  lease_id: string;
  account_id: string;
  client_id: string;
  kind: (typeof KINDS)[number];
  notes: string | null;
  payload_hash: string;
  created_at: Date | string;
}

function validation(message: string) {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message,
  });
}

function forbidden() {
  return new ForbiddenException({
    code: 'FORBIDDEN',
    message: 'Action non autorisee pour votre role.',
  });
}

function notFound() {
  return new NotFoundException({
    code: 'NOT_FOUND',
    message: 'Ressource introuvable.',
  });
}

function conflict(code: string, message: string) {
  return new HttpException({ code, message }, 409);
}

function decodeImage(value: unknown, field: string): Buffer {
  if (typeof value !== 'string' || value === '') {
    throw validation(`${field} est obligatoire (image en base64).`);
  }
  const buffer = Buffer.from(value, 'base64');
  if (buffer.length < 1) {
    throw validation(`${field} n est pas une image base64 valide.`);
  }
  if (buffer.length > maxDocumentBytes()) {
    throw validation(`${field} depasse la taille maximale de 5 Mo.`);
  }
  return buffer;
}

@Injectable()
export class InspectionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async create(
    actor: CurrentActorValue,
    leaseId: string,
    input: InspectionInput,
  ): Promise<InspectionView> {
    if (actor.accountActive !== true || actor.role !== 'AGENT') {
      throw forbidden();
    }
    if (typeof input?.clientId !== 'string' || !UUID_RE.test(input.clientId)) {
      throw validation('clientId doit etre un UUID.');
    }
    if (!KINDS.includes(input?.kind as (typeof KINDS)[number])) {
      throw validation('kind doit valoir ENTRY ou EXIT.');
    }
    const lease = rowsOf<{ id: string }>(
      await this.dataSource.query('SELECT id FROM leases WHERE id = $1', [
        leaseId,
      ]),
    );
    if (!lease[0]) {
      throw notFound();
    }
    const signature = decodeImage(
      input.tenantSignatureBase64,
      'tenantSignatureBase64',
    );
    const photos = input.photos ?? [];
    if (!Array.isArray(photos)) {
      throw validation('photos doit etre un tableau.');
    }
    const decodedPhotos = photos.map((photo, index) => {
      if (
        typeof photo?.takenAt !== 'string' ||
        Number.isNaN(Date.parse(photo.takenAt))
      ) {
        throw validation(
          `photos[${index}].takenAt doit etre une date ISO 8601.`,
        );
      }
      return {
        takenAt: new Date(photo.takenAt).toISOString(),
        data: decodeImage(photo.dataBase64, `photos[${index}].dataBase64`),
      };
    });
    const notes =
      input.notes === undefined || input.notes === null
        ? null
        : typeof input.notes === 'string'
          ? input.notes
          : (() => {
              throw validation('notes doit etre une chaine.');
            })();

    const payloadHash = sha256(
      stableStringify({ leaseId, kind: input.kind, notes, photos, input }),
    );
    const existing = rowsOf<InspectionRow>(
      await this.dataSource.query(
        'SELECT * FROM inspections WHERE account_id = $1 AND client_id = $2',
        [actor.id, input.clientId],
      ),
    );
    if (existing[0]) {
      if (existing[0].payload_hash !== payloadHash) {
        throw conflict(
          'IDEMPOTENCY_CONFLICT',
          'Ce clientId est deja associe a un etat des lieux different.',
        );
      }
      return this.toView(existing[0]);
    }

    const id = randomUUID();
    try {
      await this.dataSource.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO inspections
             (id, lease_id, account_id, client_id, kind, notes, signature, payload_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            id,
            leaseId,
            actor.id,
            input.clientId,
            input.kind,
            notes,
            signature,
            payloadHash,
          ],
        );
        for (const photo of decodedPhotos) {
          await tx.query(
            `INSERT INTO inspection_photos (id, inspection_id, taken_at, size_bytes, data)
             VALUES ($1, $2, $3, $4, $5)`,
            [randomUUID(), id, photo.takenAt, photo.data.length, photo.data],
          );
        }
        await this.audit.log(
          {
            actorId: actor.id,
            actorRole: actor.role,
            action: 'INSPECTION_CREATE',
            resourceType: 'lease',
            resourceId: leaseId,
            result: 'SUCCESS',
            details: {
              inspectionId: id,
              kind: input.kind,
              photos: decodedPhotos.length,
            },
          },
          tx,
        );
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }
      // Deux envois simultanes du meme element : la ligne existe deja.
      const concurrent = rowsOf<InspectionRow>(
        await this.dataSource.query(
          'SELECT * FROM inspections WHERE account_id = $1 AND client_id = $2',
          [actor.id, input.clientId],
        ),
      );
      if (concurrent[0]?.payload_hash === payloadHash) {
        return this.toView(concurrent[0]);
      }
      // Un etat des lieux du meme type existe deja pour ce bail.
      const sameKind = rowsOf<InspectionRow>(
        await this.dataSource.query(
          'SELECT * FROM inspections WHERE lease_id = $1 AND kind = $2',
          [leaseId, input.kind],
        ),
      );
      if (sameKind[0]) {
        throw conflict(
          'INSPECTION_EXISTS',
          `Un etat des lieux ${input.kind} existe deja pour ce bail.`,
        );
      }
      throw conflict(
        'IDEMPOTENCY_CONFLICT',
        'Ce clientId est deja associe a un etat des lieux different.',
      );
    }
    const rows = rowsOf<InspectionRow>(
      await this.dataSource.query('SELECT * FROM inspections WHERE id = $1', [
        id,
      ]),
    );
    return this.toView(rows[0]);
  }

  async listForLease(
    actor: CurrentActorValue,
    leaseId: string,
  ): Promise<InspectionView[]> {
    const leases = rowsOf<{
      agent_id: string;
      tenant_account_id: string | null;
    }>(
      await this.dataSource.query(
        'SELECT agent_id, tenant_account_id FROM leases WHERE id = $1',
        [leaseId],
      ),
    );
    const lease = leases[0];
    if (
      !lease ||
      (actor.role !== 'ADMIN' &&
        lease.agent_id !== actor.id &&
        lease.tenant_account_id !== actor.id)
    ) {
      throw notFound();
    }
    const rows = rowsOf<InspectionRow>(
      await this.dataSource.query(
        'SELECT * FROM inspections WHERE lease_id = $1 ORDER BY created_at',
        [leaseId],
      ),
    );
    return Promise.all(rows.map((row) => this.toView(row)));
  }

  private async toView(row: InspectionRow): Promise<InspectionView> {
    const photos = rowsOf<{
      id: string;
      taken_at: Date | string;
      size_bytes: number;
    }>(
      await this.dataSource.query(
        'SELECT id, taken_at, size_bytes FROM inspection_photos WHERE inspection_id = $1 ORDER BY taken_at',
        [row.id],
      ),
    );
    return {
      id: row.id,
      leaseId: row.lease_id,
      kind: row.kind,
      clientId: row.client_id,
      notes: row.notes,
      photos: photos.map((photo) => ({
        id: photo.id,
        takenAt: new Date(photo.taken_at).toISOString(),
        sizeBytes: Number(photo.size_bytes),
      })),
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    const code = (error as { code?: string; driverError?: { code?: string } })
      ?.driverError?.code;
    return code === '23505' || (error as { code?: string })?.code === '23505';
  }
}
