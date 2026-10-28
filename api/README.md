# GeoSmart API

The NestJS API lives entirely in this directory. Feature modules are organized
under `src/`:

- `audit/` contains the hash-chained audit log and its database migration.
- `land/` contains parcel, geometry, attestation, and survey-request features
  and their database migrations.

## Setup

The API requires PostgreSQL with PostGIS. From the repository root, start the
database and API with:

```bash
docker compose up --build
```

For local development, set `DATABASE_URL` (see `.env.example`) and run:

```bash
npm install
npm run start:dev
```

Database migrations are applied automatically on API startup. The API does not
use TypeORM schema synchronization.

## Validation

```bash
npm run build
npm test -- --runInBand
npm run test:db -- --runInBand
```
