import { prepareParcelGeometry } from '../../src/land/parcel-geometry';
import { LandValidationError } from '../../src/land/validate-vertices';

function vertices() {
  return [[1.212301, 6.172410], [1.212642, 6.172398],
    [1.212650, 6.172102], [1.212310, 6.172095]].map(([lon, lat], i) => ({
    number: `B${i + 1}`, lon, lat,
    source: { instrument: 'UM982', fixMode: 'RTK_FIXED', pdop: 1.4,
      satellites: 21, measuredAt: '2026-10-24T08:12:00Z' },
  }));
}

describe('prepareParcelGeometry', () => {
  it('ferme le contour en lon/lat et reproduit l empreinte du contrat', () => {
    const input = vertices();
    const result = prepareParcelGeometry(input);
    expect(result.geometry).toEqual({ type: 'Polygon', coordinates: [[
      [1.212301, 6.172410], [1.212642, 6.172398], [1.212650, 6.172102],
      [1.212310, 6.172095], [1.212301, 6.172410],
    ]] });
    expect(result.geometryHash).toBe('d8eb1a24cba4c50b14359bbacb4fc63d6a79b99ffa414014a0db2bf4784b16e6');
    expect(result.vertices).toEqual(input);
    expect(input).toHaveLength(4);
  });

  it('preserve la precision et independamment la copie des bornes et de la fermeture', () => {
    const input = vertices(); input[0].lon = 1.21230112345678;
    const result = prepareParcelGeometry(input);
    expect(result.geometry.coordinates[0][0][0]).toBe(input[0].lon);
    input[0].source.instrument = 'autre'; input[0].lon = 0;
    expect(result.vertices[0].source.instrument).toBe('UM982');
    expect(result.geometry.coordinates[0][0][0]).toBe(1.21230112345678);
    result.geometry.coordinates[0][0][0] = 0;
    expect(result.geometry.coordinates[0][4][0]).toBe(1.21230112345678);
  });

  it('ne fait pas dependre l empreinte des metadonnees de mesure', () => {
    const first = vertices(), second = vertices();
    second[0].number = 'AUTRE'; second[0].source.pdop = 2;
    expect(prepareParcelGeometry(first).geometryHash).toBe(prepareParcelGeometry(second).geometryHash);
  });

  it('modifie l empreinte si une coordonnee change', () => {
    const first = vertices(), second = vertices(); second[0].lon += 0.000001;
    expect(prepareParcelGeometry(first).geometryHash).not.toBe(prepareParcelGeometry(second).geometryHash);
  });

  it('conserve le sommet initial et le sens de parcours', () => {
    const input = vertices();
    const shifted = [...input.slice(1), input[0]];
    const reversed = [...input].reverse();
    const original = prepareParcelGeometry(input);
    expect(original.geometryHash).not.toBe(prepareParcelGeometry(shifted).geometryHash);
    expect(original.geometryHash).not.toBe(prepareParcelGeometry(reversed).geometryHash);
    expect(prepareParcelGeometry(reversed).geometry.coordinates[0][0]).toEqual([input[3].lon, input[3].lat]);
  });

  it('refuse des bornes non valides avant de produire un polygone', () => {
    const input = vertices(); input[0].source.fixMode = 'RTK_FLOAT';
    expect(() => prepareParcelGeometry(input)).toThrow(LandValidationError);
    expect(() => prepareParcelGeometry(vertices().slice(0, 2))).toThrow(LandValidationError);
    const closed = vertices(); closed.push(structuredClone(closed[0]));
    expect(() => prepareParcelGeometry(closed)).toThrow(LandValidationError);
  });
});
