import { TriangleAlert } from "lucide-react";

// Mention obligatoire RG-09 : jamais abregee ni masquee.
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="gs-notice">
      <TriangleAlert aria-hidden size={16} strokeWidth={2} />
      {children}
    </p>
  );
}