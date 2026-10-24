-- Stockage transactionnel des PDF (EF-204, RG-03, RG-09). Samuel.
-- A executer apres 202610241300_land_parcels.sql dans une transaction.
CREATE TABLE land_attestation_pdfs (
  storage_key TEXT PRIMARY KEY CHECK (length(storage_key) > 0),
  attestation_number TEXT NOT NULL UNIQUE REFERENCES attestations(number) ON DELETE RESTRICT,
  content BYTEA NOT NULL CHECK (octet_length(content) > 0 AND octet_length(content) <= 5000000),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ(3) NOT NULL
);

CREATE TRIGGER land_pdfs_no_update_delete
  BEFORE UPDATE OR DELETE ON land_attestation_pdfs
  FOR EACH ROW EXECUTE FUNCTION land_reject_history_change();
CREATE TRIGGER land_pdfs_no_truncate
  BEFORE TRUNCATE ON land_attestation_pdfs
  FOR EACH STATEMENT EXECUTE FUNCTION land_reject_history_change();
