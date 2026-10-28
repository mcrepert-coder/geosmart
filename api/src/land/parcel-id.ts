// Identifiant public des maquettes v1.0 : TG-<commune>-<numero>, ex. TG-AGO-00457.
// Le numero a 5 chiffres, 6 au-dela de 99 999 (question posee a LGR, #24).
export const PARCEL_ID_PATTERN = /^TG-[A-Z]{3}-\d{5,6}$/;

// Liste PROVISOIRE, limitee aux codes des maquettes, en attendant la liste
// officielle des communes demandee a LGR (#24).
export const COMMUNES: Record<string, string> = {
  AGO: 'Agoe-Nyive',
  LOM: 'Lome',
};

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
