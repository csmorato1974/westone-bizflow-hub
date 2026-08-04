ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS origen_importacion text,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS import_row_key text;

CREATE UNIQUE INDEX IF NOT EXISTS pedidos_import_row_key_uniq
  ON public.pedidos (import_row_key)
  WHERE import_row_key IS NOT NULL AND import_row_key <> '';

CREATE TABLE IF NOT EXISTS public.import_pedidos_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  origen text NOT NULL DEFAULT 'pegado',
  archivo text,
  total_filas integer NOT NULL DEFAULT 0,
  pedidos_creados integer NOT NULL DEFAULT 0,
  lineas_creadas integer NOT NULL DEFAULT 0,
  omitidos integer NOT NULL DEFAULT 0,
  errores integer NOT NULL DEFAULT 0,
  pendientes integer NOT NULL DEFAULT 0,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.import_pedidos_batches TO authenticated;
GRANT ALL ON public.import_pedidos_batches TO service_role;

ALTER TABLE public.import_pedidos_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ipb_select_admin" ON public.import_pedidos_batches
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "ipb_insert_admin" ON public.import_pedidos_batches
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) AND user_id = auth.uid());