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

    // Check for orphan-prone data: pedidos via clientes linked to this user
    const { data: clientesDelUser } = await admin
      .from("clientes")
      .select("id")
      .eq("user_id", targetId);
    const clienteIds = (clientesDelUser ?? []).map((c) => c.id);

    if (clienteIds.length > 0) {
      const { count } = await admin
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .in("cliente_id", clienteIds);
      if ((count ?? 0) > 0) {
        return json(
          {
            error:
              "El usuario tiene clientes con pedidos asociados. Desactívalo en lugar de eliminarlo.",
          },
          409,
        );
      }
    }

    // Also block if user is vendedor on existing pedidos
    const { count: vendedorPedidos } = await admin
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("vendedor_id", targetId);
    if ((vendedorPedidos ?? 0) > 0) {
      return json(
        {
          error:
            "El usuario tiene pedidos como vendedor. Reasigna o desactívalo en lugar de eliminarlo.",
        },
        409,
      );
    }

    // Cleanup related rows
    await admin.from("user_roles").delete().eq("user_id", targetId);
    await admin.from("clientes").delete().eq("user_id", targetId);
    await admin.from("notificaciones").delete().eq("user_id", targetId);
    await admin.from("profiles").delete().eq("id", targetId);

    // Delete auth user
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
      detalle: { by: callerId },
    });

    return json({ ok: true });
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
