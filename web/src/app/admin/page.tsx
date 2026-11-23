import type { Metadata } from "next";
import { Dashboard } from "../_components/admin/admin-screens";
import { AdminLiveDashboard } from "../_components/admin/admin-live";
import { DEMO_MODE_ENABLED } from "@/lib/runtime-config";

export const metadata: Metadata = { title: "Tableau de bord" };

export default function Page() {
  return DEMO_MODE_ENABLED ? <Dashboard /> : <AdminLiveDashboard />;
}