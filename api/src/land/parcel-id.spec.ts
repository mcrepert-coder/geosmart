import {
  COMMUNES,
  formatParcelId,
  isCommuneCode,
  isParcelId,
} from './parcel-id';

describe('formatParcelId', () => {
  it('suit le format des maquettes', () => {
    expect(formatParcelId('AG3', 457)).toBe('TG-AG3-00457');
    expect(formatParcelId('GO1', 99999)).toBe('TG-GO1-99999');
  });

  it('passe a 6 chiffres au-dela de 99 999', () => {
    expect(formatParcelId('AG3', 100000)).toBe('TG-AG3-100000');
  });

  it.each([0, -1, 1.5, 1000000])('refuse le numero %p', (sequence) => {
    expect(() => formatParcelId('AG3', sequence)).toThrow(RangeError);
  });

  it('refuse une commune inconnue', () => {
    expect(() => formatParcelId('XYZ', 1)).toThrow(RangeError);
  });
});

describe('communes du pilote', () => {
  it('ouvre les 13 communes du Grand Lome', () => {
    expect(Object.keys(COMMUNES)).toHaveLength(13);
    expect(COMMUNES.GO1).toBe('Golfe 1');
    expect(COMMUNES.GO7).toBe('Golfe 7');
    expect(COMMUNES.AG1).toBe('Agoe-Nyive 1');
    expect(COMMUNES.AG6).toBe('Agoe-Nyive 6');
  });

  it('garde des codes de 3 lettres ou chiffres', () => {
    for (const code of Object.keys(COMMUNES)) {
      expect(code).toMatch(/^[A-Z0-9]{3}$/);
    }
  });

  it.each(['AGO', 'LOM'])('ferme le code provisoire %s', (code) => {
    expect(isCommuneCode(code)).toBe(false);
  });
});

describe('isCommuneCode', () => {
  it('ne connait que la liste provisoire', () => {
    expect(isCommuneCode('AG3')).toBe(true);
    expect(isCommuneCode('ag3')).toBe(false);
    expect(isCommuneCode('toString')).toBe(false);
  });
});

describe('isParcelId', () => {
  // TG-AGO-00457 : ancien format, un identifiant deja attribue reste valide.
  it.each(['TG-AG3-00457', 'TG-GO1-100000', 'TG-AGO-00457'])(
    'accepte %s',
    (id) => {
      expect(isParcelId(id)).toBe(true);
    },
  );

  it.each([
    'TG-AG3-457',
    'tg-ago-00457',
    'GS-2026-000142',
    'TG-AG3-00457 ',
    '',
  ])('refuse %p', (id) => {
    expect(isParcelId(id)).toBe(false);
  });
});
