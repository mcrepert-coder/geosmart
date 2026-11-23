import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { type CurrentActorValue } from '../audit/current-actor.decorator';
import { rowsOf } from '../audit/sql-runner';

// EF-403 : pieces justificatives. 5 Mo maximum, JPEG, PNG ou PDF.
// Les pieces d'identite ne sont lisibles que par le proprietaire et l'admin.
export const DOCUMENT_CATEGORIES = [
  'IDENTITY',
  'PROFESSIONAL_CARD',
  'APPROVAL',
  'RCCM',
  'ORDER_REGISTRATION',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
] as const;

export function maxDocumentBytes(): number {
  const max = Number(process.env.UPLOAD_MAX_BYTES ?? 5242880);
  return Number.isInteger(max) && max > 0 ? max : 5242880;
}

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface DocumentMetadata {
  id: string;
  category: DocumentCategory;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

interface DocumentRow {
  id: string;
  account_id: string;
  category: DocumentCategory;
  content_type: string;
  size_bytes: number;
  content: Buffer;
  uploaded_at: Date | string;
}

const SIGNATURES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
};

function toMetadata(row: DocumentRow): DocumentMetadata {
  return {
    id: row.id,
    category: row.category,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    uploadedAt: new Date(row.uploaded_at).toISOString(),
  };
}

// Le pilote pg renvoie un Buffer ; PGlite (tests) renvoie du texte en base 10
// ou un Uint8Array : on normalise.
export function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (typeof value === 'string') {
    return Buffer.from(value.split(',').map((byte) => Number(byte)));
  }
  return Buffer.alloc(0);
}

@Injectable()
export class DocumentsService {
  constructor(private readonly dataSource: DataSource) {}

  async upload(
    actor: CurrentActorValue,
    category: string,
    file: UploadedFile | undefined,
  ): Promise<DocumentMetadata> {
    if (
      typeof category !== 'string' ||
      !DOCUMENT_CATEGORIES.includes(category as DocumentCategory)
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'La categorie de la piece est invalide.',
      });
    }
    if (!file || !file.buffer || file.size < 1) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Le fichier est obligatoire.',
      });
    }
    if (file.size > maxDocumentBytes()) {
      throw new PayloadTooLargeException({
        code: 'FILE_TOO_LARGE',
        message: 'Le fichier depasse la taille maximale de 5 Mo.',
      });
    }
    if (
      !DOCUMENT_CONTENT_TYPES.includes(
        file.mimetype as (typeof DOCUMENT_CONTENT_TYPES)[number],
      )
    ) {
      throw new UnsupportedMediaTypeException({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Seuls les formats JPEG, PNG et PDF sont acceptes.',
      });
    }
    const signature = SIGNATURES[file.mimetype];
    const matches = signature.every(
      (byte, index) => file.buffer[index] === byte,
    );
    if (!matches) {
      throw new UnsupportedMediaTypeException({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Le contenu du fichier ne correspond pas au format declare.',
      });
    }
    const id = randomUUID();
    await this.dataSource.query(
      `INSERT INTO account_documents
         (id, account_id, category, content_type, size_bytes, content)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, actor.id, category, file.mimetype, file.size, file.buffer],
    );
    const rows = rowsOf<DocumentRow>(
      await this.dataSource.query(
        'SELECT * FROM account_documents WHERE id = $1',
        [id],
      ),
    );
    return toMetadata(rows[0]);
  }

  async listFor(accountId: string): Promise<DocumentMetadata[]> {
    const rows = rowsOf<DocumentRow>(
      await this.dataSource.query(
        `SELECT id, account_id, category, content_type, size_bytes, uploaded_at
           FROM account_documents WHERE account_id = $1 ORDER BY uploaded_at`,
        [accountId],
      ),
    );
    return rows.map(toMetadata);
  }

  // Proprietaire ou administrateur seulement ; pour les autres la piece
  // n'existe pas (404), pour ne pas reveler son existence.
  async getFor(
    actor: CurrentActorValue,
    documentId: string,
  ): Promise<{ metadata: DocumentMetadata; content: Buffer }> {
    const rows = rowsOf<DocumentRow>(
      await this.dataSource.query(
        'SELECT * FROM account_documents WHERE id = $1',
        [documentId],
      ),
    );
    const row = rows[0];
    if (!row || (row.account_id !== actor.id && actor.role !== 'ADMIN')) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Ressource introuvable.',
      });
    }
    return { metadata: toMetadata(row), content: toBuffer(row.content) };
  }
}
