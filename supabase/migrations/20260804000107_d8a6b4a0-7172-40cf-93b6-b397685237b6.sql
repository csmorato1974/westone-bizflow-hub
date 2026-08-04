-- 1) username en profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS username_provisional boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_uidx
  ON public.profiles (lower(username)) WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.username_reservado(_username text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(coalesce(_username,'')) IN (
    'admin','admins','administrador','superadmin','super_admin','super-admin',
    'root','soporte','support','westone','wst','sistema','system','postmaster',
    'webmaster','info','contacto','ventas','null','undefined','me','usuario'
  )
$$;

CREATE OR REPLACE FUNCTION public.validar_username()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.username IS NULL OR btrim(NEW.username) = '' THEN
    NEW.username := NULL;
    RETURN NEW;
  END IF;

  NEW.username := lower(btrim(NEW.username));

  IF NEW.username !~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$' THEN
    RAISE EXCEPTION 'Nombre de usuario invalido: usa 3 a 30 caracteres (letras, numeros, punto, guion o guion bajo) sin empezar ni terminar con separador';
  END IF;

  IF public.username_reservado(NEW.username) THEN
    RAISE EXCEPTION 'El nombre de usuario % esta reservado, elegi otro', NEW.username;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_username ON public.profiles;
CREATE TRIGGER trg_validar_username
  BEFORE INSERT OR UPDATE OF username ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validar_username();

-- 2) disponibilidad de username (solo si/no, sin exponer datos)
CREATE OR REPLACE FUNCTION public.username_disponible(_username text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v text := lower(btrim(coalesce(_username,'')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v !~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$' OR public.username_reservado(v) THEN
    RETURN false;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(username) = v AND id <> auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.username_disponible(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.username_disponible(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.username_reservado(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.username_reservado(text) TO authenticated, service_role;

-- 3) backfill de usernames existentes
WITH src AS (
  SELECT DISTINCT ON (p.id)
    p.id,
    coalesce(nullif(btrim(c.empresa), ''), nullif(btrim(p.full_name), ''), 'cuenta') AS nombre
  FROM public.profiles p
  LEFT JOIN public.clientes c ON c.user_id = p.id
  WHERE p.username IS NULL
  ORDER BY p.id, c.created_at ASC
), slug AS (
  SELECT id,
    btrim(
      regexp_replace(
        lower(translate(nombre,
          'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
          'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
        '[^a-z0-9]+', '.', 'g'),
      '.')
    AS s
  FROM src
), fixed AS (
  SELECT id,
    CASE
      WHEN length(coalesce(nullif(s,''), '')) < 3 THEN 'cuenta.' || substr(replace(id::text,'-',''), 1, 6)
      ELSE substr(s, 1, 24)
    END AS s
  FROM slug
), num AS (
  SELECT id, btrim(s, '.') AS s, row_number() OVER (PARTITION BY btrim(s,'.') ORDER BY id) AS rn
  FROM fixed
)
UPDATE public.profiles p
SET username = CASE
      WHEN n.rn = 1 AND NOT public.username_reservado(n.s) THEN n.s
      ELSE n.s || '.' || n.rn::text
    END,
    username_provisional = true
FROM num n
WHERE p.id = n.id;

-- 4) solicitudes de cambio de email (estado + auditoria de UI)
CREATE TABLE IF NOT EXISTS public.email_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  solicitado_por uuid NOT NULL,
  email_anterior text,
  email_nuevo text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente',
  reenvios integer NOT NULL DEFAULT 0,
  ultimo_envio timestamptz NOT NULL DEFAULT now(),
  cerrado_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_change_requests_estado_chk
    CHECK (estado IN ('pendiente','confirmada','cancelada','expirada'))
);

CREATE INDEX IF NOT EXISTS email_change_requests_user_idx
  ON public.email_change_requests (user_id, estado);

GRANT SELECT, INSERT, UPDATE ON public.email_change_requests TO authenticated;
GRANT ALL ON public.email_change_requests TO service_role;

ALTER TABLE public.email_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ecr_select ON public.email_change_requests;
CREATE POLICY ecr_select ON public.email_change_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS ecr_insert ON public.email_change_requests;
CREATE POLICY ecr_insert ON public.email_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    solicitado_por = auth.uid()
    AND (user_id = auth.uid() OR public.is_admin(auth.uid()))
  );

DROP POLICY IF EXISTS ecr_update ON public.email_change_requests;
CREATE POLICY ecr_update ON public.email_change_requests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_ecr_updated ON public.email_change_requests;
CREATE TRIGGER trg_ecr_updated
  BEFORE UPDATE ON public.email_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5) sincronizacion del email del perfil con el email real de la cuenta
CREATE OR REPLACE FUNCTION public.sincronizar_mi_email()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_auth_email text := lower(btrim(coalesce(auth.email(), '')));
  v_perfil_email text;
  v_cambio boolean := false;
BEGIN
  IF v_uid IS NULL OR v_auth_email = '' THEN
    RETURN jsonb_build_object('sincronizado', false);
  END IF;

  SELECT lower(btrim(coalesce(email,''))) INTO v_perfil_email
  FROM public.profiles WHERE id = v_uid;

  IF v_perfil_email IS DISTINCT FROM v_auth_email THEN
    UPDATE public.profiles
    SET email = v_auth_email,
        email_provisional = (v_auth_email LIKE '%@clientes-temp.local')
    WHERE id = v_uid;
    v_cambio := true;

    INSERT INTO public.audit_logs (user_id, accion, entidad, entidad_id, detalle)
    VALUES (v_uid, 'confirmar_cambio_email', 'profiles', v_uid,
            jsonb_build_object('email_anterior', v_perfil_email, 'email_nuevo', v_auth_email));
  END IF;

  UPDATE public.email_change_requests
  SET estado = 'confirmada', cerrado_en = now()
  WHERE user_id = v_uid
    AND estado = 'pendiente'
    AND lower(email_nuevo) = v_auth_email;

  RETURN jsonb_build_object('sincronizado', v_cambio, 'email', v_auth_email);
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_mi_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sincronizar_mi_email() TO authenticated, service_role;