import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ALERTS } from "@/lib/data";
import { AlerteDetail } from "../../../_components/admin/alerte-detail";

export const metadata: Metadata = { title: "Alerte de chevauchement" };

async function AlertePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = ALERTS.find((a) => a.id === id);
  if (!alert) notFound();
  return <AlerteDetail alert={alert} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="gs-wrap py-16 text-[14px] text-[var(--text-muted)]">
          Chargement de l&apos;alerte...
        </div>
      }
    >
      <AlertePage params={params} />
    </Suspense>
  );
}