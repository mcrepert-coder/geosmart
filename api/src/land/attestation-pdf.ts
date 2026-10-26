import PDFDocument = require('pdfkit');
import type { Vertex } from './validate-vertices';

export const ATTESTATION_NOTICE = 'Ne vaut pas titre foncier' as const;

export interface AttestationDocument {
  number: string; parcelId: string; parcelVersion: number;
  areaM2: number; perimeterM: number; geometryHash: string;
  surveyorId: string; surveyorName: string; issuedAt: string;
  notice: typeof ATTESTATION_NOTICE; vertices: Vertex[];
}

export interface AttestationPdfRenderer {
  render(document: AttestationDocument): Promise<Buffer>;
}

// La police est injectee par l'integrateur, sans chemin provenant d'une requete.
// Choisir une police dont les glyphes couvrent les noms et langues du projet.
export class PdfKitAttestationRenderer implements AttestationPdfRenderer {
  constructor(private readonly font: Buffer) {}

  async render(input: AttestationDocument): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 45, compress: true,
      info: { Title: 'Attestation de leve', Author: 'GeoSmart Field',
        CreationDate: new Date(input.issuedAt), ModDate: new Date(input.issuedAt) } });
    const chunks: Buffer[] = [];
    const result = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    try {
      doc.font(this.font).fontSize(10);
      const heading = () => {
        doc.fontSize(15).text('Attestation de leve', { align: 'center' });
        doc.fontSize(11).text(ATTESTATION_NOTICE, { align: 'center' });
        doc.moveDown(); doc.fontSize(10);
      };
      const line = (text: string) => {
        if (doc.y + doc.heightOfString(text) > doc.page.height - doc.page.margins.bottom) {
          doc.addPage(); heading();
        }
        doc.text(text);
      };
      heading();
      line(`Numero : ${input.number}`);
      line(`Parcelle : ${input.parcelId}`);
      line(`Version : ${input.parcelVersion}`);
      line(`Date d'emission : ${input.issuedAt}`);
      line(`Geometre : ${input.surveyorName} (${input.surveyorId})`);
      line(`Surface (m2) : ${input.areaM2}`);
      line(`Perimetre (m) : ${input.perimeterM}`);
      line('Empreinte SHA-256 du polygone :');
      line(input.geometryHash);
      doc.moveDown(); line('Bornes WGS84 (longitude, latitude) :');
      for (const vertex of input.vertices) line(`${vertex.number} : ${vertex.lon}, ${vertex.lat}`);
      doc.moveDown(); line(ATTESTATION_NOTICE);
      doc.end();
    } catch (error) {
      doc.destroy(error as Error);
    }
    return result;
  }
}
