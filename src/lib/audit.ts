import { supabase } from "@/integrations/supabase/client";

export async function logAudit(
  accion: string,
  entidad: string,
  entidadId?: string,
  detalle?: Record<string, unknown>,
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("audit_logs").insert({
    user_id: user.id,
    accion,
    entidad,
    entidad_id: entidadId ?? null,
    detalle: (detalle ?? null) as never,
  });
}
