export type ListingPropertyType = 'TERRAIN' | 'MAISON';
export type ListingTransaction = 'VENTE' | 'LOCATION';
export type ListingStatus = 'BROUILLON' | 'PUBLIE' | 'RETIRE';
export type ListingLegalStatus =
  'TITRE' | 'COUTUMIER_NON_TITRE' | 'EN_LITIGE' | 'INCONNU';

export interface ListingPhoto {
  id: string;
  contentType: 'image/jpeg' | 'image/png';
  sizeBytes: number;
  url: string;
  uploadedAt: string;
  isPrimary: boolean;
}

export interface ListingSummary {
  id: string;
  parcelId: string;
  type: ListingPropertyType;
  transaction: ListingTransaction;
  title: string;
  description: string;
  price: number;
  currency: 'XOF';
  pricePeriod: 'MOIS' | 'AN' | null;
  zone: string | null;
  status: ListingStatus;
  badges: { parcelCertified: boolean; agentCertified: boolean };
  parcel: {
    id: string;
    legalStatus: ListingLegalStatus;
    certified: boolean;
    areaM2: number;
    statusUrl: string;
    approximateLocation: { latitude: number; longitude: number };
  };
  primaryPhotoUrl: string | null;
  publishedAt: string | null;
}

export interface ListingProperty extends ListingSummary {
  agentId: string;
  photos: ListingPhoto[];
  publicUrl: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListingPage<T = ListingSummary> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ListingSearch {
  type?: string;
  transaction?: string;
  priceMin?: string;
  priceMax?: string;
  legalStatus?: string;
  certified?: string;
  parcelCertified?: string;
  agentCertified?: string;
  zone?: string;
  q?: string;
  page?: string;
  pageSize?: string;
  sort?: string;
}

export interface ListingInput {
  parcelId?: unknown;
  type?: unknown;
  transaction?: unknown;
  title?: unknown;
  description?: unknown;
  price?: unknown;
  currency?: unknown;
  pricePeriod?: unknown;
  zone?: unknown;
  status?: unknown;
}

export type ListingUpdateInput = Omit<ListingInput, 'parcelId'>;

export interface ListingActor {
  id: string;
  role: string;
  accountActive: boolean;
  agentCertified?: boolean;
}
