import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import {
  claveProvisional,
  normalizarTanda,
  PRESUPUESTO_MS,
  PROVISIONAL_DOMAIN,
  TANDA_MAX,
} from "./clave.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.union([
  // Cuenta individual (admin o super admin)
  z.object({ user_id: z.string().uuid() }),
  // Lote reanudable (solo super admin)
  z.object({
    accion: z.literal("iniciar"),
    tamano: z.number().int().min(1).max(TANDA_MAX).optional(),
    // Fuerza la creación de un lote nuevo aunque exista uno completado. No expuesto en la UI.
    forzar: z.boolean().optional(),
  }),
  z.object({
    accion: z.literal("continuar"),
    batch_id: z.string().uuid(),
    tamano: z.number().int().min(1).max(TANDA_MAX).optional(),
  }),
  z.object({ accion: z.literal("estado"), batch_id: z.string().uuid().optional() }),
]);

type Admin = ReturnType<typeof createClient>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const inicio = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "No autorizado" }, 401);

    // El actor se deriva SIEMPRE del token verificado, nunca del cuerpo de la petición.
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
        if (!batchId) return json({ ok: true, batch_id: null });
        const estado = await progreso(admin, batchId);
        return json({ ok: true, ...estado, completado: estado.pendientes === 0 });
      }

      if (body.accion === "iniciar") {
        // Sin `forzar`, nunca se crea un lote nuevo si ya existe uno:
        // - con pendientes reales -> se reanuda
        // - sin pendientes -> se cierra como completado y se devuelve su contador final
        if (!body.forzar) {
          const ultimo = await ultimoBatchFila(admin);
          if (ultimo) {
            const estado = await progreso(admin, ultimo.id);
            if (estado.pendientes > 0) {
              return json({ ok: true, reanudado: true, ...estado, completado: false });
            }
            if (ultimo.estado !== "completado") {
              await admin
                .from("password_reset_batches")
                .update({
                  procesadas: estado.procesadas,
                  fallidas: estado.fallidas,
                  estado: "completado",
                  finalizado_en: new Date().toISOString(),
                  detalle: { ya_actualizadas: estado.ya_actualizadas },
                })
                .eq("id", ultimo.id);
            }
            return json({ ok: true, ya_completado: true, ...estado, completado: true });
          }
        }


        const { data: batch, error: bErr } = await admin
          .from("password_reset_batches")
          .insert({ actor_id: actor.id, estado: "en_curso" })
          .select("id")
          .single();
        if (bErr || !batch) return json({ error: bErr?.message ?? "No se pudo crear el lote" }, 400);
        const batchId = batch.id as string;

        // Censo de cuentas con email de acceso provisional -> filas pendientes.
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
            .filter((u) => claveProvisional(u.email) !== null)
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
          detalle: { total, dominio: PROVISIONAL_DOMAIN },
        });

        return json({ ok: true, iniciado: true, ...(await progreso(admin, batchId)) });
      }

      // ---------- continuar: una tanda pequeña, con presupuesto de tiempo ----------
      const batchId = body.batch_id;
      const tamano = normalizarTanda(body.tamano);

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
      let yaEstaban = 0;
      let cortadoPorTiempo = false;
      const auditoria: Record<string, unknown>[] = [];

      for (const item of pendientes ?? []) {
        // Corta antes de acercarse al límite de la plataforma; lo pendiente sigue pendiente.
        if (Date.now() - inicio > PRESUPUESTO_MS) {
          cortadoPorTiempo = true;
          break;
        }

        const userId = item.user_id as string;
        const email = (item.email_acceso as string | null) ?? "";
        const pass = claveProvisional(email);
        if (!pass) {
          err++;
          await marcar(admin, item.id as string, "error", "Email de acceso no provisional");
          auditoria.push({ user_id: userId, resultado: "error", motivo: "email_no_provisional" });
          continue;
        }

        // ¿La cuenta ya tiene la clave estándar (tanda anterior)? Entonces no se toca.
        const yaOk = await claveYaAplicada(SUPABASE_URL, ANON, email, pass);
        if (yaOk) {
          yaEstaban++;
          await marcar(admin, item.id as string, "ya_actualizada", null);
          auditoria.push({ user_id: userId, resultado: "ya_actualizada" });
          continue;
        }

        const { error: upErr } = await admin.auth.admin.updateUserById(userId, { password: pass });
        if (upErr) {
          err++;
          await marcar(admin, item.id as string, "error", upErr.message);
          auditoria.push({ user_id: userId, resultado: "error", motivo: upErr.message });
          continue;
        }
        await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);
        ok++;
        await marcar(admin, item.id as string, "procesada", null);
        auditoria.push({ user_id: userId, resultado: "procesada", email_acceso: email });
      }

      // Auditoría individual: una entrada por cuenta tocada en esta tanda.
      if (auditoria.length > 0) {
        await admin.from("audit_logs").insert(
          auditoria.map((a) => ({
            user_id: actor.id,
            accion: "regenerar_clave_provisional_item",
            entidad: "password_reset_batch_items",
            entidad_id: batchId,
            detalle: a,
          })),
        );
      }

      // El resumen se recalcula desde las filas: queda escrito aunque otra invocación falle.
      const estado = await progreso(admin, batchId);
      const completado = estado.pendientes === 0;
      await admin
        .from("password_reset_batches")
        .update({
          procesadas: estado.procesadas,
          fallidas: estado.fallidas,
          estado: completado ? "completado" : "en_curso",
          finalizado_en: completado ? new Date().toISOString() : null,
          detalle: { ya_actualizadas: estado.ya_actualizadas },
        })
        .eq("id", batchId);

      if (completado) {
        await admin.from("audit_logs").insert({
          user_id: actor.id,
          accion: "regenerar_clave_provisional_lote_completado",
          entidad: "password_reset_batches",
          entidad_id: batchId,
          detalle: estado,
        });
      }

      return json({
        ok: true,
        tanda: { procesadas: ok, fallidas: err, ya_actualizadas: yaEstaban },
        cortado_por_tiempo: cortadoPorTiempo,
        ...estado,
        completado,
      });
    }

    // ---------- Modo cuenta individual ----------
    const { data: cuenta } = await admin.auth.admin.getUserById(body.user_id);
    const email = cuenta?.user?.email ?? "";
    if (!email) return json({ error: "La cuenta no existe" }, 404);
    const pass = claveProvisional(email);
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

/**
 * Comprueba sin modificar nada si la cuenta ya acepta la clave estándar.
 * Usa un cliente aislado y cierra la sesión creada, para no arrastrar estado.
 */
async function claveYaAplicada(
  url: string,
  anon: string,
  email: string,
  password: string,
): Promise<boolean> {
  const probe = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await probe.auth.signInWithPassword({ email, password });
  if (error || !data?.session) return false;
  await probe.auth.signOut();
  return true;
}

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
  const [total, procesadas, fallidas, pendientes, yaActualizadas] = await Promise.all([
    cuenta(),
    cuenta("procesada"),
    cuenta("error"),
    cuenta("pendiente"),
    cuenta("ya_actualizada"),
  ]);
  return {
    batch_id: batchId,
    total,
    procesadas,
    fallidas,
    pendientes,
    ya_actualizadas: yaActualizadas,
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
