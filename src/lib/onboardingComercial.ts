import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { construirPortalUrl, obtenerPortalCliente } from "@/lib/portalCliente";

export interface PrecioOnboardingSnapshot {
  producto_id: string;
  variante_id: string;
  sku: string;
  nombre: string;
  linea: string;
  presentacion: string;
  precio: number;
  stock: number;
  imagen_url: string | null;
}

export interface ClienteOnboardingComercial {
  id: string;
  empresa: string;
  contacto: string;
  celular: string;
  lista_precio_id: string | null;
  vendedor_id: string | null;
}

export interface OnboardingComercialGenerado {
  id: string;
  clienteId: string;
  empresa: string;
  contacto: string;
  celular: string;
  vendedorNombre: string;
  listaNombre: string;
  portalUrl: string;
  mensaje: string;
  items: PrecioOnboardingSnapshot[];
  generadoEn: string;
  canal: "whatsapp" | "email" | "copiado";
}

interface FilaPrecio {
  precio: number;
  variante_id: string;
  producto_variantes: {
    id: string;
    presentacion: string;
    activa: boolean;
    productos: {
      id: string;
      sku: string;
      nombre: string;
      linea: string;
      imagen_url: string | null;
      activo: boolean;
    };
  };
}

const fechaLegible = (iso: string) =>
  new Intl.DateTimeFormat("es-BO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));

export function mensajeOnboardingComercial(input: {
  contacto: string;
  empresa: string;
  vendedorNombre: string;
  listaNombre: string;
  portalUrl: string;
  items: PrecioOnboardingSnapshot[];
  generadoEn: string;
}): string {
  const destacados = input.items
    .slice(0, 5)
    .map((item) => `• ${item.nombre} ${item.presentacion} — Bs ${item.precio.toFixed(2)}`)
    .join("\n");
  const adicionales = Math.max(0, input.items.length - 5);

  return `Hola ${input.contacto || input.empresa} 👋

Soy ${input.vendedorNombre}, de Westone Performance.

Te comparto el portal de pedidos de ${input.empresa}, con nuestro catálogo y la lista ${input.listaNombre}:

${destacados}${adicionales ? `\n• Y ${adicionales} presentación(es) más en el portal` : ""}

🛒 Abre tu portal de pedidos personalizado:
${input.portalUrl}

Aquí puedes consultar productos, precios y disponibilidad, añadirlos al carrito y solicitar tu pedido. Guarda este enlace para tus próximos pedidos.

Los precios y la disponibilidad corresponden al ${fechaLegible(input.generadoEn)} y quedan registrados en tu historial comercial.

Quedo atento para ayudarte con tu próximo pedido.`;
}

export async function generarOnboardingComercial(input: {
  cliente: ClienteOnboardingComercial;
  vendedorNombre: string;
  creadoPor: string;
  canal?: "whatsapp" | "email" | "copiado";
}): Promise<OnboardingComercialGenerado> {
  const { cliente } = input;
  if (!cliente.lista_precio_id) throw new Error("Asigná una lista de precios antes de generar el onboarding.");
  if (!cliente.vendedor_id) throw new Error("El cliente debe tener un vendedor asignado.");

  const [{ data: lista, error: listaError }, { data: filasData, error: preciosError }] = await Promise.all([
    supabase.from("listas_precios").select("id,nombre").eq("id", cliente.lista_precio_id).single(),
    supabase
      .from("lista_precio_variante_items")
      .select("precio,variante_id,producto_variantes!inner(id,presentacion,activa,productos!inner(id,sku,nombre,linea,imagen_url,activo))")
      .eq("lista_id", cliente.lista_precio_id),
  ]);

  if (listaError) throw new Error(`No se pudo cargar la lista de precios: ${listaError.message}`);
  if (preciosError) throw new Error(`No se pudieron cargar los precios: ${preciosError.message}`);

  const filas = (filasData ?? []) as unknown as FilaPrecio[];
  const visibles = filas.filter((fila) => fila.producto_variantes.activa && fila.producto_variantes.productos.activo);
  if (visibles.length === 0) throw new Error("La lista asignada no tiene productos activos con precio.");

  const varianteIds = visibles.map((fila) => fila.variante_id);
  const { data: stockRows, error: stockError } = await supabase
    .from("variante_stock")
    .select("variante_id,cantidad")
    .in("variante_id", varianteIds);
  if (stockError) throw new Error(`No se pudo consultar el stock: ${stockError.message}`);

  const stockPorVariante = new Map((stockRows ?? []).map((row) => [row.variante_id, row.cantidad]));
  const items: PrecioOnboardingSnapshot[] = visibles
    .map((fila) => {
      const variante = fila.producto_variantes;
      const producto = variante.productos;
      return {
        producto_id: producto.id,
        variante_id: variante.id,
        sku: producto.sku,
        nombre: producto.nombre,
        linea: producto.linea,
        presentacion: variante.presentacion,
        precio: Number(fila.precio),
        stock: stockPorVariante.get(variante.id) ?? 0,
        imagen_url: producto.imagen_url,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || a.presentacion.localeCompare(b.presentacion, "es"));

  const generadoEn = new Date().toISOString();
  const portalToken = await obtenerPortalCliente(cliente.id);
  const portalUrl = construirPortalUrl(portalToken);
  const vendedorNombre = input.vendedorNombre.trim() || "tu asesor comercial";
  const mensaje = mensajeOnboardingComercial({
    contacto: cliente.contacto,
    empresa: cliente.empresa,
    vendedorNombre,
    listaNombre: lista.nombre,
    portalUrl,
    items,
    generadoEn,
  });
  const canal = input.canal ?? "whatsapp";

  const { data: snapshot, error: snapshotError } = await supabase
    .from("onboarding_snapshots")
    .insert({
      cliente_id: cliente.id,
      cliente_empresa: cliente.empresa,
      cliente_contacto: cliente.contacto,
      cliente_celular: cliente.celular,
      vendedor_id: cliente.vendedor_id,
      creado_por: input.creadoPor,
      lista_precio_id: cliente.lista_precio_id,
      lista_precio_nombre: lista.nombre,
      canal,
      mensaje,
      portal_url: portalUrl,
      precios_snapshot: items as unknown as Json,
      items_total: items.length,
      generado_en: generadoEn,
    })
    .select("id")
    .single();

  if (snapshotError) throw new Error(`No se pudo guardar el historial del onboarding: ${snapshotError.message}`);

  return {
    id: snapshot.id,
    clienteId: cliente.id,
    empresa: cliente.empresa,
    contacto: cliente.contacto,
    celular: cliente.celular,
    vendedorNombre,
    listaNombre: lista.nombre,
    portalUrl,
    mensaje,
    items,
    generadoEn,
    canal,
  };
}
