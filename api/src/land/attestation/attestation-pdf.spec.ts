import { actorFromRequest } from '../../audit/current-actor.decorator';
import { surveyorLabel } from './attestation-pdf';

// Decision 6 de LGR (#24) : l'attestation porte le nom du geometre et son
// numero d'inscription a l'Ordre, fournis par le module comptes (Beni).
describe('ligne Geometre de l attestation', () => {
  const id = '0b8f6a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

  it('imprime le nom et le numero d inscription a l Ordre', () => {
    expect(
      surveyorLabel({ id, fullName: 'Kossi Agbeko', ordreNumber: 'OGT-0142' }),
    ).toBe("Kossi Agbeko, inscrit a l'Ordre sous le numero OGT-0142");
  });

  it('imprime le nom seul si le numero manque', () => {
    expect(surveyorLabel({ id, fullName: 'Kossi Agbeko' })).toBe(
      "Kossi Agbeko, inscrit a l'Ordre",
    );
  });

  it('garde l identifiant du compte tant que le nom n est pas fourni', () => {
    expect(surveyorLabel({ id })).toBe(`inscrit a l'Ordre, compte ${id}`);
    expect(surveyorLabel({ id, fullName: '   ', ordreNumber: 'OGT-1' })).toBe(
      `inscrit a l'Ordre, compte ${id}`,
    );
  });

  it('retire les caracteres de controle et borne la longueur', () => {
    const label = surveyorLabel({
      id,
      fullName: `Kossi\n\tAgbeko${'x'.repeat(300)}`,
      ordreNumber: 'OGT-\u00000142',
    });
    expect(label).toMatch(/^Kossi Agbeko/);
    expect(label).not.toMatch(/\p{Cc}/u);
    expect(label).toContain('OGT- 0142');
    expect(label.length).toBeLessThan(200);
  });

  it('recoit le nom et le numero depuis request.user', () => {
    const actor = actorFromRequest({
      user: {
        id,
        role: 'GEOMETRE',
        registeredSurveyor: true,
        accountActive: true,
        fullName: ' Kossi Agbeko ',
        ordreNumber: 42,
      },
    });
    expect(actor).toMatchObject({ fullName: 'Kossi Agbeko' });
    expect(actor.ordreNumber).toBeUndefined();
  });
});
