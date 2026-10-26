-- Demandes de leve des agents, prises par un geometre (EF-207). Samuel.
-- A executer apres 202610241300_land_parcels.sql dans une transaction.
-- Les transitions TERMINEE et ANNULEE restent une decision ouverte de LGR :
-- les statuts existent, mais aucun service ne les produit encore.

CREATE TABLE survey_requests (
  id TEXT PRIMARY KEY CHECK (length(id) > 0),
  agent_id TEXT NOT NULL CHECK (length(agent_id) > 0),
  description TEXT NOT NULL
    CHECK (length(btrim(description)) > 0 AND char_length(description) <= 1000),
  location geometry(Point, 4326) NOT NULL CHECK (
    NOT ST_IsEmpty(location)
    AND ST_X(location) BETWEEN -180 AND 180
    AND ST_Y(location) BETWEEN -90 AND 90
  ),
  contact_phone TEXT CHECK (contact_phone IS NULL OR contact_phone ~ '^\+?[0-9]{8,15}$'),
  status TEXT NOT NULL DEFAULT 'OUVERTE'
    CHECK (status IN ('OUVERTE', 'PRISE', 'TERMINEE', 'ANNULEE')),
  surveyor_id TEXT CHECK (surveyor_id IS NULL OR length(surveyor_id) > 0),
  taken_at TIMESTAMPTZ(3),
  parcel_id TEXT REFERENCES parcels(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ(3) NOT NULL,
  -- Une demande ouverte n'a pas de geometre ; une demande prise en a toujours un.
  CONSTRAINT survey_requests_open_unassigned CHECK (
    status <> 'OUVERTE' OR (surveyor_id IS NULL AND taken_at IS NULL AND parcel_id IS NULL)
  ),
  CONSTRAINT survey_requests_taken_assigned CHECK (
    status NOT IN ('PRISE', 'TERMINEE') OR (surveyor_id IS NOT NULL AND taken_at IS NOT NULL)
  ),
  CONSTRAINT survey_requests_taken_after_creation CHECK (taken_at IS NULL OR taken_at >= created_at)
);

CREATE INDEX land_survey_requests_status_idx ON survey_requests (status, created_at);
CREATE INDEX land_survey_requests_agent_idx ON survey_requests (agent_id);
CREATE INDEX land_survey_requests_surveyor_idx ON survey_requests (surveyor_id);

-- La demande de l'agent ne change pas apres sa creation, et rien ne s'efface.
CREATE FUNCTION land_preserve_survey_request() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'demande de leve en ajout seul (%)', TG_OP;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.agent_id IS DISTINCT FROM OLD.agent_id
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NOT ST_Equals(NEW.location, OLD.location)
    OR NEW.contact_phone IS DISTINCT FROM OLD.contact_phone
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'demande de leve immuable';
  END IF;
  -- Une demande prise ne change plus de geometre.
  IF OLD.surveyor_id IS NOT NULL AND NEW.surveyor_id IS DISTINCT FROM OLD.surveyor_id THEN
    RAISE EXCEPTION 'demande de leve deja prise';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER land_survey_requests_preserve
  BEFORE UPDATE OR DELETE ON survey_requests
  FOR EACH ROW EXECUTE FUNCTION land_preserve_survey_request();

CREATE TRIGGER land_survey_requests_no_truncate
  BEFORE TRUNCATE ON survey_requests
  FOR EACH STATEMENT EXECUTE FUNCTION land_reject_history_change();
