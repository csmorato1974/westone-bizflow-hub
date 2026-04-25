import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "No autorizado" }, 401);
    }

    // Validate caller via anon client + JWT
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Sesión inválida" }, 401);
    }
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verify caller is super_admin
    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isSuper = (callerRoles ?? []).some((r) => r.role === "super_admin");
    if (!isSuper) {
      return json({ error: "Solo super_admin puede eliminar usuarios" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const targetId: string | undefined = body.user_id;
    if (!targetId || typeof targetId !== "string") {
      return json({ error: "user_id requerido" }, 400);
    }

    if (targetId === callerId) {
      return json({ error: "No puedes eliminar tu propia cuenta" }, 400);
    }

    // Block deleting other super_admins
    const { data: targetRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetId);
    if ((targetRoles ?? []).some((r) => r.role === "super_admin")) {
      return json({ error: "No puedes eliminar a otro super_admin" }, 403);
    }

    const summary: Record<string, number> = {
      pedidos_desligados_vendedor: 0,
      clientes_preservados: 0,
      clientes_eliminados: 0,
      mensajes_eliminados: 0,
      conversaciones_desvinculadas: 0,
    };

    // 1) Pedidos donde figura como vendedor → desligar (preservar histórico)
    const { count: pedidosVendedor } = await admin
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("vendedor_id", targetId);
    if ((pedidosVendedor ?? 0) > 0) {
      const { error: updErr } = await admin
        .from("pedidos")
        .update({ vendedor_id: null })
        .eq("vendedor_id", targetId);
      if (updErr) return json({ error: `No se pudo desligar pedidos: ${updErr.message}` }, 500);
      summary.pedidos_desligados_vendedor = pedidosVendedor ?? 0;
    }

    // 2) Clientes vinculados al usuario → conservar si tienen pedidos, eliminar si no
    const { data: clientesDelUser } = await admin
      .from("clientes")
      .select("id")
      .eq("user_id", targetId);
    const clienteIds = (clientesDelUser ?? []).map((c) => c.id as string);

    for (const cid of clienteIds) {
      const { count: pedidosCliente } = await admin
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", cid);
      if ((pedidosCliente ?? 0) > 0) {
        // Preservar ficha pero desligarla y desactivarla
        const { error: upErr } = await admin
          .from("clientes")
          .update({ user_id: null, activo: false })
          .eq("id", cid);
        if (upErr) return json({ error: `No se pudo desligar cliente: ${upErr.message}` }, 500);
        summary.clientes_preservados += 1;
      } else {
        const { error: delErr } = await admin.from("clientes").delete().eq("id", cid);
        if (delErr) return json({ error: `No se pudo eliminar ficha: ${delErr.message}` }, 500);
        summary.clientes_eliminados += 1;
      }
    }

    // 3) Mensajes y participación en conversaciones
    const { count: msgCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_id", targetId);
    if ((msgCount ?? 0) > 0) {
      await admin.from("messages").delete().eq("sender_id", targetId);
      summary.mensajes_eliminados = msgCount ?? 0;
    }
    const { count: cpCount } = await admin
      .from("conversation_participants")
      .select("id", { count: "exact", head: true })
      .eq("user_id", targetId);
    if ((cpCount ?? 0) > 0) {
      await admin.from("conversation_participants").delete().eq("user_id", targetId);
      summary.conversaciones_desvinculadas = cpCount ?? 0;
    }

    // 4) Cleanup directo
    await admin.from("user_roles").delete().eq("user_id", targetId);
    await admin.from("notificaciones").delete().eq("user_id", targetId);
    await admin.from("profiles").delete().eq("id", targetId);

    // 5) Eliminar el usuario de auth
    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) {
      return json({ error: delErr.message }, 500);
    }

    // Audit log
    await admin.from("audit_logs").insert({
      user_id: callerId,
      accion: "eliminar_usuario",
      entidad: "auth.users",
      entidad_id: targetId,
      detalle: { by: callerId, ...summary },
    });

    return json({ ok: true, summary });
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
