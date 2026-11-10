import { Notice } from "./notice";

export function SiteFooter() {
  return (
    <footer className="gs-header mt-12 border-t">
      <div className="gs-wrap flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
        <Notice>Les informations affichees ne valent pas titre foncier</Notice>
        <p className="text-[13px] text-[var(--text-muted)]">
          GeoSmart Field seconde l&apos;ANDF, il ne la remplace pas.
        </p>
      </div>
    </footer>
  );
}