import type { Metadata } from "next";
import { DEMO_MODE_ENABLED } from "@/lib/runtime-config";
import { AdminUnavailableScreen } from "../../_components/admin/admin-live";
import { CarteScreen } from "../../_components/admin/carte-screen";

export const metadata: Metadata = { title: "Carte des parcelles" };

export default function Page() {
  if (!DEMO_MODE_ENABLED) return <AdminUnavailableScreen />;
  return <CarteScreen />;
}