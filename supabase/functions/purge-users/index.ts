import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: roles } = await admin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "super_admin"]);
    const keep = new Set((roles ?? []).map((r) => r.user_id as string));

    let deleted = 0;
    const errors: string[] = [];
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? "80");

    for (let page = 1; page <= 10; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) return json({ error: error.message }, 500);
      const targets = (data?.users ?? []).filter((u) => !keep.has(u.id));
      if (targets.length === 0) break;
      for (const u of targets.slice(0, limit - deleted)) {
        const { error: e } = await admin.auth.admin.deleteUser(u.id);
        if (e) errors.push(`${u.id}: ${e.message}`);
        else deleted++;
      }
      if (deleted >= limit) break;
    }

    const { data: remaining } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const pendientes = (remaining?.users ?? []).filter((u) => !keep.has(u.id)).length;

    return json({ ok: true, deleted, pendientes, errors: errors.slice(0, 5) });
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
