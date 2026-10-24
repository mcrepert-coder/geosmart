import {
  AuditEntry,
  computeHash,
  GENESIS_HASH,
  seal,
  verifyChain,
} from '../../src/audit/audit-chain';

function buildChain(length: number): AuditEntry[] {
  const chain: AuditEntry[] = [];
  for (let i = 1; i <= length; i++) {
    chain.push(
      seal({
        seq: i,
        prevHash: i === 1 ? GENESIS_HASH : chain[i - 2].hash,
        at: `2026-10-24T09:0${i}:00.000Z`,
        actorId: i % 2 ? 'usr_geo_01' : null,
        action: 'PARCEL_CREATED',
        entityType: 'parcel',
        entityId: `PRC-2026-00000${i}`,
        details: { areaM2: 100 * i },
      }),
    );
  }
  return chain;
}

describe('computeHash', () => {
  it('reproduit l exemple du contrat contracts/land.yaml', () => {
    expect(
      computeHash({
        seq: 1,
        prevHash: GENESIS_HASH,
        at: '2026-10-24T09:05:00.000Z',
        actorId: 'usr_geo_02',
        action: 'PARCEL_OVERLAP_REJECTED',
        entityType: 'parcel',
        entityId: 'PRC-2026-000009',
        details: { overlapAreaM2: 37.5 },
      }),
    ).toBe('52bd7a0fcb5c6135cdad2f1d894908776ade4d9a58ab7434e25673bb073f977e');
  });

  it('ignore le champ hash deja present', () => {
    const [entry] = buildChain(1);
    expect(computeHash({ ...entry, hash: 'f'.repeat(64) } as AuditEntry)).toBe(entry.hash);
  });
});

describe('verifyChain', () => {
  it('accepte une chaine vide', () => {
    expect(verifyChain([])).toEqual({ valid: true, checked: 0, firstBrokenSeq: null });
  });

  it('accepte une chaine intacte', () => {
    expect(verifyChain(buildChain(5))).toEqual({
      valid: true,
      checked: 5,
      firstBrokenSeq: null,
    });
  });

  it('relie chaque ligne a la precedente', () => {
    const chain = buildChain(3);
    expect(chain[0].prevHash).toBe(GENESIS_HASH);
    expect(chain[1].prevHash).toBe(chain[0].hash);
    expect(chain[2].prevHash).toBe(chain[1].hash);
  });

  it.each<[string, (e: AuditEntry) => void]>([
    ['details', (e) => (e.details = { areaM2: 1 })],
    ['action', (e) => (e.action = 'PARCEL_UPDATED')],
    ['acteur', (e) => (e.actorId = 'usr_admin')],
    ['acteur efface', (e) => (e.actorId = null)],
    ['date', (e) => (e.at = '2026-10-24T09:03:00.001Z')],
    ['entite', (e) => (e.entityId = 'PRC-2026-999999')],
    ['type d entite', (e) => (e.entityType = 'user')],
  ])('detecte une alteration du champ %s', (_label, tamper) => {
    const chain = buildChain(5);
    tamper(chain[2]);
    expect(verifyChain(chain)).toMatchObject({
      valid: false,
      checked: 2,
      firstBrokenSeq: 3,
      reason: 'HASH_MISMATCH',
    });
  });

  it('detecte une ligne alteree puis rescellee : la suivante ne suit plus', () => {
    const chain = buildChain(5);
    chain[2] = seal({ ...chain[2], details: { areaM2: 1 } });
    expect(verifyChain(chain)).toMatchObject({
      valid: false,
      firstBrokenSeq: 4,
      reason: 'PREV_HASH_MISMATCH',
    });
  });

  it('detecte la suppression d une ligne au milieu', () => {
    const chain = buildChain(5);
    chain.splice(2, 1);
    expect(verifyChain(chain)).toMatchObject({
      valid: false,
      firstBrokenSeq: 3,
      reason: 'SEQUENCE_GAP',
    });
  });

  it('detecte une suppression renumerotee', () => {
    const chain = buildChain(5);
    chain.splice(2, 1);
    chain[2] = { ...chain[2], seq: 3 };
    chain[3] = { ...chain[3], seq: 4 };
    expect(verifyChain(chain)).toMatchObject({
      valid: false,
      firstBrokenSeq: 3,
      reason: 'PREV_HASH_MISMATCH',
    });
  });

  it('detecte l inversion de deux lignes', () => {
    const chain = buildChain(4);
    [chain[1], chain[2]] = [chain[2], chain[1]];
    expect(verifyChain(chain)).toMatchObject({ valid: false, firstBrokenSeq: 2 });
  });

  it('detecte une premiere ligne qui ne part pas de 64 zeros', () => {
    const chain = buildChain(2);
    chain[0] = seal({ ...chain[0], prevHash: 'a'.repeat(64) });
    expect(verifyChain(chain)).toMatchObject({
      valid: false,
      firstBrokenSeq: 1,
      reason: 'PREV_HASH_MISMATCH',
    });
  });

  it('detecte un hash remplace par un autre hash valide en forme', () => {
    const chain = buildChain(3);
    chain[2] = { ...chain[2], hash: 'b'.repeat(64) };
    expect(verifyChain(chain)).toMatchObject({ valid: false, firstBrokenSeq: 3 });
  });

  it('signale une ligne dont les details ne sont plus du JSON valide', () => {
    const chain = buildChain(2);
    (chain[1].details as Record<string, unknown>).areaM2 = NaN;
    expect(verifyChain(chain)).toMatchObject({
      valid: false,
      firstBrokenSeq: 2,
      reason: 'UNHASHABLE_ENTRY',
    });
  });

  describe('avec une empreinte de reference conservee hors base', () => {
    it('detecte une reecriture prolongee au-dela de la reference', () => {
      const original = buildChain(3);
      const rewritten = buildChain(5);
      rewritten[0] = seal({ ...rewritten[0], details: { areaM2: 999 } });
      for (let i = 1; i < rewritten.length; i++) {
        rewritten[i] = seal({ ...rewritten[i], prevHash: rewritten[i - 1].hash });
      }
      expect(verifyChain(rewritten, { seq: 3, hash: original[2].hash })).toMatchObject({
        valid: false,
        checked: 2,
        firstBrokenSeq: 3,
        reason: 'HEAD_MISMATCH',
      });
    });

    it('detecte la suppression des dernieres lignes', () => {
      const chain = buildChain(5);
      const head = { seq: 5, hash: chain[4].hash };
      expect(verifyChain(chain.slice(0, 3))).toMatchObject({ valid: true });
      expect(verifyChain(chain.slice(0, 3), head)).toMatchObject({
        valid: false,
        firstBrokenSeq: 4,
        reason: 'TRUNCATED',
      });
    });

    it('detecte une reecriture complete de la chaine', () => {
      const head = { seq: 3, hash: buildChain(3)[2].hash };
      const rewritten = buildChain(3).map((e) => ({ ...e }));
      rewritten[0] = seal({ ...rewritten[0], details: { areaM2: 1 } });
      for (let i = 1; i < rewritten.length; i++) {
        rewritten[i] = seal({ ...rewritten[i], prevHash: rewritten[i - 1].hash });
      }
      expect(verifyChain(rewritten)).toMatchObject({ valid: true });
      expect(verifyChain(rewritten, head)).toMatchObject({
        valid: false,
        reason: 'HEAD_MISMATCH',
      });
    });

    it('accepte une chaine qui a grandi depuis la reference', () => {
      const chain = buildChain(5);
      expect(verifyChain(chain, { seq: 3, hash: chain[2].hash })).toMatchObject({
        valid: true,
        checked: 5,
      });
    });
  });
});
