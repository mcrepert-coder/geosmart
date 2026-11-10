import type { Metadata } from "next";
import { AlertesList } from "../../_components/admin/alerte-detail";

export const metadata: Metadata = { title: "Alertes de chevauchement" };

export default function Page() {
  return <AlertesList />;
}