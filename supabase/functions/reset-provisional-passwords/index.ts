import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Misma regla que supabase/functions/import-clientes/rules.ts
function buildProvisionalPassword(email?: string): string {
  const local = (email ?? "").trim().toLowerCase().split("@")[0].replace(/[^a-z0-9._-]/g, "");
  let base = local;
  if (base.length < 3) base = (base || "cliente") + "-26";
  return `Wst-${base}-26`;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await anon.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (!roles?.some((r: { role: string }) => r.role === "super_admin")) {
      return json({ error: "Solo super admin" }, 403);
    }

    let limit = 50;
    let offset = 0;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (typeof body?.limit === "number") limit = Math.min(Math.max(body.limit, 1), 100);
        if (typeof body?.offset === "number") offset = Math.max(body.offset, 0);
      } catch (_) { /* body opcional */ }
    }

    const { data: perfiles, error: perfErr } = await admin
      .from("profiles")
      .select("id, email")
      .eq("email_provisional", true)
      .eq("must_change_password", true)
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (perfErr) return json({ error: perfErr.message }, 500);

    let actualizados = 0;
    const fallidos: { id: string; error: string }[] = [];

    for (const p of perfiles ?? []) {
      const email = (p as { email?: string }).email;
      if (!email) {
        fallidos.push({ id: p.id, error: "perfil sin email" });
        continue;
      }
      const password = buildProvisionalPassword(email);
      const { error } = await admin.auth.admin.updateUserById(p.id, { password });
      if (error) {
        fallidos.push({ id: p.id, error: error.message });
        continue;
      }
      await admin.from("profiles").update({ must_change_password: true }).eq("id", p.id);
      actualizados++;
    }

    return json({
      procesados: perfiles?.length ?? 0,
      actualizados,
      fallidos,
      offset,
      limit,
      hay_mas: (perfiles?.length ?? 0) === limit,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
