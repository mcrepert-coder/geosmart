// Serialisation deterministe pour les empreintes (contrat : CanonicalJson, RFC 8785).
// Cles triees recursivement, tableaux dans l'ordre, nombres finis seulement.

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export class CanonicalJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalJsonError';
  }
}

export function canonicalize(value: unknown): string {
  return serialize(value, '$');
}

function serialize(value: unknown, path: string): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new CanonicalJsonError(`Nombre non fini en ${path}`);
      }
      // La serialisation des nombres de JSON.stringify est celle exigee par JCS.
      return JSON.stringify(value);
    case 'string':
      if (value.includes('\u0000')) {
        // PostgreSQL jsonb refuse ce caractere : le hash ne pourrait plus etre recalcule.
        throw new CanonicalJsonError(`Caractere nul interdit en ${path}`);
      }
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new CanonicalJsonError(`Type ${typeof value} interdit en ${path}`);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item, i) => serialize(item, `${path}[${i}]`)).join(',')}]`;
  }
  // Objet simple : prototype nul ou Object.prototype, quel que soit le contexte
  // d'execution (structuredClone peut produire des objets d'un autre contexte).
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && Object.getPrototypeOf(proto) !== null) {
    throw new CanonicalJsonError(`Objet non simple interdit en ${path}`);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort(compareUtf16);
  const parts = keys.map((key) => {
    if (record[key] === undefined) {
      throw new CanonicalJsonError(`Valeur absente pour ${path}.${key}`);
    }
    return `${JSON.stringify(key)}:${serialize(record[key], `${path}.${key}`)}`;
  });
  return `{${parts.join(',')}}`;
}

// JCS trie les cles par unites de code UTF-16, comme la comparaison native de chaines.
function compareUtf16(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
