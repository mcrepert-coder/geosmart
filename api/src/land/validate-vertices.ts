// Controles sans base (EF-201, RG-01, RG-04).
// ST_IsValid et les chevauchements restent des controles PostGIS obligatoires.
export interface Vertex {
  number: string;
  lon: number;
  lat: number;
  surveyPointId?: string;
  source: {
    instrument: string;
    fixMode: 'RTK_FIXED';
    pdop: number;
    satellites: number;
    hAccuracyM?: number;
    measuredAt: string;
  };
}

export class LandValidationError extends Error {
  constructor(
    readonly code: 'VALIDATION_ERROR' | 'TOO_FEW_VERTICES' | 'VERTEX_NOT_RTK_FIXED',
    readonly status: 400 | 422,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'LandValidationError';
  }
}

function invalid(path: string): never {
  throw new LandValidationError('VALIDATION_ERROR', 400, `Champ invalide : ${path}`, { path });
}

function object(value: unknown, allowed: string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowed.includes(key))) invalid(path);
  return record;
}

function text(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) invalid(path);
}

function finite(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(path);
}

function timestamp(value: unknown, path: string): void {
  if (typeof value !== 'string') invalid(path);
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) invalid(path);
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m < 1 || m > 12 || d < 1 || d > days[m - 1] || Number(hour) > 23 ||
      Number(minute) > 59 || Number(second) > 59 || Number(offsetHour ?? 0) > 23 ||
      Number(offsetMinute ?? 0) > 59) invalid(path);
}

// Renvoie une copie validee ; aucune fermeture, projection ou correction silencieuse.
export function validateVertices(input: unknown): Vertex[] {
  if (!Array.isArray(input)) invalid('vertices');
  if (input.length < 3) {
    throw new LandValidationError('TOO_FEW_VERTICES', 400, 'Il faut au moins 3 sommets distincts');
  }
  const coordinates = new Set<string>();
  const result: Vertex[] = [];
  const notFixed: string[] = [];
  for (let i = 0; i < input.length; i++) {
    const path = `vertices[${i}]`;
    const vertex = object(input[i], ['number', 'lon', 'lat', 'surveyPointId', 'source'], path);
    text(vertex.number, `${path}.number`);
    finite(vertex.lon, `${path}.lon`);
    finite(vertex.lat, `${path}.lat`);
    if (vertex.lon < -180 || vertex.lon > 180) invalid(`${path}.lon`);
    if (vertex.lat < -90 || vertex.lat > 90) invalid(`${path}.lat`);
    if (vertex.surveyPointId !== undefined) text(vertex.surveyPointId, `${path}.surveyPointId`);
    const key = `${vertex.lon},${vertex.lat}`;
    if (coordinates.has(key)) invalid(`${path}.lon/lat (sommet repete)`);
    coordinates.add(key);
    const source = object(vertex.source,
      ['instrument', 'fixMode', 'pdop', 'satellites', 'hAccuracyM', 'measuredAt'], `${path}.source`);
    text(source.instrument, `${path}.source.instrument`);
    if (!['RTK_FIXED', 'RTK_FLOAT', 'AUTONOME'].includes(source.fixMode as string)) {
      invalid(`${path}.source.fixMode`);
    }
    finite(source.pdop, `${path}.source.pdop`);
    finite(source.satellites, `${path}.source.satellites`);
    if (!Number.isInteger(source.satellites)) invalid(`${path}.source.satellites`);
    if (source.hAccuracyM !== undefined) finite(source.hAccuracyM, `${path}.source.hAccuracyM`);
    timestamp(source.measuredAt, `${path}.source.measuredAt`);
    if (source.fixMode !== 'RTK_FIXED') notFixed.push(vertex.number);
    result.push(structuredClone(vertex) as unknown as Vertex);
  }
  if (notFixed.length) {
    throw new LandValidationError('VERTEX_NOT_RTK_FIXED', 422,
      'Les bornes doivent etre en RTK Fixed', { vertices: notFixed });
  }
  return result;
}
