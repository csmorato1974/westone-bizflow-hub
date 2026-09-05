-- Sprint 2: historial inmutable del onboarding comercial generado.
CREATE TABLE public.onboarding_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_empresa text NOT NULL,
  cliente_contacto text NOT NULL,
  cliente_celular text NOT NULL,
  vendedor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lista_precio_id uuid REFERENCES public.listas_precios(id) ON DELETE SET NULL,
  lista_precio_nombre text NOT NULL,
  canal text NOT NULL DEFAULT 'whatsapp'
    CHECK (canal IN ('whatsapp', 'email', 'copiado')),
  mensaje text NOT NULL,
  portal_url text NOT NULL,
  precios_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(precios_snapshot) = 'array'),
  items_total integer NOT NULL DEFAULT 0 CHECK (items_total >= 0),
  generado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.onboarding_snapshots IS
  'Copia inmutable del mensaje, lista, precios y stock mostrados al generar un onboarding.';

CREATE INDEX onboarding_snapshots_cliente_fecha_idx
  ON public.onboarding_snapshots (cliente_id, generado_en DESC);
CREATE INDEX onboarding_snapshots_vendedor_fecha_idx
  ON public.onboarding_snapshots (vendedor_id, generado_en DESC);

REVOKE ALL ON TABLE public.onboarding_snapshots FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE public.onboarding_snapshots TO authenticated;
GRANT ALL ON TABLE public.onboarding_snapshots TO service_role;

ALTER TABLE public.onboarding_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarding_snapshots_select_scope
ON public.onboarding_snapshots
FOR SELECT TO authenticated
USING (
  (SELECT public.is_admin((SELECT auth.uid())))
  OR creado_por = (SELECT auth.uid())
  OR vendedor_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.id = onboarding_snapshots.cliente_id
      AND c.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY onboarding_snapshots_insert_scope
ON public.onboarding_snapshots
FOR INSERT TO authenticated
WITH CHECK (
  creado_por = (SELECT auth.uid())
  AND (
    (SELECT public.is_admin((SELECT auth.uid())))
    OR (
      vendedor_id = (SELECT auth.uid())
      AND (SELECT public.has_role((SELECT auth.uid()), 'vendedor'::public.app_role))
      AND EXISTS (
        SELECT 1
        FROM public.clientes c
        WHERE c.id = onboarding_snapshots.cliente_id
          AND c.vendedor_id = (SELECT auth.uid())
      )
    )
  )
);

-- No se crean políticas UPDATE ni DELETE: un snapshot histórico no se modifica.
