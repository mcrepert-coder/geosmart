"use client";

export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const message =
    error instanceof Error ? error.message : "Une erreur inattendue est survenue.";

  return (
    <main className="gs-wrap flex flex-1 items-center justify-center py-16">
      <div className="gs-card max-w-lg p-6 text-center">
        <p className="gs-module text-[var(--danger)]">Erreur</p>
        <h1 className="gs-h2 gs-display mt-2">Une erreur est survenue</h1>
        <p className="gs-help mt-3" role="alert">
          {message}
        </p>
        <button className="gs-btn gs-btn--primary mt-5" onClick={retry} type="button">
          Réessayer
        </button>
      </div>
    </main>
  );
}
