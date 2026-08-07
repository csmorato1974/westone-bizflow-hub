import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROVISIONAL_DOMAIN = "@clientes-temp.local";

const BodySchema = z.union([
  z.object({ user_id: z.string().uuid() }),
  z.object({ todos: z.literal(true) }),
]);

// Regenera la clave provisional estándar (Wst-{parte-local}-26) para cuentas con
// email provisional y fuerza el cambio de contraseña. Solo admin / super admin.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "No autorizado" }, 401);

    const asUser = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await asUser.auth.getUser();
    const actor = userData?.user;
    if (!actor) return json({ error: "No autorizado" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: esAdmin } = await admin.rpc("is_admin", { _user_id: actor.id });
    if (!esAdmin) return json({ error: "Requiere permisos de administrador" }, 403);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Datos inválidos" }, 400);

    const { data: cuenta } = await admin.auth.admin.getUserById(parsed.data.user_id);
    const email = cuenta?.user?.email ?? "";
    if (!email) return json({ error: "La cuenta no existe" }, 404);
    if (!email.endsWith(PROVISIONAL_DOMAIN)) {
      return json(
        { error: "La cuenta tiene un email real: usá el enlace de recuperación por correo" },
        400,
      );
    }

    const local = email.slice(0, email.length - PROVISIONAL_DOMAIN.length);
    if (!local) return json({ error: "Email provisional inválido" }, 400);
    const password = `Wst-${local}-26`;

    const { error: upErr } = await admin.auth.admin.updateUserById(parsed.data.user_id, {
      password,
    });
    if (upErr) return json({ error: upErr.message }, 400);

    await admin.from("profiles").update({ must_change_password: true }).eq("id", parsed.data.user_id);

    await admin.from("password_recovery_requests")
      .update({ estado: "resuelto_clave", resuelto_por: actor.id, resuelto_en: new Date().toISOString() })
      .eq("user_id", parsed.data.user_id)
      .eq("estado", "pendiente");

    await admin.from("audit_logs").insert({
      user_id: actor.id,
      accion: "regenerar_clave_provisional",
      entidad: "profiles",
      entidad_id: parsed.data.user_id,
      detalle: { email_acceso: email },
    });

    return json({ ok: true, password });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Error inesperado" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
