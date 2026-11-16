import type { Metadata } from "next";
import { AlertesList } from "../../_components/admin/alerte-detail";
import { AdminLiveAlerts } from "../../_components/admin/alertes-live";
import { DEMO_MODE_ENABLED } from "@/lib/runtime-config";

export const metadata: Metadata = { title: "Alertes de chevauchement" };

export default function Page() {
  return DEMO_MODE_ENABLED ? <AlertesList /> : <AdminLiveAlerts />;
}