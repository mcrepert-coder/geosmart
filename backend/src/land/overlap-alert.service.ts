import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Polygon } from 'typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { rowsOf } from '../audit/sql-runner';
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
  prevHash: string;
  hash: string;
}

interface AlertRow {
  seq: number | string;
  at: Date | string;
  actor_id: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | string;
  prev_hash: string;
  hash: string;
}

interface ConflictRow {
  id: string;
  current_version: number;
  legal_status: LegalStatus;
  certified: boolean;
  geojson: string;
  overlap: string | null;
}

@Injectable()
export class OverlapAlertService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  /// Reserve a l'administrateur. Lecture seule : l'administrateur ne modifie
  /// aucune limite, il contacte le geometre (maquette W3).
  async list(
    actor: LandActor,
    limit: string | number = 50,
  ): Promise<OverlapAlert[]> {
    if (actor.role !== 'ADMIN') {
      await this.audit.log({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'ACCESS_DENIED',
        resourceType: 'overlap_alert',
        result: 'DENIED',
        details: { operation: 'OVERLAP_ALERT_LIST' },
      });
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Action non autorisee pour votre role.',
      });
    }
    const max = Number(limit);
    if (!Number.isInteger(max) || max < 1 || max > 200) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Le parametre limit doit etre un entier entre 1 et 200.',
      });
    }

    const rows = rowsOf<AlertRow>(
      await this.dataSource.query(
        `SELECT seq, at, actor_id, resource_id, details, prev_hash, hash
           FROM audit_log
          WHERE action = 'PARCEL_OVERLAP_REJECTED'
          ORDER BY seq DESC
          LIMIT $1`,
        [max],
      ),
    );

    const alerts: OverlapAlert[] = [];
    for (const row of rows) {
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
        const overlap = p?.overlap ? (JSON.parse(p.overlap) as Polygon) : null;
        conflicts.push({
          parcelId: c.parcelId,
          overlapAreaM2: c.overlapAreaM2,
          version: p?.current_version ?? null,
          legalStatus: p?.legal_status ?? null,
          certified: p?.certified ?? null,
          geometry: p ? (JSON.parse(p.geojson) as Polygon) : null,
          overlap,
        });
      }
      alerts.push({
        auditSeq: Number(row.seq),
        at: new Date(row.at).toISOString(),
        actorId: row.actor_id,
        submittedParcelId: row.resource_id,
        surveySessionId: details.surveySessionId ?? null,
        submittedGeometry: submitted,
        conflicts,
        prevHash: row.prev_hash,
        hash: row.hash,
      });
    }
    return alerts;
  }
}
