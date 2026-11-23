import { MigrationInterface, QueryRunner } from 'typeorm';

export class SyncItems1793105000000 implements MigrationInterface {
  name = 'SyncItems1793105000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE sync_items (
        id uuid PRIMARY KEY,
        client_id uuid NOT NULL,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        entity_type text NOT NULL,
        action text NOT NULL,
        payload jsonb NOT NULL,
        payload_hash char(64) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (account_id, client_id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX sync_items_client_idx ON sync_items (client_id)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE sync_items');
  }
}
