import { MigrationInterface, QueryRunner } from 'typeorm';

// Journal en ajout seul (RG-10) : la base refuse toute modification ou
// suppression d'une ligne de audit_log, meme par une requete SQL directe.
// La chaine d'empreintes detecte une ligne alteree ; ce declencheur empeche
// en plus de l'alterer. Un administrateur de la base peut encore le retirer :
// ce n'est pas une protection contre lui.
export class AuditLogAppendOnly1793103000000 implements MigrationInterface {
  name = 'AuditLogAppendOnly1793103000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION audit_log_append_only() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'audit_log est en ajout seul : % refuse', TG_OP
          USING ERRCODE = 'insufficient_privilege';
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER audit_log_no_update_delete
        BEFORE UPDATE OR DELETE ON audit_log
        FOR EACH ROW EXECUTE FUNCTION audit_log_append_only()
    `);
    await queryRunner.query(`
      CREATE TRIGGER audit_log_no_truncate
        BEFORE TRUNCATE ON audit_log
        FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TRIGGER audit_log_no_truncate ON audit_log');
    await queryRunner.query(
      'DROP TRIGGER audit_log_no_update_delete ON audit_log',
    );
    await queryRunner.query('DROP FUNCTION audit_log_append_only()');
  }
}
