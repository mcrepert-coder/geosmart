import { Suspense } from "react";
import { AdminShell } from "../_components/admin/admin-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex-1 p-8">
          <div className="gs-skeleton h-8 w-64" />
          <div className="gs-skeleton mt-6 h-64" />
        </div>
      }
    >
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}