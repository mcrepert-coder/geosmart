import { MigrationInterface, QueryRunner } from 'typeorm';

export class PropertyContacts1793104100000 implements MigrationInterface {
  name = 'PropertyContacts1793104100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE property_contacts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        agent_id uuid NOT NULL,
        client_name text NOT NULL CHECK (length(trim(client_name)) BETWEEN 1 AND 120),
        client_phone text NOT NULL CHECK (length(trim(client_phone)) BETWEEN 8 AND 30),
        message text NOT NULL CHECK (length(trim(message)) BETWEEN 5 AND 2000),
        created_at timestamptz NOT NULL DEFAULT now(),
        read_at timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE INDEX property_contacts_agent_idx
        ON property_contacts(agent_id, read_at, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX property_contacts_cooldown_idx
        ON property_contacts(property_id, client_phone, created_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE property_contacts');
  }
}
