import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Polygon } from 'typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { type TransactionRunner, rowsOf } from '../audit/sql-runner';
import type { LegalStatus } from './parcel.entity';
import type { LandActor } from './parcel.service';

/// Parcelle deja enregistree avec laquelle la demande a ete refusee.
export interface OverlapAlertConflict {
  parcelId: string;
  overlapAreaM2: number;
  version: number | null;
  legalStatus: LegalStatus | null;
  certified: boolean | null;
  geometry: Polygon | null;
  // Zone commune recalculee avec la geometrie actuelle de la parcelle.
  overlap: Polygon | null;
}

/// Examen d'une alerte par l'administrateur (bouton "Marquer comme examinee").
export interface OverlapAlertReview {
  reviewedBy: string;
  reviewedAt: string;
  note: string | null;
}

/// Alerte de chevauchement (RG-02, ecran W3), lue dans le journal chaine.
export interface OverlapAlert {
  auditSeq: number;
  at: string;
  actorId: string | null;
  // Parcelle modifiee (refus d'une modification), absente pour une creation.
  submittedParcelId: string | null;
  surveySessionId: string | null;
  submittedGeometry: Polygon | null;
  conflicts: OverlapAlertConflict[];
  review: OverlapAlertReview | null;
  prevHash: string;
  hash: string;
}

export type OverlapAlertState = 'open' | 'reviewed';

interface AlertRow {
  seq: number | string;
  at: Date | string;
  actor_id: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | string;
  prev_hash: string;
  hash: string;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
  note: string | null;
}

interface ConflictRow {
  id: string;
  current_version: number;
  legal_status: LegalStatus;
  certified: boolean;
  geojson: string;
  overlap: string | null;
}

const SELECT_ALERTS = `
  SELECT a.seq, a.at, a.actor_id, a.resource_id, a.details, a.prev_hash, a.hash,
         r.reviewed_by, r.reviewed_at, r.note
    FROM audit_log a
    LEFT JOIN overlap_alert_reviews r ON r.audit_seq = a.seq
   WHERE a.action = 'PARCEL_OVERLAP_REJECTED'`;

@Injectable()
export class OverlapAlertService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  private get db(): TransactionRunner {
    return this.dataSource;
  }

  /// Reserve a l'administrateur. L'administrateur ne modifie aucune limite :
  /// il contacte le geometre puis marque l'alerte comme examinee (maquette W3).
  async list(
    actor: LandActor,
    limit: string | number = 50,
    state?: string,
  ): Promise<OverlapAlert[]> {
    await this.requireAdmin(actor, 'OVERLAP_ALERT_LIST');
    const max = Number(limit);
    if (!Number.isInteger(max) || max < 1 || max > 200) {
      throw this.invalid(
        'Le parametre limit doit etre un entier entre 1 et 200.',
      );
    }
    if (state !== undefined && state !== 'open' && state !== 'reviewed') {
      throw this.invalid('Le parametre state doit valoir open ou reviewed.');
    }
    const filter =
      state === 'open'
        ? ' AND r.audit_seq IS NULL'
        : state === 'reviewed'
          ? ' AND r.audit_seq IS NOT NULL'
          : '';
    const rows = rowsOf<AlertRow>(
      await this.dataSource.query(
        `${SELECT_ALERTS}${filter} ORDER BY a.seq DESC LIMIT $1`,
        [max],
      ),
    );
    const alerts: OverlapAlert[] = [];
    for (const row of rows) alerts.push(await this.toAlert(row));
    return alerts;
  }

  /// "Marquer comme examinee" : une seule fois par alerte, journalise.
  async review(
    actor: LandActor,
    auditSeq: string | number,
    note?: string,
  ): Promise<OverlapAlert> {
    await this.requireAdmin(actor, 'OVERLAP_ALERT_REVIEW', true);
    const seq = Number(auditSeq);
    if (!Number.isInteger(seq) || seq < 1) throw this.notFound();
    if (note !== undefined && (typeof note !== 'string' || note.length > 500)) {
      throw this.invalid(
        'Le champ note doit etre un texte de 500 caracteres au plus.',
      );
    }
    const cleanNote = note?.trim() || null;

    const row = await this.db.transaction(async (tx) => {
      const [alert] = rowsOf<AlertRow>(
        await tx.query(`${SELECT_ALERTS} AND a.seq = $1`, [seq]),
      );
      if (!alert) throw this.notFound();
      if (alert.reviewed_by) {
        throw new ConflictException({
          code: 'ALERT_ALREADY_REVIEWED',
          message: 'Cette alerte a deja ete examinee.',
        });
      }
      await tx.query(
        `INSERT INTO overlap_alert_reviews (audit_seq, reviewed_by, note)
         VALUES ($1, $2, $3)`,
        [seq, actor.id, cleanNote],
      );
      await this.audit.log(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'OVERLAP_ALERT_REVIEWED',
          resourceType: 'overlap_alert',
          resourceId: String(seq),
          result: 'SUCCESS',
          details: cleanNote ? { note: cleanNote } : {},
        },
        tx,
      );
      const [updated] = rowsOf<AlertRow>(
        await tx.query(`${SELECT_ALERTS} AND a.seq = $1`, [seq]),
      );
      return updated;
    });
    return this.toAlert(row);
  }

  private async toAlert(row: AlertRow): Promise<OverlapAlert> {
    const details = (
      typeof row.details === 'string' ? JSON.parse(row.details) : row.details
    ) as {
      conflicts?: { parcelId: string; overlapAreaM2: number }[];
      surveySessionId?: string;
      submittedGeometry?: Polygon;
    };
    const submitted = details.submittedGeometry ?? null;
    const conflicts: OverlapAlertConflict[] = [];
    for (const c of details.conflicts ?? []) {
      const [p] = rowsOf<ConflictRow>(
        await this.dataSource.query(
          `SELECT id, current_version, legal_status, certified,
                  ST_AsGeoJSON(geom) AS geojson,
                  CASE WHEN $2::text IS NULL THEN NULL ELSE ST_AsGeoJSON(
                    ST_CollectionExtract(ST_Intersection(
                      geom, ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)), 3))
                  END AS overlap
             FROM parcels WHERE id = $1`,
          [c.parcelId, submitted ? JSON.stringify(submitted) : null],
        ),
      );
      conflicts.push({
        parcelId: c.parcelId,
        overlapAreaM2: c.overlapAreaM2,
        version: p?.current_version ?? null,
        legalStatus: p?.legal_status ?? null,
        certified: p?.certified ?? null,
        geometry: p ? (JSON.parse(p.geojson) as Polygon) : null,
        overlap: p?.overlap ? (JSON.parse(p.overlap) as Polygon) : null,
      });
    }
    return {
      auditSeq: Number(row.seq),
      at: new Date(row.at).toISOString(),
      actorId: row.actor_id,
      submittedParcelId: row.resource_id,
      surveySessionId: details.surveySessionId ?? null,
      submittedGeometry: submitted,
      conflicts,
      review:
        row.reviewed_by && row.reviewed_at
          ? {
              reviewedBy: row.reviewed_by,
              reviewedAt: new Date(row.reviewed_at).toISOString(),
              note: row.note,
            }
          : null,
      prevHash: row.prev_hash,
      hash: row.hash,
    };
  }

  // Une ecriture exige en plus un compte actif (compte suspendu : 403).
  private async requireAdmin(
    actor: LandActor,
    operation: string,
    write = false,
  ) {
    if (actor.role === 'ADMIN' && (!write || actor.accountActive === true)) {
      return;
    }
    await this.audit.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'ACCESS_DENIED',
      resourceType: 'overlap_alert',
      result: 'DENIED',
      details: { operation },
    });
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Action non autorisee pour votre role.',
    });
  }

  private invalid(message: string): BadRequestException {
    return new BadRequestException({ code: 'VALIDATION_ERROR', message });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'NOT_FOUND',
      message: 'Alerte introuvable.',
    });
  }
}
