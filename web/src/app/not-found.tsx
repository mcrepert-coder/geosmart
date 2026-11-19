import Link from "next/link";

export default function NotFound() {
  return (
    <main className="gs-wrap flex flex-1 items-center justify-center py-16">
      <div className="gs-card max-w-lg p-6 text-center">
        <p className="gs-module text-[var(--primary)]">404</p>
        <h1 className="gs-h2 gs-display mt-2">Page introuvable</h1>
        <p className="gs-help mt-3">
          La page demandée n’existe pas ou n’est plus disponible.
        </p>
        <Link className="gs-btn gs-btn--primary mt-5" href="/">
          Retour à l’accueil
        </Link>
      </div>
    </main>
  );
}
