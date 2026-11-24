"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Crosshair,
  FileCheck2,
  MapPin,
  ScanSearch,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { PROPERTIES, COMMUNES, communeOf, type LegalStatus, type Property, type PropertyType, type TransactionType } from "@/lib/data";
import { fetchPublicListings, LISTINGS_API_PATH, LISTINGS_DEMO_ENABLED } from "@/lib/listings-api";
import { PropertyCard } from "./property-card";
import { PropertyDrawer } from "./property-drawer";
import { HeroTopo } from "./hero-topo";
import { useDialog } from "../use-dialog";

const AnnoncesMap = dynamic(() => import("./annonces-map"), {
  ssr: false,
  loading: () => <div className="gs-skeleton h-[360px] lg:h-[560px]" />,
});

type PriceKey = "TOUS" | "0-10" | "10-25" | "25-50" | "50+";
const PRICE_RANGE: Record<PriceKey, [number, number] | null> = {
  TOUS: null,
  "0-10": [0, 10_000_000],
  "10-25": [10_000_000, 25_000_000],
  "25-50": [25_000_000, 50_000_000],
  "50+": [50_000_000, Number.POSITIVE_INFINITY],
};
const PRICE_LABEL: Record<PriceKey, string> = {
  TOUS: "Prix : tous",
  "0-10": "Prix : < 10 M FCFA",
  "10-25": "Prix : 10 à 25 M FCFA",
  "25-50": "Prix : 25 à 50 M FCFA",
  "50+": "Prix : > 50 M FCFA",
};

type Filters = {
  type: "TOUS" | PropertyType;
  operation: "TOUS" | TransactionType;
  price: PriceKey;
  legal: "TOUS" | LegalStatus;
  commune: "TOUS" | string;
  parcelCert: boolean;
  agentCert: boolean;
};
const DEFAULT_FILTERS: Filters = {
  type: "TOUS",
  operation: "TOUS",
  price: "TOUS",
  legal: "TOUS",
  commune: "TOUS",
  parcelCert: false,
  agentCert: false,
};

function FilterControls({
  filters,
  setFilters,
  communes,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  communes: string[];
}) {
  return (
    <>
      <label className="sr-only" htmlFor="f-operation">Type d&apos;opération</label>
      <select
        id="f-operation"
        className="gs-select w-auto"
        value={filters.operation}
        onChange={(e) => setFilters({ ...filters, operation: e.target.value as Filters["operation"] })}
      >
        <option value="TOUS">Opération : toutes</option>
        <option value="VENTE">Opération : Achat</option>
        <option value="LOCATION">Opération : Location</option>
      </select>
      <label className="sr-only" htmlFor="f-type">Type de bien</label>
      <select
        id="f-type"
        className="gs-select w-auto"
        value={filters.type}
        onChange={(e) => setFilters({ ...filters, type: e.target.value as Filters["type"] })}
      >
        <option value="TOUS">Type : tous</option>
        <option value="TERRAIN">Type : Terrain</option>
        <option value="MAISON">Type : Maison</option>
      </select>
      <label className="sr-only" htmlFor="f-commune">Commune</label>
      <select
        id="f-commune"
        className="gs-select w-auto"
        value={filters.commune}
        onChange={(e) => setFilters({ ...filters, commune: e.target.value })}
      >
        <option value="TOUS">Commune : toutes</option>
        {communes.map((c) => (
          <option key={c} value={c}>Commune : {c}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor="f-price">Fourchette de prix</label>
      <select
        id="f-price"
        className="gs-select w-auto"
        value={filters.price}
        onChange={(e) => setFilters({ ...filters, price: e.target.value as PriceKey })}
      >
        {(Object.keys(PRICE_LABEL) as PriceKey[]).map((k) => (
          <option key={k} value={k}>{PRICE_LABEL[k]}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor="f-legal">Statut juridique</label>
      <select
        id="f-legal"
        className="gs-select w-auto"
        value={filters.legal}
        onChange={(e) => setFilters({ ...filters, legal: e.target.value as Filters["legal"] })}
      >
        <option value="TOUS">Statut : tous</option>
        <option value="TITRE">Statut : Titré</option>
        <option value="COUTUMIER_NON_TITRE">Statut : Coutumier</option>
        <option value="EN_LITIGE">Statut : En litige</option>
        <option value="INCONNU">Statut : Inconnu</option>
      </select>
      <button
        className={`gs-chip ${filters.parcelCert ? "gs-chip--active" : ""}`}
        aria-pressed={filters.parcelCert}
        onClick={() => setFilters({ ...filters, parcelCert: !filters.parcelCert })}
      >
        Parcelle certifiée
      </button>
      <button
        className={`gs-chip ${filters.agentCert ? "gs-chip--active" : ""}`}
        aria-pressed={filters.agentCert}
        onClick={() => setFilters({ ...filters, agentCert: !filters.agentCert })}
      >
        Agent certifié
      </button>
    </>
  );
}

export function AnnoncesScreen({ initialSelectedId }: { initialSelectedId: string | null }) {
  const [properties, setProperties] = useState<Property[]>(
    LISTINGS_DEMO_ENABLED ? PROPERTIES : [],
  );
  const [loading, setLoading] = useState(Boolean(LISTINGS_API_PATH));
  const [apiError, setApiError] = useState<string | null>(
    !LISTINGS_API_PATH && !LISTINGS_DEMO_ENABLED
      ? "L’API Listings n’est pas configurée. Définissez NEXT_PUBLIC_API_URL pour afficher les annonces réelles."
      : null,
  );
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  useDialog(filtersOpen, () => setFiltersOpen(false), filtersRef);
  const [toast, setToast] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!LISTINGS_API_PATH) return;
    const controller = new AbortController();
    fetchPublicListings(controller.signal)
      .then(setProperties)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setApiError(error instanceof Error ? error.message : "Le catalogue est indisponible.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const range = PRICE_RANGE[filters.price];
    return properties.filter((p) => {
      if (filters.type !== "TOUS" && p.type !== filters.type) return false;
      if (filters.operation !== "TOUS" && p.transaction !== filters.operation) return false;
      if (filters.legal !== "TOUS" && p.legalStatus !== filters.legal) return false;
      if (filters.commune !== "TOUS" && communeOf(p.zone) !== filters.commune) return false;
      if (filters.parcelCert && !p.parcelCertified) return false;
      if (filters.agentCert && !p.agentCertified) return false;
      if (range && (p.price < range[0] || p.price > range[1])) return false;
      if (q && !`${p.zone} ${p.title} ${p.parcelId}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, filters, properties]);

  const selected = properties.find((p) => p.id === selectedId) ?? null;
  const communes = LISTINGS_API_PATH
    ? [...new Set(properties.map((property) => communeOf(property.zone)))].sort()
    : LISTINGS_DEMO_ENABLED
      ? COMMUNES
      : [];
  const activeFilterCount =
    (filters.type !== "TOUS" ? 1 : 0) +
    (filters.operation !== "TOUS" ? 1 : 0) +
    (filters.price !== "TOUS" ? 1 : 0) +
    (filters.legal !== "TOUS" ? 1 : 0) +
    (filters.commune !== "TOUS" ? 1 : 0) +
    (filters.parcelCert ? 1 : 0) +
    (filters.agentCert ? 1 : 0);

  const reset = () => {
    setFilters(DEFAULT_FILTERS);
    setQuery("");
  };

  return (
    <main className="flex-1">
      {/* Hero brand-blue + recherche */}
      <section className="gs-hero gs-hero--market">
        <HeroTopo />
        <div className="gs-wrap relative z-[3] py-12 lg:py-16">
          <div className="flex flex-col gap-9 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="gs-hero-eyebrow gs-rise">GeoSmart Field · Togo</p>
              <h1 className="gs-display gs-rise mt-5 text-[30px] font-bold leading-[38px] lg:text-[42px] lg:leading-[52px]">
                Des biens rattachés à des parcelles{" "}
                <span className="gs-hero-accent">levées au centimètre</span>
              </h1>
              <p className="gs-rise mt-4 max-w-xl text-[15px] leading-[24px] text-[#cfe0ea]" style={{ animationDelay: "90ms" }}>
                Chaque annonce indique le statut juridique de sa parcelle et si elle est certifiée. Vérifiez avant d&apos;acheter, sans créer de compte.
              </p>
              <div className="gs-hero-metrics gs-rise mt-7" style={{ animationDelay: "140ms" }}>
                <span className="gs-hero-metric"><Crosshair size={17} aria-hidden /> Levé RTK</span>
                <span className="gs-hero-metric"><FileCheck2 size={17} aria-hidden /> Statut juridique visible</span>
                <span className="gs-hero-metric"><ShieldCheck size={17} aria-hidden /> Vérification sans compte</span>
              </div>
            </div>
            <div className="gs-rise w-full max-w-lg" style={{ animationDelay: "170ms" }}>
              <form
                className="gs-search flex items-center gap-2 p-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                role="search"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                  <Search aria-hidden size={19} />
                </span>
                <input
                  className="h-11 min-w-0 flex-1 bg-transparent px-1 text-[15px] text-[#1b2a33] outline-none placeholder:text-[#5b6b75]"
                  placeholder="Agoè-Nyivé, Adidogomé, TG-AGO-00457..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Rechercher par zone ou identifiant"
                />
                {query && (
                  <button
                    type="button"
                    className="gs-iconbtn h-9 w-9 shrink-0"
                    onClick={() => setQuery("")}
                    aria-label="Effacer la recherche"
                  >
                    <X size={16} aria-hidden />
                  </button>
                )}
                <button type="submit" className="gs-btn gs-btn--accent gs-btn--sm shrink-0">
                  Rechercher <ArrowRight size={15} aria-hidden />
                </button>
              </form>
              <p className="mt-3 text-[12px] text-[#cfe0ea]">
                Par zone, commune ou identifiant de parcelle.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="gs-wrap pt-6">
        <div className="gs-trust gs-rise">
          <div className="gs-trust-item">
            <span className="gs-trust-icon"><BadgeCheck size={20} aria-hidden /></span>
            <div><strong>Parcelles identifiées</strong><span>Une emprise levée et un identifiant par bien</span></div>
          </div>
          <div className="gs-trust-item">
            <span className="gs-trust-icon"><FileCheck2 size={20} aria-hidden /></span>
            <div><strong>Statut juridique affiché</strong><span>Titré, coutumier ou en litige, sans ambiguïté</span></div>
          </div>
          <div className="gs-trust-item">
            <span className="gs-trust-icon"><ScanSearch size={20} aria-hidden /></span>
            <div><strong>Vérification ouverte à tous</strong><span>Consultez le statut d&apos;une parcelle sans compte</span></div>
          </div>
          <div className="gs-trust-item">
            <span className="gs-trust-icon"><MapPin size={20} aria-hidden /></span>
            <div><strong>Carte et annonces liées</strong><span>Repérez le bien puis sa parcelle en un clic</span></div>
          </div>
        </div>
      </div>

      <div className="gs-wrap mt-4">
        {apiError ? (
          <p className="gs-alert gs-alert--danger" role="alert">{apiError}</p>
        ) : loading ? (
          <p className="gs-help" role="status">Chargement du catalogue…</p>
        ) : LISTINGS_DEMO_ENABLED ? (
          <p className="gs-demo rounded-[10px] px-3 py-2" role="status">
            Version de démonstration : annonces et données fictives, non reliées à l&apos;API.
          </p>
        ) : null}
      </div>

      {/* Filtres + resultats */}
      <div ref={resultsRef} className="gs-wrap scroll-mt-20 py-8">
        <div className="gs-section-head mb-5">
          <div>
            <p className="gs-module text-[var(--primary)]">Le catalogue</p>
            <h2 className="gs-h2 gs-display mt-2">Annonces rattachées à une parcelle</h2>
            <p className="mt-1 text-[13px] text-[var(--text-muted)]">
              Filtrez par statut juridique, certification et zone.
            </p>
          </div>
          <span className="gs-badge gs-badge--primary">
            {filtered.length} bien{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""}
          </span>
        </div>
        <div className="gs-filterbar mb-5">
          <div className="hidden md:flex flex-wrap items-center gap-2">
            <FilterControls filters={filters} setFilters={setFilters} communes={communes} />
          </div>
          <button
            className="gs-chip md:hidden"
            onClick={() => setFiltersOpen(true)}
            aria-haspopup="dialog"
          >
            <SlidersHorizontal size={14} /> Filtres
            {activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>
          {activeFilterCount > 0 && (
            <button className="gs-chip" onClick={reset}>
              <X size={14} /> Réinitialiser
            </button>
          )}
          <span className="gs-caption ml-auto hidden lg:block">
            {activeFilterCount === 0 ? "Aucun filtre actif" : `${activeFilterCount} filtre(s) actif(s)`}
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div>
            {filtered.length === 0 ? (
              <div className="gs-card flex flex-col items-center gap-3 py-16 text-center">
                <p className="gs-h3">Aucun bien ne correspond</p>
                <p className="text-[14px] text-[var(--text-muted)]">
                  Élargissez la zone ou retirez un filtre pour voir plus d&apos;annonces.
                </p>
                <button className="gs-btn gs-btn--secondary" onClick={reset}>
                  Réinitialiser les filtres
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((p) => (
                  <PropertyCard
                    key={p.id}
                    property={p}
                    hovered={hoveredId === p.id}
                    selected={selectedId === p.id}
                    onHover={setHoveredId}
                    onSelect={setSelectedId}
                  />
                ))}
              </div>
            )}
          </div>
          {(LISTINGS_API_PATH || LISTINGS_DEMO_ENABLED) && (
            <div className="lg:sticky lg:top-20 lg:self-start">
              <div className="gs-panel">
                <div className="gs-panel-head">
                  <div>
                    <p className="gs-module">Localisation</p>
                    <p className="gs-h3 mt-1">Carte des parcelles</p>
                  </div>
                  <span className="gs-badge gs-badge--primary">
                    <MapPin size={14} aria-hidden /> {filtered.length} repère{filtered.length > 1 ? "s" : ""}
                  </span>
                </div>
                <AnnoncesMap
                  properties={filtered}
                  liveLocations={Boolean(LISTINGS_API_PATH)}
                  hoveredId={hoveredId}
                  selectedId={selectedId}
                  onHover={setHoveredId}
                  onSelect={setSelectedId}
                />
              </div>
              <p className="gs-caption mt-2">
                Survolez une carte : le repère grossit. Cliquez un repère pour ouvrir la fiche.
              </p>
            </div>
          )}
        </div>
      </div>

      <section className="gs-wrap pb-12 pt-4">
        <div className="gs-section-head mb-5">
          <div>
            <p className="gs-module text-[var(--primary)]">La méthode</p>
            <h2 className="gs-h2 gs-display mt-2">
              Trois étapes pour décider en connaissance de cause
            </h2>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <article className="gs-step">
            <span className="gs-step-icon"><Search size={21} aria-hidden /></span>
            <p className="gs-module mt-5 text-[var(--accent-text)]">Étape 01</p>
            <h3 className="gs-h3 gs-display mt-1">Repérer un bien</h3>
            <p className="mt-2 text-[14px] leading-[22px] text-[var(--text-muted)]">
              Parcourez les annonces et situez la parcelle sur la carte.
            </p>
          </article>
          <article className="gs-step">
            <span className="gs-step-icon"><ScanSearch size={21} aria-hidden /></span>
            <p className="gs-module mt-5 text-[var(--accent-text)]">Étape 02</p>
            <h3 className="gs-h3 gs-display mt-1">Contrôler la parcelle</h3>
            <p className="mt-2 text-[14px] leading-[22px] text-[var(--text-muted)]">
              Vérifiez le statut juridique, la surface et la certification déclarés.
            </p>
          </article>
          <article className="gs-step">
            <span className="gs-step-icon"><ShieldCheck size={21} aria-hidden /></span>
            <p className="gs-module mt-5 text-[var(--accent-text)]">Étape 03</p>
            <h3 className="gs-h3 gs-display mt-1">Avancer en confiance</h3>
            <p className="mt-2 text-[14px] leading-[22px] text-[var(--text-muted)]">
              Comparez les biens avec les mêmes informations, sans créer de compte.
            </p>
          </article>
        </div>
        <div className="gs-cta-band mt-6 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="relative z-[1]">
            <h3 className="gs-h2 gs-display">
              Une parcelle en tête ? Vérifiez-la avant d&apos;avancer.
            </h3>
            <p className="mt-2 max-w-xl text-[14px] leading-[22px] text-[#cfe0ea]">
              Statut juridique, surface levée, certification et litiges éventuels :
              tout est consultable sans compte.
            </p>
          </div>
          <Link href="/parcelle" className="gs-btn gs-btn--accent gs-btn--lg relative z-[1] shrink-0">
            Vérifier une parcelle <ArrowRight size={17} aria-hidden />
          </Link>
        </div>
      </section>

      {/* Filtres mobile en tiroir */}
      {filtersOpen && (
        <>
          <div className="gs-scrim" onClick={() => setFiltersOpen(false)} aria-hidden />
          <div
            ref={filtersRef}
            className="gs-sheet p-5"
            role="dialog"
            aria-modal="true"
            aria-label="Filtres"
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="gs-h3">Filtres</p>
              <button className="gs-iconbtn" onClick={() => setFiltersOpen(false)} aria-label="Fermer les filtres">
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-3 overflow-y-auto pb-4">
              <FilterControls filters={filters} setFilters={setFilters} communes={communes} />
            </div>
            <div className="flex gap-2 border-t border-[var(--border)] pt-4">
              <button className="gs-btn gs-btn--secondary flex-1" onClick={reset}>
                Réinitialiser
              </button>
              <button className="gs-btn gs-btn--primary flex-1" onClick={() => setFiltersOpen(false)}>
                Voir {filtered.length} bien{filtered.length > 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </>
      )}

      {selected && (
        <PropertyDrawer
          key={selected.id}
          property={selected}
          onClose={() => setSelectedId(null)}
          onToast={setToast}
        />
      )}

      {toast && (
        <div className="gs-toast" role="status">
          {toast}
          <button onClick={() => setToast(null)}>Fermer</button>
        </div>
      )}
    </main>
  );
}