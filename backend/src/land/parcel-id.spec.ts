import { formatParcelId, isParcelId } from './parcel-id';

describe('formatParcelId', () => {
  it('complete le numero sur 6 chiffres', () => {
    expect(formatParcelId(2026, 142)).toBe('GS-2026-000142');
    expect(formatParcelId(2026, 999999)).toBe('GS-2026-999999');
  });

  it.each([0, -1, 1.5, 1000000])('refuse le numero %p', (sequence) => {
    expect(() => formatParcelId(2026, sequence)).toThrow(RangeError);
  });

  it('refuse une annee invalide', () => {
    expect(() => formatParcelId(26, 1)).toThrow(RangeError);
  });
});

describe('isParcelId', () => {
  it.each(['GS-2026-000142', 'GS-2027-000001'])('accepte %s', (id) => {
    expect(isParcelId(id)).toBe(true);
  });

  it.each(['GS-2026-142', 'gs-2026-000142', 'GS-2026-000142 ', ''])(
    'refuse %p',
    (id) => {
      expect(isParcelId(id)).toBe(false);
    },
  );
});
