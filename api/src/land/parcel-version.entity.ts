import type { Polygon } from 'typeorm';
import { Column, Entity, PrimaryColumn } from 'typeorm';
import { decimalAsNumber } from './parcel.entity';

// Borne telle que recue du mobile (contracts/survey.md, SurveyPoint).
export interface ParcelBoundary {
  pointNumber: number;
  surveyPointId: string;
  name?: string;
  fixQuality: 'FIXED' | 'FLOAT' | 'AUTONOME' | 'INVALIDE';
  pdop?: number;
  satellitesCount?: number;
  instrument?: string;
  recordedAt?: string;
}

// Une ligne par version : une version n'est jamais modifiee apres insertion.
@Entity({ name: 'parcel_versions' })
export class ParcelVersionEntity {
  @PrimaryColumn({ name: 'parcel_id', type: 'text' })
  parcelId!: string;

  @PrimaryColumn({ type: 'integer' })
  version!: number;

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

  @Column({ type: 'jsonb' })
  boundaries!: ParcelBoundary[];

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
