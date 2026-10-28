// Types et appels repris de contracts/land.yaml (routes publiques).

export type LegalStatus = "TITRE" | "COUTUMIER_NON_TITRE" | "EN_LITIGE" | "INCONNU";

export interface ParcelPublicStatus {
  id: string;
  legalStatus: LegalStatus;
  statusSource: string | null;
  statusDate: string | null;
  titleNumber: string | null;
  disputeNote: string | null;
  certified: boolean;
  areaM2: number;
  version: number;
  versionsCount: number;
  lastSurveyAt: string;
  bornage: {
    neighboursTotal: number;
    neighboursPresent: number;
    heldAt: string;
  } | null;
  updatedAt: string;
  warnings: string[];
}

export interface AttestationVerification {
  number: string;
  valid: boolean;
  // Le fichier est celui emis, meme si la parcelle a change depuis.
  authentic: boolean;
  parcelId: string;
  parcelVersion: number;
  issuedAt: string;
  superseded: boolean;
  mention: string;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "not-found" | "invalid" | "network"; message: string };

export const PARCEL_ID_PATTERN = /^TG-[A-Z]{3}-\d{5,6}$/;
export const ATTESTATION_PATTERN = /^AT-\d{4}-\d{6}$/;

// Sans NEXT_PUBLIC_API_URL, la page affiche des donnees d'exemple, clairement
// signalees, en attendant que l'API soit branchee (issue #22).
const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
export const DEMO_MODE = API_URL === "";

async function getJson<T>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (res.ok) return { ok: true, data: (await res.json()) as T };
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    if (res.status === 404) {
      return { ok: false, kind: "not-found", message: body?.message ?? "Introuvable." };
    }
    return {
      ok: false,
      kind: "invalid",
      message: body?.message ?? "La demande n'a pas pu être traitée.",
    };
  } catch {
    return {
      ok: false,
      kind: "network",
      message: "Le serveur ne répond pas. Vérifiez votre connexion et réessayez.",
    };
  }
}

export function fetchParcelStatus(id: string): Promise<ApiResult<ParcelPublicStatus>> {
  if (DEMO_MODE) return demoParcel(id);
  return getJson(`/parcels/${encodeURIComponent(id)}/status`);
}

export function verifyAttestation(
  number: string,
  hash: string,
): Promise<ApiResult<AttestationVerification>> {
  if (DEMO_MODE) return demoAttestation(number, hash);
  return getJson(
    `/attestations/${encodeURIComponent(number)}/verify?hash=${encodeURIComponent(hash)}`,
  );
}

// Donnees d'exemple, reprises des maquettes v1.0 (C1, T8). Fictives.
const NOT_A_TITLE = "Ne vaut pas titre foncier.";

const DEMO_PARCELS: Record<string, ParcelPublicStatus> = {
  "TG-AGO-00457": {
    id: "TG-AGO-00457",
    legalStatus: "COUTUMIER_NON_TITRE",
    statusSource: "Declaration du chef de canton, PV 2026/41",
    statusDate: "2026-10-22",
    titleNumber: null,
    disputeNote: null,
    certified: true,
    areaM2: 452.18,
    version: 2,
    versionsCount: 2,
    lastSurveyAt: "2026-10-24T09:42:00Z",
    bornage: { neighboursTotal: 3, neighboursPresent: 3, heldAt: "2026-10-24T09:30:00Z" },
    updatedAt: "2026-10-24T09:42:00Z",
    warnings: [NOT_A_TITLE],
  },
  "TG-AGO-00377": {
    id: "TG-AGO-00377",
    legalStatus: "EN_LITIGE",
    statusSource: "Tribunal de Lome, ordonnance 2026/88",
    statusDate: "2026-09-12",
    titleNumber: null,
    disputeNote:
      "Un voisin conteste la limite est. Ne versez aucun acompte avant sa résolution auprès des autorités compétentes.",
    certified: false,
    areaM2: 612.4,
    version: 3,
    versionsCount: 3,
    lastSurveyAt: "2026-10-14T10:05:00Z",
    bornage: { neighboursTotal: 3, neighboursPresent: 2, heldAt: "2026-10-14T09:00:00Z" },
    updatedAt: "2026-10-14T10:05:00Z",
    warnings: [
      "Parcelle signalee en litige par la source indiquee.",
      "Leve non certifie.",
      NOT_A_TITLE,
    ],
  },
  "TG-LOM-01188": {
    id: "TG-LOM-01188",
    legalStatus: "INCONNU",
    statusSource: null,
    statusDate: null,
    titleNumber: null,
    disputeNote: null,
    certified: true,
    areaM2: 12045.6,
    version: 1,
    versionsCount: 1,
    lastSurveyAt: "2026-10-02T15:20:00Z",
    bornage: null,
    updatedAt: "2026-10-02T15:20:00Z",
    warnings: ["Statut juridique non renseigne par une source autorisee.", NOT_A_TITLE],
  },
};

export const DEMO_ATTESTATION = {
  number: "AT-2026-000031",
  hash: "a3f9c2e15d87b8aa0c4e9f1d2b3a4c5d6e7f8091a2b3c4d5e6f708191c04d8ce",
};

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 400));
}

function demoParcel(id: string): Promise<ApiResult<ParcelPublicStatus>> {
  const parcel = DEMO_PARCELS[id];
  return delay(
    parcel
      ? { ok: true, data: parcel }
      : { ok: false, kind: "not-found", message: "Parcelle introuvable." },
  );
}

function demoAttestation(
  number: string,
  hash: string,
): Promise<ApiResult<AttestationVerification>> {
  if (number !== DEMO_ATTESTATION.number) {
    return delay({ ok: false, kind: "not-found", message: "Attestation introuvable." });
  }
  const authentic = hash.toLowerCase() === DEMO_ATTESTATION.hash;
  return delay({
    ok: true,
    data: {
      number,
      valid: authentic,
      authentic,
      parcelId: "TG-AGO-00457",
      parcelVersion: 2,
      issuedAt: "2026-10-24T11:02:00Z",
      superseded: false,
      mention: "Ne vaut pas titre foncier",
    },
  });
}
