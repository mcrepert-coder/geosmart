import type { Metadata } from "next";
import { Suspense } from "react";
import { ParcelLookup } from "./_components/parcel-lookup";

export const metadata: Metadata = {
  title: "Vérifier une parcelle",
};

// EF-206 : verifier une parcelle avant d'acheter, sans compte.
export default function ParcellePage() {
  return (
    <>
      <section className="gs-hero">
        <div className="gs-container pt-10 pb-14">
          <h1 className="gs-display text-[28px] leading-[36px] font-bold">
            Vérifier avant d&apos;acheter
          </h1>
          <p className="mt-2 max-w-xl text-[15px] text-[#dcebf2]">
            Statut juridique déclaré, surface levée, certification et litiges éventuels
            d&apos;une parcelle enregistrée dans GeoSmart Field.
          </p>
        </div>
      </section>
      <div className="gs-container -mt-6 max-w-[720px]">
        <Suspense fallback={<div className="gs-card gs-skeleton h-[150px]" />}>
          <ParcelLookup />
        </Suspense>
      </div>
    </>
  );
}
