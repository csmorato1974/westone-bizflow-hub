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

    if (!["solicitar", "reenviar", "cancelar"].includes(accion)) {
      return json({ error: "Acción inválida" }, 400);
    }

    // Permiso: dueño, admin o super_admin
    const esPropio = targetId === callerId;
    if (!esPropio) {
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", callerId);
      const esAdmin = (roles ?? []).some((r) => r.role === "admin" || r.role === "super_admin");
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
        .select("id, email_nuevo")
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
    // La cuenta ya tiene ese email (p. ej. el cambio se aplicó antes): sincronizamos y cerramos.
    if (emailNuevo === emailActual) {
      const now = new Date().toISOString();
      await admin
        .from("profiles")
        .update({ email: emailNuevo, email_provisional: emailNuevo.endsWith("@clientes-temp.local") })
        .eq("id", targetId);
      await admin
        .from("email_change_requests")
        .update({ estado: "confirmada", cerrado_en: now })
        .eq("user_id", targetId)
        .eq("estado", "pendiente");
      return json({ ok: true, estado: "aplicada", email_nuevo: emailNuevo, ya_estaba: true });
    }

    // Disponibilidad: la cuenta de acceso es la fuente de verdad.
    // Un perfil desincronizado no debe bloquear el cambio: se corrige y se sigue.
    const { data: enUso } = await admin
      .from("profiles")
      .select("id, full_name")
      .ilike("email", emailNuevo)
      .neq("id", targetId)
      .limit(20);

    for (const otroPerfil of enUso ?? []) {
      const { data: otro } = await admin.auth.admin.getUserById(otroPerfil.id);
      const otroEmail = (otro?.user?.email ?? "").toLowerCase();

      if (otroEmail === emailNuevo) {
        return json(
          {
            error: `Ese email ya es el email de acceso de "${otroPerfil.full_name ?? "otra cuenta"}". Cambiá primero el email de esa cuenta o usá otro.`,
          },
          409,
        );
      }

      // Perfil desincronizado (la cuenta real tiene otro email o ya no existe).
      await admin
        .from("profiles")
        .update({
          email: otroEmail || null,
          email_provisional: otroEmail.endsWith("@clientes-temp.local"),
        })
        .eq("id", otroPerfil.id);

      await admin.from("audit_logs").insert({
        user_id: callerId,
        accion: "reconciliar_email",
        entidad: "profiles",
        entidad_id: otroPerfil.id,
        detalle: {
          email_anterior: emailNuevo,
          email_nuevo: otroEmail || null,
          motivo: "perfil_desincronizado_bloqueaba_cambio",
        },
      });
    }



    // Cambio propio: el navegador dispara el flujo nativo con su propia sesión.
    // (La sesión temporal desde el servidor invalidaba el token del enlace y la
    // confirmación fallaba en silencio: "Email link is invalid or has expired".)
    if (esPropio) {
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
        detalle: { email_anterior: emailActual, email_nuevo: emailNuevo, por_admin: false },
      });

      return json({ ok: true, estado: "pendiente", modo: "nativo", email_nuevo: emailNuevo });
    }

    // Cambio hecho por admin / super admin: se aplica de inmediato sobre la cuenta.
    const { error: updErr } = await admin.auth.admin.updateUserById(targetId, {
      email: emailNuevo,
      email_confirm: true,
    });
    if (updErr) {
      const m = updErr.message ?? "No se pudo aplicar el cambio de email";
      const enUsoReal = /already/i.test(m);
      return json(
        {
          error: enUsoReal
            ? "Ese email ya está registrado en otra cuenta de acceso. Usá otro email."
            : m,
        },
        enUsoReal ? 409 : 400,
      );
    }


    const now = new Date().toISOString();
    await admin
      .from("profiles")
      .update({ email: emailNuevo, email_provisional: emailNuevo.endsWith("@clientes-temp.local") })
      .eq("id", targetId);

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
      estado: "confirmada",
      cerrado_en: now,
    });

    await admin.from("audit_logs").insert({
      user_id: callerId,
      accion: "confirmar_cambio_email",
      entidad: "profiles",
      entidad_id: targetId,
      detalle: { email_anterior: emailActual, email_nuevo: emailNuevo, por_admin: true },
    });

    return json({ ok: true, estado: "aplicada", email_nuevo: emailNuevo });
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
