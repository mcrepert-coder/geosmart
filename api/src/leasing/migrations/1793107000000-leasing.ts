import { MigrationInterface, QueryRunner } from 'typeorm';

export class Leasing1793107000000 implements MigrationInterface {
  name = 'Leasing1793107000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Biens simules : a remplacer par le module listings de Marrich
    // (GET /properties/{propertyId}) des qu'il est livre.
    await queryRunner.query(`
      CREATE TABLE simulated_properties (
        id uuid PRIMARY KEY,
        agent_id uuid NOT NULL REFERENCES accounts(id),
        status text NOT NULL DEFAULT 'PUBLIE' CHECK (status IN ('PUBLIE', 'BROUILLON', 'RETIRE')),
        title text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE visits (
        id uuid PRIMARY KEY,
        property_id uuid NOT NULL,
        requester_id uuid NOT NULL REFERENCES accounts(id),
        status text NOT NULL DEFAULT 'DEMANDEE'
          CHECK (status IN ('DEMANDEE', 'CONFIRMEE', 'FAITE', 'ANNULEE')),
        scheduled_at timestamptz,
        reminder_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX visits_requester_idx ON visits (requester_id)',
    );
    await queryRunner.query(`
      CREATE TABLE leases (
        id uuid PRIMARY KEY,
        property_id uuid NOT NULL,
        agent_id uuid NOT NULL REFERENCES accounts(id),
        tenant_account_id uuid REFERENCES accounts(id),
        tenant_name text,
        monthly_rent integer NOT NULL CHECK (monthly_rent >= 0),
        start_date date NOT NULL,
        months integer NOT NULL CHECK (months BETWEEN 1 AND 120),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE lease_rents (
        id uuid PRIMARY KEY,
        lease_id uuid NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
        due_date date NOT NULL,
        amount integer NOT NULL CHECK (amount >= 0),
        paid_at timestamptz,
        UNIQUE (lease_id, due_date)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE inspections (
        id uuid PRIMARY KEY,
        lease_id uuid NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
        account_id uuid NOT NULL REFERENCES accounts(id),
        client_id uuid NOT NULL,
        kind text NOT NULL CHECK (kind IN ('ENTRY', 'EXIT')),
        notes text,
        signature bytea NOT NULL,
        payload_hash char(64) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (account_id, client_id),
        UNIQUE (lease_id, kind)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE inspection_photos (
        id uuid PRIMARY KEY,
        inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        taken_at timestamptz NOT NULL,
        size_bytes integer NOT NULL,
        data bytea NOT NULL
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE inspection_photos');
    await queryRunner.query('DROP TABLE inspections');
    await queryRunner.query('DROP TABLE lease_rents');
    await queryRunner.query('DROP TABLE leases');
    await queryRunner.query('DROP TABLE visits');
    await queryRunner.query('DROP TABLE simulated_properties');
  }
}
