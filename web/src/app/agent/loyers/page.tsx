import type { Metadata } from "next";
import { AgentRentsScreen } from "../../_components/agent/agent-rents-screen";

export const metadata: Metadata = { title: "Espace agent · loyers" };

export default function Page() {
  return <AgentRentsScreen />;
}