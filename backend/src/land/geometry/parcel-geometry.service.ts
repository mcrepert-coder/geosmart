import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Polygon } from 'typeorm';
import {
  GeometryError,
  geometryHash,
  normalizePolygon,
} from './parcel-geometry';
import { type SqlRunner, rowsOf } from '../../audit/sql-runner';

export interface CheckedGeometry {
  polygon: Polygon;
  geometryHash: string;
  areaM2: number;
  perimeterM: number;
}

export interface OverlapConflict {
  parcelId: string;
  overlapAreaM2: number;
}

// Surface commune toleree avant de parler de chevauchement, en m2.
// Hypothese 0 en attendant la decision de LGR (contracts/land.yaml).
export function overlapToleranceM2(): number {
  const raw = Number(process.env.LAND_OVERLAP_TOLERANCE_M2 ?? 0);
  return Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

const GEOM = 'ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)';

@Injectable()
export class ParcelGeometryService {
  // EF-201 : refuse avec 422 un polygone invalide. Surface et perimetre
  // sont calcules en UTM 31N (EPSG:32631), en metres.
  async check(runner: SqlRunner, input: unknown): Promise<CheckedGeometry> {
    let polygon: Polygon;
    try {
      polygon = normalizePolygon(input);
    } catch (error) {
      if (error instanceof GeometryError) throw this.invalid(error);
      throw error;
    }
    const [row] = rowsOf<{
      valid: boolean;
      reason: string;
      area: number | string;
      perimeter: number | string;
    }>(
      await runner.query(
        `SELECT ST_IsValid(g) AS valid, ST_IsValidReason(g) AS reason,
                ST_Area(ST_Transform(g, 32631)) AS area,
                ST_Perimeter(ST_Transform(g, 32631)) AS perimeter
           FROM (SELECT ${GEOM} AS g) AS input`,
        [JSON.stringify(polygon)],
      ),
    );
    if (!row?.valid) {
      const selfCrossing = /self-intersection|ring self/i.test(
        row?.reason ?? '',
      );
      throw this.invalid(
        new GeometryError(
          selfCrossing ? 'SELF_INTERSECTION' : 'INVALID_GEOMETRY',
          selfCrossing
            ? 'Le polygone se recoupe lui-meme.'
            : 'La geometrie du polygone est invalide.',
        ),
      );
    }
    return {
      polygon,
      geometryHash: geometryHash(polygon),
      areaM2: Math.round(Number(row.area) * 100) / 100,
      perimeterM: Math.round(Number(row.perimeter) * 100) / 100,
    };
  }

  // RG-02, CA-2 : seules les parcelles dont l'interieur recoupe celui de la
  // nouvelle sont en conflit. Une limite ou un sommet commun est accepte.
  async findOverlaps(
    runner: SqlRunner,
    polygon: Polygon,
    excludeParcelId?: string,
  ): Promise<OverlapConflict[]> {
    const rows = rowsOf<{ id: string; area: number | string }>(
      await runner.query(
        `SELECT p.id,
                ST_Area(ST_Transform(ST_Intersection(p.geom, input.g), 32631)) AS area
           FROM parcels p, (SELECT ${GEOM} AS g) AS input
          WHERE p.geom && input.g
            AND ST_Relate(p.geom, input.g, 'T********')
            AND ($2::text IS NULL OR p.id <> $2)
          ORDER BY p.id`,
        [JSON.stringify(polygon), excludeParcelId ?? null],
      ),
    );
    const tolerance = overlapToleranceM2();
    return rows
      .map((r) => ({
        parcelId: r.id,
        overlapAreaM2: Math.round(Number(r.area) * 100) / 100,
      }))
      .filter((c) => c.overlapAreaM2 > tolerance);
  }

  // Erreur 409 du contrat : un conflit geometrique, jamais une accusation.
  overlapError(
    conflicts: OverlapConflict[],
    auditSeq?: number,
  ): ConflictException {
    return new ConflictException({
      code: 'PARCEL_OVERLAP',
      message:
        'Cette parcelle recouvre une parcelle deja enregistree. Verifiez les bornes avec le geometre.',
      details: { conflicts, ...(auditSeq ? { auditSeq } : {}) },
    });
  }

  private invalid(error: GeometryError): UnprocessableEntityException {
    return new UnprocessableEntityException({
      code: 'INVALID_GEOMETRY',
      message: error.message,
      details: { reason: error.reason },
    });
  }
}
