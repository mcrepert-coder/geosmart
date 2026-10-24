-- Journal chaine (EF-205, RG-10). Proprietaire : Samuel.
-- hash = SHA-256 du JSON canonique de (seq, prevHash, at, actorId, action,
-- entityType, entityId, details), calcule par api/src/audit/audit-chain.ts.

CREATE TABLE audit_log (
  seq          BIGINT       PRIMARY KEY CHECK (seq >= 1),
  at           TIMESTAMPTZ(3) NOT NULL,
  actor_id     TEXT,
  action       TEXT         NOT NULL CHECK (action ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  entity_type  TEXT         NOT NULL,
  entity_id    TEXT         NOT NULL,
  details      JSONB        NOT NULL DEFAULT '{}'::jsonb
                            CHECK (jsonb_typeof(details) = 'object'),
  prev_hash    CHAR(64)     NOT NULL CHECK (prev_hash ~ '^[0-9a-f]{64}$'),
  hash         CHAR(64)     NOT NULL UNIQUE CHECK (hash ~ '^[0-9a-f]{64}$'),
  -- Un seul successeur par ligne, et la premiere ligne part de 64 zeros.
  CONSTRAINT audit_log_prev_unique UNIQUE (prev_hash),
  CONSTRAINT audit_log_genesis CHECK (
    (seq = 1) = (prev_hash = '0000000000000000000000000000000000000000000000000000000000000000')
  )
);

CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);
CREATE INDEX audit_log_action_idx ON audit_log (action);
CREATE INDEX audit_log_at_idx ON audit_log (at);

-- Journal en ajout seul : modification et suppression refusees, y compris par TRUNCATE.
CREATE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log est en ajout seul (%)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();
