// Ce dont les services ont besoin pour parler a PostgreSQL : un EntityManager
// TypeORM (dans ou hors transaction) convient, un client PGlite aussi.
export interface SqlRunner {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

export interface TransactionRunner {
  transaction<T>(work: (tx: SqlRunner) => Promise<T>): Promise<T>;
}

// TypeORM renvoie un tableau de lignes, PGlite un objet { rows }.
export function rowsOf<T>(result: unknown): T[] {
  if (
    Array.isArray(result) &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0] as T[];
  }
  if (Array.isArray(result)) return result as T[];
  return (result as { rows?: T[] } | null)?.rows ?? [];
}
