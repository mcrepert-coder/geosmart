// Donnees fictives pour les tests du stockage foncier (aucune donnee reelle).
import { randomUUID } from 'crypto';
import { LandTestDb } from './land-test-db';

export const SQUARE =
  'SRID=4326;POLYGON((1.2123 6.1724,1.2126 6.1724,1.2126 6.1721,1.2123 6.1721,1.2123 6.1724))';
export const HASH = 'a'.repeat(64);
export const NOTICE = 'Ne vaut pas titre foncier';

const VERTICES = [
  [1.2123, 6.1724],
  [1.2126, 6.1724],
  [1.2126, 6.1721],
  [1.2123, 6.1721],
].map(([lon, lat], i) => ({
  number: `B${i + 1}`,
  lon,
  lat,
  source: {
    instrument: 'UM982',
    fixMode: 'RTK_FIXED',
    pdop: 1.4,
    satellites: 21,
    measuredAt: '2026-10-24T08:12:00Z',
  },
}));

let counter = 0;
export function uniqueId(prefix: string): string {
  counter += 1;
  return `${prefix}-${process.pid}-${counter}`;
}

export interface ParcelRow {
  id: string;
  author_id: string;
  client_id: string;
  creation_payload: unknown;
  creation_response: unknown;
  project_id: string | null;
  label: string | null;
  legal_status: string;
  version: number;
  geometry: string;
  geometry_hash: string;
  vertices: unknown;
  area_m2: number | string;
  perimeter_m: number | string;
  in_conflict: boolean;
  created_at: string;
  updated_at: string;
}

export interface VersionRow {
  parcel_id: string;
  version: number;
  project_id: string | null;
  label: string | null;
  legal_status: string;
  geometry: string;
  geometry_hash: string;
  vertices: unknown;
  area_m2: number | string;
  perimeter_m: number | string;
  in_conflict: boolean;
  changed_by: string;
  changed_at: string;
  reason: string | null;
}

export function parcelRow(overrides: Partial<ParcelRow> = {}): ParcelRow {
  const id = overrides.id ?? uniqueId('PRC-TEST');
  const clientId = overrides.client_id ?? randomUUID();
  return {
    id,
    author_id: 'usr_geo_test',
    client_id: clientId,
    creation_payload: { clientId, legalStatus: 'COUTUMIER_NON_TITRE', vertices: VERTICES },
    creation_response: { id, version: 1, certified: true },
    project_id: null,
    label: 'Lot fictif',
    legal_status: 'COUTUMIER_NON_TITRE',
    version: 1,
    geometry: SQUARE,
    geometry_hash: HASH,
    vertices: VERTICES,
    area_m2: 1240.37,
    perimeter_m: 141.22,
    in_conflict: false,
    created_at: '2026-10-24T09:00:00.000Z',
    updated_at: '2026-10-24T09:00:00.000Z',
    ...overrides,
  };
}

export function versionRow(parcel: ParcelRow, overrides: Partial<VersionRow> = {}): VersionRow {
  return {
    parcel_id: parcel.id,
    version: parcel.version,
    project_id: parcel.project_id,
    label: parcel.label,
    legal_status: parcel.legal_status,
    geometry: parcel.geometry,
    geometry_hash: parcel.geometry_hash,
    vertices: parcel.vertices,
    area_m2: parcel.area_m2,
    perimeter_m: parcel.perimeter_m,
    in_conflict: parcel.in_conflict,
    changed_by: parcel.author_id,
    changed_at: parcel.updated_at,
    reason: null,
    ...overrides,
  };
}

// Les mesures passent en texte pour pouvoir transmettre NaN et Infinity a float8.
export function insertParcel(db: LandTestDb, row: ParcelRow): Promise<unknown> {
  return db.query(
    `INSERT INTO parcels (id, author_id, client_id, creation_payload, creation_response,
       project_id, label, legal_status, version, geometry, geometry_hash, vertices,
       area_m2, perimeter_m, in_conflict, created_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10::geometry, $11,
       $12::jsonb, $13::float8, $14::float8, $15, $16, $17)`,
    [
      row.id,
      row.author_id,
      row.client_id,
      JSON.stringify(row.creation_payload),
      JSON.stringify(row.creation_response),
      row.project_id,
      row.label,
      row.legal_status,
      row.version,
      row.geometry,
      row.geometry_hash,
      JSON.stringify(row.vertices),
      String(row.area_m2),
      String(row.perimeter_m),
      row.in_conflict,
      row.created_at,
      row.updated_at,
    ],
  );
}

export function insertVersion(db: LandTestDb, row: VersionRow): Promise<unknown> {
  return db.query(
    `INSERT INTO parcel_versions (parcel_id, version, project_id, label, legal_status,
       geometry, geometry_hash, vertices, area_m2, perimeter_m, in_conflict,
       changed_by, changed_at, reason)
     VALUES ($1, $2, $3, $4, $5, $6::geometry, $7, $8::jsonb, $9::float8, $10::float8,
       $11, $12, $13, $14)`,
    [
      row.parcel_id,
      row.version,
      row.project_id,
      row.label,
      row.legal_status,
      row.geometry,
      row.geometry_hash,
      JSON.stringify(row.vertices),
      String(row.area_m2),
      String(row.perimeter_m),
      row.in_conflict,
      row.changed_by,
      row.changed_at,
      row.reason,
    ],
  );
}

// Parcelle et version 1 ecrites ensemble ; l'appelant gere la transaction.
export async function insertParcelWithVersion(
  db: LandTestDb,
  overrides: Partial<ParcelRow> = {},
): Promise<ParcelRow> {
  const parcel = parcelRow(overrides);
  await insertParcel(db, parcel);
  await insertVersion(db, versionRow(parcel));
  return parcel;
}

export function insertAttestation(
  db: LandTestDb,
  values: {
    number?: string;
    parcelId: string;
    version: number;
    notice?: string;
    surveyorName?: string;
  },
): Promise<unknown> {
  const columns = ['number', 'parcel_id', 'parcel_version', 'surveyor_id', 'surveyor_name',
    'issued_at', 'pdf_storage_key'];
  const params: unknown[] = [
    values.number ?? uniqueId('ATL-TEST'),
    values.parcelId,
    values.version,
    'usr_geo_test',
    values.surveyorName ?? 'Geometre fictif',
    '2026-10-24T10:00:00.000Z',
    'test/attestation.pdf',
  ];
  if (values.notice !== undefined) {
    columns.push('notice');
    params.push(values.notice);
  }
  const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
  return db.query(
    `INSERT INTO attestations (${columns.join(', ')}) VALUES (${placeholders})`,
    params,
  );
}
