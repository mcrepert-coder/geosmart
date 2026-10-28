import type { Metadata } from "next";
import { AttestationCheck } from "../_components/attestation-check";

export const metadata: Metadata = {
  title: "Vérifier une attestation de levé",
};

// EF-204 : verifier qu'un PDF est bien l'attestation de leve emise.
export default function AttestationPage() {
  return (
    <>
      <section className="gs-hero">
        <div className="gs-container pt-10 pb-14">
          <h1 className="gs-display text-[28px] leading-[36px] font-bold">
            Vérifier une attestation de levé
          </h1>
          <p className="mt-2 max-w-xl text-[15px] text-[#dcebf2]">
            Comparez le fichier reçu à l&apos;attestation enregistrée par GeoSmart Field.
            Une attestation de levé ne vaut pas titre foncier.
          </p>
        </div>
      </section>
      <div className="gs-container -mt-6 max-w-[720px]">
        <AttestationCheck />
      </div>
    </>
  );
}
