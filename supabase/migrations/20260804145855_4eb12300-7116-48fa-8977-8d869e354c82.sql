CREATE TABLE public.password_recovery_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identificador text NOT NULL,
  user_id uuid,
  username text,
  email_acceso text,
  tiene_email_real boolean NOT NULL DEFAULT false,
  estado text NOT NULL DEFAULT 'pendiente',
  resuelto_por uuid,
  resuelto_en timestamp with time zone,
  notas text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.password_recovery_requests TO authenticated;
GRANT ALL ON public.password_recovery_requests TO service_role;

ALTER TABLE public.password_recovery_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prr_admin_select" ON public.password_recovery_requests
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "prr_admin_update" ON public.password_recovery_requests
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_prr_updated BEFORE UPDATE ON public.password_recovery_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_prr_estado ON public.password_recovery_requests (estado, created_at DESC);