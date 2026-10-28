import type { Polygon } from 'typeorm';
import { Column, Entity, PrimaryColumn } from 'typeorm';

export type LegalStatus =
  'TITRE' | 'COUTUMIER_NON_TITRE' | 'EN_LITIGE' | 'INCONNU';

export const decimalAsNumber = {
  to: (value: number) => value,
  from: (value: string | number) => Number(value),
};

@Entity({ name: 'parcels' })
export class ParcelEntity {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'current_version', type: 'integer' })
  currentVersion!: number;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Polygon',
    srid: 4326,
  })
  geom!: Polygon;

  @Column({
    name: 'area_m2',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: decimalAsNumber,
  })
  areaM2!: number;

  @Column({
    name: 'perimeter_m',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalAsNumber,
  })
  perimeterM!: number;

  @Column({ name: 'geometry_hash', type: 'char', length: 64 })
  geometryHash!: string;

  @Column({ type: 'text', nullable: true })
  locality!: string | null;

  @Column({ name: 'legal_status', type: 'text' })
  legalStatus!: LegalStatus;

  @Column({ name: 'status_source', type: 'text', nullable: true })
  statusSource!: string | null;

  @Column({ name: 'status_date', type: 'date', nullable: true })
  statusDate!: string | null;

  @Column({ type: 'boolean' })
  certified!: boolean;

  @Column({ name: 'surveyor_id', type: 'uuid' })
  surveyorId!: string;

  @Column({ name: 'survey_session_id', type: 'uuid' })
  surveySessionId!: string;

  @Column({ name: 'idempotency_key', type: 'uuid' })
  idempotencyKey!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
