import { formatParcelId, isCommuneCode, isParcelId } from './parcel-id';

describe('formatParcelId', () => {
  it('suit le format des maquettes', () => {
    expect(formatParcelId('AGO', 457)).toBe('TG-AGO-00457');
    expect(formatParcelId('LOM', 99999)).toBe('TG-LOM-99999');
  });

  it('passe a 6 chiffres au-dela de 99 999', () => {
    expect(formatParcelId('AGO', 100000)).toBe('TG-AGO-100000');
  });

  it.each([0, -1, 1.5, 1000000])('refuse le numero %p', (sequence) => {
    expect(() => formatParcelId('AGO', sequence)).toThrow(RangeError);
  });

  it('refuse une commune inconnue', () => {
    expect(() => formatParcelId('XYZ', 1)).toThrow(RangeError);
  });
});

describe('isCommuneCode', () => {
  it('ne connait que la liste provisoire', () => {
    expect(isCommuneCode('AGO')).toBe(true);
    expect(isCommuneCode('ago')).toBe(false);
    expect(isCommuneCode('toString')).toBe(false);
  });
});

describe('isParcelId', () => {
  it.each(['TG-AGO-00457', 'TG-LOM-100000'])('accepte %s', (id) => {
    expect(isParcelId(id)).toBe(true);
  });

  it.each([
    'TG-AGO-457',
    'tg-ago-00457',
    'GS-2026-000142',
    'TG-AGO-00457 ',
    '',
  ])('refuse %p', (id) => {
    expect(isParcelId(id)).toBe(false);
  });
});
