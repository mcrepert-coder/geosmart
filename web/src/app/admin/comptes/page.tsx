import type { Metadata } from "next";
import { ComptesScreen } from "../../_components/admin/comptes-screen";
import { AdminLiveAccounts } from "../../_components/admin/admin-live";
import { DEMO_MODE_ENABLED } from "@/lib/runtime-config";

export const metadata: Metadata = { title: "Comptes à valider" };

export default function Page() {
  return DEMO_MODE_ENABLED ? <ComptesScreen /> : <AdminLiveAccounts />;
}