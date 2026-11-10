import type { Metadata } from "next";
import { ComptesScreen } from "../../_components/admin/comptes-screen";

export const metadata: Metadata = { title: "Comptes à valider" };

export default function Page() {
  return <ComptesScreen />;
}