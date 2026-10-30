import { MigrationInterface, QueryRunner } from 'typeorm';

// Codes de commune du pilote (GO1 a GO7, AG1 a AG6, decision de LGR, #24) :
// l'identifiant accepte maintenant les chiffres. Les identifiants deja
// attribues restent valides. Nouvelle migration, car la premiere tourne deja
// dans dev.
export class LandParcelIdFormat1793103100000 implements MigrationInterface {
  name = 'LandParcelIdFormat1793103100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE parcels
        DROP CONSTRAINT parcels_id_check,
        ADD CONSTRAINT parcels_id_check
          CHECK (id ~ '^TG-[A-Z0-9]{3}-[0-9]{5,6}$')
    `);
  }

  // Echoue s'il existe deja un identifiant avec un chiffre dans la commune :
  // rien n'est efface.
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE parcels
        DROP CONSTRAINT parcels_id_check,
        ADD CONSTRAINT parcels_id_check
          CHECK (id ~ '^TG-[A-Z]{3}-[0-9]{5,6}$')
    `);
  }
}
