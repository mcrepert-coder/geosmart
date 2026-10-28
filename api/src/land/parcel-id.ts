export const PARCEL_ID_PATTERN = /^GS-\d{4}-\d{6}$/;

// Identifiant public : GS-<annee>-<numero sur 6 chiffres>, ex. GS-2026-000142.
export function formatParcelId(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new RangeError(`Annee invalide : ${year}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999999) {
    throw new RangeError(`Numero de parcelle invalide : ${sequence}`);
  }
  return `GS-${year}-${String(sequence).padStart(6, '0')}`;
}

export function isParcelId(value: string): boolean {
  return PARCEL_ID_PATTERN.test(value);
}
