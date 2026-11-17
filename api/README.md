# GeoSmart API

The NestJS API lives entirely in this directory. Feature modules are organized
under `src/`:

- `audit/` contains the hash-chained audit log and its database migration.
- `land/` contains parcel, geometry, attestation, and survey-request features
  and their database migrations.

## Setup

The API requires PostgreSQL with PostGIS. From the repository root, set
`DATABASE_URL` in `.env` to the managed Aiven database (SSL mode `require`),
then start the API and web app with:

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

## First Super Admin

The public registration flow never grants the `ADMIN` role. Create the first
Super Admin once, after starting the database and API, by setting `ADMIN_PHONE`
and `ADMIN_INITIAL_PASSWORD` in the local root `.env` file. Use a valid
international phone number and a unique password of at least 12 characters.
These values are passed only to the temporary bootstrap container, not to the
running API service:

```bash
docker compose --profile admin-bootstrap run --rm admin-bootstrap
```

The command creates an active `ADMIN` account only when no administrator
exists. It refuses to modify an existing account or run again after an admin
has been created. It is safe to remove both bootstrap values from `.env` after
the command succeeds. Sign in at `/admin/connexion`. This command cannot be
used to promote an existing account or create additional administrators.

## Validation

```bash
npm run build
npm test -- --runInBand
npm run test:db -- --runInBand
```
