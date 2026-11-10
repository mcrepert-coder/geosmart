// Donnees d'exemple (DEMO_MODE) conformes aux contrats listings.yaml /
// auth.yaml / land.yaml. Remplacees par l'API quand NEXT_PUBLIC_API_URL est set.

export type PropertyType = "TERRAIN" | "MAISON";
export type TransactionType = "VENTE" | "LOCATION";
export type LegalStatus = "TITRE" | "COUTUMIER_NON_TITRE" | "EN_LITIGE" | "INCONNU";

export type Property = {
  id: string;
  parcelId: string;
  type: PropertyType;
  transaction: TransactionType;
  title: string;
  price: number;
  surfaceM2: number;
  zone: string;
  legalStatus: LegalStatus;
  parcelCertified: boolean;
  agentCertified: boolean;
  agentName: string;
  description: string;
  coords: { x: number; y: number };
  photoHue: [string, string];
  mapLocation?: { latitude: number; longitude: number };
  remotePhotos?: string[];
  pricePeriod?: "MOIS" | "AN" | null;
};

export const PROPERTIES: Property[] = [
  {
    id: "b1f0c2a4-1111-4a10-9c01-0a1b2c3d4e01",
    parcelId: "TG-AG3-00457",
    type: "TERRAIN",
    transaction: "VENTE",
    title: "Terrain 452 m² · Agoè-Sogbossito",
    price: 18_500_000,
    surfaceM2: 452.18,
    zone: "Agoè-Sogbossito",
    legalStatus: "COUTUMIER_NON_TITRE",
    parcelCertified: true,
    agentCertified: true,
    agentName: "Kodjo Amegah",
    description:
      "Terrain plat borné au centimètre (RTK Fixed), accès voirie de 8 m. Levé contradictoire avec les voisins Nord et Est. Idéal habitation.",
    coords: { x: 480, y: 560 },
    photoHue: ["#b08968", "#8a6a4f"],
  },
  {
    id: "b1f0c2a4-2222-4a10-9c01-0a1b2c3d4e02",
    parcelId: "TG-LOM-01188",
    type: "MAISON",
    transaction: "VENTE",
    title: "Maison F5 sur 600 m² · Adidogomé",
    price: 42_000_000,
    surfaceM2: 600,
    zone: "Adidogomé",
    legalStatus: "TITRE",
    parcelCertified: true,
    agentCertified: true,
    agentName: "Ama Kpodar",
    description:
      "Maison F5 sur parcelle titrée, 5 pièces, salon double, cour clôturée. Titre foncier consultable à l'ANDF. Levé certifié version 3.",
    coords: { x: 620, y: 430 },
    photoHue: ["#8fa88f", "#6f8a70"],
  },
  {
    id: "b1f0c2a4-3333-4a10-9c01-0a1b2c3d4e03",
    parcelId: "TG-AGO-00521",
    type: "TERRAIN",
    transaction: "VENTE",
    title: "Terrain 300 m² · Légbassito",
    price: 9_000_000,
    surfaceM2: 300,
    zone: "Légbassito",
    legalStatus: "COUTUMIER_NON_TITRE",
    parcelCertified: false,
    agentCertified: false,
    agentName: "Edem Sossou",
    description:
      "Terrain coutumier non titré, levé non certifié (géomètre non inscrit). Bornage contradictoire réalisé, photos horodatées disponibles.",
    coords: { x: 300, y: 760 },
    photoHue: ["#a8886a", "#7d654c"],
  },
  {
    id: "b1f0c2a4-4444-4a10-9c01-0a1b2c3d4e04",
    parcelId: "TG-AGO-00610",
    type: "TERRAIN",
    transaction: "VENTE",
    title: "Terrain 500 m² · Agoè-Nyivé",
    price: 25_000_000,
    surfaceM2: 500,
    zone: "Agoè-Nyivé",
    legalStatus: "TITRE",
    parcelCertified: true,
    agentCertified: true,
    agentName: "Kodjo Amegah",
    description: "Parcelle titrée en angle, deux façades, quartier résidentiel calme.",
    coords: { x: 750, y: 290 },
    photoHue: ["#9db08a", "#7c9070"],
  },
  {
    id: "b1f0c2a4-5555-4a10-9c01-0a1b2c3d4e05",
    parcelId: "TG-AGO-00611",
    type: "TERRAIN",
    transaction: "VENTE",
    title: "Terrain 420 m² · Agoè-Nyivé",
    price: 21_000_000,
    surfaceM2: 420,
    zone: "Agoè-Nyivé",
    legalStatus: "TITRE",
    parcelCertified: true,
    agentCertified: false,
    agentName: "Yao Dossou",
    description: "Parcelle titrée, levé certifié, proche du goudron.",
    coords: { x: 770, y: 310 },
    photoHue: ["#b39070", "#8d7055"],
  },
  {
    id: "b1f0c2a4-6666-4a10-9c01-0a1b2c3d4e06",
    parcelId: "TG-AGO-00612",
    type: "MAISON",
    transaction: "VENTE",
    title: "Maison F4 sur 450 m² · Agoè-Nyivé",
    price: 38_000_000,
    surfaceM2: 450,
    zone: "Agoè-Nyivé",
    legalStatus: "COUTUMIER_NON_TITRE",
    parcelCertified: true,
    agentCertified: true,
    agentName: "Ama Kpodar",
    description: "Maison F4 récente sur parcelle coutumière certifiée.",
    coords: { x: 760, y: 330 },
    photoHue: ["#8aa0a8", "#6b8590"],
  },
  {
    id: "b1f0c2a4-7777-4a10-9c01-0a1b2c3d4e07",
    parcelId: "TG-AGO-00613",
    type: "TERRAIN",
    transaction: "VENTE",
    title: "Terrain 600 m² · Agoè-Nyivé",
    price: 30_000_000,
    surfaceM2: 600,
    zone: "Agoè-Nyivé",
    legalStatus: "EN_LITIGE",
    parcelCertified: false,
    agentCertified: true,
    agentName: "Kodjo Amegah",
    description:
      "Parcelle en litige de limite avec le voisin Sud. Signalement journalisé, consultez l'ANDF avant tout engagement.",
    coords: { x: 740, y: 320 },
    photoHue: ["#a89080", "#83705f"],
  },
  {
    id: "b1f0c2a4-8888-4a10-9c01-0a1b2c3d4e08",
    parcelId: "TG-AGO-00614",
    type: "TERRAIN",
    transaction: "VENTE",
    title: "Terrain 380 m² · Agoè-Nyivé",
    price: 19_000_000,
    surfaceM2: 380,
    zone: "Agoè-Nyivé",
    legalStatus: "TITRE",
    parcelCertified: true,
    agentCertified: true,
    agentName: "Ama Kpodar",
    description: "Parcelle titrée certifiée, viabilisée, eau et électricité en bordure.",
    coords: { x: 780, y: 290 },
    photoHue: ["#93a893", "#748a74"],
  },
  {
    id: "b1f0c2a4-9999-4a10-9c01-0a1b2c3d4e09",
    parcelId: "TG-BAG-00230",
    type: "TERRAIN",
    transaction: "VENTE",
    title: "Terrain 800 m² · Baguida",
    price: 15_000_000,
    surfaceM2: 800,
    zone: "Baguida",
    legalStatus: "COUTUMIER_NON_TITRE",
    parcelCertified: true,
    agentCertified: false,
    agentName: "Edem Sossou",
    description: "Grand terrain coutumier certifié, proche de la lagune.",
    coords: { x: 200, y: 300 },
    photoHue: ["#a8b090", "#879070"],
  },
  {
    id: "b1f0c2a4-aaaa-4a10-9c01-0a1b2c3d4e10",
    parcelId: "TG-KEG-00140",
    type: "MAISON",
    transaction: "LOCATION",
    title: "Maison F3 à louer · Kégué",
    price: 150_000,
    surfaceM2: 250,
    zone: "Kégué",
    legalStatus: "TITRE",
    parcelCertified: true,
    agentCertified: true,
    agentName: "Ama Kpodar",
    description: "Maison F3 à louer, parcelle titrée certifiée, cour commune.",
    coords: { x: 520, y: 820 },
    photoHue: ["#8f9aa8", "#6f7a88"],
  },
  {
    id: "b1f0c2a4-bbbb-4a10-9c01-0a1b2c3d4e11",
    parcelId: "TG-TOK-00310",
    type: "MAISON",
    transaction: "LOCATION",
    title: "Maison F4 à louer · Tokoin",
    price: 250_000,
    surfaceM2: 300,
    zone: "Tokoin",
    legalStatus: "TITRE",
    parcelCertified: true,
    agentCertified: true,
    agentName: "Kodjo Amegah",
    description: "Maison F4 rénovée à louer, quartier Tokoin, parcelle titrée.",
    coords: { x: 860, y: 640 },
    photoHue: ["#a09088", "#7d6f68"],
  },
  {
    id: "b1f0c2a4-cccc-4a10-9c01-0a1b2c3d4e12",
    parcelId: "TG-AGO-00700",
    type: "TERRAIN",
    transaction: "VENTE",
    title: "Terrain 1,2 ha · Agoè",
    price: 60_000_000,
    surfaceM2: 12000,
    zone: "Agoè",
    legalStatus: "TITRE",
    parcelCertified: true,
    agentCertified: true,
    agentName: "Ama Kpodar",
    description:
      "Grande parcelle titrée de 1,2 ha, levé certifié, idéale promotion immobilière.",
    coords: { x: 400, y: 180 },
    photoHue: ["#90a890", "#6f876f"],
  },
  {
    id: "b1f0c2a4-dddd-4a10-9c01-0a1b2c3d4e13",
    parcelId: "TG-AGO-00812",
    type: "MAISON",
    transaction: "VENTE",
    title: "Villa duplex 4 chambres · Baguida",
    price: 95_000_000,
    surfaceM2: 850,
    zone: "Baguida",
    legalStatus: "TITRE",
    parcelCertified: true,
    agentCertified: true,
    agentName: "Ama Kpodar",
    description:
      "Villa duplex sur parcelle titrée de 850 m², 4 chambres, jardin, forage. Levé certifié RTK Fixed, limites contradictoires.",
    coords: { x: 760, y: 640 },
    photoHue: ["#7fa8c9", "#5b87a8"],
  },
  {
    id: "b1f0c2a4-eeee-4a10-9c01-0a1b2c3d4e14",
    parcelId: "TG-KEG-00233",
    type: "MAISON",
    transaction: "LOCATION",
    title: "Villa basse 3 chambres · Kégué",
    price: 450_000,
    surfaceM2: 520,
    zone: "Kégué",
    legalStatus: "TITRE",
    parcelCertified: true,
    agentCertified: true,
    agentName: "Kodjo Amegah",
    description:
      "Villa basse 3 chambres à louer, cour clôturée, parcelle titrée certifiée. Loyer mensuel, quittance électronique.",
    coords: { x: 560, y: 720 },
    photoHue: ["#c9a87f", "#a8875b"],
  },
];

export const LEGAL_LABEL: Record<LegalStatus, string> = {
  TITRE: "Titré",
  COUTUMIER_NON_TITRE: "Coutumier non titré",
  EN_LITIGE: "En litige",
  INCONNU: "Statut inconnu",
};

export const TYPE_LABEL: Record<PropertyType, string> = {
  TERRAIN: "Terrain",
  MAISON: "Maison",
};

const ZONE_COMMUNE: Record<string, string> = {
  "Agoè-Sogbossito": "Agoè-Nyivé",
  "Agoè-Nyivé": "Agoè-Nyivé",
  Agoè: "Agoè-Nyivé",
  Adidogomé: "Adidogomé",
  Légbassito: "Légbassito",
  Baguida: "Baguida",
  Kégué: "Kégué",
  Tokoin: "Tokoin",
};

export function communeOf(zone: string): string {
  return ZONE_COMMUNE[zone] ?? zone;
}

export const COMMUNES: string[] = [...new Set(PROPERTIES.map((p) => communeOf(p.zone)))];

export type AccountStatus = "EN_ATTENTE" | "ACTIF" | "REJETE" | "SUSPENDU";
export type Role = "GEOMETRE" | "TOPOGRAPHE" | "AGENT" | "CLIENT";

export type Account = {
  id: string;
  name: string;
  phone: string;
  roleRequested: Role;
  roleAssigned: Role | null;
  pieces: string[];
  status: AccountStatus;
  received: string;
  ordreVerified: boolean;
};

export const ROLE_LABEL: Record<Role, string> = {
  GEOMETRE: "Géomètre",
  TOPOGRAPHE: "Topographe",
  AGENT: "Agent immobilier",
  CLIENT: "Client",
};

export const ACCOUNTS: Account[] = [
  {
    id: "acc-001",
    name: "Kodjo Amegah",
    phone: "+228 90 12 34 56",
    roleRequested: "GEOMETRE",
    roleAssigned: null,
    pieces: ["Pièce d'identité", "Attestation de l'Ordre · OGT-0214"],
    status: "EN_ATTENTE",
    received: "2026-10-24T09:15:00",
    ordreVerified: true,
  },
  {
    id: "acc-002",
    name: "Ama Kpodar",
    phone: "+228 91 45 67 02",
    roleRequested: "AGENT",
    roleAssigned: null,
    pieces: ["Pièce d'identité", "RCCM", "Carte professionnelle"],
    status: "EN_ATTENTE",
    received: "2026-10-23T16:40:00",
    ordreVerified: false,
  },
  {
    id: "acc-003",
    name: "Edem Sossou",
    phone: "+228 98 30 11 76",
    roleRequested: "TOPOGRAPHE",
    roleAssigned: null,
    pieces: ["Pièce d'identité"],
    status: "EN_ATTENTE",
    received: "2026-10-22T11:05:00",
    ordreVerified: false,
  },
  {
    id: "acc-004",
    name: "Yao Dossou",
    phone: "+228 99 88 21 40",
    roleRequested: "AGENT",
    roleAssigned: null,
    pieces: ["Pièce d'identité"],
    status: "REJETE",
    received: "2026-10-22T10:20:00",
    ordreVerified: false,
  },
  {
    id: "acc-005",
    name: "Akossiwa Ayivi",
    phone: "+228 92 66 18 05",
    roleRequested: "CLIENT",
    roleAssigned: "CLIENT",
    pieces: ["Pièce d'identité"],
    status: "ACTIF",
    received: "2026-10-21T14:00:00",
    ordreVerified: false,
  },
  {
    id: "acc-006",
    name: "Mensah Lawson",
    phone: "+228 90 44 72 19",
    roleRequested: "GEOMETRE",
    roleAssigned: null,
    pieces: ["Pièce d'identité", "Attestation de l'Ordre · OGT-0301"],
    status: "EN_ATTENTE",
    received: "2026-10-24T08:02:00",
    ordreVerified: true,
  },
  {
    id: "acc-007",
    name: "Afia Benissan",
    phone: "+228 93 20 58 64",
    roleRequested: "AGENT",
    roleAssigned: "AGENT",
    pieces: ["Pièce d'identité", "RCCM", "Carte professionnelle"],
    status: "SUSPENDU",
    received: "2026-10-19T09:30:00",
    ordreVerified: false,
  },
  {
    id: "acc-008",
    name: "Sena Agbeko",
    phone: "+228 91 72 40 88",
    roleRequested: "CLIENT",
    roleAssigned: null,
    pieces: ["Pièce d'identité"],
    status: "EN_ATTENTE",
    received: "2026-10-21T09:12:00",
    ordreVerified: false,
  },
  {
    id: "acc-009",
    name: "Kossi Mensah",
    phone: "+228 90 63 27 51",
    roleRequested: "AGENT",
    roleAssigned: null,
    pieces: ["Pièce d'identité", "RCCM"],
    status: "EN_ATTENTE",
    received: "2026-10-20T15:44:00",
    ordreVerified: false,
  },
  {
    id: "acc-010",
    name: "Abla Dogbé",
    phone: "+228 92 51 09 34",
    roleRequested: "TOPOGRAPHE",
    roleAssigned: null,
    pieces: ["Pièce d'identité"],
    status: "EN_ATTENTE",
    received: "2026-10-19T08:25:00",
    ordreVerified: false,
  },
  {
    id: "acc-011",
    name: "Komlan Atti",
    phone: "+228 98 14 65 02",
    roleRequested: "AGENT",
    roleAssigned: "AGENT",
    pieces: ["Pièce d'identité", "Carte professionnelle"],
    status: "SUSPENDU",
    received: "2026-10-17T10:05:00",
    ordreVerified: false,
  },
];

export type JournalEntry = {
  seq: number;
  at: string;
  action: string;
  author: string;
  prevHash: string;
  hash: string;
};

export const JOURNAL: JournalEntry[] = [
  {
    seq: 4812,
    at: "2026-10-24T10:58:21",
    action: "Alerte de chevauchement AL-0019",
    author: "Système",
    prevHash: "9be1...c07a",
    hash: "4f2d...a8e3",
  },
  {
    seq: 4811,
    at: "2026-10-24T10:58:20",
    action: "Parcelle soumise TG-AGO-00457 (refusée)",
    author: "K. Amegah",
    prevHash: "31c6...e540",
    hash: "9be1...c07a",
  },
  {
    seq: 4810,
    at: "2026-10-24T09:15:02",
    action: "Compte validé · rôle Géomètre",
    author: "LGR",
    prevHash: "d7a0...12bf",
    hash: "31c6...e540",
  },
];

export type OverlapAlert = {
  id: string;
  existing: { parcelId: string; version: number; legal: LegalStatus; certified: boolean; surveyedAt: string; surveyor: string };
  submitted: { parcelId: string; version: number; refusedCode: number; receivedAt: string; controlSeconds: number; author: string };
  overlapM2: number;
  bornes: string;
  existingPoly: [number, number][];
  submittedPoly: [number, number][];
};

// Polygones en metres, repere local. La zone hachurée est calculee par
// intersection convexe ; AL-0019 est calee sur 18,4 m² (B3-B4).
export const ALERTS: OverlapAlert[] = [
  {
    id: "AL-0019",
    existing: {
      parcelId: "TG-AGO-00412",
      version: 1,
      legal: "TITRE",
      certified: true,
      surveyedAt: "2026-09-02",
      surveyor: "A. Gbeasor",
    },
    submitted: {
      parcelId: "TG-AGO-00457",
      version: 1,
      refusedCode: 409,
      receivedAt: "2026-10-24T10:58:00",
      controlSeconds: 0.4,
      author: "K. Amegah",
    },
    overlapM2: 18.4,
    bornes: "B3-B4",
    existingPoly: [[0, 0], [20, 0.8], [19.3, 22.6], [0.5, 21.9]],
    submittedPoly: [[18.587, 1.2], [40, 0.6], [40.6, 22.0], [18.987, 22.8]],
  },
  {
    id: "AL-0018",
    existing: {
      parcelId: "TG-LOM-00934",
      version: 2,
      legal: "TITRE",
      certified: true,
      surveyedAt: "2026-08-14",
      surveyor: "S. Agbodjan",
    },
    submitted: {
      parcelId: "TG-LOM-01188",
      version: 1,
      refusedCode: 409,
      receivedAt: "2026-10-23T15:12:00",
      controlSeconds: 0.6,
      author: "A. Kpodar",
    },
    overlapM2: 21,
    bornes: "B2-B3",
    existingPoly: [[0, 0], [14, 0], [14, 18], [0, 18]],
    submittedPoly: [[12.5, 2], [30, 2], [30, 16], [12.5, 16]],
  },
  {
    id: "AL-0017",
    existing: {
      parcelId: "TG-KEG-00077",
      version: 1,
      legal: "COUTUMIER_NON_TITRE",
      certified: true,
      surveyedAt: "2026-07-30",
      surveyor: "A. Gbeasor",
    },
    submitted: {
      parcelId: "TG-KEG-00140",
      version: 2,
      refusedCode: 409,
      receivedAt: "2026-10-21T09:47:00",
      controlSeconds: 0.3,
      author: "E. Sossou",
    },
    overlapM2: 8,
    bornes: "B1-B2",
    existingPoly: [[0, 0], [10, 0], [10, 12], [0, 12]],
    submittedPoly: [[9.2, 1], [22, 1], [22, 11], [9.2, 11]],
  },
];

export const ADMIN_STATS = {
  geometresInscrits: 12,
  geometresTotal: 15,
  agentsCertifies: 21,
  agentsTotal: 34,
  parcellesTotal: 1248,
};

export type Attestation = {
  id: string;
  parcelId: string;
  version: number;
  surfaceM2: number;
  perimeterM: number;
  bornes: string[];
  issuedAt: string;
  geometre: string;
  sha256: string;
};

export const ATTESTATIONS: Attestation[] = [
  {
    id: "ATT-2026-0141",
    parcelId: "TG-AGO-00412",
    version: 1,
    surfaceM2: 436.52,
    perimeterM: 84.12,
    bornes: ["B1", "B2", "B3", "B4"],
    issuedAt: "2026-09-02",
    geometre: "A. Gbeasor",
    sha256: "8f14e45fceea167a5a36dedd4bea2543a6b1c9d0e2f3a4b5c6d7e8f90a1b2c3d",
  },
  {
    id: "ATT-2026-0139",
    parcelId: "TG-LOM-01188",
    version: 3,
    surfaceM2: 600,
    perimeterM: 100,
    bornes: ["B1", "B2", "B3", "B4", "B5"],
    issuedAt: "2026-08-21",
    geometre: "K. Amegah",
    sha256: "c775e7b757ede630cd0aa1113bd102661ab38829ca52a6422ab782862f268646",
  },
  {
    id: "ATT-2026-0136",
    parcelId: "TG-AGO-00457",
    version: 1,
    surfaceM2: 452.18,
    perimeterM: 86.4,
    bornes: ["B1", "B2", "B3", "B4"],
    issuedAt: "2026-08-05",
    geometre: "K. Amegah",
    sha256: "3d2f1c9a8b7e6d5f4c3b2a1908f7e6d5c4b3a291807f6e5d4c3b2a1908f7e6d5",
  },
];

// Parcelles levees au RTK par un geometre (application mobile), pas encore
// annoncees : c'est la source que l'agent relie a une annonce (§5).
export type SurveyedParcel = {
  parcelId: string;
  zone: string;
  surfaceM2: number;
  legalStatus: LegalStatus;
  certified: boolean;
  surveyor: string;
  surveyedAt: string;
};

export const SURVEYED_PARCELS: SurveyedParcel[] = [
  { parcelId: "TG-AGO-00921", zone: "Agoè", surfaceM2: 612, legalStatus: "TITRE", certified: true, surveyor: "K. Amegah", surveyedAt: "2026-10-18" },
  { parcelId: "TG-LEG-00344", zone: "Légbassito", surfaceM2: 480, legalStatus: "TITRE", certified: true, surveyor: "M. Lawson", surveyedAt: "2026-10-15" },
  { parcelId: "TG-BAG-00118", zone: "Baguida", surfaceM2: 940, legalStatus: "COUTUMIER_NON_TITRE", certified: true, surveyor: "K. Amegah", surveyedAt: "2026-10-11" },
  { parcelId: "TG-KEG-00507", zone: "Kégué", surfaceM2: 356, legalStatus: "TITRE", certified: true, surveyor: "E. Sossou", surveyedAt: "2026-10-08" },
  { parcelId: "TG-TOK-00762", zone: "Tokoin", surfaceM2: 520, legalStatus: "EN_LITIGE", certified: false, surveyor: "E. Sossou", surveyedAt: "2026-10-05" },
];

export type ListingStatus = "LIBRE" | "LOUE" | "VENDU";

export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  LIBRE: "Libre",
  LOUE: "Loué",
  VENDU: "Vendu",
};

export type AgentListing = {
  id: string;
  agentId: string;
  parcelId: string;
  title: string;
  type: PropertyType;
  transaction: TransactionType;
  price: number;
  surfaceM2: number;
  zone: string;
  status: ListingStatus;
  published: boolean;
  createdAt: string;
};

export const LISTINGS: AgentListing[] = [
  { id: "lst-001", agentId: "acc-002", parcelId: "TG-AG3-00457", title: "Terrain 452 m² · Agoè", type: "TERRAIN", transaction: "VENTE", price: 28_000_000, surfaceM2: 452, zone: "Agoè", status: "LIBRE", published: true, createdAt: "2026-10-12" },
  { id: "lst-002", agentId: "acc-002", parcelId: "TG-AGO-00700", title: "Terrain 1,2 ha · Agoè", type: "TERRAIN", transaction: "VENTE", price: 60_000_000, surfaceM2: 12000, zone: "Agoè", status: "LIBRE", published: true, createdAt: "2026-10-09" },
  { id: "lst-003", agentId: "acc-002", parcelId: "TG-KEG-00507", title: "Maison 4 pièces · Kégué", type: "MAISON", transaction: "LOCATION", price: 350_000, surfaceM2: 356, zone: "Kégué", status: "LOUE", published: false, createdAt: "2026-09-28" },
  { id: "lst-004", agentId: "acc-007", parcelId: "TG-AGO-00412", title: "Terrain 436 m² · Agoè Nyivé", type: "TERRAIN", transaction: "VENTE", price: 24_500_000, surfaceM2: 436, zone: "Agoè", status: "VENDU", published: false, createdAt: "2026-09-14" },
  { id: "lst-005", agentId: "acc-009", parcelId: "TG-BAG-00118", title: "Villa 940 m² · Baguida", type: "MAISON", transaction: "VENTE", price: 95_000_000, surfaceM2: 940, zone: "Baguida", status: "LIBRE", published: false, createdAt: "2026-10-02" },
  { id: "lst-006", agentId: "acc-002", parcelId: "TG-AGO-00921", title: "Villa duplex · Agoè", type: "MAISON", transaction: "LOCATION", price: 750_000, surfaceM2: 612, zone: "Agoè", status: "LIBRE", published: false, createdAt: "2026-10-16" },
];

// Gestion locative (§5) : encaissement Mobile Money simule cote web, quittances
// electroniques et suivi des impayes. Remplace par les webhooks Flooz /
// T-Money / Mixx quand l'API est branchee.
export type PayMethod = "FLOOZ" | "TMONEY" | "MIXX";

export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  FLOOZ: "Flooz",
  TMONEY: "T-Money",
  MIXX: "Mixx by Yas",
};

export type RentStatus = "PAYE" | "IMPAYE";

export type RentEntry = {
  id: string;
  listingId: string;
  tenant: string;
  tenantPhone: string;
  month: string;
  amount: number;
  status: RentStatus;
  method?: PayMethod;
  paidAt?: string;
  quittanceRef?: string;
  quittanceHash?: string;
};

export const RENTS: RentEntry[] = [
  { id: "rent-001", listingId: "lst-003", tenant: "Rachida Bello", tenantPhone: "+228 90 21 44 08", month: "2026-09", amount: 350_000, status: "PAYE", method: "MIXX", paidAt: "2026-09-04", quittanceRef: "QIT-2026-0398", quittanceHash: "7c1f...9a20" },
  { id: "rent-002", listingId: "lst-003", tenant: "Rachida Bello", tenantPhone: "+228 90 21 44 08", month: "2026-10", amount: 350_000, status: "PAYE", method: "FLOOZ", paidAt: "2026-10-05", quittanceRef: "QIT-2026-0412", quittanceHash: "b3e8...41cd" },
  { id: "rent-003", listingId: "lst-003", tenant: "Rachida Bello", tenantPhone: "+228 90 21 44 08", month: "2026-11", amount: 350_000, status: "IMPAYE" },
  { id: "rent-004", listingId: "lst-006", tenant: "Koffi Adjata", tenantPhone: "+228 91 07 63 25", month: "2026-10", amount: 750_000, status: "PAYE", method: "TMONEY", paidAt: "2026-10-08", quittanceRef: "QIT-2026-0419", quittanceHash: "5d02...e77b" },
  { id: "rent-005", listingId: "lst-006", tenant: "Koffi Adjata", tenantPhone: "+228 91 07 63 25", month: "2026-11", amount: 750_000, status: "IMPAYE" },
];