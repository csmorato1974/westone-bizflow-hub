import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PROTECTED_USER_IDS = new Set<string>([
  "9ea7d930-f7ef-46e6-ae0f-8ab73d04be58", // csolizmo@gmail.com (super_admin)
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No autorizado" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Sesión inválida" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isSuper = (callerRoles ?? []).some((r) => r.role === "super_admin");
    if (!isSuper) return json({ error: "Solo super_admin puede purgar usuarios" }, 403);

    const body = await req.json().catch(() => ({}));
    const userIds: string[] = Array.isArray(body.user_ids) ? body.user_ids : [];
    if (userIds.length === 0) return json({ error: "user_ids requerido" }, 400);

    const results: Array<{
      user_id: string;
      ok: boolean;
      error?: string;
      summary?: Record<string, number>;
    }> = [];

    for (const targetId of userIds) {
      if (typeof targetId !== "string" || targetId.length < 10) {
        results.push({ user_id: String(targetId), ok: false, error: "id inválido" });
        continue;
      }
      if (PROTECTED_USER_IDS.has(targetId) || targetId === callerId) {
        results.push({ user_id: targetId, ok: false, error: "usuario protegido" });
        continue;
      }

      const summary: Record<string, number> = {
        pedido_items: 0,
        pedidos: 0,
        clientes: 0,
        messages: 0,
        conversation_participants: 0,
        conversations_eliminadas: 0,
        notificaciones: 0,
        user_roles: 0,
      };

      try {
        // 1) clientes vinculados al usuario
        const { data: cs } = await admin
          .from("clientes")
          .select("id")
          .eq("user_id", targetId);
        const clienteIds = (cs ?? []).map((c) => c.id as string);

        // 2) pedidos relacionados (cliente_id IN, vendedor_id, creado_por)
        const pedidoIdSet = new Set<string>();
        if (clienteIds.length > 0) {
          const { data: ps1 } = await admin
            .from("pedidos")
            .select("id")
            .in("cliente_id", clienteIds);
          (ps1 ?? []).forEach((p) => pedidoIdSet.add(p.id as string));
        }
        const { data: ps2 } = await admin
          .from("pedidos")
          .select("id")
          .eq("vendedor_id", targetId);
        (ps2 ?? []).forEach((p) => pedidoIdSet.add(p.id as string));
        const { data: ps3 } = await admin
          .from("pedidos")
          .select("id")
          .eq("creado_por", targetId);
        (ps3 ?? []).forEach((p) => pedidoIdSet.add(p.id as string));
        const pedidoIds = Array.from(pedidoIdSet);

        // 3-4) pedido_items y pedidos
        if (pedidoIds.length > 0) {
          const { count: piCount } = await admin
            .from("pedido_items")
            .select("id", { count: "exact", head: true })
            .in("pedido_id", pedidoIds);
          await admin.from("pedido_items").delete().in("pedido_id", pedidoIds);
          summary.pedido_items = piCount ?? 0;

          await admin.from("pedidos").delete().in("id", pedidoIds);
          summary.pedidos = pedidoIds.length;
        }

        // 5) clientes
        if (clienteIds.length > 0) {
          await admin.from("clientes").delete().in("id", clienteIds);
          summary.clientes = clienteIds.length;
        }

        // 6) messages enviados
        const { count: msgCount } = await admin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("sender_id", targetId);
        if ((msgCount ?? 0) > 0) {
          await admin.from("messages").delete().eq("sender_id", targetId);
          summary.messages = msgCount ?? 0;
        }

        // 7-9) conversaciones donde participaba
        const { data: cps } = await admin
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", targetId);
        const conversationIds = Array.from(
          new Set((cps ?? []).map((c) => c.conversation_id as string)),
        );
        if (conversationIds.length > 0) {
          await admin
            .from("conversation_participants")
            .delete()
            .eq("user_id", targetId);
          summary.conversation_participants = conversationIds.length;

          // limpiar conversaciones huérfanas
          for (const convId of conversationIds) {
            const { count: remaining } = await admin
              .from("conversation_participants")
              .select("id", { count: "exact", head: true })
              .eq("conversation_id", convId);
            if ((remaining ?? 0) === 0) {
              await admin.from("messages").delete().eq("conversation_id", convId);
              await admin.from("conversations").delete().eq("id", convId);
              summary.conversations_eliminadas += 1;
            }
          }
        }

        // 10) notificaciones
        const { count: notifCount } = await admin
          .from("notificaciones")
          .select("id", { count: "exact", head: true })
          .eq("user_id", targetId);
        if ((notifCount ?? 0) > 0) {
          await admin.from("notificaciones").delete().eq("user_id", targetId);
          summary.notificaciones = notifCount ?? 0;
        }

        // 11) user_roles
        const { count: roleCount } = await admin
          .from("user_roles")
          .select("id", { count: "exact", head: true })
          .eq("user_id", targetId);
        await admin.from("user_roles").delete().eq("user_id", targetId);
        summary.user_roles = roleCount ?? 0;

        // 12) profiles
        await admin.from("profiles").delete().eq("id", targetId);

        // 13) auth user
        const { error: authErr } = await admin.auth.admin.deleteUser(targetId);
        if (authErr) throw new Error(`auth: ${authErr.message}`);

        // 14) audit
        await admin.from("audit_logs").insert({
          user_id: callerId,
          accion: "purge_usuario",
          entidad: "auth.users",
          entidad_id: targetId,
          detalle: { by: callerId, ...summary },
        });

        results.push({ user_id: targetId, ok: true, summary });
      } catch (e) {
        results.push({
          user_id: targetId,
          ok: false,
          error: (e as Error).message,
          summary,
        });
      }
    }

    return json({ ok: true, results });
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
