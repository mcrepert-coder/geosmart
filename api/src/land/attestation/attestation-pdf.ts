import PDFDocument from 'pdfkit';
import type { ParcelBoundary } from '../parcel-version.entity';

// Mention exigee par RG-09, reprise mot pour mot.
export const ATTESTATION_MENTION = 'Ne vaut pas titre foncier';

export interface AttestationPdfData {
  number: string;
  parcelId: string;
  parcelVersion: number;
  issuedAt: Date;
  areaM2: number;
  perimeterM: number;
  locality: string | null;
  surveyorLabel: string;
  geometryHash: string;
  boundaries: ParcelBoundary[];
  // Sommets du polygone, dans l'ordre des bornes : [longitude, latitude].
  vertices: [number, number][];
}

function frenchNumber(value: number, decimals = 2): string {
  const [whole, fraction] = value.toFixed(decimals).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${fraction}`;
}

// EF-204 : numero, surface, perimetre, bornes, version, date, geometre,
// empreinte du polygone et mention. Pas de QR code (EF-204).
export function buildAttestationPdf(data: AttestationPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Attestation de leve ${data.number}`,
        Author: 'GeoSmart',
        Subject: ATTESTATION_MENTION,
        CreationDate: data.issuedAt,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(18).text('ATTESTATION DE LEVE', {
      align: 'center',
    });
    doc.moveDown(0.3);
    doc.fontSize(14).fillColor('#b00020').text(ATTESTATION_MENTION, {
      align: 'center',
    });
    doc.fillColor('black').moveDown();

    const line = (label: string, value: string) => {
      doc.font('Helvetica-Bold').fontSize(11).text(`${label} : `, {
        continued: true,
      });
      doc.font('Helvetica').text(value);
    };
    line('Numero', data.number);
    line('Parcelle', `${data.parcelId}, version ${data.parcelVersion}`);
    line('Date', data.issuedAt.toISOString().slice(0, 10));
    line('Localite', data.locality ?? 'non renseignee');
    line('Surface', `${frenchNumber(data.areaM2)} m2 (UTM 31N)`);
    line('Perimetre', `${frenchNumber(data.perimeterM)} m (UTM 31N)`);
    line('Geometre', data.surveyorLabel);
    doc.moveDown();

    doc.font('Helvetica-Bold').text('Bornes (WGS84, EPSG:4326)');
    doc.font('Helvetica').fontSize(10);
    data.boundaries.forEach((b, i) => {
      const vertex = data.vertices[i];
      const where = vertex
        ? `lon ${vertex[0].toFixed(9)}, lat ${vertex[1].toFixed(9)}`
        : 'position non disponible';
      const quality = [
        b.fixQuality,
        b.pdop !== undefined ? `PDOP ${b.pdop}` : null,
        b.satellitesCount !== undefined ? `${b.satellitesCount} sat.` : null,
      ]
        .filter(Boolean)
        .join(', ');
      doc.text(`${b.name ?? `B${b.pointNumber}`} : ${where} - ${quality}`);
    });
    doc.moveDown();

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('Empreinte SHA-256 du polygone');
    doc.font('Helvetica').text(data.geometryHash);
    doc.moveDown();
    doc.text(
      `Pour verifier ce document, comparez son empreinte SHA-256 a celle ` +
        `enregistree pour l'attestation ${data.number} sur GeoSmart.`,
    );
    doc.moveDown();
    doc
      .font('Helvetica-Bold')
      .text(`Ce document est une attestation de leve. ${ATTESTATION_MENTION}.`);
    doc.end();
  });
}
