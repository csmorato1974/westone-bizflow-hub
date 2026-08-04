import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Resuelve "usuario o email" y valida la contraseña contra el sistema de autenticación.
// Nunca revela si una cuenta existe: cualquier fallo devuelve el mismo mensaje genérico.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const GENERICO = { error: "Usuario o contraseña incorrectos" };

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const body = await req.json().catch(() => ({}));
    const identificador = String(body.identificador ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!identificador || identificador.length > 255 || !password || password.length > 200) {
      return json(GENERICO, 400);
    }

    let email = identificador;

    if (!identificador.includes("@")) {
      if (!/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(identificador)) return json(GENERICO, 400);

      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data: perfil } = await admin
        .from("profiles")
        .select("id")
        .ilike("username", identificador)
        .maybeSingle();
      if (!perfil) return json(GENERICO, 400);

      const { data: cuenta } = await admin.auth.admin.getUserById(perfil.id);
      if (!cuenta?.user?.email) return json(GENERICO, 400);
      email = cuenta.user.email;
    }

    const anonClient = createClient(SUPABASE_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) return json(GENERICO, 400);

    return json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch (_e) {
    return json(GENERICO, 400);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
