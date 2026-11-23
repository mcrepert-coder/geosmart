// Tests des fonctions pures extraites pour le site web, executes avec le
// lanceur de tests de Node (Node 24 execute le TypeScript sans compilation) :
//   node --test src/lib/web-utils.test.mjs
import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

const SRC = new URL("../", import.meta.url).href;
register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(spec, context, next) {
      if (spec.startsWith("@/")) return next(${JSON.stringify(SRC)} + spec.slice(2) + ".ts", context);
      if (spec.startsWith(".") && !/\\.[a-z0-9]+$/i.test(spec.split("?")[0].split("#")[0])) {
        return next(new URL(spec + ".ts", context.parentURL).href, context);
      }
      return next(spec, context);
    }`),
  import.meta.url,
);

const { fileProblem, requiredDocuments } = await import("./account-documents.ts");
const { EMPTY_DRAFT, listingPayload, validateDraft } = await import("./agent-listing-form.ts");
const { loginPhone } = await import("./phone.ts");

test("requiredDocuments selon le role", () => {
  assert.deepEqual(requiredDocuments("CLIENT"), ["la pièce d’identité"]);
  assert.deepEqual(requiredDocuments("TOPOGRAPHE"), ["la pièce d’identité"]);
  assert.deepEqual(requiredDocuments("AGENT"), [
    "la pièce d’identité",
    "une pièce professionnelle (carte professionnelle, agrément ou RCCM)",
  ]);
  assert.deepEqual(requiredDocuments("GEOMETRE"), [
    "la pièce d’identité",
    "l’attestation d’inscription à l’Ordre",
  ]);
});

test("loginPhone accepte les formats local et international", () => {
  assert.equal(loginPhone("90 00 00 03"), "+22890000003");
  assert.equal(loginPhone("90000003"), "+22890000003");
  assert.equal(loginPhone("+228 90 00 00 03"), "+22890000003");
  assert.equal(loginPhone("+228(90)00-00-03"), "+22890000003");
  assert.equal(loginPhone(" 22890000003 "), "+22890000003");
});

test("fileProblem controle type et taille", () => {
  assert.equal(fileProblem({ type: "image/jpeg", size: 1024 }), null);
  assert.equal(fileProblem({ type: "image/png", size: 1024 }), null);
  assert.equal(fileProblem({ type: "application/pdf", size: 1024 }), null);
  assert.equal(fileProblem({ type: "text/plain", size: 10 }), "Format accepté : JPEG, PNG ou PDF.");
  assert.equal(fileProblem({ type: "image/jpeg", size: 5 * 1024 * 1024 + 1 }), "Le fichier dépasse 5 Mo.");
  assert.equal(fileProblem({ type: "image/jpeg", size: 0 }), "Le fichier est vide.");
});

test("validateDraft refuse les donnees invalides", () => {
  assert.ok(validateDraft({ ...EMPTY_DRAFT, parcelId: "BAD", title: "T", price: "10" }));
  assert.ok(validateDraft({ ...EMPTY_DRAFT, parcelId: "TG-AG3-00457", title: "", price: "10" }));
  assert.ok(validateDraft({ ...EMPTY_DRAFT, parcelId: "TG-AG3-00457", title: "T", price: "0" }));
  assert.equal(
    validateDraft({ ...EMPTY_DRAFT, parcelId: "TG-AG3-00457", title: "Terrain", price: "1000" }),
    null,
  );
  assert.equal(
    validateDraft({
      ...EMPTY_DRAFT,
      parcelId: "tg-ag3-00457",
      transaction: "LOCATION",
      pricePeriod: "AN",
      title: "Maison",
      price: "50000",
    }),
    null,
  );
  assert.equal(
    validateDraft({ ...EMPTY_DRAFT, parcelId: "TG-AG3-004567", title: "T", price: "10" }),
    null,
  );
});

test("listingPayload normalise la parcelle et la periode", () => {
  const vente = listingPayload(
    { ...EMPTY_DRAFT, parcelId: " tg-ag3-00457 ", title: " Terrain ", price: "25000", zone: " Agoe " },
    "BROUILLON",
  );
  assert.equal(vente.parcelId, "TG-AG3-00457");
  assert.equal(vente.title, "Terrain");
  assert.equal(vente.zone, "Agoe");
  assert.equal(vente.status, "BROUILLON");
  assert.equal(vente.price, 25000);
  assert.ok(!("pricePeriod" in vente));

  const location = listingPayload(
    { ...EMPTY_DRAFT, parcelId: "TG-AG3-00457", transaction: "LOCATION", title: "Maison", price: "1000", pricePeriod: "AN", zone: "" },
    "PUBLIE",
  );
  assert.equal(location.pricePeriod, "AN");
  assert.equal(location.zone, null);
});

test("mapProperty normalise une annonce API", async () => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
  const { mapProperty } = await import(`./listings-api.ts?test=${Date.now()}`);
  const property = mapProperty({
    id: "p1",
    parcelId: "TG-AG3-00457",
    type: "TERRAIN",
    transaction: "VENTE",
    title: "Terrain",
    description: null,
    price: 1000,
    zone: null,
    status: "PUBLIE",
    badges: { parcelCertified: true, agentCertified: false },
    parcel: {
      legalStatus: "TITRE",
      areaM2: 450,
      approximateLocation: { latitude: 6.2, longitude: 1.2 },
    },
    primaryPhotoUrl: "/photos/a.jpg",
  });
  assert.equal(property.zone, "Zone non précisée");
  assert.equal(property.description, "");
  assert.equal(property.surfaceM2, 450);
  assert.equal(property.coords.x, 1.2);
  assert.equal(property.coords.y, 6.2);
  assert.deepEqual(property.remotePhotos, ["/listings-api/photos/a.jpg"]);
  assert.equal(property.parcelCertified, true);
});
