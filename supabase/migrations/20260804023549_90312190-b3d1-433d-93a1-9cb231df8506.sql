ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS onboarding_enviado_en timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_canal text,
  ADD COLUMN IF NOT EXISTS onboarding_enviado_por uuid;