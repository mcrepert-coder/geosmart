import { MigrationInterface, QueryRunner } from 'typeorm';

// Examen des alertes de chevauchement par l'administrateur (maquette W3,
// bouton "Marquer comme examinee"). Le journal reste intact : l'examen est
// garde a part et lui-meme journalise.
export class LandOverlapAlertReviews1793102900000 implements MigrationInterface {
  name = 'LandOverlapAlertReviews1793102900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE overlap_alert_reviews (
        audit_seq bigint PRIMARY KEY REFERENCES audit_log (seq),
        reviewed_by uuid NOT NULL,
        reviewed_at timestamptz NOT NULL DEFAULT now(),
        note text CHECK (note IS NULL OR length(note) <= 500)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE overlap_alert_reviews');
  }
}
