import type { Metadata } from "next";
import { JournalScreen } from "../../_components/admin/admin-screens";

export const metadata: Metadata = { title: "Journal" };

export default function Page() {
  return <JournalScreen />;
}