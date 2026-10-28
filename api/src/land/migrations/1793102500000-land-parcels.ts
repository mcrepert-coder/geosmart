import { MigrationInterface, QueryRunner } from 'typeorm';

// Geometries en WGS84 (EPSG:4326). Surfaces et perimetres sont calcules
// en UTM 31N (EPSG:32631) par le service avant enregistrement.
export class LandParcels1793102500000 implements MigrationInterface {
  name = 'LandParcels1793102500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS postgis');
    await queryRunner.query('CREATE SEQUENCE parcel_number_seq');
    await queryRunner.query(`
      CREATE TABLE parcels (
        id text PRIMARY KEY CHECK (id ~ '^GS-[0-9]{4}-[0-9]{6}$'),
        current_version integer NOT NULL DEFAULT 1 CHECK (current_version >= 1),
        geom geometry(Polygon, 4326) NOT NULL,
        area_m2 numeric(14, 2) NOT NULL CHECK (area_m2 > 0),
        perimeter_m numeric(12, 2) NOT NULL CHECK (perimeter_m > 0),
        geometry_hash char(64) NOT NULL,
        locality text,
        legal_status text NOT NULL DEFAULT 'INCONNU'
          CHECK (legal_status IN ('TITRE', 'COUTUMIER_NON_TITRE', 'EN_LITIGE', 'INCONNU')),
        status_source text,
        status_date date,
        certified boolean NOT NULL DEFAULT false,
        surveyor_id uuid NOT NULL,
        survey_session_id uuid NOT NULL,
        idempotency_key uuid NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT parcels_geom_valid CHECK (ST_IsValid(geom)),
        CONSTRAINT parcels_status_sourced CHECK (
          legal_status = 'INCONNU' OR (status_source IS NOT NULL AND status_date IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(
      'CREATE INDEX parcels_geom_idx ON parcels USING gist (geom)',
    );
    await queryRunner.query(`
      CREATE TABLE parcel_versions (
        parcel_id text NOT NULL REFERENCES parcels (id),
        version integer NOT NULL CHECK (version >= 1),
        geom geometry(Polygon, 4326) NOT NULL,
        area_m2 numeric(14, 2) NOT NULL,
        perimeter_m numeric(12, 2) NOT NULL,
        geometry_hash char(64) NOT NULL,
        boundaries jsonb NOT NULL,
        reason text,
        author_id uuid NOT NULL,
        -- EF-208 : voisins presents et date du bornage contradictoire.
        bornage jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (parcel_id, version),
        CONSTRAINT parcel_versions_geom_valid CHECK (ST_IsValid(geom)),
        CONSTRAINT parcel_versions_boundaries_array CHECK (
          jsonb_typeof(boundaries) = 'array' AND jsonb_array_length(boundaries) >= 3
        )
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE parcel_versions');
    await queryRunner.query('DROP TABLE parcels');
    await queryRunner.query('DROP SEQUENCE parcel_number_seq');
  }
}
