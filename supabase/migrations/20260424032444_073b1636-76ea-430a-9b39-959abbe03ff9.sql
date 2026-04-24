-- ===== ENUMS =====
CREATE TYPE public.app_role AS ENUM ('super_admin','admin','vendedor','logistica','cliente');
CREATE TYPE public.pedido_estado AS ENUM ('borrador','enviado','aprobado','listo_despacho','en_ruta','entregado','cancelado');
CREATE TYPE public.producto_linea AS ENUM ('refrigerante','anticongelante','heavy_duty','def','limpieza');

-- ===== PROFILES =====
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ===== USER ROLES =====
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ===== HAS_ROLE FUNCTION =====
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','super_admin')
  )
$$;

-- ===== PRICE LISTS =====
CREATE TABLE public.listas_precios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.listas_precios ENABLE ROW LEVEL SECURITY;

-- ===== PRODUCTS =====
CREATE TABLE public.productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  linea producto_linea NOT NULL,
  descripcion TEXT,
  ficha_tecnica JSONB DEFAULT '{}'::jsonb,
  presentaciones TEXT[],
  imagen_url TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

-- ===== PRICE LIST ITEMS =====
CREATE TABLE public.lista_precio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_id UUID NOT NULL REFERENCES public.listas_precios(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  precio NUMERIC(12,2) NOT NULL,
  UNIQUE (lista_id, producto_id)
);
ALTER TABLE public.lista_precio_items ENABLE ROW LEVEL SECURITY;

-- ===== STOCK =====
CREATE TABLE public.stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL UNIQUE REFERENCES public.productos(id) ON DELETE CASCADE,
  cantidad INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;

-- ===== CLIENTES =====
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa TEXT NOT NULL,
  contacto TEXT NOT NULL,
  celular TEXT NOT NULL,
  email TEXT,
  direccion TEXT,
  latitud NUMERIC(10,7),
  longitud NUMERIC(10,7),
  vendedor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  lista_precio_id UUID REFERENCES public.listas_precios(id) ON DELETE SET NULL,
  notas TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- ===== PEDIDOS =====
CREATE TABLE public.pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero SERIAL UNIQUE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  vendedor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_por UUID NOT NULL REFERENCES auth.users(id),
  estado pedido_estado NOT NULL DEFAULT 'borrador',
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

-- ===== PEDIDO ITEMS =====
CREATE TABLE public.pedido_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(12,2) NOT NULL,
  subtotal NUMERIC(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
);
ALTER TABLE public.pedido_items ENABLE ROW LEVEL SECURITY;

-- ===== NOTIFICACIONES =====
CREATE TABLE public.notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  tipo TEXT,
  link TEXT,
  leida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

-- ===== WHATSAPP TEMPLATES =====
CREATE TABLE public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- ===== AUDIT LOGS =====
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accion TEXT NOT NULL,
  entidad TEXT NOT NULL,
  entidad_id UUID,
  detalle JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ===== TRIGGERS =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_pedidos_updated BEFORE UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== RLS POLICIES =====

-- profiles: users can view/update their own; admins all
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- user_roles: users can view their roles; only admins manage
CREATE POLICY "roles_self_view" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "roles_admin_manage" ON public.user_roles FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- listas_precios
CREATE POLICY "listas_view_auth" ON public.listas_precios FOR SELECT TO authenticated USING (true);
CREATE POLICY "listas_admin" ON public.listas_precios FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- productos
CREATE POLICY "productos_view_auth" ON public.productos FOR SELECT TO authenticated USING (true);
CREATE POLICY "productos_admin" ON public.productos FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- lista_precio_items
CREATE POLICY "lpi_view_auth" ON public.lista_precio_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "lpi_admin" ON public.lista_precio_items FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- stock
CREATE POLICY "stock_view_auth" ON public.stock FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock_admin" ON public.stock FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- clientes
CREATE POLICY "clientes_admin_all" ON public.clientes FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "clientes_vendedor_select" ON public.clientes FOR SELECT TO authenticated
USING (vendedor_id = auth.uid() AND public.has_role(auth.uid(),'vendedor'));
CREATE POLICY "clientes_vendedor_insert" ON public.clientes FOR INSERT TO authenticated
WITH CHECK (vendedor_id = auth.uid() AND public.has_role(auth.uid(),'vendedor'));
CREATE POLICY "clientes_vendedor_update" ON public.clientes FOR UPDATE TO authenticated
USING (vendedor_id = auth.uid() AND public.has_role(auth.uid(),'vendedor'));
CREATE POLICY "clientes_self_select" ON public.clientes FOR SELECT TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "clientes_logistica_select" ON public.clientes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'logistica'));

-- pedidos
CREATE POLICY "pedidos_admin_all" ON public.pedidos FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "pedidos_vendedor_select" ON public.pedidos FOR SELECT TO authenticated
USING (vendedor_id = auth.uid() AND public.has_role(auth.uid(),'vendedor'));
CREATE POLICY "pedidos_vendedor_insert" ON public.pedidos FOR INSERT TO authenticated
WITH CHECK (creado_por = auth.uid() AND public.has_role(auth.uid(),'vendedor'));
CREATE POLICY "pedidos_vendedor_update" ON public.pedidos FOR UPDATE TO authenticated
USING (vendedor_id = auth.uid() AND public.has_role(auth.uid(),'vendedor'));
CREATE POLICY "pedidos_cliente_select" ON public.pedidos FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = cliente_id AND c.user_id = auth.uid()));
CREATE POLICY "pedidos_cliente_insert" ON public.pedidos FOR INSERT TO authenticated
WITH CHECK (creado_por = auth.uid() AND EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = cliente_id AND c.user_id = auth.uid()));
CREATE POLICY "pedidos_logistica_select" ON public.pedidos FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'logistica') AND estado IN ('listo_despacho','en_ruta','entregado'));
CREATE POLICY "pedidos_logistica_update" ON public.pedidos FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'logistica') AND estado IN ('listo_despacho','en_ruta'));

-- pedido_items: same access as parent pedido
CREATE POLICY "pi_select" ON public.pedido_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id));
CREATE POLICY "pi_insert" ON public.pedido_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND (
  public.is_admin(auth.uid())
  OR (p.vendedor_id = auth.uid() AND public.has_role(auth.uid(),'vendedor'))
  OR EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = p.cliente_id AND c.user_id = auth.uid())
)));
CREATE POLICY "pi_update_admin" ON public.pedido_items FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()));
CREATE POLICY "pi_delete_admin" ON public.pedido_items FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- notificaciones
CREATE POLICY "notif_self_select" ON public.notificaciones FOR SELECT TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "notif_self_update" ON public.notificaciones FOR UPDATE TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "notif_admin_all" ON public.notificaciones FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "notif_insert_auth" ON public.notificaciones FOR INSERT TO authenticated
WITH CHECK (true);

-- whatsapp_templates
CREATE POLICY "wa_view_auth" ON public.whatsapp_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa_admin" ON public.whatsapp_templates FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- audit_logs
CREATE POLICY "audit_admin_select" ON public.audit_logs FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));
CREATE POLICY "audit_insert_auth" ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);