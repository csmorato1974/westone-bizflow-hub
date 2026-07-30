CREATE TYPE public.import_issue_tipo AS ENUM (
  'error_de_formato','datos_incompletos','duplicado_probable','conflicto_desde_preview',
  'referencia_no_encontrada','error_auth','error_profile','error_cliente','error_desconocido'
);

CREATE TYPE public.import_issue_estado AS ENUM ('pendiente','reintentado','resuelto','ignorado');

CREATE TABLE public.import_batch_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL,
  fila integer NOT NULL,
  datos_originales jsonb NOT NULL DEFAULT '{}'::jsonb,
  datos_normalizados jsonb NOT NULL DEFAULT '{}'::jsonb,
  datos_corregidos jsonb,
  estado text NOT NULL,
  motivo text NOT NULL DEFAULT '',
  observaciones text[] NOT NULL DEFAULT '{}',
  tipo_problema public.import_issue_tipo NOT NULL DEFAULT 'error_desconocido',
  identidad_key text NOT NULL,
  claves_conocidas text[] NOT NULL DEFAULT '{}',
  external_import_key text,
  user_id uuid,
  profile_id uuid,
  cliente_id uuid,
  estado_caso public.import_issue_estado NOT NULL DEFAULT 'pendiente',
  intentos integer NOT NULL DEFAULT 0,
  ultimo_intento timestamptz,
  historial jsonb NOT NULL DEFAULT '[]'::jsonb,
  resuelto_por uuid,
  resuelto_en timestamptz,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batch_issues TO authenticated;
GRANT ALL ON public.import_batch_issues TO service_role;

ALTER TABLE public.import_batch_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin gestiona incidencias de importacion"
ON public.import_batch_issues FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE UNIQUE INDEX import_batch_issues_identidad_abierta
  ON public.import_batch_issues (identidad_key)
  WHERE estado_caso IN ('pendiente','reintentado');

CREATE INDEX import_batch_issues_batch_idx ON public.import_batch_issues (batch_id);
CREATE INDEX import_batch_issues_estado_idx ON public.import_batch_issues (estado_caso);
CREATE INDEX import_batch_issues_tipo_idx ON public.import_batch_issues (tipo_problema);
CREATE INDEX import_batch_issues_claves_idx ON public.import_batch_issues USING gin (claves_conocidas);

CREATE TRIGGER import_batch_issues_touch
BEFORE UPDATE ON public.import_batch_issues
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();