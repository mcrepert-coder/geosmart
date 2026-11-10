// Etat de demonstration persistant (localStorage) : file des comptes, journal
// chainé, alertes examinées. Remplace par l'API quand NEXT_PUBLIC_API_URL est set.

import { useEffect, useSyncExternalStore } from "react";
import {
  ACCOUNTS,
  JOURNAL,
  LISTINGS,
  RENTS,
  ROLE_LABEL,
  type Account,
  type AgentListing,
  type JournalEntry,
  type ListingStatus,
  type PayMethod,
  type RentEntry,
  type Role,
} from "./data";

export type DemoState = {
  accounts: Account[];
  journal: JournalEntry[];
  examined: string[];
  listings: AgentListing[];
  rents: RentEntry[];
  agentSessionId: string | null;
};

const KEY = "gs-field-demo-v1";

const seed = (): DemoState => ({
  accounts: ACCOUNTS.map((a) => ({ ...a })),
  journal: JOURNAL.map((j) => ({ ...j })),
  examined: ["AL-0017"],
  listings: LISTINGS.map((l) => ({ ...l })),
  rents: RENTS.map((r) => ({ ...r })),
  agentSessionId: "acc-002",
});

const SERVER_STATE = seed();
let state = seed();
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function set(next: DemoState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // stockage indisponible : la session reste en memoire
  }
  emit();
}

export function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...seed(), ...(JSON.parse(raw) as DemoState) };
  } catch {
    // stockage corrompu : on repart des donnees d'exemple
  }
  emit();
}

export function resetDemo() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  set(seed());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useDemoStore(): DemoState {
  // Le snapshot reste cote serveur jusqu'au montage : en navigation SPA, le
  // module est deja hydrate depuis localStorage alors que le HTML recu est
  // rendu avec la seed, ce qui casserait l'hydratation React.
  useEffect(() => {
    ensureHydrated();
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => (hydrated ? state : SERVER_STATE),
    () => SERVER_STATE,
  );
}

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function shortHash(s: string): string {
  const h = fnv(s);
  return `${h.slice(0, 4)}...${h.slice(4)}`;
}

function append(journal: JournalEntry[], action: string, author: string): JournalEntry[] {
  const top = journal[0];
  const at = new Date().toISOString();
  const seq = top.seq + 1;
  const prevHash = top.hash;
  return [
    {
      seq,
      at,
      action,
      author,
      prevHash,
      hash: shortHash(`${seq}|${at}|${action}|${author}|${prevHash}`),
    },
    ...journal,
  ];
}

export function chainIntegrity(journal: JournalEntry[]): boolean {
  for (let i = 0; i < journal.length - 1; i++) {
    if (journal[i].prevHash !== journal[i + 1].hash) return false;
  }
  return true;
}

function patchAccount(id: string, patch: Partial<Account>): Account[] {
  return state.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a));
}

export function validateAccount(id: string, role: Role, ordreVerified: boolean): Account | null {
  const prev = state.accounts.find((a) => a.id === id) ?? null;
  set({
    ...state,
    accounts: patchAccount(id, { status: "ACTIF", roleAssigned: role, ordreVerified }),
    journal: append(state.journal, `Compte validé · rôle ${ROLE_LABEL[role]}`, "LGR"),
  });
  return prev;
}

export function rejectAccount(id: string, motif: string): Account | null {
  const prev = state.accounts.find((a) => a.id === id) ?? null;
  set({
    ...state,
    accounts: patchAccount(id, { status: "REJETE" }),
    journal: append(state.journal, `Compte rejeté · motif : ${motif}`, "LGR"),
  });
  return prev;
}

export function suspendAccount(id: string, motif: string): Account | null {
  const prev = state.accounts.find((a) => a.id === id) ?? null;
  set({
    ...state,
    accounts: patchAccount(id, { status: "SUSPENDU" }),
    journal: append(state.journal, `Compte suspendu · motif : ${motif}`, "LGR"),
  });
  return prev;
}

export function reactivateAccount(id: string): Account | null {
  const prev = state.accounts.find((a) => a.id === id) ?? null;
  set({
    ...state,
    accounts: patchAccount(id, { status: "ACTIF" }),
    journal: append(state.journal, "Compte réactivé", "LGR"),
  });
  return prev;
}

export function restoreAccount(prev: Account, note: string) {
  set({
    ...state,
    accounts: state.accounts.map((a) => (a.id === prev.id ? { ...prev } : a)),
    journal: append(state.journal, `Décision annulée · ${note}`, "LGR"),
  });
}

export function addAccount(input: {
  name: string;
  phone: string;
  roleRequested: Role;
  pieces: string[];
}): string {
  const id = `acc-${Date.now().toString(36)}`;
  const account: Account = {
    id,
    name: input.name,
    phone: input.phone,
    roleRequested: input.roleRequested,
    roleAssigned: null,
    pieces: input.pieces,
    status: "EN_ATTENTE",
    received: new Date().toISOString(),
    ordreVerified: false,
  };
  set({
    ...state,
    accounts: [account, ...state.accounts],
    journal: append(
      state.journal,
      `Nouveau compte · rôle demandé ${ROLE_LABEL[input.roleRequested]}`,
      "Système",
    ),
  });
  return id;
}

export function markExamined(alertId: string) {
  if (state.examined.includes(alertId)) return;
  set({
    ...state,
    examined: [...state.examined, alertId],
    journal: append(state.journal, `Alerte ${alertId} marquée comme examinée`, "LGR"),
  });
}

export function contactGeometre(alertId: string, message: string) {
  set({
    ...state,
    journal: append(state.journal, `Message au géomètre · ${alertId} : ${message}`, "LGR"),
  });
}

// Espace professionnel agent (§2, §5). La publication exige un compte ACTIF :
// c'est la regle d'or, appliquee ici cote client comme le ferait l'API.
export function setAgentSession(id: string | null) {
  set({ ...state, agentSessionId: id });
}

function agentName(id: string): string {
  return state.accounts.find((a) => a.id === id)?.name ?? "Agent";
}

export function canAgentPublish(agentId: string | null): boolean {
  if (!agentId) return false;
  const account = state.accounts.find((a) => a.id === agentId);
  return account?.status === "ACTIF" && account.roleAssigned === "AGENT";
}

export function addListing(input: {
  agentId: string;
  parcelId: string;
  title: string;
  type: AgentListing["type"];
  transaction: AgentListing["transaction"];
  price: number;
  surfaceM2: number;
  zone: string;
}): AgentListing | null {
  if (!canAgentPublish(input.agentId)) return null;
  const listing: AgentListing = {
    id: `lst-${Date.now().toString(36)}`,
    ...input,
    status: "LIBRE",
    published: false,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  set({
    ...state,
    listings: [listing, ...state.listings],
    journal: append(
      state.journal,
      `Annonce créée · ${listing.parcelId} (brouillon)`,
      agentName(input.agentId),
    ),
  });
  return listing;
}

export function setListingStatus(id: string, status: ListingStatus) {
  const l = state.listings.find((x) => x.id === id);
  if (!l || !canAgentPublish(l.agentId)) return;
  set({
    ...state,
    listings: state.listings.map((x) => (x.id === id ? { ...x, status } : x)),
    journal: append(state.journal, `Statut bien ${l.parcelId} · ${status}`, agentName(l.agentId)),
  });
}

export function setListingPublished(id: string, published: boolean) {
  const l = state.listings.find((x) => x.id === id);
  if (!l || !canAgentPublish(l.agentId)) return;
  set({
    ...state,
    listings: state.listings.map((x) => (x.id === id ? { ...x, published } : x)),
    journal: append(
      state.journal,
      `${published ? "Publication" : "Dépublication"} annonce ${l.parcelId}`,
      agentName(l.agentId),
    ),
  });
}

// Encaissement Mobile Money simule : confirme le loyer et emet la quittance
// electronique. En production, declenche par webhook Flooz / T-Money / Mixx.
export function encaisserRent(id: string, method: PayMethod): RentEntry | null {
  const rent = state.rents.find((r) => r.id === id);
  if (!rent || rent.status === "PAYE") return null;
  const listing = state.listings.find((l) => l.id === rent.listingId);
  if (!listing || !canAgentPublish(listing.agentId)) return null;
  const paidAt = new Date().toISOString().slice(0, 10);
  const quittanceRef = `QIT-2026-${String(Date.now() % 10000).padStart(4, "0")}`;
  const updated: RentEntry = {
    ...rent,
    status: "PAYE",
    method,
    paidAt,
    quittanceRef,
    quittanceHash: shortHash(`${id}|${method}|${paidAt}`),
  };
  set({
    ...state,
    rents: state.rents.map((r) => (r.id === id ? updated : r)),
    journal: append(
      state.journal,
      `Loyer ${rent.month} encaissé · ${method} · quittance ${quittanceRef}`,
      agentName(listing.agentId),
    ),
  });
  return updated;
}

export function sendRentReminder(id: string) {
  const rent = state.rents.find((r) => r.id === id);
  if (!rent) return;
  const listing = state.listings.find((l) => l.id === rent.listingId);
  set({
    ...state,
    journal: append(
      state.journal,
      `Relance impayé ${rent.month} envoyée à ${rent.tenant}`,
      listing ? agentName(listing.agentId) : "Système",
    ),
  });
}
