// Tests des fonctions pures de /parcelle, avec le lanceur de tests de Node
// (Node 24 execute le TypeScript sans compilation) :
//   node --test src/app/parcelle/_lib/parcelle.test.mjs
// Aucun paquet a installer. Le mode exemple est force (NEXT_PUBLIC_DEMO_MODE)
// et NEXT_PUBLIC_API_URL est vide : api.ts ne fait aucun appel reseau.
import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

// L'alias "@/" de tsconfig.json (src/) n'existe que pour Next.js : on le
// resout ici pour Node, avant de charger api.ts.
const SRC = new URL("../../../", import.meta.url).href;
register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(spec, context, next) {
      if (spec.startsWith("@/")) return next(${JSON.stringify(SRC)} + spec.slice(2) + ".ts", context);
      return next(spec, context);
    }`),
  import.meta.url,
);
process.env.NEXT_PUBLIC_DEMO_MODE = "true";
delete process.env.NEXT_PUBLIC_API_URL;

const {
  ATTESTATION_PATTERN,
  DEMO_ATTESTATION,
  DEMO_MODE,
  PARCEL_ID_PATTERN,
  fetchParcelStatus,
  verifyAttestation,
} = await import("./api.ts");
const {
  formatArea,
  formatDate,
  formatDateTime,
  formatPlainDate,
  legalStatusLabel,
  shareMessage,
  shareUrl,
  shortHash,
} = await import("./format.ts");
const { sha256File } = await import("./sha256.ts");

const NBSP = " ";

test("formatArea suit les formats du design system", () => {
  assert.equal(formatArea(452.18), `452,18${NBSP}m²`);
  assert.equal(formatArea(10000), `10${NBSP}000,00${NBSP}m²`);
  assert.equal(
    formatArea(45218.4),
    `45${NBSP}218,40${NBSP}m² (4${NBSP}ha 52${NBSP}a 18${NBSP}ca)`,
  );
});

test("les dates sont en JJ/MM/AAAA, heure de Lome", () => {
  assert.equal(formatDate("2026-10-24T09:42:00Z"), "24/10/2026");
  assert.equal(formatDateTime("2026-10-24T09:42:00Z"), "24/10/2026 à 09:42");
  assert.equal(formatPlainDate("2026-09-12"), "12/09/2026");
});

test("shortHash garde 8 + 8 caracteres", () => {
  const hash = "a3f9c2e15d87b8aa0c4e9f1d2b3a4c5d6e7f8091a2b3c4d5e6f708191c04d8ce";
  assert.equal(shortHash(hash), "a3f9c2e1…1c04d8ce");
  assert.equal(shortHash("court"), "court");
});

test("legalStatusLabel ecrit chaque statut en toutes lettres", () => {
  assert.equal(legalStatusLabel("TITRE"), "Titré");
  assert.equal(legalStatusLabel("COUTUMIER_NON_TITRE"), "Coutumier non titré");
  assert.equal(legalStatusLabel("EN_LITIGE"), "En litige");
  assert.equal(legalStatusLabel("INCONNU"), "Statut non renseigné");
});

test("les identifiants suivent le format du serveur", () => {
  assert.ok(PARCEL_ID_PATTERN.test("TG-AG3-00457"));
  assert.ok(PARCEL_ID_PATTERN.test("TG-AGO-00457"));
  assert.ok(PARCEL_ID_PATTERN.test("TG-GO1-100000"));
  assert.ok(!PARCEL_ID_PATTERN.test("GS-2026-000142"));
  assert.ok(!PARCEL_ID_PATTERN.test("tg-ago-00457"));
  assert.ok(ATTESTATION_PATTERN.test("AT-2026-000031"));
  assert.ok(!ATTESTATION_PATTERN.test("AT-26-31"));
});

test("le message WhatsApp porte le lien et la mention obligatoire", async () => {
  assert.ok(DEMO_MODE);
  const result = await fetchParcelStatus("TG-AG3-00457");
  assert.ok(result.ok);
  const url = shareUrl("https://geosmart.tg", "TG-AG3-00457");
  assert.equal(url, "https://geosmart.tg/parcelle?id=TG-AG3-00457");
  assert.equal(
    shareMessage(result.data, url),
    [
      "Parcelle TG-AG3-00457 sur GeoSmart Field",
      `Coutumier non titré · 452,18${NBSP}m² · parcelle certifiée`,
      url,
      "Ne vaut pas titre foncier.",
    ].join("\n"),
  );
});

test("le mode exemple distingue parcelle connue et inconnue", async () => {
  const litige = await fetchParcelStatus("TG-AG3-00377");
  assert.ok(litige.ok && litige.data.legalStatus === "EN_LITIGE");
  assert.ok(litige.ok && !litige.data.certified);
  const absent = await fetchParcelStatus("TG-AG3-99999");
  assert.deepEqual(absent, { ok: false, kind: "not-found", message: "Parcelle introuvable." });
});

test("la verification d'attestation compare l'empreinte", async () => {
  const good = await verifyAttestation(DEMO_ATTESTATION.number, DEMO_ATTESTATION.hash.toUpperCase());
  assert.ok(good.ok && good.data.valid && good.data.authentic);
  const forged = await verifyAttestation(DEMO_ATTESTATION.number, "0".repeat(64));
  assert.ok(forged.ok && !forged.data.valid && !forged.data.authentic);
  const unknown = await verifyAttestation("AT-2026-999999", "0".repeat(64));
  assert.ok(!unknown.ok && unknown.kind === "not-found");
});

test("sha256File calcule l'empreinte du fichier sur l'appareil", async () => {
  const hash = await sha256File(new Blob(["GeoSmart"]));
  assert.match(hash, /^[0-9a-f]{64}$/);
  const { createHash } = await import("node:crypto");
  assert.equal(hash, createHash("sha256").update("GeoSmart").digest("hex"));
});
