import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditLog1793102400000 implements MigrationInterface {
  name = 'AuditLog1793102400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE audit_log (
        seq bigint PRIMARY KEY,
        at timestamptz NOT NULL,
        actor_id uuid,
        actor_role text,
        action text NOT NULL,
        resource_type text NOT NULL,
        resource_id text,
        result text NOT NULL CHECK (result IN ('SUCCESS', 'REJECTED', 'DENIED')),
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        prev_hash char(64) NOT NULL,
        hash char(64) NOT NULL UNIQUE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX audit_log_resource_idx ON audit_log (resource_type, resource_id)',
    );
    await queryRunner.query('CREATE INDEX audit_log_at_idx ON audit_log (at)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE audit_log');
  }
}
