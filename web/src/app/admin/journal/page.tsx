import type { Metadata } from "next";
import { JournalScreen } from "../../_components/admin/admin-screens";
import { AdminLiveJournal } from "../../_components/admin/admin-live";
import { DEMO_MODE_ENABLED } from "@/lib/runtime-config";

export const metadata: Metadata = { title: "Journal" };

export default function Page() {
  return DEMO_MODE_ENABLED ? <JournalScreen /> : <AdminLiveJournal />;
}