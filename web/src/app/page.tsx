import { Suspense } from "react";
import { SiteHeader } from "./_components/site-header";
import { SiteFooter } from "./_components/site-footer";
import { AnnoncesScreen } from "./_components/annonces/annonces-screen";

async function HomeContent({
  searchParams,
}: {
  searchParams: PageProps<"/">["searchParams"];
}) {
  const params = await searchParams;
  const initialSelectedId = typeof params.bien === "string" ? params.bien : null;
  return <AnnoncesScreen initialSelectedId={initialSelectedId} />;
}

export default function Home({ searchParams }: PageProps<"/">) {
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
      <Suspense fallback={<div className="gs-wrap gs-skeleton my-6 h-[560px]" />}>
        <HomeContent searchParams={searchParams} />
      </Suspense>
      <SiteFooter />
    </>
  );
}