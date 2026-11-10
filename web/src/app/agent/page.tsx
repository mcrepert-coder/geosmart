import type { Metadata } from "next";
import { AgentScreen } from "../_components/agent/agent-screen";

export const metadata: Metadata = { title: "Espace agent · catalogue" };

export default function Page() {
  return <AgentScreen />;
}