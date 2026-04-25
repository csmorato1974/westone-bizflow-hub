import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";

const BUCKET = "productos";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export function productImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  // cache-bust to reflect updates
  return url.includes("?") ? url : `${url}?v=${Date.now()}`;
}

export async function uploadProductImage(productoId: string, file: File): Promise<string> {
  if (!ALLOWED.includes(file.type)) throw new Error("Formato no permitido (JPG, PNG o WEBP)");
  if (file.size > MAX_BYTES) throw new Error("Imagen mayor a 5MB");

  // remove previous files in folder
  const { data: existing } = await supabase.storage.from(BUCKET).list(productoId);
  if (existing && existing.length > 0) {
    await supabase.storage.from(BUCKET).remove(existing.map((f) => `${productoId}/${f.name}`));
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${productoId}/main.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600",
  });
  if (error) throw error;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = pub.publicUrl;

  const { error: e2 } = await supabase.from("productos").update({ imagen_url: url }).eq("id", productoId);
  if (e2) throw e2;

  await logAudit("actualizar_imagen_producto", "productos", productoId, { imagen_url: url });
  return url;
}

export async function deleteProductImage(productoId: string): Promise<void> {
  const { data: existing } = await supabase.storage.from(BUCKET).list(productoId);
  if (existing && existing.length > 0) {
    await supabase.storage.from(BUCKET).remove(existing.map((f) => `${productoId}/${f.name}`));
  }
  const { error } = await supabase.from("productos").update({ imagen_url: null }).eq("id", productoId);
  if (error) throw error;
  await logAudit("eliminar_imagen_producto", "productos", productoId, {});
}
