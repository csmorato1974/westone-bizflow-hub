-- P0 forward-only closure for zonas_geo after migration 03 creates the table.
-- postgres/public default table ACLs may include TRUNCATE, REFERENCES, TRIGGER
-- and MAINTAIN. Reset this table only; do not change global default privileges.
-- No direct authenticated writes or service_role dependency were found in the
-- candidate source. The dashboard reads via authenticated SECURITY INVOKER.
REVOKE ALL PRIVILEGES ON TABLE public.zonas_geo
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.zonas_geo
  TO authenticated;
