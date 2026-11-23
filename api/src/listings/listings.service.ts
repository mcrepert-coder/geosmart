import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ParcelStatusService } from '../land/parcel-status.service';
import { rowsOf } from '../audit/sql-runner';
import type {
  ListingActor,
  ListingInput,
  ListingLegalStatus,
  ListingPage,
  ListingPhoto,
  ListingProperty,
  ListingSearch,
  ListingStatus,
  ListingSummary,
  ListingUpdateInput,
} from './listings.types';
import { PARCEL_ID_PATTERN } from '../land/parcel-id';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Meme format que le foncier : la commune tient en 3 lettres ou chiffres
// (AG3, GO1, decision de LGR, #24).
const PARCEL_PATTERN = PARCEL_ID_PATTERN;
const LEGAL_STATUSES: ListingLegalStatus[] = [
  'TITRE',
  'COUTUMIER_NON_TITRE',
  'EN_LITIGE',
  'INCONNU',
];
const STATUSES: ListingStatus[] = ['BROUILLON', 'PUBLIE', 'RETIRE'];
// Le badge "agent certifie" est copie a la publication et ne reste vrai que
// tant que l'agent est actif : une suspension le retire de ses annonces sans
// ecrire dans la table des annonces.
const AGENT_CERTIFIED = `COALESCE(prop.agent_certified AND agent.status = 'ACTIF', false)`;

const BASE_SELECT = `
  SELECT prop.id, prop.parcel_id, prop.agent_id, prop.type, prop.transaction,
         prop.title, prop.description, prop.price, prop.currency, prop.price_period,
         prop.zone, prop.status, ${AGENT_CERTIFIED} AS agent_certified, prop.created_at,
         prop.updated_at, prop.published_at, parcel.legal_status, parcel.certified,
         parcel.area_m2,
         round(ST_Y(ST_PointOnSurface(parcel.geom))::numeric, 2)::float8 AS approximate_latitude,
         round(ST_X(ST_PointOnSurface(parcel.geom))::numeric, 2)::float8 AS approximate_longitude
    FROM properties prop
    JOIN parcels parcel ON parcel.id = prop.parcel_id
    LEFT JOIN accounts agent ON agent.id = prop.agent_id`;

interface ListingRow {
  id: string;
  parcel_id: string;
  agent_id: string;
  type: 'TERRAIN' | 'MAISON';
  transaction: 'VENTE' | 'LOCATION';
  title: string;
  description: string;
  price: number | string;
  currency: 'XOF';
  price_period: 'MOIS' | 'AN' | null;
  zone: string | null;
  status: ListingStatus;
  agent_certified: boolean;
  created_at: Date | string;
  updated_at: Date | string | null;
  published_at: Date | string | null;
  legal_status: ListingLegalStatus;
  certified: boolean;
  area_m2: number | string;
  approximate_latitude: number | string;
  approximate_longitude: number | string;
}

interface PhotoRow {
  id: string;
  property_id: string;
  content_type: 'image/jpeg' | 'image/png';
  size_bytes: number;
  uploaded_at: Date | string;
  is_primary: boolean;
  file_data?: Buffer;
}

interface PhotoUpload {
  originalname?: string;
  mimetype?: string;
  size: number;
  buffer: Buffer;
}

interface SearchOptions {
  page: number;
  pageSize: number;
  sort: 'recent' | 'price_asc' | 'price_desc';
}

@Injectable()
export class ListingsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly parcels: ParcelStatusService,
  ) {}

  async search(query: ListingSearch): Promise<ListingPage> {
    const options = this.searchOptions(query);
    const conditions = [
      'prop.status = $1',
      "parcel.legal_status <> 'EN_LITIGE'",
    ];
    const params: unknown[] = ['PUBLIE'];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      conditions.push(sql.replace('?', `$${params.length}`));
    };

    if (query.type !== undefined) {
      add(
        'prop.type = ?',
        this.enumValue(query.type, ['TERRAIN', 'MAISON'], 'type'),
      );
    }
    if (query.transaction !== undefined) {
      add(
        'prop.transaction = ?',
        this.enumValue(query.transaction, ['VENTE', 'LOCATION'], 'transaction'),
      );
    }
    const priceMin = this.optionalInteger(query.priceMin, 'priceMin');
    const priceMax = this.optionalInteger(query.priceMax, 'priceMax');
    if (priceMin !== undefined && priceMin < 0) {
      throw this.invalid('priceMin doit etre superieur ou egal a zero.');
    }
    if (priceMax !== undefined && priceMax < 0) {
      throw this.invalid('priceMax doit etre superieur ou egal a zero.');
    }
    if (priceMin !== undefined) add('prop.price >= ?', priceMin);
    if (priceMax !== undefined) add('prop.price <= ?', priceMax);
    if (
      priceMin !== undefined &&
      priceMax !== undefined &&
      priceMin > priceMax
    ) {
      throw this.invalid('priceMin doit etre inferieur ou egal a priceMax.');
    }
    if (query.legalStatus !== undefined) {
      add(
        'parcel.legal_status = ?',
        this.enumValue(query.legalStatus, LEGAL_STATUSES, 'legalStatus'),
      );
    }
    const parcelCertified = query.parcelCertified ?? query.certified;
    if (parcelCertified !== undefined) {
      add(
        'parcel.certified = ?',
        this.booleanValue(parcelCertified, 'parcelCertified'),
      );
    }
    if (query.agentCertified !== undefined) {
      add(
        `${AGENT_CERTIFIED} = ?`,
        this.booleanValue(query.agentCertified, 'agentCertified'),
      );
    }
    const zone = this.optionalText(query.zone, 'zone', 120);
    if (zone) add('prop.zone ILIKE ?', `%${this.escapeLike(zone)}%`);
    const search = this.optionalText(query.q, 'q', 120);
    if (search) {
      params.push(`%${this.escapeLike(search)}%`);
      const parameter = `$${params.length}`;
      conditions.push(
        `(prop.title ILIKE ${parameter} ESCAPE '\\' OR prop.zone ILIKE ${parameter} ESCAPE '\\' OR prop.parcel_id ILIKE ${parameter} ESCAPE '\\')`,
      );
    }

    const where = conditions.join(' AND ');
    const [{ total = '0' } = {}] = rowsOf<{ total: string }>(
      await this.dataSource.query(
        `SELECT count(*)::text AS total ${BASE_SELECT.slice(BASE_SELECT.indexOf('FROM'))} WHERE ${where}`,
        params,
      ),
    );
    const order =
      options.sort === 'price_asc'
        ? 'prop.price ASC, prop.created_at DESC'
        : options.sort === 'price_desc'
          ? 'prop.price DESC, prop.created_at DESC'
          : 'prop.created_at DESC, prop.id';
    const pageParams = [
      ...params,
      options.pageSize,
      (options.page - 1) * options.pageSize,
    ];
    const rows = rowsOf<ListingRow>(
      await this.dataSource.query(
        `${BASE_SELECT} WHERE ${where} ORDER BY ${order} LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
        pageParams,
      ),
    );
    const photos = await this.photosFor(rows.map((row) => row.id));
    return {
      items: rows.map((row) => this.toSummary(row, photos.get(row.id) ?? [])),
      page: options.page,
      pageSize: options.pageSize,
      total: Number(total),
    };
  }

  async mine(
    actor: ListingActor,
    query: { status?: string; page?: string; pageSize?: string },
  ): Promise<ListingPage> {
    this.requireAgent(actor, false);
    const options = this.searchOptions(query);
    const conditions = ['prop.agent_id = $1'];
    const params: unknown[] = [actor.id];
    if (query.status !== undefined) {
      params.push(this.enumValue(query.status, STATUSES, 'status'));
      conditions.push(`prop.status = $${params.length}`);
    }
    const where = conditions.join(' AND ');
    const [{ total = '0' } = {}] = rowsOf<{ total: string }>(
      await this.dataSource.query(
        `SELECT count(*)::text AS total ${BASE_SELECT.slice(BASE_SELECT.indexOf('FROM'))} WHERE ${where}`,
        params,
      ),
    );
    const pageParams = [
      ...params,
      options.pageSize,
      (options.page - 1) * options.pageSize,
    ];
    const rows = rowsOf<ListingRow>(
      await this.dataSource.query(
        `${BASE_SELECT} WHERE ${where} ORDER BY prop.created_at DESC, prop.id LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
        pageParams,
      ),
    );
    const photos = await this.photosFor(rows.map((row) => row.id));
    return {
      items: rows.map((row) => this.toSummary(row, photos.get(row.id) ?? [])),
      page: options.page,
      pageSize: options.pageSize,
      total: Number(total),
    };
  }

  async getPublic(propertyId: string): Promise<ListingProperty> {
    const row = await this.findPublicRow(propertyId);
    const photos = await this.photosFor([row.id]);
    return this.toProperty(row, photos.get(row.id) ?? []);
  }

  async create(
    actor: ListingActor,
    input: ListingInput,
  ): Promise<ListingProperty> {
    this.requireAgent(actor);
    this.validateInput(input, false);
    const values = this.normalizeInput(input);
    const parcelId = values.parcelId;
    if (!parcelId || !PARCEL_PATTERN.test(parcelId)) {
      throw this.invalid('parcelId doit etre un identifiant foncier valide.');
    }
    if (
      (values.transaction === 'LOCATION' && !values.pricePeriod) ||
      (values.transaction === 'VENTE' && values.pricePeriod)
    ) {
      throw this.invalid(
        'pricePeriod est obligatoire pour LOCATION et interdit pour VENTE.',
      );
    }
    const parcel = await this.parcels.getPublicStatus(parcelId);
    const status = values.status ?? 'BROUILLON';
    if (status === 'RETIRE') {
      throw this.invalid(
        'Un bien ne peut pas etre cree directement a l’etat RETIRE.',
      );
    }
    if (status === 'PUBLIE' && parcel.legalStatus === 'EN_LITIGE') {
      throw this.disputedParcel();
    }
    const id = randomUUID();
    await this.dataSource.query(
      `INSERT INTO properties
         (id, parcel_id, agent_id, type, transaction, title, description, price,
          currency, price_period, zone, status, agent_certified, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'XOF', $9, $10, $11, $12,
               CASE WHEN $11 = 'PUBLIE' THEN now() ELSE NULL END)`,
      [
        id,
        parcelId,
        actor.id,
        values.type,
        values.transaction,
        values.title,
        values.description ?? '',
        values.price,
        values.pricePeriod,
        values.zone,
        status,
        actor.agentCertified === true,
      ],
    );
    return this.getOwned(actor, id).then((row) => this.getById(row.id));
  }

  async update(
    actor: ListingActor,
    propertyId: string,
    input: ListingUpdateInput,
  ): Promise<ListingProperty> {
    const property = await this.getOwned(actor, propertyId, true);
    this.validateInput(input, true);
    const keys = Object.keys(input);
    if (keys.length === 0)
      throw this.invalid('Au moins un champ doit etre fourni.');
    const updates = this.normalizeInput(input);
    const nextTransaction = updates.transaction ?? property.transaction;
    const nextPeriod =
      updates.pricePeriod === undefined
        ? property.price_period
        : updates.pricePeriod;
    if (
      (nextTransaction === 'LOCATION' && nextPeriod === null) ||
      (nextTransaction === 'VENTE' && nextPeriod !== null)
    ) {
      throw this.invalid(
        'pricePeriod est obligatoire pour LOCATION et interdit pour VENTE.',
      );
    }
    if (actor.role === 'ADMIN' && keys.some((key) => key !== 'status')) {
      throw this.forbidden('Un administrateur peut seulement retirer un bien.');
    }
    const status = updates.status;
    if (actor.role === 'ADMIN' && status !== 'RETIRE') {
      throw this.forbidden('Un administrateur peut seulement retirer un bien.');
    }
    if (status === 'PUBLIE') {
      const parcel = await this.parcels.getPublicStatus(property.parcel_id);
      if (parcel.legalStatus === 'EN_LITIGE') throw this.disputedParcel();
    }

    const columns: Record<string, string> = {
      title: 'title',
      description: 'description',
      price: 'price',
      currency: 'currency',
      pricePeriod: 'price_period',
      zone: 'zone',
      type: 'type',
      transaction: 'transaction',
      status: 'status',
    };
    const sets: string[] = [];
    const params: unknown[] = [propertyId];
    for (const [key, column] of Object.entries(columns)) {
      if (!(key in updates)) continue;
      params.push(updates[key as keyof typeof updates]);
      sets.push(`${column} = $${params.length}`);
    }
    sets.push('updated_at = now()');
    if (status) {
      params.push(status);
      sets.push(
        `published_at = CASE WHEN $${params.length} = 'PUBLIE' THEN now() ELSE published_at END`,
      );
    }
    if (status === 'PUBLIE') {
      params.push(actor.agentCertified === true);
      sets.push(`agent_certified = $${params.length}`);
    }
    await this.dataSource.query(
      `UPDATE properties SET ${sets.join(', ')} WHERE id = $1`,
      params,
    );
    return this.getById(propertyId);
  }

  async share(propertyId: string) {
    const property = await this.getPublic(propertyId);
    const publicUrl = property.publicUrl;
    if (!publicUrl) throw this.invalid('WEB_PUBLIC_URL doit etre configure.');
    const parcelBadge = property.badges.parcelCertified
      ? 'Parcelle certifiee'
      : 'Parcelle non certifiee';
    const message = `Ref. ${property.parcelId} - ${property.title} - ${property.price} FCFA - ${parcelBadge} - ${publicUrl}`;
    const primary = property.photos.find((photo) => photo.isPrimary);
    const imageUrl = primary ? this.absolutePhotoUrl(primary.url) : null;
    return {
      publicUrl,
      whatsapp: {
        url: `https://wa.me/?text=${encodeURIComponent(message)}`,
        message,
      },
      tiktok: { url: publicUrl, imageUrl },
      instagram: { url: publicUrl, imageUrl },
    };
  }

  async uploadPhoto(
    actor: ListingActor,
    propertyId: string,
    file: PhotoUpload | undefined,
  ): Promise<ListingPhoto> {
    const property = await this.getOwned(actor, propertyId);
    if (!file?.buffer || file.buffer.length < 1)
      throw this.invalid('Aucun fichier photo fourni.');
    if (file.size !== file.buffer.length) {
      throw this.invalid('La taille de la photo est incoherente.');
    }
    if (file.buffer.length > MAX_PHOTO_BYTES) {
      throw new PayloadTooLargeException({
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Le fichier depasse la taille maximale de 5 Mio.',
      });
    }
    const contentType = this.detectImageType(file.buffer);
    if (!contentType || file.mimetype !== contentType) {
      throw new UnsupportedMediaTypeException({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Format de fichier non pris en charge. JPEG ou PNG attendu.',
      });
    }
    const [{ total = '0' } = {}] = rowsOf<{ total: string }>(
      await this.dataSource.query(
        'SELECT count(*)::text AS total FROM property_photos WHERE property_id = $1',
        [property.id],
      ),
    );
    const isPrimary = Number(total) === 0;
    const [row] = rowsOf<PhotoRow>(
      await this.dataSource.query(
        `INSERT INTO property_photos
           (id, property_id, content_type, file_data, is_primary)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, property_id, content_type, octet_length(file_data) AS size_bytes,
                   uploaded_at, is_primary`,
        [randomUUID(), property.id, contentType, file.buffer, isPrimary],
      ),
    );
    if (!row) throw new Error('Photo upload did not return the inserted row.');
    return this.toPhoto(row);
  }

  async photoContent(propertyId: string, photoId: string) {
    const [row] = rowsOf<PhotoRow>(
      await this.dataSource.query(
        `SELECT photo.id, photo.content_type, photo.file_data
           FROM property_photos photo
           JOIN properties prop ON prop.id = photo.property_id
           JOIN parcels parcel ON parcel.id = prop.parcel_id
          WHERE photo.id = $1 AND photo.property_id = $2
            AND prop.status = 'PUBLIE' AND parcel.legal_status <> 'EN_LITIGE'`,
        [photoId, propertyId],
      ),
    );
    if (!row?.file_data) throw this.notFound();
    return {
      contentType: row.content_type,
      data: Buffer.from(row.file_data),
    };
  }

  async deletePhoto(actor: ListingActor, propertyId: string, photoId: string) {
    const property = await this.getOwned(actor, propertyId);
    const [deleted] = rowsOf<{ id: string; is_primary: boolean }>(
      await this.dataSource.query(
        `DELETE FROM property_photos
          WHERE id = $1 AND property_id = $2
          RETURNING id, is_primary`,
        [photoId, property.id],
      ),
    );
    if (!deleted) throw this.notFound();
    if (deleted.is_primary) {
      await this.dataSource.query(
        `UPDATE property_photos SET is_primary = true
          WHERE id = (
            SELECT id FROM property_photos
             WHERE property_id = $1
             ORDER BY uploaded_at, id
             LIMIT 1
          )`,
        [property.id],
      );
    }
  }

  private async getById(propertyId: string): Promise<ListingProperty> {
    const [row] = rowsOf<ListingRow>(
      await this.dataSource.query(`${BASE_SELECT} WHERE prop.id = $1`, [
        propertyId,
      ]),
    );
    if (!row) throw this.notFound();
    const photos = await this.photosFor([row.id]);
    return this.toProperty(row, photos.get(row.id) ?? []);
  }

  private async findPublicRow(propertyId: string): Promise<ListingRow> {
    if (!UUID_PATTERN.test(propertyId)) throw this.notFound();
    const [row] = rowsOf<ListingRow>(
      await this.dataSource.query(
        `${BASE_SELECT}
          WHERE prop.id = $1 AND prop.status = 'PUBLIE'
            AND parcel.legal_status <> 'EN_LITIGE'`,
        [propertyId],
      ),
    );
    if (!row) throw this.notFound();
    return row;
  }

  private async getOwned(
    actor: ListingActor,
    propertyId: string,
    allowAdmin = false,
  ): Promise<ListingRow> {
    this.requireAgent(actor, true, allowAdmin);
    if (!UUID_PATTERN.test(propertyId)) throw this.notFound();
    const [row] = rowsOf<ListingRow>(
      await this.dataSource.query(`${BASE_SELECT} WHERE prop.id = $1`, [
        propertyId,
      ]),
    );
    if (!row) throw this.notFound();
    if (actor.role !== 'ADMIN' && row.agent_id !== actor.id) {
      throw this.forbidden('Vous ne pouvez modifier que vos propres biens.');
    }
    return row;
  }

  private async photosFor(ids: string[]): Promise<Map<string, ListingPhoto[]>> {
    const result = new Map<string, ListingPhoto[]>();
    if (ids.length === 0) return result;
    const rows = rowsOf<PhotoRow>(
      await this.dataSource.query(
        `SELECT id, property_id, content_type, octet_length(file_data) AS size_bytes,
                uploaded_at, is_primary
           FROM property_photos
          WHERE property_id = ANY($1::uuid[])
          ORDER BY uploaded_at, id`,
        [ids],
      ),
    );
    for (const row of rows) {
      const photos = result.get(row.property_id) ?? [];
      photos.push(this.toPhoto(row));
      result.set(row.property_id, photos);
    }
    return result;
  }

  private toPhoto(row: PhotoRow): ListingPhoto {
    return {
      id: row.id,
      contentType: row.content_type,
      sizeBytes: Number(row.size_bytes),
      url: `/properties/${row.property_id}/photos/${row.id}/content`,
      uploadedAt: new Date(row.uploaded_at).toISOString(),
      isPrimary: row.is_primary,
    };
  }

  private toSummary(row: ListingRow, photos: ListingPhoto[]): ListingSummary {
    const primary = photos.find((photo) => photo.isPrimary) ?? photos[0];
    return {
      id: row.id,
      parcelId: row.parcel_id,
      type: row.type,
      transaction: row.transaction,
      title: row.title,
      description: row.description,
      price: Number(row.price),
      currency: row.currency,
      pricePeriod: row.price_period,
      zone: row.zone,
      status: row.status,
      badges: {
        parcelCertified: row.certified,
        agentCertified: row.agent_certified,
      },
      parcel: {
        id: row.parcel_id,
        legalStatus: row.legal_status,
        certified: row.certified,
        areaM2: Number(row.area_m2),
        statusUrl: `/parcels/${encodeURIComponent(row.parcel_id)}/status`,
        approximateLocation: {
          latitude: Number(row.approximate_latitude),
          longitude: Number(row.approximate_longitude),
        },
      },
      primaryPhotoUrl: primary?.url ?? null,
      publishedAt: row.published_at
        ? new Date(row.published_at).toISOString()
        : null,
    };
  }

  private toProperty(row: ListingRow, photos: ListingPhoto[]): ListingProperty {
    const summary = this.toSummary(row, photos);
    return {
      ...summary,
      agentId: row.agent_id,
      photos,
      publicUrl:
        row.status === 'PUBLIE'
          ? `${this.webBaseUrl()}/?bien=${encodeURIComponent(row.id)}`
          : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
  }

  private searchOptions(
    query: Pick<ListingSearch, 'page' | 'pageSize' | 'sort'>,
  ): SearchOptions {
    const page = this.optionalInteger(query.page, 'page') ?? 1;
    const pageSize = this.optionalInteger(query.pageSize, 'pageSize') ?? 20;
    if (page < 1) throw this.invalid('page doit etre superieur ou egal a 1.');
    if (pageSize < 1 || pageSize > 100) {
      throw this.invalid('pageSize doit etre compris entre 1 et 100.');
    }
    const sort = query.sort ?? 'recent';
    if (!['recent', 'price_asc', 'price_desc'].includes(sort)) {
      throw this.invalid('sort doit etre recent, price_asc ou price_desc.');
    }
    return { page, pageSize, sort: sort as SearchOptions['sort'] };
  }

  private validateInput(input: ListingInput, partial: boolean) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw this.invalid('Le corps de la requete doit etre un objet.');
    }
    const allowed = new Set([
      ...(partial ? [] : ['parcelId']),
      'type',
      'transaction',
      'title',
      'description',
      'price',
      'currency',
      'pricePeriod',
      'zone',
      'status',
    ]);
    for (const key of Object.keys(input)) {
      if (!allowed.has(key)) throw this.invalid(`Champ non autorise : ${key}.`);
    }
    if (!partial && !input.parcelId)
      throw this.invalid('parcelId est obligatoire.');
    if (input.parcelId !== undefined && typeof input.parcelId !== 'string') {
      throw this.invalid('parcelId doit etre un texte.');
    }
    if (input.type !== undefined) {
      this.enumValue(input.type, ['TERRAIN', 'MAISON'], 'type');
    } else if (!partial) throw this.invalid('type est obligatoire.');
    if (input.transaction !== undefined) {
      this.enumValue(input.transaction, ['VENTE', 'LOCATION'], 'transaction');
    } else if (!partial) throw this.invalid('transaction est obligatoire.');
    if (input.title !== undefined) this.requiredText(input.title, 'title', 160);
    else if (!partial) throw this.invalid('title est obligatoire.');
    if (input.description !== undefined)
      this.optionalText(input.description, 'description', 4000);
    if (input.price !== undefined)
      this.validateInteger(input.price, 'price', 0);
    else if (!partial) throw this.invalid('price est obligatoire.');
    if (input.currency !== undefined && input.currency !== 'XOF') {
      throw this.invalid('La devise doit etre XOF.');
    }
    if (
      input.pricePeriod !== undefined &&
      input.pricePeriod !== 'MOIS' &&
      input.pricePeriod !== 'AN'
    ) {
      throw this.invalid('pricePeriod doit etre MOIS ou AN.');
    }
    if (input.zone !== undefined) this.optionalText(input.zone, 'zone', 120);
    if (input.status !== undefined) {
      this.enumValue(input.status, STATUSES, 'status');
    }
  }

  private normalizeInput(input: ListingInput) {
    return {
      parcelId: input.parcelId as string | undefined,
      type: input.type as 'TERRAIN' | 'MAISON' | undefined,
      transaction: input.transaction as 'VENTE' | 'LOCATION' | undefined,
      title:
        input.title === undefined
          ? undefined
          : this.requiredText(input.title, 'title', 160),
      description:
        input.description === undefined
          ? undefined
          : this.optionalText(input.description, 'description', 4000),
      price: input.price as number | undefined,
      currency: input.currency as 'XOF' | undefined,
      pricePeriod:
        input.pricePeriod === undefined
          ? undefined
          : (input.pricePeriod as 'MOIS' | 'AN'),
      zone:
        input.zone === undefined
          ? undefined
          : this.optionalText(input.zone, 'zone', 120) || null,
      status: input.status as ListingStatus | undefined,
    };
  }

  private requireAgent(
    actor: ListingActor,
    allowAdmin = false,
    adminAllowed = false,
  ) {
    if (allowAdmin && adminAllowed && actor.role === 'ADMIN') {
      if (!actor.accountActive) throw this.forbidden('Compte inactif.');
      return;
    }
    if (actor.role !== 'AGENT') {
      throw this.forbidden('Pour publier un bien, passez par un agent.');
    }
    if (!actor.accountActive) throw this.forbidden('Compte agent inactif.');
    if (!UUID_PATTERN.test(actor.id)) {
      throw this.invalid('L’identifiant du compte doit etre un UUID valide.');
    }
  }

  private absolutePhotoUrl(path: string) {
    return `${this.apiBaseUrl()}${path}`;
  }

  private apiBaseUrl() {
    return this.publicBaseUrl('API_PUBLIC_URL', 'http://localhost:3001');
  }

  private webBaseUrl() {
    return this.publicBaseUrl('WEB_PUBLIC_URL', 'http://localhost:3000');
  }

  private publicBaseUrl(
    name: 'API_PUBLIC_URL' | 'WEB_PUBLIC_URL',
    fallback: string,
  ) {
    const value = process.env[name];
    if (!value) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`${name} must be configured in production.`);
      }
      return fallback;
    }
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`${name} must be an HTTP(S) URL.`);
    }
    return url.toString().replace(/\/+$/, '');
  }

  private detectImageType(buffer: Buffer): 'image/jpeg' | 'image/png' | null {
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return 'image/jpeg';
    }
    if (
      buffer.length >= 8 &&
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return 'image/png';
    }
    return null;
  }

  private optionalInteger(value: string | number | undefined, field: string) {
    if (value === undefined) return undefined;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw this.invalid(`${field} doit etre un entier valide.`);
    }
    return parsed;
  }

  private validateInteger(value: unknown, field: string, minimum: number) {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < minimum
    ) {
      throw this.invalid(
        `${field} doit etre un entier superieur ou egal a ${minimum}.`,
      );
    }
  }

  private optionalText(value: unknown, field: string, max: number): string {
    if (value === undefined) return '';
    if (typeof value !== 'string' || value.length > max) {
      throw this.invalid(
        `${field} doit etre un texte de ${max} caracteres au plus.`,
      );
    }
    return value.trim();
  }

  private requiredText(value: unknown, field: string, max: number): string {
    const text = this.optionalText(value, field, max);
    if (!text) throw this.invalid(`${field} ne peut pas etre vide.`);
    return text;
  }

  private enumValue<T extends string>(
    value: unknown,
    allowed: readonly T[],
    field: string,
  ): T {
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
      throw this.invalid(
        `${field} doit etre l'une des valeurs : ${allowed.join(', ')}.`,
      );
    }
    return value as T;
  }

  private booleanValue(value: unknown, field: string): boolean {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw this.invalid(`${field} doit valoir true ou false.`);
  }

  private escapeLike(value: string) {
    return value.replace(/[\\%_]/g, '\\$&');
  }

  private invalid(message: string) {
    return new BadRequestException({ code: 'VALIDATION_ERROR', message });
  }

  private forbidden(message: string) {
    return new ForbiddenException({ code: 'FORBIDDEN', message });
  }

  private disputedParcel() {
    return this.forbidden(
      'Publication refusee : cette parcelle est en litige.',
    );
  }

  private notFound() {
    return new NotFoundException({
      code: 'NOT_FOUND',
      message: 'Ressource introuvable.',
    });
  }
}
