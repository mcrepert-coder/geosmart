import { MigrationInterface, QueryRunner } from 'typeorm';

// Une attestation par version de parcelle : le PDF est garde tel qu'emis,
// avec son empreinte, pour pouvoir le verifier plus tard.
export class LandAttestations1793102600000 implements MigrationInterface {
  name = 'LandAttestations1793102600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SEQUENCE attestation_number_seq');
    await queryRunner.query(`
      CREATE TABLE attestations (
        number text PRIMARY KEY CHECK (number ~ '^AT-[0-9]{4}-[0-9]{6}$'),
        parcel_id text NOT NULL,
        parcel_version integer NOT NULL,
        geometry_hash char(64) NOT NULL,
        document_hash char(64) NOT NULL UNIQUE,
        pdf bytea NOT NULL,
        surveyor_id uuid NOT NULL,
        issued_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (parcel_id, parcel_version),
        FOREIGN KEY (parcel_id, parcel_version)
          REFERENCES parcel_versions (parcel_id, version)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE attestations');
    await queryRunner.query('DROP SEQUENCE attestation_number_seq');
  }
}
