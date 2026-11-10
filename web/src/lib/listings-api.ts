import type { LegalStatus, Property, PropertyType, TransactionType } from "./data";
import { DEMO_MODE_ENABLED } from "./runtime-config";

export const LISTINGS_API_PATH = process.env.NEXT_PUBLIC_API_URL
  ? "/listings-api"
  : null;
export const LISTINGS_DEMO_ENABLED = DEMO_MODE_ENABLED && !LISTINGS_API_PATH;

interface ApiPropertySummary {
  id: string;
  parcelId: string;
  type: "TERRAIN" | "MAISON";
  transaction: TransactionType;
  title: string;
  description?: string | null;
  price: number;
  pricePeriod?: "MOIS" | "AN" | null;
  zone?: string | null;
  status: "BROUILLON" | "PUBLIE" | "RETIRE";
  badges: { parcelCertified: boolean; agentCertified: boolean };
  parcel: {
    legalStatus: LegalStatus;
    areaM2: number;
    approximateLocation: { latitude: number; longitude: number };
  };
  primaryPhotoUrl?: string | null;
}

interface ApiPropertyPage {
  items: ApiPropertySummary[];
  page: number;
  pageSize: number;
  total: number;
}

function mapProperty(item: ApiPropertySummary): Property {
  const photoUrl = item.primaryPhotoUrl
    ? item.primaryPhotoUrl.startsWith("http")
      ? item.primaryPhotoUrl
      : `${LISTINGS_API_PATH}${item.primaryPhotoUrl}`
    : undefined;
  const type: PropertyType = item.type;
  return {
    id: item.id,
    parcelId: item.parcelId,
    type,
    transaction: item.transaction,
    title: item.title,
    price: item.price,
    surfaceM2: item.parcel.areaM2,
    zone: item.zone ?? "Zone non précisée",
    legalStatus: item.parcel.legalStatus,
    parcelCertified: item.badges.parcelCertified,
    agentCertified: item.badges.agentCertified,
    agentName: undefined,
    description: item.description ?? "",
    coords: {
      x: item.parcel.approximateLocation.longitude,
      y: item.parcel.approximateLocation.latitude,
    },
    photoHue: ["#8fa88f", "#6f8a70"],
    mapLocation: item.parcel.approximateLocation,
    remotePhotos: photoUrl ? [photoUrl] : [],
    pricePeriod: item.pricePeriod ?? null,
  };
}

export async function fetchPublicListings(signal?: AbortSignal): Promise<Property[]> {
  if (!LISTINGS_API_PATH) throw new Error("L’API Listings n’est pas configurée.");
  const firstUrl = new URL(`${LISTINGS_API_PATH}/properties`, window.location.origin);
  firstUrl.searchParams.set("page", "1");
  firstUrl.searchParams.set("pageSize", "100");
  const firstResponse = await fetch(firstUrl, { signal });
  if (!firstResponse.ok) {
    throw new Error(`Le catalogue est indisponible (HTTP ${firstResponse.status}).`);
  }
  const firstPage = (await firstResponse.json()) as ApiPropertyPage;
  if (
    !Array.isArray(firstPage.items) ||
    !Number.isInteger(firstPage.pageSize) ||
    firstPage.pageSize < 1 ||
    !Number.isInteger(firstPage.total) ||
    firstPage.total < 0
  ) {
    throw new Error("La réponse du catalogue n’a pas le format attendu.");
  }
  const pages = [firstPage];
  for (let page = 2; page <= Math.ceil(firstPage.total / firstPage.pageSize); page += 1) {
    const url = new URL(`${LISTINGS_API_PATH}/properties`, window.location.origin);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(firstPage.pageSize));
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Le catalogue est incomplet (HTTP ${response.status}).`);
    }
    const result = (await response.json()) as ApiPropertyPage;
    if (!Array.isArray(result.items) || result.pageSize !== firstPage.pageSize) {
      throw new Error("La réponse du catalogue n’a pas le format attendu.");
    }
    pages.push(result);
  }
  return pages.flatMap((page) => page.items).map(mapProperty);
}
