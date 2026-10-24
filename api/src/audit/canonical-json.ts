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
  return serialize(value, '$', new Set<object>());
}

function validateString(value: string, path: string): void {
  if (value.includes('\u0000')) {
    throw new CanonicalJsonError(`Caractere nul interdit en ${path}`);
  }
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new CanonicalJsonError(`Unicode invalide en ${path}`);
      }
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new CanonicalJsonError(`Unicode invalide en ${path}`);
    }
  }
}

function serialize(value: unknown, path: string, ancestors: Set<object>): string {
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
      // PostgreSQL jsonb refuse le caractere nul ; JCS refuse les surrogates isoles.
      validateString(value, path);
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new CanonicalJsonError(`Type ${typeof value} interdit en ${path}`);
  }

  const object = value as object;
  if (ancestors.has(object)) {
    throw new CanonicalJsonError(`Reference cyclique en ${path}`);
  }
  ancestors.add(object);
  try {
    if (Array.isArray(value)) {
      const parts: string[] = [];
      for (let i = 0; i < value.length; i++) {
        if (!Object.prototype.hasOwnProperty.call(value, i)) {
          throw new CanonicalJsonError(`Element absent en ${path}[${i}]`);
        }
        parts.push(serialize(value[i], `${path}[${i}]`, ancestors));
      }
      return `[${parts.join(',')}]`;
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
      validateString(key, path);
      if (record[key] === undefined) {
        throw new CanonicalJsonError(`Valeur absente pour ${path}.${key}`);
      }
      return `${JSON.stringify(key)}:${serialize(record[key], `${path}.${key}`, ancestors)}`;
    });
    return `{${parts.join(',')}}`;
  } finally {
    ancestors.delete(object);
  }
}

// JCS trie les cles par unites de code UTF-16, comme la comparaison native de chaines.
function compareUtf16(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
