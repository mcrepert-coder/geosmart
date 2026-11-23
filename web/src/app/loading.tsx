export default function Loading() {
  return (
    <main className="gs-wrap py-10" role="status" aria-label="Chargement de la page">
      <div className="gs-skeleton h-10 w-2/5" />
      <div className="gs-skeleton mt-6 h-64 w-full" />
      <span className="sr-only">Chargement de la page…</span>
    </main>
  );
}
