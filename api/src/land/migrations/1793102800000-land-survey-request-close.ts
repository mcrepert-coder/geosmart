import { MigrationInterface, QueryRunner } from 'typeorm';

// Decision 5 de LGR (#24) : TERMINEE par le geometre, ANNULEE par l'agent tant
// que la demande est ouverte. Une demande annulee n'a donc pas de geometre :
// l'ancienne contrainte (OUVERTE si et seulement si pas de geometre) est
// remplacee. Nouvelle migration, car la precedente tourne deja dans dev.
export class LandSurveyRequestClose1793102800000 implements MigrationInterface {
  name = 'LandSurveyRequestClose1793102800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE survey_requests ADD COLUMN closed_at timestamptz',
    );
    await queryRunner.query(
      'ALTER TABLE survey_requests DROP CONSTRAINT survey_requests_taken_has_surveyor',
    );
    await queryRunner.query(`
      ALTER TABLE survey_requests ADD CONSTRAINT survey_requests_surveyor_by_state CHECK (
        (state IN ('PRISE', 'TERMINEE') AND surveyor_id IS NOT NULL)
        OR (state = 'OUVERTE' AND surveyor_id IS NULL)
        OR state = 'ANNULEE'
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE survey_requests DROP CONSTRAINT survey_requests_surveyor_by_state',
    );
    await queryRunner.query(`
      ALTER TABLE survey_requests ADD CONSTRAINT survey_requests_taken_has_surveyor CHECK (
        (state = 'OUVERTE') = (surveyor_id IS NULL)
      )
    `);
    await queryRunner.query(
      'ALTER TABLE survey_requests DROP COLUMN closed_at',
    );
  }
}
