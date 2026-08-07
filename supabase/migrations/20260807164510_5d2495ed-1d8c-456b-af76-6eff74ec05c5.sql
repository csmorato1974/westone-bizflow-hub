CREATE TABLE public.password_reset_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id uuid NOT NULL,
  estado text NOT NULL DEFAULT 'en_curso',
  total integer NOT NULL DEFAULT 0,
  procesadas integer NOT NULL DEFAULT 0,
  fallidas integer NOT NULL DEFAULT 0,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  finalizado_en timestamp with time zone
);

GRANT SELECT ON public.password_reset_batches TO authenticated;
GRANT ALL ON public.password_reset_batches TO service_role;
ALTER TABLE public.password_reset_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prb_select_admin" ON public.password_reset_batches
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_prb_updated BEFORE UPDATE ON public.password_reset_batches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.password_reset_batch_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.password_reset_batches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  email_acceso text,
  estado text NOT NULL DEFAULT 'pendiente',
  error text,
  procesado_en timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (batch_id, user_id)
);

GRANT SELECT ON public.password_reset_batch_items TO authenticated;
GRANT ALL ON public.password_reset_batch_items TO service_role;
ALTER TABLE public.password_reset_batch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prbi_select_admin" ON public.password_reset_batch_items
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE INDEX idx_prbi_batch_estado ON public.password_reset_batch_items (batch_id, estado);

CREATE TRIGGER trg_prbi_updated BEFORE UPDATE ON public.password_reset_batch_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();