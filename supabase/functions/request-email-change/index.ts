import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    const body = await req.json().catch(() => ({}));
    const accion: string = body.accion ?? "solicitar";
    const targetId: string = typeof body.user_id === "string" && body.user_id ? body.user_id : callerId;
    const redirectTo: string = typeof body.redirect_to === "string" ? body.redirect_to : "";

    if (!["solicitar", "reenviar", "cancelar"].includes(accion)) {
      return json({ error: "Acción inválida" }, 400);
    }

    // Permiso: dueño, admin o super_admin
    let esAdmin = false;
    if (targetId !== callerId) {
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", callerId);
      esAdmin = (roles ?? []).some((r) => r.role === "admin" || r.role === "super_admin");
      if (!esAdmin) return json({ error: "No tenés permiso para cambiar el email de esta cuenta" }, 403);
    }

    // ---------- Cancelar ----------
    if (accion === "cancelar") {
      const { data: pend } = await admin
        .from("email_change_requests")
        .select("id, email_anterior, email_nuevo")
        .eq("user_id", targetId)
        .eq("estado", "pendiente")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!pend) return json({ error: "No hay una solicitud pendiente" }, 400);

      await admin
        .from("email_change_requests")
        .update({ estado: "cancelada", cerrado_en: new Date().toISOString() })
        .eq("id", pend.id);

      await admin.from("audit_logs").insert({
        user_id: callerId,
        accion: "cancelar_cambio_email",
        entidad: "profiles",
        entidad_id: targetId,
        detalle: { email_anterior: pend.email_anterior, email_nuevo: pend.email_nuevo },
      });

      return json({ ok: true, estado: "cancelada" });
    }

    // ---------- Solicitar / reenviar ----------
    const { data: target, error: targetErr } = await admin.auth.admin.getUserById(targetId);
    if (targetErr || !target.user) return json({ error: "Cuenta no encontrada" }, 404);
    const emailActual = (target.user.email ?? "").toLowerCase();

    let emailNuevo = String(body.email ?? "").trim().toLowerCase();

    if (accion === "reenviar") {
      const { data: pend } = await admin
        .from("email_change_requests")
        .select("id, email_nuevo, reenvios")
        .eq("user_id", targetId)
        .eq("estado", "pendiente")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!pend) return json({ error: "No hay una solicitud pendiente para reenviar" }, 400);
      emailNuevo = pend.email_nuevo.toLowerCase();
    }

    if (!EMAIL_RE.test(emailNuevo)) return json({ error: "Email inválido" }, 400);
    if (emailNuevo.length > 255) return json({ error: "Email demasiado largo" }, 400);
    if (emailNuevo === emailActual) return json({ error: "El email es el mismo que el actual" }, 400);

    // Disponibilidad
    const { data: enUso } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", emailNuevo)
      .neq("id", targetId)
      .maybeSingle();
    if (enUso) return json({ error: "Ese email ya está en uso por otra cuenta" }, 409);

    // Sesión temporal de la cuenta destino para usar el flujo nativo de cambio de email
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: emailActual,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      return json({ error: `No se pudo preparar el cambio: ${linkErr?.message ?? "sin token"}` }, 500);
    }

    const tmp = createClient(SUPABASE_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: sess, error: sessErr } = await tmp.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.properties.hashed_token,
    });
    if (sessErr || !sess.session) {
      return json({ error: `No se pudo preparar el cambio: ${sessErr?.message ?? "sin sesión"}` }, 500);
    }

    // Flujo nativo: envía el correo de confirmación al email nuevo
    const { error: updErr } = await tmp.auth.updateUser(
      { email: emailNuevo },
      redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    );
    await tmp.auth.signOut();
    if (updErr) return json({ error: updErr.message }, 400);

    // Estado / auditoría
    const now = new Date().toISOString();
    const { data: pend } = await admin
      .from("email_change_requests")
      .select("id, reenvios")
      .eq("user_id", targetId)
      .eq("estado", "pendiente")
      .eq("email_nuevo", emailNuevo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pend) {
      await admin
        .from("email_change_requests")
        .update({ reenvios: (pend.reenvios ?? 0) + 1, ultimo_envio: now })
        .eq("id", pend.id);
    } else {
      // cerrar otras pendientes del mismo usuario
      await admin
        .from("email_change_requests")
        .update({ estado: "cancelada", cerrado_en: now })
        .eq("user_id", targetId)
        .eq("estado", "pendiente");

      await admin.from("email_change_requests").insert({
        user_id: targetId,
        solicitado_por: callerId,
        email_anterior: emailActual,
        email_nuevo: emailNuevo,
        estado: "pendiente",
      });
    }

    await admin.from("audit_logs").insert({
      user_id: callerId,
      accion: accion === "reenviar" ? "reenviar_cambio_email" : "solicitar_cambio_email",
      entidad: "profiles",
      entidad_id: targetId,
      detalle: { email_anterior: emailActual, email_nuevo: emailNuevo, por_admin: targetId !== callerId },
    });

    return json({ ok: true, estado: "pendiente", email_nuevo: emailNuevo });
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
