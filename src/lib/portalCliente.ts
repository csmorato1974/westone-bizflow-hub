import { supabase } from "@/integrations/supabase/client";

export type DisponibilidadPortal = "disponible" | "poco_stock" | "consultar";

export interface VariantePortal {
  id: string;
  presentacion: string;
  precio: number;
  disponibilidad: DisponibilidadPortal;
}

export interface ProductoPortal {
  id: string;
  sku: string;
  nombre: string;
  linea: string;
  descripcion: string | null;
  ficha_tecnica: Record<string, unknown> | null;
  imagen_url: string | null;
  variantes: VariantePortal[];
}

export interface CatalogoPortal {
  cliente: { empresa: string; contacto: string };
  vendedor: { nombre: string; telefono: string | null; email: string | null };
  lista_precio: { id: string; nombre: string };
  productos: ProductoPortal[];
}

export interface ItemPedidoPortal {
  nombre: string;
  presentacion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface PedidoPortal {
  id: string;
  numero: number;
  estado: string;
  estado_label: string;
  total: number;
  notas: string | null;
  created_at: string;
  items: ItemPedidoPortal[];
}

export interface PedidoPortalCreado {
  id: string;
  numero: number;
  estado: string;
  total: number;
  created_at: string;
}

export interface ItemCarritoPortal {
  variante_id: string;
  producto_id: string;
  nombre: string;
  presentacion: string;
  precio: number;
  cantidad: number;
}

export const DISPONIBILIDAD_LABEL: Record<DisponibilidadPortal, string> = {
  disponible: "Disponible",
  poco_stock: "Poco stock",
  consultar: "Consultar",
};

export function construirPortalUrl(token: string, baseUrl: string): string {
  const base = new URL(baseUrl, window.location.origin);
  return `${base.origin}/portal/${token}`;
}

export function calcularTotalCarrito(items: ItemCarritoPortal[]): number {
  return items.reduce((total, item) => total + item.precio * item.cantidad, 0);
}

export function normalizarTelefonoWhatsapp(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 7 ? digits : null;
}

export async function obtenerPortalCliente(clienteId: string, rotar = false): Promise<string> {
  const { data, error } = await supabase.rpc("generar_portal_cliente", {
    _cliente_id: clienteId,
    _rotar: rotar,
  });
  if (error) throw error;
  const token = (data as { token?: string } | null)?.token;
  if (!token) throw new Error("No se pudo generar el enlace personalizado.");
  return token;
}

export async function cargarCatalogoPortal(token: string): Promise<CatalogoPortal> {
  const { data, error } = await supabase.rpc("portal_catalogo", { _token: token });
  if (error) throw error;
  return data as unknown as CatalogoPortal;
}

export async function cargarPedidosPortal(token: string): Promise<PedidoPortal[]> {
  const { data, error } = await supabase.rpc("portal_pedidos", { _token: token });
  if (error) throw error;
  return (data ?? []) as unknown as PedidoPortal[];
}

export async function crearPedidoPortal(
  token: string,
  items: ItemCarritoPortal[],
  notas: string,
): Promise<PedidoPortalCreado> {
  const payload = items.map(({ variante_id, cantidad }) => ({ variante_id, cantidad }));
  const { data, error } = await supabase.rpc("portal_crear_pedido", {
    _token: token,
    _items: payload,
    _notas: notas.trim() || undefined,
  });
  if (error) throw error;
  return data as unknown as PedidoPortalCreado;
}
