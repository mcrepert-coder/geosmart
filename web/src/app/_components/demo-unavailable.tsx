import Link from "next/link";

export function DemoUnavailable({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="gs-wrap flex flex-1 items-center justify-center py-16">
      <section className="gs-card max-w-xl p-6 md:p-8">
        <h1 className="gs-h2 gs-display">{title}</h1>
        <div className="mt-3 text-[14px] text-[var(--text-muted)]">{children}</div>
        <p className="mt-4 text-[14px] text-[var(--text-muted)]">
          Les données d’exemple sont désactivées. Pour examiner les maquettes en
          développement uniquement, activez <code>NEXT_PUBLIC_DEMO_MODE=true</code>.
        </p>
        <Link href="/" className="gs-btn gs-btn--secondary mt-5">
          Retour au site public
        </Link>
      </section>
    </main>
  );
}
