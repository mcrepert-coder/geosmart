import type { Metadata } from "next";
import { CarteScreen } from "../../_components/admin/carte-screen";

export const metadata: Metadata = { title: "Carte des parcelles" };

export default function Page() {
  return <CarteScreen />;
}