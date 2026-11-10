import type { Metadata } from "next";
import { Dashboard } from "../_components/admin/admin-screens";

export const metadata: Metadata = { title: "Tableau de bord" };

export default function Page() {
  return <Dashboard />;
}