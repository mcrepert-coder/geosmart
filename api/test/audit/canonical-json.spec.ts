import { canonicalize, CanonicalJsonError } from '../../src/audit/canonical-json';

describe('canonicalize', () => {
  it('trie les cles recursivement et garde l ordre des tableaux', () => {
    expect(canonicalize({ b: 1, a: { d: [3, 1, 2], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,1,2]},"b":1}',
    );
  });

  it('donne le meme texte quel que soit l ordre d insertion des cles', () => {
    expect(canonicalize({ x: 1, y: 2 })).toBe(canonicalize({ y: 2, x: 1 }));
  });

  it('serialise les nombres comme JCS', () => {
    expect(canonicalize([1.0, 0.1, -0, 1e21, 1e-7])).toBe('[1,0.1,0,1e+21,1e-7]');
  });

  it('distingue null d un champ absent', () => {
    expect(canonicalize({ a: null })).not.toBe(canonicalize({}));
  });

  it.each([
    ['NaN', { a: NaN }],
    ['Infinity', { a: Infinity }],
    ['undefined', { a: undefined }],
    ['fonction', { a: () => 1 }],
    ['date', { a: new Date(0) }],
    ['caractere nul', { a: 'x\u0000' }],
    ['bigint', { a: BigInt(1) }],
  ])('refuse %s', (_label, value) => {
    expect(() => canonicalize(value)).toThrow(CanonicalJsonError);
  });

  it('echappe les chaines comme JSON', () => {
    expect(canonicalize({ 'a"b': 'ligne\nsuivante fin' })).toBe(
      '{"a\\"b":"ligne\\nsuivante fin"}',
    );
  });

  it.each([[new Array(2)], [[, 1]], [[1, ,]]])('refuse les tableaux creux (%j)', (value) => {
    expect(() => canonicalize(value)).toThrow(CanonicalJsonError);
  });

  it.each(['\ud800', '\udc00', '\ud800x', '\ud800\ud800'])('refuse Unicode invalide (%j)', (value) => {
    expect(() => canonicalize({ value })).toThrow(CanonicalJsonError);
    expect(() => canonicalize({ [value]: 1 })).toThrow(CanonicalJsonError);
  });

  it('refuse le caractere nul dans une cle', () => {
    expect(() => canonicalize({ ['a\u0000']: 1 })).toThrow(CanonicalJsonError);
  });

  it('preserve les paires Unicode valides et les references partagees', () => {
    const shared = { text: '\ud83d\ude00' };
    expect(canonicalize([shared, shared])).toBe(JSON.stringify([shared, shared]));
  });

  it('refuse les cycles directs et indirects', () => {
    const object: Record<string, unknown> = {};
    object.self = object;
    const array: unknown[] = [{ object }];
    expect(() => canonicalize(object)).toThrow(CanonicalJsonError);
    expect(() => canonicalize(array)).toThrow(CanonicalJsonError);
    const indirect: unknown[] = [];
    indirect.push({ parent: indirect });
    expect(() => canonicalize(indirect)).toThrow(CanonicalJsonError);
  });
});
