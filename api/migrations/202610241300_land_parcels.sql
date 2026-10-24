-- Foncier (EF-201, EF-203 a EF-205, RG-04, RG-08, RG-09). Samuel.
-- Prerequis : PostgreSQL avec PostGIS active par l'integrateur.
-- Executer atomiquement avec le moteur de migrations commun.
-- Les identifiants de comptes et chantiers restent opaques : leurs schemas
-- appartiennent aux autres modules et ne sont pas encore disponibles.

CREATE TABLE parcels (
  id TEXT PRIMARY KEY CHECK (length(id) > 0),
  author_id TEXT NOT NULL CHECK (length(author_id) > 0),
  client_id UUID NOT NULL,
  -- Conserver la requete initiale, meme apres modification de la parcelle,
  -- pour comparer les reprises sans les confondre avec l'etat courant.
  creation_payload JSONB NOT NULL CHECK (jsonb_typeof(creation_payload) = 'object'),
  -- Corps JSON de la reponse 201 initiale, dont certified a cet instant.
  -- Enregistre atomiquement avec la parcelle ; rejoue en 200 sans recalcul.
  creation_response JSONB NOT NULL CHECK (jsonb_typeof(creation_response) = 'object'),
  project_id TEXT,
  label VARCHAR(120),
  legal_status TEXT NOT NULL
    CHECK (legal_status IN ('TITRE', 'COUTUMIER_NON_TITRE', 'EN_LITIGE')),
  version INTEGER NOT NULL CHECK (version >= 1),
  geometry geometry(Polygon, 4326) NOT NULL,
  geometry_hash TEXT NOT NULL CHECK (geometry_hash ~ '^[0-9a-f]{64}$'),
  -- Bornes ordonnees, avec leur source complete selon contracts/land.yaml.
  vertices JSONB NOT NULL CHECK (
    CASE WHEN jsonb_typeof(vertices) = 'array'
      THEN jsonb_array_length(vertices) >= 3 ELSE false END
  ),
  area_m2 DOUBLE PRECISION NOT NULL CHECK (area_m2 > 0 AND area_m2 < 'Infinity'::float8),
  perimeter_m DOUBLE PRECISION NOT NULL CHECK (perimeter_m > 0 AND perimeter_m < 'Infinity'::float8),
  in_conflict BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ(3) NOT NULL,
  updated_at TIMESTAMPTZ(3) NOT NULL CHECK (updated_at >= created_at),
  CONSTRAINT land_parcels_client_unique UNIQUE (author_id, client_id),
  CONSTRAINT land_parcels_geometry_valid CHECK (
    NOT ST_IsEmpty(geometry) AND ST_IsValid(geometry)
    AND ST_Area(geometry) > 0
    -- Contour exterieur seul, comme ParcelCreate dans contracts/land.yaml.
    AND ST_NumInteriorRings(geometry) = 0
    AND ST_XMin(Box3D(geometry)) >= -180
    AND ST_XMax(Box3D(geometry)) <= 180
    AND ST_YMin(Box3D(geometry)) >= -90
    AND ST_YMax(Box3D(geometry)) <= 90
  )
);

CREATE INDEX land_parcels_geometry_idx ON parcels USING GIST (geometry);
CREATE INDEX land_parcels_status_idx ON parcels (legal_status);

-- Les donnees de rejeu et leur proprietaire ne changent jamais avec le courant.
CREATE FUNCTION land_preserve_creation() RETURNS trigger AS $$
BEGIN
  IF NEW.author_id IS DISTINCT FROM OLD.author_id
    OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.creation_payload IS DISTINCT FROM OLD.creation_payload
    OR NEW.creation_response IS DISTINCT FROM OLD.creation_response THEN
    RAISE EXCEPTION 'donnees de creation immuables';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER land_parcels_preserve_creation
  BEFORE UPDATE ON parcels
  FOR EACH ROW EXECUTE FUNCTION land_preserve_creation();

CREATE TABLE parcel_versions (
  parcel_id TEXT NOT NULL REFERENCES parcels(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version >= 1),
  -- Instantane complet : une modification ulterieure ne change pas le PDF
  -- d'une ancienne attestation ni la reponse initiale de creation.
  project_id TEXT,
  label VARCHAR(120),
  legal_status TEXT NOT NULL
    CHECK (legal_status IN ('TITRE', 'COUTUMIER_NON_TITRE', 'EN_LITIGE')),
  geometry geometry(Polygon, 4326) NOT NULL,
  geometry_hash TEXT NOT NULL CHECK (geometry_hash ~ '^[0-9a-f]{64}$'),
  vertices JSONB NOT NULL CHECK (
    CASE WHEN jsonb_typeof(vertices) = 'array'
      THEN jsonb_array_length(vertices) >= 3 ELSE false END
  ),
  area_m2 DOUBLE PRECISION NOT NULL CHECK (area_m2 > 0 AND area_m2 < 'Infinity'::float8),
  perimeter_m DOUBLE PRECISION NOT NULL CHECK (perimeter_m > 0 AND perimeter_m < 'Infinity'::float8),
  in_conflict BOOLEAN NOT NULL,
  changed_by TEXT NOT NULL CHECK (length(changed_by) > 0),
  changed_at TIMESTAMPTZ(3) NOT NULL,
  reason TEXT,
  PRIMARY KEY (parcel_id, version),
  CONSTRAINT land_versions_geometry_valid CHECK (
    NOT ST_IsEmpty(geometry) AND ST_IsValid(geometry) AND ST_Area(geometry) > 0
    AND ST_NumInteriorRings(geometry) = 0
    AND ST_XMin(Box3D(geometry)) >= -180 AND ST_XMax(Box3D(geometry)) <= 180
    AND ST_YMin(Box3D(geometry)) >= -90 AND ST_YMax(Box3D(geometry)) <= 90
  ),
  CONSTRAINT land_versions_reason CHECK (version = 1 OR length(reason) >= 3),
  CONSTRAINT land_versions_reason_required CHECK (version = 1 OR reason IS NOT NULL)
);

-- La parcelle courante doit avoir un instantane, cree dans la meme transaction.
-- Contrainte differee pour permettre l'insertion initiale des deux lignes.
ALTER TABLE parcels ADD CONSTRAINT land_parcels_current_version_fk
  FOREIGN KEY (id, version) REFERENCES parcel_versions(parcel_id, version)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE attestations (
  number TEXT PRIMARY KEY CHECK (length(number) > 0),
  parcel_id TEXT NOT NULL,
  parcel_version INTEGER NOT NULL,
  -- Identite professionnelle conservee telle qu'affichee a l'emission.
  surveyor_id TEXT NOT NULL CHECK (length(surveyor_id) > 0),
  surveyor_name TEXT NOT NULL CHECK (length(trim(surveyor_name)) > 0),
  issued_at TIMESTAMPTZ(3) NOT NULL,
  notice TEXT NOT NULL DEFAULT 'Ne vaut pas titre foncier'
    CHECK (notice = 'Ne vaut pas titre foncier'),
  -- Reference interne seulement : stockage et acces au PDF a integrer.
  pdf_storage_key TEXT NOT NULL CHECK (length(pdf_storage_key) > 0),
  FOREIGN KEY (parcel_id, parcel_version)
    REFERENCES parcel_versions(parcel_id, version) ON DELETE RESTRICT
);

CREATE INDEX land_attestations_parcel_idx ON attestations (parcel_id, parcel_version);

-- Les instantanes et attestations emis ne sont jamais remplaces ou effaces.
CREATE FUNCTION land_reject_history_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'historique foncier en ajout seul (%)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER land_versions_no_update_delete
  BEFORE UPDATE OR DELETE ON parcel_versions
  FOR EACH ROW EXECUTE FUNCTION land_reject_history_change();
CREATE TRIGGER land_versions_no_truncate
  BEFORE TRUNCATE ON parcel_versions
  FOR EACH STATEMENT EXECUTE FUNCTION land_reject_history_change();
CREATE TRIGGER land_attestations_no_update_delete
  BEFORE UPDATE OR DELETE ON attestations
  FOR EACH ROW EXECUTE FUNCTION land_reject_history_change();
CREATE TRIGGER land_attestations_no_truncate
  BEFORE TRUNCATE ON attestations
  FOR EACH STATEMENT EXECUTE FUNCTION land_reject_history_change();

-- Restent a implementer dans le service et a tester sur PostGIS :
-- droits et inscription a l'Ordre, RTK Fixed et coherence bornes/geometrie,
-- hash canonique et mesures UTM 31N, certification issue du module comptes,
-- comparaison des reprises, progression des versions et audit transactionnel.
-- Le controle de chevauchement doit etre protege contre les creations concurrentes ;
-- l'index GIST et ST_IsValid ne constituent pas cette protection (RG-02).
