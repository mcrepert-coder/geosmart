import { MigrationInterface, QueryRunner } from 'typeorm';

// EF-305 : un rappel de visite n'est envoye qu'une fois.
export class VisitReminderSent1793109000000 implements MigrationInterface {
  name = 'VisitReminderSent1793109000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE visits ADD COLUMN reminder_sent_at timestamptz',
    );
    await queryRunner.query(
      `CREATE INDEX visits_reminder_due_idx ON visits (reminder_at)
         WHERE reminder_sent_at IS NULL AND status = 'CONFIRMEE'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX visits_reminder_due_idx');
    await queryRunner.query('ALTER TABLE visits DROP COLUMN reminder_sent_at');
  }
}
