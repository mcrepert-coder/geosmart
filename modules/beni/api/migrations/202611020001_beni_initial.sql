CREATE TABLE IF NOT EXISTS beni_mutex (id integer PRIMARY KEY);
INSERT INTO beni_mutex(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS beni_records (
 id text PRIMARY KEY, kind text NOT NULL, data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS beni_records_kind ON beni_records(kind);
