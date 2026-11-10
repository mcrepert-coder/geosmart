import type { Metadata } from "next";
import { ParcellesScreen } from "../../_components/admin/admin-screens";

export const metadata: Metadata = { title: "Parcelles" };

export default function Page() {
  return <ParcellesScreen />;
}