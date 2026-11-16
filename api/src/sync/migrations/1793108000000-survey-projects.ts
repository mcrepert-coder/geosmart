import { MigrationInterface, QueryRunner } from 'typeorm';

// EF-109 et CA-7 : chantiers de leve et topographes assignes. POST /sync
// refuse les points d'un chantier non assigne au topographe, ou clos.
export class SurveyProjects1793108000000 implements MigrationInterface {
  name = 'SurveyProjects1793108000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE survey_projects (
        id uuid PRIMARY KEY,
        title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
        status text NOT NULL DEFAULT 'OUVERT' CHECK (status IN ('OUVERT', 'CLOS')),
        created_by uuid NOT NULL REFERENCES accounts(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        closed_at timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE TABLE survey_project_assignments (
        project_id uuid NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
        topographe_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        assigned_by uuid NOT NULL REFERENCES accounts(id),
        assigned_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_id, topographe_id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX survey_project_assignments_topo_idx ON survey_project_assignments (topographe_id)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE survey_project_assignments');
    await queryRunner.query('DROP TABLE survey_projects');
  }
}
