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

export function mapProperty(item: ApiPropertySummary): Property {
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

async function fetchPage(
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<ApiPropertyPage> {
  const url = new URL(`${LISTINGS_API_PATH}/properties`, window.location.origin);
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(pageSize));
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      page === 1
        ? `Le catalogue est indisponible (HTTP ${response.status}).`
        : `Le catalogue est incomplet (HTTP ${response.status}).`,
    );
  }
  const result = (await response.json()) as ApiPropertyPage;
  if (
    !Array.isArray(result.items) ||
    !Number.isInteger(result.pageSize) ||
    result.pageSize < 1 ||
    (page === 1 && (!Number.isInteger(result.total) || result.total < 0))
  ) {
    throw new Error("La réponse du catalogue n’a pas le format attendu.");
  }
  return result;
}

export async function fetchPublicListings(signal?: AbortSignal): Promise<Property[]> {
  if (!LISTINGS_API_PATH) throw new Error("L’API Listings n’est pas configurée.");
  const firstPage = await fetchPage(1, 100, signal);
  const pages = [firstPage];
  const totalPages = Math.ceil(firstPage.total / firstPage.pageSize);
  if (totalPages > 1) {
    const remaining = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const concurrency = 4;
    for (let i = 0; i < remaining.length; i += concurrency) {
      const batch = remaining.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map((page) => fetchPage(page, firstPage.pageSize, signal)),
      );
      for (const result of results) {
        if (result.pageSize !== firstPage.pageSize) {
          throw new Error("La réponse du catalogue n’a pas le format attendu.");
        }
        pages.push(result);
      }
    }
  }
  return pages.flatMap((page) => page.items).map(mapProperty);
}
