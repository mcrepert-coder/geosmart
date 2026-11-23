import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountRegistrationScreen } from "../_components/account-registration-screen";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata: Metadata = { title: "Créer un compte" };

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
      <AccountRegistrationScreen />
      <SiteFooter />
    </>
  );
}
