import { MigrationInterface, QueryRunner } from 'typeorm';

// EF-207 : un agent demande un leve, un geometre le prend.
// Les etats TERMINEE et ANNULEE existent mais leurs transitions attendent
// la decision de LGR.
export class LandSurveyRequests1793102700000 implements MigrationInterface {
  name = 'LandSurveyRequests1793102700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE survey_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        state text NOT NULL DEFAULT 'OUVERTE'
          CHECK (state IN ('OUVERTE', 'PRISE', 'TERMINEE', 'ANNULEE')),
        agent_id uuid NOT NULL,
        surveyor_id uuid,
        parcel_id text REFERENCES parcels (id),
        locality text NOT NULL CHECK (length(locality) BETWEEN 1 AND 120),
        description text NOT NULL CHECK (length(description) BETWEEN 1 AND 1000),
        approx_location geometry(Point, 4326),
        created_at timestamptz NOT NULL DEFAULT now(),
        taken_at timestamptz,
        CONSTRAINT survey_requests_taken_has_surveyor CHECK (
          (state = 'OUVERTE') = (surveyor_id IS NULL)
        )
      )
    `);
    await queryRunner.query(
      'CREATE INDEX survey_requests_state_idx ON survey_requests (state, created_at)',
    );
    await queryRunner.query(
      'CREATE INDEX survey_requests_agent_idx ON survey_requests (agent_id)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE survey_requests');
  }
}
