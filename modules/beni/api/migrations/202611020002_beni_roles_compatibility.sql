-- A executer seulement pour mettre a niveau les donnees du prototype precedent.
-- Conserver l'ancien recu de synchronisation : ne pas reutiliser ses clientId.
UPDATE beni_records
SET data = jsonb_set(data, '{role}', to_jsonb((CASE data->>'role'
  WHEN 'admin' THEN 'ADMIN'
  WHEN 'ADMINISTRATEUR' THEN 'ADMIN'
  WHEN 'surveyor' THEN 'GEOMETRE'
  WHEN 'topographer' THEN 'TOPOGRAPHE'
  WHEN 'agent' THEN 'AGENT_IMMOBILIER'
  WHEN 'client' THEN 'CLIENT'
END)::text))
WHERE kind = 'user' AND data->>'role' IN
  ('admin','ADMINISTRATEUR','surveyor','topographer','agent','client');
