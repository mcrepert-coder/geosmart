import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { type TransactionRunner, rowsOf } from '../audit/sql-runner';
import { isParcelId } from './parcel-id';
import type { LegalStatus } from './parcel.entity';
import type { LandActor } from './parcel.service';

export const LEGAL_STATUSES: LegalStatus[] = [
  'TITRE',
  'COUTUMIER_NON_TITRE',
  'EN_LITIGE',
  'INCONNU',
];

// Roles autorises a renseigner le statut juridique. Hypothese ADMIN en
// attendant la decision de LGR (contracts/land.yaml).
export const STATUS_EDITOR_ROLES = ['ADMIN'];

export const NOT_A_LAND_TITLE = 'Ne vaut pas titre foncier.';

export interface ParcelPublicStatus {
  id: string;
  legalStatus: LegalStatus;
  statusSource: string | null;
  statusDate: string | null;
  certified: boolean;
  areaM2: number;
  version: number;
  updatedAt: string;
  warnings: string[];
}

export interface LegalStatusInput {
  legalStatus: LegalStatus;
  source?: string;
  documentDate?: string;
  note?: string;
}

interface StatusRow {
  id: string;
  legal_status: LegalStatus;
  status_source: string | null;
  status_date: string | null;
  certified: boolean;
  area_m2: number | string;
  current_version: number;
  updated_at: Date | string;
}

const SELECT_STATUS = `
  SELECT id, legal_status, status_source,
         to_char(status_date, 'YYYY-MM-DD') AS status_date,
         certified, area_m2, current_version, updated_at
    FROM parcels`;

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_ERROR', message });
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// GeoSmart n'invente jamais un statut : tout statut autre que INCONNU doit
// citer sa source et la date du document (EF-203).
function validateStatus(input: LegalStatusInput) {
  if (!LEGAL_STATUSES.includes(input?.legalStatus)) {
    throw invalid(
      `Le statut doit etre l'un de : ${LEGAL_STATUSES.join(', ')}.`,
    );
  }
  if (
    input.note !== undefined &&
    (typeof input.note !== 'string' || input.note.length > 500)
  ) {
    throw invalid(
      'Le champ note doit etre un texte de 500 caracteres au plus.',
    );
  }
  if (input.legalStatus === 'INCONNU') return;
  const source = typeof input.source === 'string' ? input.source.trim() : '';
  if (source.length === 0 || source.length > 200) {
    throw invalid(
      'La source du statut est obligatoire (200 caracteres au plus).',
    );
  }
  if (
    typeof input.documentDate !== 'string' ||
    !isCalendarDate(input.documentDate)
  ) {
    throw invalid('La date du document doit etre au format AAAA-MM-JJ.');
  }
  if (input.documentDate > new Date().toISOString().slice(0, 10)) {
    throw invalid('La date du document ne peut pas etre dans le futur.');
  }
}

export function toPublicStatus(row: StatusRow): ParcelPublicStatus {
  const warnings: string[] = [];
  if (row.legal_status === 'INCONNU' || !row.status_source) {
    warnings.push('Statut juridique non renseigne par une source autorisee.');
  }
  if (row.legal_status === 'EN_LITIGE') {
    warnings.push('Parcelle signalee en litige par la source indiquee.');
  }
  if (!row.certified) {
    warnings.push('Leve non certifie.');
  }
  warnings.push(NOT_A_LAND_TITLE);
  return {
    id: row.id,
    legalStatus: row.legal_status,
    statusSource: row.status_source,
    statusDate: row.status_date,
    certified: row.certified,
    areaM2: Number(row.area_m2),
    version: row.current_version,
    updatedAt: new Date(row.updated_at).toISOString(),
    warnings,
  };
}

@Injectable()
export class ParcelStatusService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  private get db(): TransactionRunner {
    return this.dataSource;
  }

  // EF-206 : consultation publique avant achat. Aucune donnee personnelle,
  // aucune coordonnee de borne.
  async getPublicStatus(parcelId: string): Promise<ParcelPublicStatus> {
    if (!isParcelId(parcelId ?? '')) throw this.notFound();
    const [row] = rowsOf<StatusRow>(
      await this.dataSource.query(`${SELECT_STATUS} WHERE id = $1`, [parcelId]),
    );
    if (!row) throw this.notFound();
    return toPublicStatus(row);
  }

  // EF-203 : enregistre le statut fourni par une source autorisee, et
  // journalise l'ancienne et la nouvelle valeur.
  async setLegalStatus(
    actor: LandActor,
    parcelId: string,
    input: LegalStatusInput,
  ): Promise<ParcelPublicStatus> {
    if (!STATUS_EDITOR_ROLES.includes(actor.role)) {
      await this.audit.log({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'ACCESS_DENIED',
        resourceType: 'parcel',
        resourceId: parcelId,
        result: 'DENIED',
        details: { operation: 'PARCEL_STATUS_SET' },
      });
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Action non autorisee pour votre role.',
      });
    }
    validateStatus(input);
    const known = input.legalStatus !== 'INCONNU';
    const source = known ? (input.source as string).trim() : null;
    const documentDate = known ? (input.documentDate as string) : null;

    return this.db.transaction(async (tx) => {
      const [before] = rowsOf<StatusRow>(
        await tx.query(`${SELECT_STATUS} WHERE id = $1 FOR UPDATE`, [parcelId]),
      );
      if (!before) throw this.notFound();
      await tx.query(
        `UPDATE parcels
            SET legal_status = $2, status_source = $3, status_date = $4,
                updated_at = now()
          WHERE id = $1`,
        [parcelId, input.legalStatus, source, documentDate],
      );
      await this.audit.log(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'PARCEL_STATUS_SET',
          resourceType: 'parcel',
          resourceId: parcelId,
          result: 'SUCCESS',
          details: {
            previous: {
              legalStatus: before.legal_status,
              source: before.status_source,
              documentDate: before.status_date,
            },
            legalStatus: input.legalStatus,
            source,
            documentDate,
            note: input.note ?? null,
          },
        },
        tx,
      );
      const [after] = rowsOf<StatusRow>(
        await tx.query(`${SELECT_STATUS} WHERE id = $1`, [parcelId]),
      );
      return toPublicStatus(after);
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'NOT_FOUND',
      message: 'Parcelle introuvable.',
    });
  }
}
