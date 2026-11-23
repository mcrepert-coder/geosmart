// PDF minimal (une page A4, Helvetica WinAnsi) pour l'attestation de levé.
// RG-09 : mention en tete et pied, pas de QR code.

import type { Attestation } from "./data";
import { formatDate, formatSurface } from "./format";

const WINANSI: Record<string, string> = {
  "é": "\\351",
  "è": "\\350",
  "ê": "\\352",
  "ë": "\\353",
  "à": "\\340",
  "â": "\\342",
  "ç": "\\347",
  "î": "\\356",
  "ï": "\\357",
  "ô": "\\364",
  "ù": "\\371",
  "û": "\\373",
  "ü": "\\374",
  "É": "\\311",
  "È": "\\310",
  "Ê": "\\312",
  "À": "\\300",
  "Â": "\\302",
  "Ç": "\\307",
  "Î": "\\316",
  "Ô": "\\324",
  "Û": "\\333",
  "°": "\\260",
  "²": "\\262",
  "·": "\\267",
  " ": "\\240",
  "’": "'",
  "–": "-",
  "—": "-",
};

function esc(s: string): string {
  return s
    .replace(/[\\()]/g, (m) => `\\${m}`)
    .replace(/[^\x20-\x7E]/g, (ch) => WINANSI[ch] ?? "");
}

export function buildAttestationPdf(a: Attestation): Blob {
  const lines: string[] = [
    "BT",
    "/F2 9 Tf",
    "50 792 Td",
    `(ATTESTATION DE LEVE - NE VAUT PAS TITRE FONCIER) Tj`,
    "0 -26 Td",
    "/F2 16 Tf",
    `(${esc(`Attestation de levé n° ${a.id}`)}) Tj`,
    "0 -30 Td",
    "/F1 11 Tf",
    "17 TL",
  ];
  const rows = [
    `Parcelle : ${a.parcelId} - version ${a.version}`,
    `Surface : ${formatSurface(a.surfaceM2)}`,
    `Périmètre : ${a.perimeterM.toFixed(2).replace(".", ",")} m (UTM 31N)`,
    `Bornes : ${a.bornes.join(", ")}`,
    `Date du levé : ${formatDate(a.issuedAt)}`,
    `Géomètre : ${a.geometre}`,
    "",
    "Empreinte SHA-256 du document :",
    a.sha256.slice(0, 32),
    a.sha256.slice(32),
    "",
    "Mesure réalisée en RTK Fixed, moyenne de 10 époques par borne.",
    "Vérification de l'empreinte auprès de GeoSmart Field ou de l'ANDF.",
  ];
  for (const r of rows) lines.push(`(${esc(r)}) Tj`, "T*");
  lines.push(
    "0 -10 Td",
    "/F2 9 Tf",
    "(NE VAUT PAS TITRE FONCIER - CONSULTEZ L'ANDF) Tj",
    "0 -14 Td",
    "/F1 9 Tf",
    `(GeoSmart Field seconde l'ANDF, il ne la remplace pas. - ${esc(a.id)}) Tj`,
    "ET",
  );
  const stream = lines.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

export function downloadAttestation(a: Attestation) {
  const url = URL.createObjectURL(buildAttestationPdf(a));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${a.id}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}