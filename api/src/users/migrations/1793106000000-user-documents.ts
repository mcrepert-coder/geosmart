import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserDocuments1793106000000 implements MigrationInterface {
  name = 'UserDocuments1793106000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE account_documents (
        id uuid PRIMARY KEY,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        category text NOT NULL
          CHECK (category IN ('IDENTITY', 'PROFESSIONAL_CARD', 'APPROVAL', 'RCCM', 'ORDER_REGISTRATION')),
        content_type text NOT NULL
          CHECK (content_type IN ('image/jpeg', 'image/png', 'application/pdf')),
        size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
        content bytea NOT NULL,
        uploaded_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX account_documents_account_idx ON account_documents (account_id)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE account_documents');
  }
}
