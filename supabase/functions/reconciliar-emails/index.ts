import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Compara el email real de cada cuenta de acceso con profiles.email.
// modo = "informe" (dry-run, no escribe) | "aplicar" (corrige y audita).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No autorizado" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Sesión inválida" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", callerId);
    if (!(roles ?? []).some((r) => r.role === "super_admin")) {
      return json({ error: "Solo super admin puede reconciliar emails" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const modo = body.modo === "aplicar" ? "aplicar" : "informe";

    // Perfiles
    const perfiles = new Map<string, { email: string | null; full_name: string | null }>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin
        .from("profiles")
        .select("id, email, full_name")
        .range(from, from + 999);
      if (error) return json({ error: error.message }, 500);
      (data ?? []).forEach((p) => perfiles.set(p.id, { email: p.email, full_name: p.full_name }));
      if (!data || data.length < 1000) break;
    }

    // Cuentas de acceso
    const cuentas: { id: string; email: string; new_email: string | null }[] = [];
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return json({ error: error.message }, 500);
      (data.users ?? []).forEach((u) =>
        cuentas.push({
          id: u.id,
          email: (u.email ?? "").toLowerCase(),
          new_email: ((u as unknown as { new_email?: string | null }).new_email ?? null),
        }),
      );
      if (!data.users || data.users.length < 1000) break;
    }

    const diferencias: {
      user_id: string;
      nombre: string | null;
      email_perfil: string | null;
      email_cuenta: string;
      email_pendiente: string | null;
    }[] = [];
    let sinPerfil = 0;
    let pendientes = 0;

    for (const c of cuentas) {
      const p = perfiles.get(c.id);
      if (!p) {
        sinPerfil++;
        continue;
      }
      if (c.new_email) pendientes++;
      const perfilEmail = (p.email ?? "").toLowerCase();
      if (perfilEmail !== c.email) {
        diferencias.push({
          user_id: c.id,
          nombre: p.full_name,
          email_perfil: p.email,
          email_cuenta: c.email,
          email_pendiente: c.new_email,
        });
      }
    }

    let corregidos = 0;
    if (modo === "aplicar") {
      for (const d of diferencias) {
        const { error } = await admin
          .from("profiles")
          .update({
            email: d.email_cuenta,
            email_provisional: d.email_cuenta.endsWith("@clientes-temp.local"),
          })
          .eq("id", d.user_id);
        if (error) continue;
        corregidos++;
        await admin.from("audit_logs").insert({
          user_id: callerId,
          accion: "reconciliar_email",
          entidad: "profiles",
          entidad_id: d.user_id,
          detalle: { email_anterior: d.email_perfil, email_nuevo: d.email_cuenta },
        });
      }
      // cerrar solicitudes ya confirmadas
      for (const c of cuentas) {
        if (!c.email) continue;
        await admin
          .from("email_change_requests")
          .update({ estado: "confirmada", cerrado_en: new Date().toISOString() })
          .eq("user_id", c.id)
          .eq("estado", "pendiente")
          .ilike("email_nuevo", c.email);
      }
    }

    return json({
      modo,
      total_cuentas: cuentas.length,
      total_perfiles: perfiles.size,
      sin_perfil: sinPerfil,
      con_cambio_pendiente: pendientes,
      desalineados: diferencias.length,
      corregidos,
      detalle: diferencias.slice(0, 300),
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
