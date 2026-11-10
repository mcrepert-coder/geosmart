import { MigrationInterface, QueryRunner } from 'typeorm';

export class Listings1793103200000 implements MigrationInterface {
  name = 'Listings1793103200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE properties (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        parcel_id text NOT NULL REFERENCES parcels(id) ON DELETE RESTRICT,
        agent_id uuid NOT NULL,
        type text NOT NULL CHECK (type IN ('TERRAIN', 'MAISON')),
        transaction text NOT NULL CHECK (transaction IN ('VENTE', 'LOCATION')),
        title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
        description text NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
        price bigint NOT NULL CHECK (price >= 0),
        currency text NOT NULL DEFAULT 'XOF' CHECK (currency = 'XOF'),
        price_period text CHECK (price_period IN ('MOIS', 'AN')),
        zone text CHECK (zone IS NULL OR length(zone) <= 120),
        status text NOT NULL DEFAULT 'BROUILLON'
          CHECK (status IN ('BROUILLON', 'PUBLIE', 'RETIRE')),
        agent_certified boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        published_at timestamptz,
        CONSTRAINT properties_price_period_matches_transaction CHECK (
          (transaction = 'LOCATION' AND price_period IS NOT NULL)
          OR (transaction = 'VENTE' AND price_period IS NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX properties_public_search_idx
        ON properties(status, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX properties_agent_idx ON properties(agent_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE TABLE property_photos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
        file_data bytea NOT NULL CHECK (octet_length(file_data) BETWEEN 1 AND 5242880),
        is_primary boolean NOT NULL DEFAULT false,
        uploaded_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX property_photos_one_primary_idx
        ON property_photos(property_id) WHERE is_primary
    `);
    await queryRunner.query(`
      CREATE INDEX property_photos_order_idx ON property_photos(property_id, uploaded_at, id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE property_photos');
    await queryRunner.query('DROP TABLE properties');
  }
}
