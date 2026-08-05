-- =====================================================================
-- Identidad y conciliación centralizada de clientes
-- =====================================================================

-- ---------- 0. Funciones base (normalización / hash) -----------------

CREATE OR REPLACE FUNCTION public.fnv1a_hex(_v text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  h bigint := 2166136261;
  i int;
  c int;
BEGIN
  IF _v IS NULL THEN RETURN NULL; END IF;
  FOR i IN 1..length(_v) LOOP
    c := ascii(substr(_v, i, 1));
    h := (h # c);
    h := (h * 16777619) & 4294967295;
  END LOOP;
  RETURN lpad(to_hex(h), 8, '0');
END;
$$;

-- Equivalente exacto de normalizeText (TS): NFD, sin diacríticos,
-- minúsculas, no alfanumérico -> espacio, espacios colapsados, trim.
CREATE OR REPLACE FUNCTION public.normalizar_texto(_v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        lower(
          regexp_replace(normalize(coalesce(_v, ''), NFD),
                         '[' || chr(768) || '-' || chr(879) || ']', '', 'g')
        ),
        '[^a-z0-9[:space:]]', ' ', 'g'
      ),
      '[[:space:]]+', ' ', 'g'
    )
  )
$$;

-- Equivalente exacto de normalizePhone (TS). Devuelve '' si no hay dígitos.
CREATE OR REPLACE FUNCTION public.normalizar_telefono(_v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ltrim(regexp_replace(coalesce(_v, ''), '[^0-9]', '', 'g'), '0')
$$;

CREATE OR REPLACE FUNCTION public.normalizar_email(_v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(btrim(coalesce(_v, '')))
$$;

CREATE OR REPLACE FUNCTION public.email_provisional(_v text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.normalizar_email(_v) LIKE '%@clientes-temp.local'
$$;

-- Equivalente exacto de buildImportKey (TS). Devuelve '' cuando no hay datos.
CREATE OR REPLACE FUNCTION public.clientes_import_key(
  _telefono_normalizado text,
  _email text,
  _nombre_normalizado text,
  _direccion_normalizada text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  tel text := coalesce(_telefono_normalizado, '');
  mail text := coalesce(_email, '');
  nom text := coalesce(_nombre_normalizado, '');
  dir text := coalesce(_direccion_normalizada, '');
BEGIN
  IF length(tel) >= 7 THEN
    RETURN 'tel_' || public.fnv1a_hex('tel:' || tel);
  END IF;
  IF mail <> '' AND NOT public.email_provisional(mail) THEN
    RETURN 'mail_' || public.fnv1a_hex('mail:' || mail);
  END IF;
  IF nom <> '' THEN
    RETURN 'nom_' || public.fnv1a_hex('nom:' || nom || '|' || dir);
  END IF;
  RETURN '';
END;
$$;

-- Clave a partir de una fila de clientes (aplica las mismas reglas del importador)
CREATE OR REPLACE FUNCTION public.clientes_import_key_fila(
  _celular text, _email text, _empresa text, _contacto text, _direccion text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.clientes_import_key(
    public.normalizar_telefono(_celular),
    CASE WHEN public.email_provisional(_email) THEN '' ELSE public.normalizar_email(_email) END,
    public.normalizar_texto(coalesce(nullif(btrim(coalesce(_empresa, '')), ''), _contacto)),
    public.normalizar_texto(_direccion)
  )
$$;

-- ---------- 1. Códigos de cliente -----------------------------------

-- Formato tolerante a números > 9999 (nunca trunca)
CREATE OR REPLACE FUNCTION public.formato_codigo_cliente(_n bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 'CLI-' || lpad(_n::text, greatest(4, length(_n::text)), '0')
$$;

-- Normaliza y valida. Acepta CLI-n, VTA-n y otros códigos externos
-- (se conservan en mayúsculas sin alterar el número). Rechaza espacios
-- internos y caracteres invisibles.
CREATE OR REPLACE FUNCTION public.normalizar_codigo_cliente(_v text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text := coalesce(_v, '');
BEGIN
  -- caracteres invisibles / no separables -> espacio
  v := regexp_replace(v, '[' || chr(160) || chr(8203) || chr(8204) || chr(8205) || chr(65279) || ']', ' ', 'g');
  v := upper(btrim(v));
  IF v = '' THEN RETURN NULL; END IF;
  IF v ~ '[[:space:]]' THEN
    RAISE EXCEPTION 'Código de cliente inválido (contiene espacios internos): %', _v
      USING ERRCODE = '22023';
  END IF;
  IF v !~ '^[A-Z0-9][A-Z0-9._-]*$' THEN
    RAISE EXCEPTION 'Código de cliente inválido: %', _v USING ERRCODE = '22023';
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.codigo_cliente_numero(_v text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN upper(btrim(coalesce(_v, ''))) ~ '^CLI-[0-9]+$'
              THEN substring(upper(btrim(_v)) from 5)::bigint END
$$;

CREATE SEQUENCE IF NOT EXISTS public.clientes_codigo_seq AS bigint START WITH 1;
REVOKE ALL ON SEQUENCE public.clientes_codigo_seq FROM PUBLIC;

-- Sincroniza la secuencia hacia arriba (nunca retrocede)
CREATE OR REPLACE FUNCTION public.clientes_sync_codigo_seq(_n bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cur bigint;
BEGIN
  IF _n IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('public.clientes_codigo_seq'));
  cur := coalesce(pg_sequence_last_value('public.clientes_codigo_seq'::regclass), 0);
  IF _n > cur THEN
    PERFORM setval('public.clientes_codigo_seq', _n, true);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.clientes_nuevo_codigo()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public.clientes_codigo_seq'));
  RETURN public.formato_codigo_cliente(nextval('public.clientes_codigo_seq'));
END;
$$;

-- ---------- 2. Origen del registro ----------------------------------

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS origen_registro text NOT NULL DEFAULT 'manual';

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_origen_registro_check;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_origen_registro_check
  CHECK (origen_registro IN ('manual','importacion','autorregistro','integracion','historico'));

-- ---------- 3. Tabla de alias históricos ----------------------------

CREATE TABLE IF NOT EXISTS public.cliente_codigos_alias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  origen text,
  activo boolean NOT NULL DEFAULT true,
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cliente_codigos_alias TO authenticated;
GRANT ALL ON public.cliente_codigos_alias TO service_role;
ALTER TABLE public.cliente_codigos_alias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cca_admin_select ON public.cliente_codigos_alias;
CREATE POLICY cca_admin_select ON public.cliente_codigos_alias
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE UNIQUE INDEX IF NOT EXISTS cliente_codigos_alias_codigo_uniq
  ON public.cliente_codigos_alias (lower(btrim(codigo)))
  WHERE activo AND nullif(btrim(codigo), '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS cliente_codigos_alias_cliente_idx
  ON public.cliente_codigos_alias (cliente_id);

-- ---------- 4. Triggers ---------------------------------------------

CREATE OR REPLACE FUNCTION public.clientes_bi_identidad()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  num bigint;
  k text;
BEGIN
  NEW.origen_registro := coalesce(nullif(lower(btrim(coalesce(NEW.origen_registro, ''))), ''), 'manual');
  NEW.telefono_normalizado := nullif(public.normalizar_telefono(NEW.celular), '');

  IF nullif(btrim(coalesce(NEW.external_import_key, '')), '') IS NULL THEN
    k := public.clientes_import_key_fila(NEW.celular, NEW.email, NEW.empresa, NEW.contacto, NEW.direccion);
    NEW.external_import_key := nullif(k, '');
  END IF;

  NEW.codigo_cliente_externo := public.normalizar_codigo_cliente(NEW.codigo_cliente_externo);

  IF NEW.codigo_cliente_externo IS NULL THEN
    NEW.codigo_cliente_externo := public.clientes_nuevo_codigo();
  ELSE
    num := public.codigo_cliente_numero(NEW.codigo_cliente_externo);
    IF num IS NOT NULL THEN
      PERFORM public.clientes_sync_codigo_seq(num);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.clientes_bu_identidad()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  k text;
  autorizado boolean;
BEGIN
  NEW.origen_registro := coalesce(nullif(lower(btrim(coalesce(NEW.origen_registro, ''))), ''), OLD.origen_registro);

  IF NEW.celular IS DISTINCT FROM OLD.celular THEN
    NEW.telefono_normalizado := nullif(public.normalizar_telefono(NEW.celular), '');
  ELSE
    NEW.telefono_normalizado := OLD.telefono_normalizado;
  END IF;

  -- La clave técnica es estable: solo se completa si aún es NULL.
  IF OLD.external_import_key IS NOT NULL THEN
    NEW.external_import_key := OLD.external_import_key;
  ELSE
    k := public.clientes_import_key_fila(NEW.celular, NEW.email, NEW.empresa, NEW.contacto, NEW.direccion);
    NEW.external_import_key := nullif(k, '');
  END IF;

  -- El código solo cambia mediante la operación autorizada de super_admin.
  autorizado := coalesce(current_setting('westone.correccion_codigo', true), '') = OLD.id::text;
  IF NEW.codigo_cliente_externo IS DISTINCT FROM OLD.codigo_cliente_externo AND NOT autorizado THEN
    RAISE EXCEPTION 'El código de cliente no puede modificarse directamente. Use corregir_codigo_cliente.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.clientes_ai_auditoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, accion, entidad, entidad_id, detalle)
  VALUES (auth.uid(), 'cliente_identidad_alta', 'clientes', NEW.id,
    jsonb_build_object(
      'codigo', NEW.codigo_cliente_externo,
      'origen_registro', NEW.origen_registro,
      'telefono_normalizado', NEW.telefono_normalizado,
      'external_import_key', NEW.external_import_key,
      'fecha', now()
    ));
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.clientes_au_auditoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.celular IS DISTINCT FROM OLD.celular
     OR NEW.telefono_normalizado IS DISTINCT FROM OLD.telefono_normalizado
     OR NEW.codigo_cliente_externo IS DISTINCT FROM OLD.codigo_cliente_externo
     OR NEW.external_import_key IS DISTINCT FROM OLD.external_import_key THEN
    INSERT INTO public.audit_logs (user_id, accion, entidad, entidad_id, detalle)
    VALUES (auth.uid(), 'cliente_identidad_cambio', 'clientes', NEW.id,
      jsonb_build_object(
        'celular_anterior', OLD.celular,
        'celular_nuevo', NEW.celular,
        'telefono_anterior', OLD.telefono_normalizado,
        'telefono_nuevo', NEW.telefono_normalizado,
        'codigo_anterior', OLD.codigo_cliente_externo,
        'codigo_nuevo', NEW.codigo_cliente_externo,
        'clave_anterior', OLD.external_import_key,
        'clave_nueva', NEW.external_import_key,
        'motivo', nullif(current_setting('westone.correccion_motivo', true), ''),
        'fecha', now()
      ));
  END IF;
  RETURN NULL;
END;
$$;

-- ---------- 5. Backfill ---------------------------------------------

DO $backfill$
DECLARE
  dups int;
  max_cli bigint;
  n int;
BEGIN
  LOCK TABLE public.clientes IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*) INTO dups FROM (
    SELECT lower(btrim(codigo_cliente_externo))
    FROM public.clientes
    WHERE nullif(btrim(coalesce(codigo_cliente_externo, '')), '') IS NOT NULL
    GROUP BY 1 HAVING count(*) > 1
  ) d;
  IF dups > 0 THEN
    RAISE EXCEPTION 'Existen % códigos duplicados: se detiene la migración', dups;
  END IF;

  -- Secuencia inicializada con el mayor CLI existente
  SELECT max(public.codigo_cliente_numero(codigo_cliente_externo)) INTO max_cli FROM public.clientes;
  PERFORM setval('public.clientes_codigo_seq', coalesce(max_cli, 0) + 1, false);
  RAISE NOTICE 'Secuencia inicializada. Mayor CLI existente: %', coalesce(max_cli, 0);

  -- Códigos faltantes (solo NULL o vacío), en orden de antigüedad
  WITH faltan AS (
    SELECT id FROM public.clientes
    WHERE nullif(btrim(coalesce(codigo_cliente_externo, '')), '') IS NULL
    ORDER BY created_at, id
  )
  UPDATE public.clientes c
  SET codigo_cliente_externo = public.formato_codigo_cliente(nextval('public.clientes_codigo_seq'))
  FROM faltan f WHERE f.id = c.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Códigos asignados en backfill: %', n;

  -- Teléfono normalizado (solo cuando falta y hay dígitos)
  UPDATE public.clientes
  SET telefono_normalizado = nullif(public.normalizar_telefono(celular), '')
  WHERE telefono_normalizado IS NULL
    AND nullif(public.normalizar_telefono(celular), '') IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Teléfonos normalizados: %', n;

  UPDATE public.clientes SET telefono_normalizado = NULL WHERE btrim(coalesce(telefono_normalizado,'')) = '';

  -- Clave técnica (solo cuando falta)
  UPDATE public.clientes
  SET external_import_key =
    nullif(public.clientes_import_key_fila(celular, email, empresa, contacto, direccion), '')
  WHERE external_import_key IS NULL
    AND nullif(public.clientes_import_key_fila(celular, email, empresa, contacto, direccion), '') IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Claves técnicas asignadas: %', n;

  -- Origen del registro.
  -- Regla documentada de inferencia histórica:
  --  * 'manual'      -> existe auditoría 'crear_cliente_admin' para ese cliente
  --  * 'importacion' -> email placeholder @clientes-temp.local (solo lo genera el importador)
  --  * 'historico'   -> sin evidencia suficiente
  UPDATE public.clientes c SET origen_registro = 'historico';

  UPDATE public.clientes c SET origen_registro = 'importacion'
  WHERE public.email_provisional(c.email);

  UPDATE public.clientes c SET origen_registro = 'manual'
  WHERE EXISTS (
    SELECT 1 FROM public.audit_logs a
    WHERE a.entidad = 'clientes' AND a.accion = 'crear_cliente_admin' AND a.entidad_id = c.id
  );

  -- Resincronizar secuencia al finalizar
  SELECT max(public.codigo_cliente_numero(codigo_cliente_externo)) INTO max_cli FROM public.clientes;
  PERFORM setval('public.clientes_codigo_seq', coalesce(max_cli, 1), true);
  RAISE NOTICE 'Secuencia final: %', coalesce(max_cli, 1);
END
$backfill$;

-- ---------- 6. Índice único de código -------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS clientes_codigo_externo_uniq
  ON public.clientes (lower(btrim(codigo_cliente_externo)))
  WHERE nullif(btrim(codigo_cliente_externo), '') IS NOT NULL;

ALTER TABLE public.clientes
  ALTER COLUMN codigo_cliente_externo SET NOT NULL;

-- ---------- 7. Activación de triggers -------------------------------

DROP TRIGGER IF EXISTS trg_clientes_bi_identidad ON public.clientes;
CREATE TRIGGER trg_clientes_bi_identidad
  BEFORE INSERT ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.clientes_bi_identidad();

DROP TRIGGER IF EXISTS trg_clientes_bu_identidad ON public.clientes;
CREATE TRIGGER trg_clientes_bu_identidad
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.clientes_bu_identidad();

DROP TRIGGER IF EXISTS trg_clientes_ai_auditoria ON public.clientes;
CREATE TRIGGER trg_clientes_ai_auditoria
  AFTER INSERT ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.clientes_ai_auditoria();

DROP TRIGGER IF EXISTS trg_clientes_au_auditoria ON public.clientes;
CREATE TRIGGER trg_clientes_au_auditoria
  AFTER UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.clientes_au_auditoria();

-- ---------- 8. RPC: corrección autorizada de código -----------------

CREATE OR REPLACE FUNCTION public.corregir_codigo_cliente(
  _cliente_id uuid,
  _codigo_nuevo text,
  _motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo text;
  v_old text;
  v_conflicto uuid;
  v_num bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo un super administrador puede corregir el código de cliente'
      USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(coalesce(_motivo, '')), '') IS NULL THEN
    RAISE EXCEPTION 'El motivo es obligatorio' USING ERRCODE = '22023';
  END IF;

  v_codigo := public.normalizar_codigo_cliente(_codigo_nuevo);
  IF v_codigo IS NULL THEN
    RAISE EXCEPTION 'El código nuevo es obligatorio' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.clientes_codigo_seq'));

  SELECT codigo_cliente_externo INTO v_old FROM public.clientes WHERE id = _cliente_id;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'Cliente no encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF lower(v_old) = lower(v_codigo) THEN
    RETURN jsonb_build_object('cambiado', false, 'codigo', v_old);
  END IF;

  SELECT id INTO v_conflicto FROM public.clientes
  WHERE lower(btrim(codigo_cliente_externo)) = lower(v_codigo) AND id <> _cliente_id;
  IF v_conflicto IS NULL THEN
    SELECT cliente_id INTO v_conflicto FROM public.cliente_codigos_alias
    WHERE activo AND lower(btrim(codigo)) = lower(v_codigo) AND cliente_id <> _cliente_id;
  END IF;
  IF v_conflicto IS NOT NULL THEN
    RAISE EXCEPTION 'El código % ya pertenece a otro cliente (%)', v_codigo, v_conflicto
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.cliente_codigos_alias (cliente_id, codigo, origen, creado_por)
  VALUES (_cliente_id, v_old, 'correccion', auth.uid())
  ON CONFLICT DO NOTHING;

  PERFORM set_config('westone.correccion_codigo', _cliente_id::text, true);
  PERFORM set_config('westone.correccion_motivo', _motivo, true);

  UPDATE public.clientes SET codigo_cliente_externo = v_codigo WHERE id = _cliente_id;

  PERFORM set_config('westone.correccion_codigo', '', true);
  PERFORM set_config('westone.correccion_motivo', '', true);

  v_num := public.codigo_cliente_numero(v_codigo);
  IF v_num IS NOT NULL THEN PERFORM public.clientes_sync_codigo_seq(v_num); END IF;

  INSERT INTO public.audit_logs (user_id, accion, entidad, entidad_id, detalle)
  VALUES (auth.uid(), 'corregir_codigo_cliente', 'clientes', _cliente_id,
    jsonb_build_object('codigo_anterior', v_old, 'codigo_nuevo', v_codigo, 'motivo', _motivo));

  RETURN jsonb_build_object('cambiado', true, 'codigo', v_codigo, 'codigo_anterior', v_old);
END;
$$;

-- ---------- 9. RPC: validación previa de identidad ------------------

CREATE OR REPLACE FUNCTION public.validar_identidad_cliente(
  _codigo text DEFAULT NULL,
  _celular text DEFAULT NULL,
  _email text DEFAULT NULL,
  _empresa text DEFAULT NULL,
  _contacto text DEFAULT NULL,
  _direccion text DEFAULT NULL,
  _cliente_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo text;
  v_tel text;
  v_key text;
  r record;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  BEGIN
    v_codigo := public.normalizar_codigo_cliente(_codigo);
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('conflicto', 'codigo_invalido');
  END;

  IF v_codigo IS NOT NULL THEN
    SELECT c.id, c.empresa, c.contacto, c.codigo_cliente_externo, 'codigo_principal'::text AS via
      INTO r
    FROM public.clientes c
    WHERE lower(btrim(c.codigo_cliente_externo)) = lower(v_codigo)
      AND (_cliente_id IS NULL OR c.id <> _cliente_id)
    LIMIT 1;
    IF r.id IS NULL THEN
      SELECT c.id, c.empresa, c.contacto, c.codigo_cliente_externo, 'codigo_alias'::text AS via
        INTO r
      FROM public.cliente_codigos_alias a
      JOIN public.clientes c ON c.id = a.cliente_id
      WHERE a.activo AND lower(btrim(a.codigo)) = lower(v_codigo)
        AND (_cliente_id IS NULL OR c.id <> _cliente_id)
      LIMIT 1;
    END IF;
    IF r.id IS NOT NULL THEN
      RETURN jsonb_build_object('conflicto', 'codigo', 'via', r.via, 'cliente_id', r.id,
        'empresa', r.empresa, 'contacto', r.contacto, 'codigo', r.codigo_cliente_externo);
    END IF;
  END IF;

  v_tel := nullif(public.normalizar_telefono(_celular), '');
  IF v_tel IS NOT NULL THEN
    SELECT c.id, c.empresa, c.contacto, c.codigo_cliente_externo INTO r
    FROM public.clientes c
    WHERE c.telefono_normalizado = v_tel AND (_cliente_id IS NULL OR c.id <> _cliente_id)
    LIMIT 1;
    IF r.id IS NOT NULL THEN
      RETURN jsonb_build_object('conflicto', 'telefono', 'cliente_id', r.id,
        'empresa', r.empresa, 'contacto', r.contacto, 'codigo', r.codigo_cliente_externo);
    END IF;
  END IF;

  IF nullif(btrim(coalesce(_email, '')), '') IS NOT NULL AND NOT public.email_provisional(_email) THEN
    SELECT c.id, c.empresa, c.contacto, c.codigo_cliente_externo INTO r
    FROM public.clientes c
    WHERE public.normalizar_email(c.email) = public.normalizar_email(_email)
      AND (_cliente_id IS NULL OR c.id <> _cliente_id)
    LIMIT 1;
    IF r.id IS NOT NULL THEN
      RETURN jsonb_build_object('conflicto', 'email', 'cliente_id', r.id,
        'empresa', r.empresa, 'contacto', r.contacto, 'codigo', r.codigo_cliente_externo);
    END IF;
  END IF;

  v_key := nullif(public.clientes_import_key_fila(_celular, _email, _empresa, _contacto, _direccion), '');
  IF v_key IS NOT NULL THEN
    SELECT c.id, c.empresa, c.contacto, c.codigo_cliente_externo INTO r
    FROM public.clientes c
    WHERE c.external_import_key = v_key AND (_cliente_id IS NULL OR c.id <> _cliente_id)
    LIMIT 1;
    IF r.id IS NOT NULL THEN
      RETURN jsonb_build_object('conflicto', 'clave', 'cliente_id', r.id,
        'empresa', r.empresa, 'contacto', r.contacto, 'codigo', r.codigo_cliente_externo);
    END IF;
  END IF;

  RETURN jsonb_build_object('conflicto', NULL, 'clave', v_key, 'codigo', v_codigo);
END;
$$;

-- ---------- 10. Nuevo tipo de incidencia ----------------------------

ALTER TYPE public.import_issue_tipo ADD VALUE IF NOT EXISTS 'conflicto_codigo_cliente';

-- ---------- 11. Permisos --------------------------------------------

REVOKE ALL ON FUNCTION public.clientes_bi_identidad() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clientes_bu_identidad() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clientes_ai_auditoria() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clientes_au_auditoria() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clientes_nuevo_codigo() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clientes_sync_codigo_seq(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.corregir_codigo_cliente(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validar_identidad_cliente(text, text, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fnv1a_hex(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalizar_texto(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalizar_telefono(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalizar_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.email_provisional(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clientes_import_key(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clientes_import_key_fila(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalizar_codigo_cliente(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.codigo_cliente_numero(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.formato_codigo_cliente(bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.corregir_codigo_cliente(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validar_identidad_cliente(text, text, text, text, text, text, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fnv1a_hex(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.normalizar_texto(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.normalizar_telefono(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.normalizar_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_provisional(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.clientes_import_key(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.clientes_import_key_fila(text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.normalizar_codigo_cliente(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.codigo_cliente_numero(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.formato_codigo_cliente(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.corregir_codigo_cliente(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.validar_identidad_cliente(text, text, text, text, text, text, uuid) TO service_role;