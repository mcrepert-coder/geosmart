import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { rowsOf } from '../audit/sql-runner';
import { BCRYPT_ROUNDS, normalizePhone } from './accounts.service';

async function bootstrapAdmin(): Promise<void> {
  const phoneInput = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  const databaseUrl = process.env.DATABASE_URL;

  if (!phoneInput || !password || !databaseUrl) {
    throw new Error(
      'ADMIN_PHONE, ADMIN_INITIAL_PASSWORD et DATABASE_URL sont requis.',
    );
  }

  const phone = normalizePhone(phoneInput);
  if (!/^\+?[0-9]{8,15}$/.test(phone)) {
    throw new Error('ADMIN_PHONE doit etre un numero international valide.');
  }
  if (password.length < 12) {
    throw new Error(
      'ADMIN_INITIAL_PASSWORD doit contenir au moins 12 caracteres.',
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const connectionUrl = new URL(databaseUrl);
  connectionUrl.searchParams.delete('sslmode');
  const caPath = process.env.AIVEN_CA_CERT_PATH;
  const ssl = caPath
    ? { ca: readFileSync(caPath), rejectUnauthorized: false }
    : { rejectUnauthorized: false };

  const dataSource = new DataSource({
    type: 'postgres',
    url: connectionUrl.toString(),
    ssl,
    synchronize: false,
  });
  await dataSource.initialize();
  const transaction = dataSource.createQueryRunner();

  try {
    await transaction.startTransaction();
    await transaction.query('SELECT pg_advisory_xact_lock(82633845, 1)');

    const existingAdmin = rowsOf<{ id: string }>(
      await transaction.query(
        "SELECT id FROM accounts WHERE role = 'ADMIN' LIMIT 1",
      ),
    );
    if (existingAdmin.length) {
      throw new Error(
        'Un compte administrateur existe deja ; le bootstrap est reserve a la premiere initialisation.',
      );
    }

    const existingAccount = rowsOf<{ id: string }>(
      await transaction.query(
        'SELECT id FROM accounts WHERE phone = $1 LIMIT 1',
        [phone],
      ),
    );
    if (existingAccount.length) {
      throw new Error(
        'Ce numero est deja associe a un compte ; le bootstrap ne modifie aucun compte existant.',
      );
    }

    await transaction.query(
      `INSERT INTO accounts (id, phone, password_hash, status, role)
       VALUES ($1, $2, $3, 'ACTIF', 'ADMIN')`,
      [randomUUID(), phone, passwordHash],
    );
    await transaction.commitTransaction();
  } catch (error) {
    try {
      if (transaction.isTransactionActive) {
        await transaction.rollbackTransaction();
      }
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'Le bootstrap a echoue et la transaction n a pas pu etre annulee.',
      );
    }
    throw error;
  } finally {
    await transaction.release();
    await dataSource.destroy();
  }
}

bootstrapAdmin()
  .then(() => {
    console.info(
      'Compte Super Admin cree. Connectez-vous sur /admin/connexion.',
    );
  })
  .catch((error: unknown) => {
    console.error(
      `Echec du bootstrap Super Admin : ${error instanceof Error ? error.message : 'erreur inconnue'}`,
    );
    process.exitCode = 1;
  });
