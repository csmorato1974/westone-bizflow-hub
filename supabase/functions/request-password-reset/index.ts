import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROVISIONAL_DOMAIN = "@clientes-temp.local";

const BodySchema = z.object({
  identificador: z.string().min(1).max(255),
  redirectTo: z.string().url().max(500).optional(),
});

// Acepta usuario o email. Si la cuenta no tiene un email real (placeholder de
// importación en lote) no se finge un envío: se registra la solicitud para que
// el admin la resuelva y se devuelve sin_email.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const OK = { enviado: true };

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json(OK);

    const identificador = parsed.data.identificador.trim().toLowerCase();
    const redirectTo = parsed.data.redirectTo;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Resolver el perfil por username o por email de perfil.
    let perfil: { id: string; username: string | null } | null = null;
    if (identificador.includes("@")) {
      const { data } = await admin
        .from("profiles")
        .select("id, username")
        .ilike("email", identificador)
        .maybeSingle();
      perfil = data ?? null;
    } else {
      if (!/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(identificador)) return json(OK);
      const { data } = await admin
        .from("profiles")
        .select("id, username")
        .ilike("username", identificador)
        .maybeSingle();
      perfil = data ?? null;
    }

    let emailAcceso: string | null = null;
    if (perfil) {
      const { data: cuenta } = await admin.auth.admin.getUserById(perfil.id);
      emailAcceso = cuenta?.user?.email ?? null;
    } else if (identificador.includes("@")) {
      // El email puede existir en la cuenta aunque el perfil esté desalineado.
      emailAcceso = identificador;
    }

    const provisional = !emailAcceso || emailAcceso.endsWith(PROVISIONAL_DOMAIN);

    if (perfil && provisional) {
      await admin.from("password_recovery_requests").insert({
        identificador,
        user_id: perfil.id,
        username: perfil.username,
        email_acceso: emailAcceso,
        tiene_email_real: false,
        estado: "pendiente",
      });
      return json({ enviado: false, sin_email: true });
    }

    if (!perfil && !identificador.includes("@")) return json(OK);
    if (provisional) return json(OK);

    await admin.auth.resetPasswordForEmail(emailAcceso!, redirectTo ? { redirectTo } : undefined);

    if (perfil) {
      await admin.from("password_recovery_requests").insert({
        identificador,
        user_id: perfil.id,
        username: perfil.username,
        email_acceso: emailAcceso,
        tiene_email_real: true,
        estado: "enviado",
      });
    }

    return json({ enviado: true, email_destino: mask(emailAcceso!) });
  } catch (_e) {
    return json(OK);
  }
});

function mask(email: string) {
  const [local, dom] = email.split("@");
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(1, local.length - 2))}@${dom}`;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
