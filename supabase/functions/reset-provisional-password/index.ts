import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROVISIONAL_DOMAIN = "@clientes-temp.local";
const TAMANO_LOTE_MAX = 50;
const TAMANO_LOTE_DEFECTO = 30;

const BodySchema = z.union([
  // Cuenta individual (admin o super admin)
  z.object({ user_id: z.string().uuid() }),
  // Lote reanudable (solo super admin)
  z.object({
    accion: z.literal("iniciar"),
    tamano: z.number().int().min(1).max(TAMANO_LOTE_MAX).optional(),
  }),
  z.object({
    accion: z.literal("continuar"),
    batch_id: z.string().uuid(),
    tamano: z.number().int().min(1).max(TAMANO_LOTE_MAX).optional(),
  }),
  z.object({ accion: z.literal("estado"), batch_id: z.string().uuid().optional() }),
]);

type Admin = ReturnType<typeof createClient>;

/** Clave provisional estándar a partir del email de acceso provisional. */
function clave(email: string): string | null {
  if (!email.endsWith(PROVISIONAL_DOMAIN)) return null;
  const local = email.slice(0, email.length - PROVISIONAL_DOMAIN.length);
  return local ? `Wst-${local}-26` : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "No autorizado" }, 401);

    const asUser = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await asUser.auth.getUser();
    const actor = userData?.user;
    if (!actor) return json({ error: "No autorizado" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: esAdmin } = await admin.rpc("is_admin", { _user_id: actor.id });
    if (!esAdmin) return json({ error: "Requiere permisos de administrador" }, 403);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Datos inválidos" }, 400);
    const body = parsed.data;

    // ---------- Modo lote reanudable (solo super admin) ----------
    if ("accion" in body) {
      const { data: esSuper } = await admin.rpc("has_role", {
        _user_id: actor.id,
        _role: "super_admin",
      });
      if (!esSuper) return json({ error: "Requiere super administrador" }, 403);

      if (body.accion === "estado") {
        const batchId = body.batch_id ?? (await ultimoBatch(admin));
        if (!batchId) return json({ ok: true, batch: null });
        return json({ ok: true, ...(await progreso(admin, batchId)) });
      }

      if (body.accion === "iniciar") {
        // Si ya hay un lote en curso, se continúa ese en vez de duplicar trabajo.
        const { data: enCurso } = await admin
          .from("password_reset_batches")
          .select("id")
          .eq("estado", "en_curso")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (enCurso?.id) {
          return json({ ok: true, reanudado: true, ...(await progreso(admin, enCurso.id as string)) });
        }

        const { data: batch, error: bErr } = await admin
          .from("password_reset_batches")
          .insert({ actor_id: actor.id, estado: "en_curso" })
          .select("id")
          .single();
        if (bErr || !batch) return json({ error: bErr?.message ?? "No se pudo crear el lote" }, 400);
        const batchId = batch.id as string;

        // Enumerar todas las cuentas con email provisional y registrarlas como pendientes.
        let page = 1;
        let total = 0;
        for (;;) {
          const { data: lista, error: listErr } = await admin.auth.admin.listUsers({
            page,
            perPage: 200,
          });
          if (listErr) return json({ error: listErr.message }, 400);
          const usuarios = lista?.users ?? [];
          if (usuarios.length === 0) break;
          const filas = usuarios
            .filter((u) => (u.email ?? "").endsWith(PROVISIONAL_DOMAIN) && clave(u.email ?? ""))
            .map((u) => ({ batch_id: batchId, user_id: u.id, email_acceso: u.email }));
          if (filas.length > 0) {
            const { error: insErr } = await admin
              .from("password_reset_batch_items")
              .upsert(filas, { onConflict: "batch_id,user_id", ignoreDuplicates: true });
            if (insErr) return json({ error: insErr.message }, 400);
            total += filas.length;
          }
          if (usuarios.length < 200) break;
          page++;
        }

        await admin.from("password_reset_batches").update({ total }).eq("id", batchId);
        await admin.from("audit_logs").insert({
          user_id: actor.id,
          accion: "regenerar_clave_provisional_lote_iniciado",
          entidad: "password_reset_batches",
          entidad_id: batchId,
          detalle: { total },
        });

        return json({ ok: true, iniciado: true, ...(await progreso(admin, batchId)) });
      }

      // continuar: procesa un bloque pequeño de pendientes
      const batchId = body.batch_id;
      const tamano = body.tamano ?? TAMANO_LOTE_DEFECTO;

      const { data: pendientes, error: pErr } = await admin
        .from("password_reset_batch_items")
        .select("id, user_id, email_acceso")
        .eq("batch_id", batchId)
        .eq("estado", "pendiente")
        .order("created_at", { ascending: true })
        .limit(tamano);
      if (pErr) return json({ error: pErr.message }, 400);

      let ok = 0;
      let err = 0;
      for (const item of pendientes ?? []) {
        const email = (item.email_acceso as string | null) ?? "";
        const pass = clave(email);
        if (!pass) {
          err++;
          await marcar(admin, item.id as string, "error", "Email de acceso no provisional");
          continue;
        }
        const { error: upErr } = await admin.auth.admin.updateUserById(item.user_id as string, {
          password: pass,
        });
        if (upErr) {
          err++;
          await marcar(admin, item.id as string, "error", upErr.message);
          continue;
        }
        await admin
          .from("profiles")
          .update({ must_change_password: true })
          .eq("id", item.user_id as string);
        ok++;
        await marcar(admin, item.id as string, "procesada", null);
      }

      // El resumen se recalcula desde las filas: queda escrito aunque falle otra invocación.
      const estado = await progreso(admin, batchId);
      await admin
        .from("password_reset_batches")
        .update({
          procesadas: estado.procesadas,
          fallidas: estado.fallidas,
          estado: estado.pendientes === 0 ? "completado" : "en_curso",
          finalizado_en: estado.pendientes === 0 ? new Date().toISOString() : null,
        })
        .eq("id", batchId);

      if (estado.pendientes === 0) {
        await admin.from("audit_logs").insert({
          user_id: actor.id,
          accion: "regenerar_clave_provisional_lote_completado",
          entidad: "password_reset_batches",
          entidad_id: batchId,
          detalle: { procesadas: estado.procesadas, fallidas: estado.fallidas, total: estado.total },
        });
      }

      return json({
        ok: true,
        procesadas_en_esta_tanda: ok,
        fallidas_en_esta_tanda: err,
        ...estado,
        completado: estado.pendientes === 0,
      });
    }

    // ---------- Modo cuenta individual ----------
    const { data: cuenta } = await admin.auth.admin.getUserById(body.user_id);
    const email = cuenta?.user?.email ?? "";
    if (!email) return json({ error: "La cuenta no existe" }, 404);
    const pass = clave(email);
    if (!pass) {
      return json(
        { error: "La cuenta tiene un email real: usá el enlace de recuperación por correo" },
        400,
      );
    }

    const { error: upErr } = await admin.auth.admin.updateUserById(body.user_id, { password: pass });
    if (upErr) return json({ error: upErr.message }, 400);

    await admin.from("profiles").update({ must_change_password: true }).eq("id", body.user_id);

    await admin
      .from("password_recovery_requests")
      .update({
        estado: "resuelto_clave",
        resuelto_por: actor.id,
        resuelto_en: new Date().toISOString(),
      })
      .eq("user_id", body.user_id)
      .eq("estado", "pendiente");

    await admin.from("audit_logs").insert({
      user_id: actor.id,
      accion: "regenerar_clave_provisional",
      entidad: "profiles",
      entidad_id: body.user_id,
      detalle: { email_acceso: email },
    });

    return json({ ok: true, password: pass });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Error inesperado" }, 500);
  }
});

async function marcar(admin: Admin, id: string, estado: string, error: string | null) {
  await admin
    .from("password_reset_batch_items")
    .update({ estado, error, procesado_en: new Date().toISOString() })
    .eq("id", id);
}

async function ultimoBatch(admin: Admin): Promise<string | null> {
  const { data } = await admin
    .from("password_reset_batches")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function progreso(admin: Admin, batchId: string) {
  const cuenta = async (estado?: string) => {
    let q = admin
      .from("password_reset_batch_items")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", batchId);
    if (estado) q = q.eq("estado", estado);
    const { count } = await q;
    return count ?? 0;
  };
  const [total, procesadas, fallidas, pendientes] = await Promise.all([
    cuenta(),
    cuenta("procesada"),
    cuenta("error"),
    cuenta("pendiente"),
  ]);
  return { batch_id: batchId, total, procesadas, fallidas, pendientes };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
