import {
  ForbiddenException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ParcelStatusService } from '../land/parcel-status.service';
import { ListingsService } from './listings.service';
import type { ListingActor, ListingLegalStatus } from './listings.types';

const AGENT_ID = 'b1f0c2a4-1111-4a10-9c01-0a1b2c3d4e01';
const PROPERTY_ID = 'b1f0c2a4-2222-4a10-9c01-0a1b2c3d4e02';
const PARCEL_ID = 'TG-AGO-00001';

const row = {
  id: PROPERTY_ID,
  parcel_id: PARCEL_ID,
  agent_id: AGENT_ID,
  type: 'TERRAIN',
  transaction: 'VENTE',
  title: 'Terrain a vendre',
  description: '',
  price: '18500000',
  currency: 'XOF',
  price_period: null,
  zone: 'Agoe',
  status: 'PUBLIE',
  agent_certified: false,
  created_at: new Date('2026-11-10T09:00:00Z'),
  updated_at: new Date('2026-11-10T09:00:00Z'),
  published_at: new Date('2026-11-10T09:00:00Z'),
  legal_status: 'TITRE',
  certified: true,
  area_m2: '450',
  approximate_latitude: 6.14,
  approximate_longitude: 1.21,
};

const activeAgent: ListingActor = {
  id: AGENT_ID,
  role: 'AGENT',
  accountActive: true,
};

function setup() {
  let currentStatus: {
    id: string;
    legalStatus: ListingLegalStatus;
    certified: boolean;
    areaM2: number;
  } = {
    id: PARCEL_ID,
    legalStatus: 'TITRE',
    certified: true,
    areaM2: 450,
  };
  const query = jest.fn((sql: string) => {
    if (sql.includes('count(*)::text')) return [{ total: '1' }];
    if (sql.includes('FROM property_photos')) return [];
    if (sql.includes('FROM properties prop')) return [row];
    return [];
  });
  const dataSource = { query } as unknown as DataSource;
  const getPublicStatus = jest.fn(() => Promise.resolve(currentStatus));
  const parcelStatus = {
    getPublicStatus,
  } as unknown as ParcelStatusService;
  return {
    service: new ListingsService(dataSource, parcelStatus),
    query,
    parcelStatus,
    getPublicStatus,
    setParcelStatus: (status: typeof currentStatus) => {
      currentStatus = status;
    },
  };
}

describe('ListingsService', () => {
  it('refuse la publication directe par un client avec le message CA-5', async () => {
    const { service, query } = setup();
    await expect(
      service.create(
        { id: AGENT_ID, role: 'CLIENT', accountActive: true },
        {
          parcelId: PARCEL_ID,
          type: 'TERRAIN',
          transaction: 'VENTE',
          title: 'Terrain',
          price: 1000,
          status: 'PUBLIE',
        },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'FORBIDDEN',
        message: 'Pour publier un bien, passez par un agent.',
      },
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('refuse un agent inactif', async () => {
    const { service, query } = setup();
    await expect(
      service.create(
        { ...activeAgent, accountActive: false },
        {
          parcelId: PARCEL_ID,
          type: 'TERRAIN',
          transaction: 'VENTE',
          title: 'Terrain',
          price: 1000,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it('publie un bien lie a une parcelle certifiee pour un agent actif (CA-6)', async () => {
    const { service, query, getPublicStatus } = setup();
    const result = await service.create(activeAgent, {
      parcelId: PARCEL_ID,
      type: 'TERRAIN',
      transaction: 'VENTE',
      title: 'Terrain a vendre',
      price: 18_500_000,
      zone: 'Agoe',
      status: 'PUBLIE',
    });

    expect(getPublicStatus).toHaveBeenCalledWith(PARCEL_ID);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO properties'),
      expect.arrayContaining([PARCEL_ID, AGENT_ID, 'PUBLIE', false]),
    );
    expect(result.parcel.certified).toBe(true);
    expect(result.parcel.approximateLocation).toEqual({
      latitude: 6.14,
      longitude: 1.21,
    });
    expect(result.badges.parcelCertified).toBe(true);
    expect(result.badges.agentCertified).toBe(false);
    expect(result.publicUrl).toContain(PROPERTY_ID);
  });

  it('interdit la publication d’une parcelle en litige', async () => {
    const { service, query, setParcelStatus } = setup();
    setParcelStatus({
      id: PARCEL_ID,
      legalStatus: 'EN_LITIGE',
      certified: false,
      areaM2: 450,
    });

    await expect(
      service.create(activeAgent, {
        parcelId: PARCEL_ID,
        type: 'TERRAIN',
        transaction: 'VENTE',
        title: 'Terrain',
        price: 1000,
        status: 'PUBLIE',
      }),
    ).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('refuse la modification du bien par un autre agent', async () => {
    const { service, query } = setup();
    await expect(
      service.update(
        {
          id: 'b1f0c2a4-3333-4a10-9c01-0a1b2c3d4e03',
          role: 'AGENT',
          accountActive: true,
        },
        PROPERTY_ID,
        { title: 'Modification non autorisee' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('refuse une image dont le contenu ne correspond pas au type annonce', async () => {
    const { service } = setup();
    const invalidImage = Buffer.from('pas une image');
    await expect(
      service.uploadPhoto(activeAgent, PROPERTY_ID, {
        mimetype: 'image/jpeg',
        size: invalidImage.length,
        buffer: invalidImage,
      }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it('filtre les biens par type, certification et texte de recherche', async () => {
    const { service, query } = setup();
    const result = await service.search({
      type: 'TERRAIN',
      parcelCertified: 'true',
      q: 'Agoe',
    });

    expect(result.total).toBe(1);
    expect(query.mock.calls[0]?.[0]).toContain(
      "parcel.legal_status <> 'EN_LITIGE'",
    );
    expect(query.mock.calls[0]?.[0]).toContain('parcel.certified = $3');
  });
});
