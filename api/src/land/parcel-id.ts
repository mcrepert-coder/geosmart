import communes from './communes.json';

// Identifiant public : TG-<commune>-<numero>, ex. TG-AG3-00457. La commune
// tient en 3 lettres ou chiffres (decision de LGR, #24).
// Le numero a 5 chiffres, 6 au-dela de 99 999 (question posee a LGR, #24).
export const PARCEL_ID_PATTERN = /^TG-[A-Z0-9]{3}-\d{5,6}$/;

// Communes ouvertes (Grand Lome pour le pilote). Pour en ajouter une, ajouter
// sa ligne dans communes.json, sans toucher au code (decision de LGR, #24).
export const COMMUNES: Record<string, string> = communes;

export function isCommuneCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(COMMUNES, code);
}

export function formatParcelId(commune: string, sequence: number): string {
  if (!isCommuneCode(commune)) {
    throw new RangeError(`Code de commune inconnu : ${commune}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999999) {
    throw new RangeError(`Numero de parcelle invalide : ${sequence}`);
  }
  return `TG-${commune}-${String(sequence).padStart(5, '0')}`;
}

export function isParcelId(value: string): boolean {
  return PARCEL_ID_PATTERN.test(value);
}
