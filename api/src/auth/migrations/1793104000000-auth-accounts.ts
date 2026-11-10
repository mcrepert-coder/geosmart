import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthAccounts1793104000000 implements MigrationInterface {
  name = 'AuthAccounts1793104000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE accounts (
        id uuid PRIMARY KEY,
        phone text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        status text NOT NULL DEFAULT 'TELEPHONE_NON_VERIFIE'
          CHECK (status IN ('TELEPHONE_NON_VERIFIE', 'EN_ATTENTE', 'ACTIF', 'REJETE', 'SUSPENDU')),
        role text CHECK (role IN ('ADMIN', 'GEOMETRE', 'TOPOGRAPHE', 'AGENT', 'CLIENT')),
        rejection_reason text,
        full_name text,
        ordre_number text,
        failed_login_attempts integer NOT NULL DEFAULT 0,
        locked_until timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE phone_verification_codes (
        phone text PRIMARY KEY,
        code_hash char(64) NOT NULL,
        expires_at timestamptz NOT NULL,
        attempts integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        token_hash char(64) PRIMARY KEY,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX refresh_tokens_account_idx ON refresh_tokens (account_id)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE refresh_tokens');
    await queryRunner.query('DROP TABLE phone_verification_codes');
    await queryRunner.query('DROP TABLE accounts');
  }
}
