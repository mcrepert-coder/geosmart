import { Suspense } from "react";
import { AgentShell } from "../_components/agent/agent-shell";

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex-1 p-8">
          <div className="gs-skeleton h-8 w-64" />
          <div className="gs-skeleton mt-6 h-64" />
        </div>
      }
    >
      <AgentShell>{children}</AgentShell>
    </Suspense>
  );
}