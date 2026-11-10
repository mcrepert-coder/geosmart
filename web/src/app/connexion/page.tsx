import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "../_components/site-header";
import { SiteFooter } from "../_components/site-footer";
import { ConnexionScreen } from "../_components/connexion-screen";

export const metadata: Metadata = { title: "Se connecter" };

export default function Page() {
  return (
    <>
      <Suspense
        fallback={
          <div className="gs-header gs-header--fixed">
            <div className="gs-wrap h-[58px]" />
          </div>
        }
      >
        <SiteHeader />
      </Suspense>
      <ConnexionScreen />
      <SiteFooter />
    </>
  );
}