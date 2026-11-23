import type { Metadata } from "next";
import { AgentRentsScreen } from "../../_components/agent/agent-rents-screen";
import { DemoUnavailable } from "../../_components/demo-unavailable";
import { DEMO_MODE_ENABLED } from "@/lib/runtime-config";

export const metadata: Metadata = { title: "Espace agent · loyers" };

export default function Page() {
  if (DEMO_MODE_ENABLED) return <AgentRentsScreen />;
  return (
    <DemoUnavailable title="Loyers et quittances">
      <p>
        Le suivi des loyers, encaissements et quittances n’est pas encore relié à l’API sur le
        site. Cette gestion est disponible dans l’application mobile (baux et loyers) et dans
        l’espace agent en mode démonstration.
      </p>
    </DemoUnavailable>
  );
}