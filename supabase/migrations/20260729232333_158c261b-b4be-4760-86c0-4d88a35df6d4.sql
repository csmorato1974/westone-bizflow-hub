ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS ciudad text,
  ADD COLUMN IF NOT EXISTS codigo_cliente_externo text,
  ADD COLUMN IF NOT EXISTS telefono_normalizado text,
  ADD COLUMN IF NOT EXISTS email_provisional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_import_key text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_provisional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_clientes_telefono_normalizado ON public.clientes (telefono_normalizado);
CREATE INDEX IF NOT EXISTS idx_clientes_codigo_externo ON public.clientes (codigo_cliente_externo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_external_import_key ON public.clientes (external_import_key) WHERE external_import_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  origen text NOT NULL,
  archivo text,
  total_filas integer NOT NULL DEFAULT 0,
  creados integer NOT NULL DEFAULT 0,
  actualizados integer NOT NULL DEFAULT 0,
  vinculados integer NOT NULL DEFAULT 0,
  omitidos integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 0,
  errores integer NOT NULL DEFAULT 0,
  detalle jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_batches_super_admin_all"
  ON public.import_batches
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));