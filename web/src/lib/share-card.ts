import type { Property } from "./data";
import { LEGAL_LABEL, TYPE_LABEL } from "./data";
import { formatPrice } from "./format";
import { primaryPhoto } from "./photos";

export type ShareFormat = "story" | "feed";

const DIMS: Record<ShareFormat, [number, number]> = {
  story: [1080, 1920],
  feed: [1080, 1350],
};

const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) break;
    } else {
      cur = next;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "...";
  }
  return lines;
}

function shortSurface(m2: number): string {
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(1).replace(".", ",")} ha`;
  return `${m2} m²`;
}

function pill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  padX: number,
  h: number,
): number {
  ctx.font = font;
  const w = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic";
  return w;
}

// Carte visuelle prete a publier : story 9:16 (TikTok) ou feed 4:5 (Instagram).
export async function downloadShareCard(
  p: Property,
  format: ShareFormat,
  shareUrl: string,
): Promise<void> {
  const [W, H] = DIMS[format];
  const u = H / 1920;
  const M = 72;
  const img = await loadImage(primaryPhoto(p));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");

  cover(ctx, img, W, H);

  let g = ctx.createLinearGradient(0, 0, 0, H * 0.4);
  g.addColorStop(0, "rgba(8,20,28,0.72)");
  g.addColorStop(1, "rgba(8,20,28,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H * 0.4);
  g = ctx.createLinearGradient(0, H * 0.45, 0, H);
  g.addColorStop(0, "rgba(8,20,28,0)");
  g.addColorStop(0.55, "rgba(8,20,28,0.8)");
  g.addColorStop(1, "rgba(8,20,28,0.95)");
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.45, W, H * 0.55);

  const y = (v: number) => v * u;

  // Marque + statut juridique en haut.
  ctx.fillStyle = "#d36534";
  roundRect(ctx, M, y(70), 40 * u, 40 * u, 9 * u);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${44 * u}px ${SANS}`;
  ctx.fillText("GeoSmart Immo", M + 56 * u, y(104));
  const legal = LEGAL_LABEL[p.legalStatus];
  ctx.font = `600 ${32 * u}px ${SANS}`;
  const lw = ctx.measureText(legal).width + 48 * u;
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  roundRect(ctx, W - M - lw, y(66), lw, 52 * u, 26 * u);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(legal, W - M - lw + 24 * u, y(92));
  ctx.textBaseline = "alphabetic";

  // Bloc bas : prix, titre, zone, caracteristiques, reference, appel a l'action.
  ctx.fillStyle = "#d36534";
  ctx.fillRect(M, y(1210), 96 * u, 10 * u);

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${84 * u}px ${SANS}`;
  const price = formatPrice(p.price) + (p.transaction === "LOCATION" ? " /mois" : "");
  ctx.fillText(price, M, y(1300));

  ctx.font = `700 ${52 * u}px ${SANS}`;
  const titleLines = wrap(ctx, p.title, W - M * 2, 2);
  let ty = 1360;
  for (const line of titleLines) {
    ctx.fillText(line, M, y(ty));
    ty += 60;
  }

  ctx.fillStyle = "#cfe0ea";
  ctx.font = `500 ${38 * u}px ${SANS}`;
  const zoneY = ty + 34;
  ctx.fillText(`${p.zone} · Lomé, Togo`, M, y(zoneY));

  const chipsY = zoneY + 52;
  const chipH = 56 * u;
  const chipFont = `600 ${32 * u}px ${SANS}`;
  let cx = M;
  for (const label of [shortSurface(p.surfaceM2), TYPE_LABEL[p.type], p.transaction === "VENTE" ? "Vente" : "Location"]) {
    cx += pill(ctx, label, cx, y(chipsY), chipFont, 24 * u, chipH) + 16 * u;
  }

  const refY = chipsY + 90;
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${36 * u}px ${MONO}`;
  ctx.fillText(`Réf. parcelle ${p.parcelId}`, M, y(refY));
  ctx.fillStyle = "#9fb6c4";
  ctx.font = `400 ${30 * u}px ${SANS}`;
  ctx.fillText("Levé RTK certifié · ne vaut pas titre foncier", M, y(refY + 46));

  const ctaY = 1760;
  const ctaH = 96 * u;
  ctx.fillStyle = "#d36534";
  roundRect(ctx, M, y(ctaY), W - M * 2, ctaH, 18 * u);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${24 * u}px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const link = shareUrl.replace(/^https?:\/\//, "");
  const maxLinkFont = 24 * u;
  const minLinkFont = 14 * u;
  let linkFont = maxLinkFont;
  while (linkFont > minLinkFont) {
    ctx.font = `600 ${linkFont}px ${SANS}`;
    if (ctx.measureText(link).width <= W - M * 2 - 32 * u) break;
    linkFont -= 1;
  }
  ctx.font = `700 ${30 * u}px ${SANS}`;
  ctx.fillText("Voir l'annonce", W / 2, y(ctaY) + ctaH * 0.34);
  ctx.font = `600 ${linkFont}px ${SANS}`;
  ctx.fillText(link, W / 2, y(ctaY) + ctaH * 0.72);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `geosmart-${p.parcelId}-${format}.png`;
  a.click();
  URL.revokeObjectURL(url);
}