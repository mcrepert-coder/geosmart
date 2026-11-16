import type { Metadata } from "next";
import { AgentScreen } from "../_components/agent/agent-screen";
import { AgentLiveListings } from "../_components/agent/agent-live";
import { DEMO_MODE_ENABLED } from "@/lib/runtime-config";

export const metadata: Metadata = { title: "Espace agent · catalogue" };

export default function Page() {
  return DEMO_MODE_ENABLED ? <AgentScreen /> : <AgentLiveListings />;
}