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
});
