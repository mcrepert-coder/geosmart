import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ParcelLookup } from "./_components/parcel-lookup";
import { PARCEL_ID_PATTERN } from "./_lib/api";

const DESCRIPTION =
  "Statut juridique déclaré, surface levée et certification d'une parcelle, avant d'acheter. Ne vaut pas titre foncier.";

// Apercu du lien partage (WhatsApp, reseaux) : seulement l'identifiant, aucune
// donnee de la parcelle, pour ne rien afficher de perime ou de prive.
export async function generateMetadata({
  searchParams,
}: PageProps<"/parcelle">): Promise<Metadata> {
  const raw = (await searchParams).id;
  const id = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  const title = PARCEL_ID_PATTERN.test(id)
    ? `Vérifier la parcelle ${id}`
    : "Vérifier une parcelle";
  return {
    title,
    description: DESCRIPTION,
    openGraph: { title, description: DESCRIPTION, type: "website", siteName: "GeoSmart Field" },
  };
}

// generateMetadata lit ?id= : ce marqueur declare la page dynamique, comme
// le demande Next.js, sans bloquer le reste du rendu.
async function DynamicMarker() {
  await connection();
  return null;
}

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
        <Suspense>
          <DynamicMarker />
        </Suspense>
      </div>
    </>
  );
}
