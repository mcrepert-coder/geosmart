import { LandValidationError, validateVertices } from '../../src/land/validate-vertices';

function vertices() {
  return [[1.2, 6.1], [1.3, 6.1], [1.3, 6.2]].map(([lon, lat], i) => ({
    number: `B${i + 1}`, lon, lat,
    source: { instrument: 'UM982', fixMode: 'RTK_FIXED', pdop: 1.4,
      satellites: 21, measuredAt: '2026-10-24T08:12:00Z' },
  }));
}

describe('validateVertices', () => {
  it('accepte les bornes et copie les sources sans fermer le contour', () => {
    const input = vertices();
    const result = validateVertices(input);
    expect(result).toEqual(input);
    input[0].source.instrument = 'autre';
    expect(result[0].source.instrument).toBe('UM982');
  });

  it('refuse moins de trois sommets', () => {
    expect(() => validateVertices(vertices().slice(0, 2))).toThrow(LandValidationError);
  });

  it.each([NaN, Infinity, 181, -181, '1.2', null])('refuse une longitude invalide (%s)', (lon) => {
    const input = vertices();
    (input[0] as unknown as Record<string, unknown>).lon = lon;
    expect(() => validateVertices(input)).toThrow(LandValidationError);
  });

  it.each([91, -91, NaN])('refuse une latitude invalide (%s)', (lat) => {
    const input = vertices(); input[0].lat = lat;
    expect(() => validateVertices(input)).toThrow(LandValidationError);
  });

  it('refuse un sommet repete, y compris la fermeture fournie par le client', () => {
    const input = vertices(); input.push(structuredClone(input[0]));
    expect(() => validateVertices(input)).toThrow(LandValidationError);
  });

  it.each(['RTK_FLOAT', 'AUTONOME'])('refuse %s avec le code 422 du contrat', (mode) => {
    const input = vertices(); input[1].source.fixMode = mode;
    try { validateVertices(input); throw new Error('Refus attendu'); }
    catch (error) {
      expect(error).toMatchObject({ code: 'VERTEX_NOT_RTK_FIXED', status: 422,
        details: { vertices: ['B2'] } });
    }
  });

  it.each(['inconnu', '', 'RTK_fixed'])('refuse un mode inconnu (%s)', (mode) => {
    const input = vertices(); input[0].source.fixMode = mode;
    expect(() => validateVertices(input)).toThrow(LandValidationError);
  });

  it.each(['2026-02-30T08:00:00Z', '2026-10-24', '2026-10-24T25:00:00Z', 'invalide'])
  ('refuse un horodatage invalide (%s)', (date) => {
    const input = vertices(); input[0].source.measuredAt = date;
    expect(() => validateVertices(input)).toThrow(LandValidationError);
  });

  it('accepte un horodatage avec decalage explicite', () => {
    const input = vertices(); input[0].source.measuredAt = '2024-02-29T08:00:00+01:00';
    expect(validateVertices(input)).toEqual(input);
  });

  it.each(['instrument', 'pdop', 'satellites', 'measuredAt', 'fixMode'])
  ('refuse une source incomplete (%s)', (field) => {
    const input = vertices();
    delete (input[0].source as Record<string, unknown>)[field];
    expect(() => validateVertices(input)).toThrow(LandValidationError);
  });

  it('refuse une precision non finie et les satellites fractionnaires', () => {
    const input = vertices();
    Object.assign(input[0].source, { hAccuracyM: Infinity });
    expect(() => validateVertices(input)).toThrow(LandValidationError);
    delete (input[0].source as Record<string, unknown>).hAccuracyM;
    input[0].source.satellites = 1.5;
    expect(() => validateVertices(input)).toThrow(LandValidationError);
  });

  it('refuse les tableaux creux et les champs inconnus', () => {
    expect(() => validateVertices(new Array(3))).toThrow(LandValidationError);
    const input = vertices(); Object.assign(input[0], { authorId: 'autre' });
    expect(() => validateVertices(input)).toThrow(LandValidationError);
  });
});
