export type ListingStatus = "BROUILLON" | "PUBLIE" | "RETIRE";

export type Draft = {
  parcelId: string;
  type: "TERRAIN" | "MAISON";
  transaction: "VENTE" | "LOCATION";
  title: string;
  description: string;
  price: string;
  pricePeriod: "MOIS" | "AN";
  zone: string;
};

export const EMPTY_DRAFT: Draft = {
  parcelId: "",
  type: "TERRAIN",
  transaction: "VENTE",
  title: "",
  description: "",
  price: "",
  pricePeriod: "MOIS",
  zone: "",
};

/// Validation locale avant envoi : l'API reste juge mais l'erreur est immediate.
export function validateDraft(draft: Draft): string | null {
  if (!/^TG-[A-Z0-9]{3}-\d{5,6}$/.test(draft.parcelId.trim().toUpperCase())) {
    return "Identifiant de parcelle invalide (format TG-XXX-##### ou TG-XXX-######).";
  }
  if (!draft.title.trim()) return "Le titre est obligatoire.";
  const price = Number(draft.price);
  if (!Number.isFinite(price) || price <= 0) return "Le prix doit etre superieur a zero.";
  if (draft.transaction === "LOCATION" && !draft.pricePeriod) {
    return "La periode de location est obligatoire.";
  }
  return null;
}

/// Corps de POST /properties a partir du formulaire.
export function listingPayload(draft: Draft, status: ListingStatus) {
  const payload = {
    parcelId: draft.parcelId.trim().toUpperCase(),
    type: draft.type,
    transaction: draft.transaction,
    title: draft.title.trim(),
    description: draft.description.trim(),
    price: Number(draft.price),
    currency: "XOF",
    zone: draft.zone.trim() || null,
    status,
  };
  return draft.transaction === "LOCATION"
    ? { ...payload, pricePeriod: draft.pricePeriod }
    : payload;
}
