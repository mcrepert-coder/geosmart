import type { Metadata } from "next";
import { DEMO_MODE_ENABLED } from "@/lib/runtime-config";
import { AdminUnavailableScreen } from "../../_components/admin/admin-live";
import { ParcellesScreen } from "../../_components/admin/admin-screens";

export const metadata: Metadata = { title: "Parcelles" };

export default function Page() {
  if (!DEMO_MODE_ENABLED) return <AdminUnavailableScreen />;
  return <ParcellesScreen />;
}