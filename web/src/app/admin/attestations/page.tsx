import type { Metadata } from "next";
import { AttestationsScreen } from "../../_components/admin/admin-screens";

export const metadata: Metadata = { title: "Attestations de levé" };

export default function Page() {
  return <AttestationsScreen />;
}