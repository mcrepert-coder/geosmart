const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

const ACCEPTED_DOCUMENT_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;

/// Pieces exigees par l'administration pour valider le compte (EF-403).
export function requiredDocuments(role: string): string[] {
  const required = ["la pièce d’identité"];
  if (role === "AGENT") {
    required.push("une pièce professionnelle (carte professionnelle, agrément ou RCCM)");
  }
  if (role === "GEOMETRE") required.push("l’attestation d’inscription à l’Ordre");
  return required;
}

/// Contrôle avant envoi, comme le serveur : JPEG, PNG ou PDF, 5 Mo au plus.
export function fileProblem(file: { type: string; size: number }): string | null {
  if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type as (typeof ACCEPTED_DOCUMENT_TYPES)[number])) {
    return "Format accepté : JPEG, PNG ou PDF.";
  }
  if (file.size > MAX_DOCUMENT_BYTES) return "Le fichier dépasse 5 Mo.";
  if (file.size === 0) return "Le fichier est vide.";
  return null;
}
