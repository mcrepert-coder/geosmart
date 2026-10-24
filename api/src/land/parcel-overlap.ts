import { JsonValue } from '../audit/canonical-json';
import { ParcelPolygon } from './parcel-geometry';

// Adaptateur a brancher sur une connexion PostgreSQL dediee, hors transaction.
// Le callback et tous les autres chemins d'ecriture doivent utiliser cette connexion.
export interface ParcelTransaction {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface OverlapAudit {
  log(action: string, actorId: string, details: Record<string, JsonValue>,
    target: { type: string; id: string }): Promise<{ seq: number }>;
}

export class ParcelOverlapError extends Error {
  readonly status = 409;
  readonly code = 'PARCEL_OVERLAP';
  constructor(readonly details: {
    conflictingParcelIds: string[]; overlapAreaM2: number; alertSeq: number;
  }) {
    super('La parcelle chevauche une parcelle existante');
    this.name = 'ParcelOverlapError';
  }
}

export class InvalidParcelGeometryError extends Error {
  readonly status = 400;
  readonly code = 'INVALID_GEOMETRY';
  constructor() {
    super('Geometrie invalide');
    this.name = 'InvalidParcelGeometryError';
  }
}

interface ConflictRow { id: string; overlap_area_m2: number }

// Controle et ecriture sous le meme verrou, au niveau READ COMMITTED explicite :
// apres attente, la recherche voit les creations deja validees par les autres.
// Le verrou bloque les INSERT/UPDATE concurrents pendant cette transaction.
// Tous les chemins de creation/modification doivent toutefois faire ce controle :
// une ecriture SQL arbitraire apres le COMMIT peut encore violer RG-02.
// Les droits, versions et rejeux doivent etre controles par le service appelant.
export async function withParcelOverlapCheck<T>(
  db: ParcelTransaction,
  candidate: { id: string; geometry: ParcelPolygon; excludeParcelId?: string },
  actorId: string,
  audit: OverlapAudit,
  write: (transaction: ParcelTransaction) => Promise<T>,
  beforeCheck?: (transaction: ParcelTransaction) => Promise<
    { handled: true; value: T } | { handled: false }
  >,
): Promise<T> {
  let conflicts: ConflictRow[] = [];
  await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  try {
    await db.query('LOCK TABLE parcels IN SHARE ROW EXCLUSIVE MODE');
    // Le rejeu est recherche sous le meme verrou, avant le controle spatial :
    // la creation initiale ne doit pas etre confondue avec une parcelle voisine.
    const early = await beforeCheck?.(db);
    if (early?.handled) {
      await db.query('COMMIT');
      return early.value;
    }
    const geojson = JSON.stringify(candidate.geometry);
    const [validation] = await db.query<{ valid: boolean }>(
      `WITH candidate AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom)
       SELECT NOT ST_IsEmpty(geom) AND ST_IsValid(geom)
         AND ST_Area(geom) > 0 AS valid FROM candidate`, [geojson],
    );
    if (!validation?.valid) throw new InvalidParcelGeometryError();
    conflicts = await db.query<ConflictRow>(
      `WITH candidate AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom)
       SELECT p.id,
         ST_Area(ST_Transform(ST_Intersection(p.geometry, c.geom), 32631)) AS overlap_area_m2
       FROM parcels p CROSS JOIN candidate c
       WHERE ($2::text IS NULL OR p.id <> $2)
         AND p.geometry && c.geom AND ST_Relate(p.geometry, c.geom, 'T********')
       ORDER BY p.id`, [geojson, candidate.excludeParcelId ?? null],
    );
    if (!conflicts.length) {
      const result = await write(db);
      await db.query('COMMIT');
      return result;
    }
    await db.query('ROLLBACK');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }

  // L'annulation est terminee avant l'appel au journal, qui utilise sa propre
  // transaction. Un echec du journal remonte : aucune fausse alerte annoncee.
  const conflictingParcelIds = conflicts.map(({ id }) => id);
  const overlapAreaM2 = conflicts.reduce((area, row) => area + Number(row.overlap_area_m2), 0);
  const alert = await audit.log('PARCEL_OVERLAP_REJECTED', actorId,
    { conflictingParcelIds, overlapAreaM2 }, { type: 'parcel', id: candidate.id });
  throw new ParcelOverlapError({ conflictingParcelIds, overlapAreaM2, alertSeq: alert.seq });
}
