import {
  AuditContent,
  ChainedAuditEntry,
  GENESIS_HASH,
  canonicalJson,
  computeHash,
  redactSecrets,
  verifyChain,
} from './audit-chain';

function buildChain(count: number): ChainedAuditEntry[] {
  const entries: ChainedAuditEntry[] = [];
  let prevHash = GENESIS_HASH;
  for (let seq = 1; seq <= count; seq++) {
    const content: AuditContent = {
      seq,
      at: new Date(Date.UTC(2026, 9, 27, 10, 0, seq)),
      actorId: '11111111-1111-4111-8111-111111111111',
      actorRole: 'GEOMETRE',
      action: 'PARCEL_CREATE',
      resourceType: 'parcel',
      resourceId: `GS-2026-00000${seq}`,
      result: 'SUCCESS',
      details: { areaM2: 100 * seq },
    };
    const hash = computeHash(prevHash, content);
    entries.push({ ...content, prevHash, hash });
    prevHash = hash;
  }
  return entries;
}

describe('canonicalJson', () => {
  it("ne depend pas de l'ordre des cles", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });

  it('ignore les cles undefined et garde null', () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
  });
});

describe('redactSecrets', () => {
  it('retire mots de passe, jetons et secrets, meme imbriques', () => {
    expect(
      redactSecrets({
        password: 'x',
        nested: { accessToken: 'y', ntripSecret: 'z', keep: 1 },
        list: [{ Authorization: 'Bearer abc' }],
      }),
    ).toEqual({
      password: '[retire]',
      nested: { accessToken: '[retire]', ntripSecret: '[retire]', keep: 1 },
      list: [{ Authorization: '[retire]' }],
    });
  });
});

describe('computeHash', () => {
  it('produit une empreinte SHA-256 hexadecimale stable', () => {
    const [first] = buildChain(1);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(computeHash(GENESIS_HASH, first)).toBe(first.hash);
  });

  it("change si l'empreinte precedente change", () => {
    const [first] = buildChain(1);
    expect(computeHash('f'.repeat(64), first)).not.toBe(first.hash);
  });
});

describe('verifyChain', () => {
  it('accepte une chaine intacte', () => {
    expect(verifyChain(buildChain(5))).toEqual({
      valid: true,
      checked: 5,
      firstBrokenSeq: null,
    });
  });

  it('accepte un journal vide', () => {
    expect(verifyChain([]).valid).toBe(true);
  });

  it('detecte une ligne modifiee', () => {
    const chain = buildChain(5);
    chain[2] = { ...chain[2], details: { areaM2: 1 } };
    expect(verifyChain(chain)).toEqual({
      valid: false,
      checked: 2,
      firstBrokenSeq: 3,
    });
  });

  it('detecte une ligne supprimee', () => {
    const chain = buildChain(5);
    chain.splice(1, 1);
    expect(verifyChain(chain).firstBrokenSeq).toBe(3);
  });

  it('detecte une ligne inseree', () => {
    const chain = buildChain(3);
    chain.splice(1, 0, { ...chain[1] });
    expect(verifyChain(chain).valid).toBe(false);
  });

  it("detecte une ligne dont l'empreinte a ete recalculee seule", () => {
    const chain = buildChain(4);
    const altered = { ...chain[1], result: 'DENIED' as const };
    altered.hash = computeHash(altered.prevHash, altered);
    chain[1] = altered;
    expect(verifyChain(chain).firstBrokenSeq).toBe(3);
  });
});
