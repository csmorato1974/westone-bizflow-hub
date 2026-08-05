import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  RULES_VERSION,
  matchRow,
  normalizeRow,
  normalizeEmail,
  normalizeText,
  stableHash,
  buildProvisionalPassword,
  detectarDuplicadosInternos,
  type ExistingCliente,
  type NormalizedRow,
  type RawRow,
  type RowEstado,
} from "./rules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Accion = "crear" | "actualizar" | "vincular" | "ignorar" | "revisar" | "error";

interface Decision {
  fila: number;
  estado_preview: RowEstado;
  accion: Accion;
  cliente_id?: string | null;
}

interface ResultRow {
  fila: number;
  nombre: string;
  empresa: string;
  telefono_normalizado: string;
  email: string;
  email_provisional: boolean;
  estado: RowEstado;
  accion_propuesta: Accion;
  accion_tomada?: Accion;
  motivo: string;
  cambios: string[];
  observaciones: string[];
  external_import_key: string;
  cliente_id: string | null;
  user_id: string | null;
  profile_id: string | null;
  coincide_con?: { id: string; empresa: string | null; contacto: string | null; email: string | null } | null;
  password_provisional?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
    const isSuper = (callerRoles ?? []).some((r: { role: string }) => r.role === "super_admin");
    if (!isSuper) return json({ error: "Solo super_admin puede importar clientes" }, 403);

    const body = await req.json().catch(() => ({}));
    const mode: "dry_run" | "commit" | "retry_issue" =
      body.mode === "commit" ? "commit" : body.mode === "retry_issue" ? "retry_issue" : "dry_run";
    const rows: RawRow[] = Array.isArray(body.rows) ? body.rows : [];
    const rulesVersion: string = body.rules_version ?? "";
    const decisions: Decision[] = Array.isArray(body.decisions) ? body.decisions : [];
    const origen: string = body.origen === "archivo" ? "archivo" : "pegado";
    const archivo: string | null = typeof body.archivo === "string" ? body.archivo : null;
    const issueId: string | null = typeof body.issue_id === "string" ? body.issue_id : null;
    const issueAccion: Accion =
      ["crear", "actualizar", "vincular", "ignorar"].includes(body.accion) ? body.accion : "crear";
    const issueClienteId: string | null =
      typeof body.cliente_id === "string" ? body.cliente_id : null;

    if (rulesVersion !== RULES_VERSION) {
      return json(
        {
          error: `Versión de reglas incompatible (cliente ${rulesVersion || "?"} / servidor ${RULES_VERSION}). Recarga la aplicación.`,
        },
        409,
      );
    }
    if (mode === "retry_issue" && !issueId) return json({ error: "Falta issue_id" }, 400);
    if (rows.length === 0) return json({ error: "No hay filas para procesar" }, 400);
    if (rows.length > 1000) return json({ error: "Máximo 1000 filas por lote" }, 400);
    if (mode === "retry_issue" && rows.length !== 1)
      return json({ error: "El reintento procesa exactamente una fila" }, 400);
    // El commit crea cuentas de auth (operación lenta): se limita el tamaño del
    // lote para no agotar el tiempo máximo de ejecución (150s). El frontend
    // envía la importación en trozos secuenciales.
    if (mode === "commit" && rows.length > 50)
      return json({ error: "Máximo 50 filas por lote en la importación. Recarga la aplicación." }, 400);

    /* -------- Catálogos de referencia -------- */
    const [{ data: clientesData }, { data: listasData }, { data: rolesData }, { data: profilesData }, { data: aliasData }] =
      await Promise.all([
        admin
          .from("clientes")
          .select(
            "id,user_id,empresa,contacto,celular,email,direccion,ciudad,vendedor_id,lista_precio_id,telefono_normalizado,external_import_key,codigo_cliente_externo",
          ),
        admin.from("listas_precios").select("id,nombre").eq("activa", true),
        admin.from("user_roles").select("user_id,role"),
        admin.from("profiles").select("id,full_name,email,phone"),
        admin.from("cliente_codigos_alias").select("cliente_id,codigo").eq("activo", true),
      ]);

    const aliasPorCliente = new Map<string, string[]>();
    ((aliasData ?? []) as { cliente_id: string; codigo: string }[]).forEach((a) => {
      const arr = aliasPorCliente.get(a.cliente_id) ?? [];
      arr.push(a.codigo);
      aliasPorCliente.set(a.cliente_id, arr);
    });

    const existentes = ((clientesData ?? []) as ExistingCliente[]).map((c) => ({
      ...c,
      codigos_alias: aliasPorCliente.get(c.id) ?? [],
    }));

    const listas = listasData ?? [];
    const vendedorIds = new Set(
      (rolesData ?? []).filter((r: { role: string }) => r.role === "vendedor").map((r: { user_id: string }) => r.user_id),
    );
    const profiles = (profilesData ?? []) as {
      id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
    }[];
    const profileByEmail = new Map(profiles.map((p) => [normalizeEmail(p.email), p]));
    const vendedores = profiles.filter((p) => vendedorIds.has(p.id));

    const resolveVendedor = (nombre: string): string | null => {
      if (!nombre) return null;
      const n = normalizeText(nombre);
      const v = vendedores.find(
        (x) => normalizeText(x.full_name) === n || normalizeEmail(x.email) === normalizeEmail(nombre),
      );
      return v?.id ?? null;
    };
    const resolveLista = (nombre: string): string | null => {
      if (!nombre) return null;
      const n = normalizeText(nombre);
      const l = listas.find((x: { nombre: string }) => normalizeText(x.nombre) === n);
      return l?.id ?? null;
    };

    /* -------- Normalización + matching (misma ruta para ambos modos) -------- */
    const emailsEnLote = new Set<string>(
      existentes.map((c) => normalizeEmail(c.email)).filter(Boolean),
    );
    profiles.forEach((p) => emailsEnLote.add(normalizeEmail(p.email)));

    const normalizados: NormalizedRow[] = [];
    for (const raw of rows) {
      const n = normalizeRow(raw);
      if (n.email_provisional) {
        let candidate = n.email;
        let i = 1;
        while (emailsEnLote.has(candidate)) {
          i++;
          const [local, dom] = n.email.split("@");
          candidate = `${local}.${i}@${dom}`;
        }
        n.email = candidate;
      }
      emailsEnLote.add(n.email);
      normalizados.push(n);
    }

    // Validación definitiva de duplicados internos del archivo: las
    // repeticiones de teléfono o email dentro del mismo lote se bloquean y van
    // a revisión manual, nunca se crean ni se actualizan.
    const duplicadosInternos = detectarDuplicadosInternos(normalizados);

    const evaluar = (n: NormalizedRow) => {
      const dupInterno = duplicadosInternos.get(n.fila);
      const m = matchRow(n, existentes);
      const observaciones: string[] = [];
      if (n.email_provisional) observaciones.push("Email provisional generado");
      if (n.vendedor_asignado && !resolveVendedor(n.vendedor_asignado))
        observaciones.push(`Vendedor no encontrado: ${n.vendedor_asignado}`);
      if (n.lista_precio && !resolveLista(n.lista_precio))
        observaciones.push(`Lista de precios no encontrada: ${n.lista_precio}`);

      if (dupInterno) {
        observaciones.push(dupInterno);
        return {
          m: { ...m, estado: "coincidencia_probable" as RowEstado, motivo: dupInterno },
          observaciones,
          accion: "revisar" as Accion,
        };
      }

      const accion: Accion =
        m.estado === "nuevo"
          ? "crear"
          : m.estado === "actualizable"
            ? "actualizar"
            : m.estado === "duplicado_exacto"
              ? "ignorar"
              : m.estado === "coincidencia_probable"
                ? "revisar"
                : "error";
      return { m, observaciones, accion };
    };


    /**
     * Aplicación de la acción decidida. Es la ÚNICA ruta de escritura: la usan
     * tanto el commit por lotes como el reintento individual de una incidencia.
     */
    const ejecutarAccion = async (
      n: NormalizedRow,
      accion: Accion,
      clienteTarget: string | null,
      base: ResultRow,
    ) => {
      const vendedor_id = resolveVendedor(n.vendedor_asignado);
      const lista_precio_id = resolveLista(n.lista_precio);

      // Conflicto de código: el archivo trae un código que ya pertenece a otro
      // cliente (por código principal o alias histórico). No se crea ni se
      // actualiza nada: la fila va a revisión manual.
      const codigoArchivo = normalizeCodigoCliente(n.codigo_cliente_externo);
      if (codigoArchivo && accion !== "ignorar" && accion !== "revisar") {
        const dueno = existentes.find(
          (c) =>
            normalizeCodigoCliente(c.codigo_cliente_externo) === codigoArchivo ||
            (c.codigos_alias ?? []).some((a) => normalizeCodigoCliente(a) === codigoArchivo),
        );
        if (dueno && dueno.id !== clienteTarget) {
          base.conflicto_codigo = {
            codigo: codigoArchivo,
            cliente_id: dueno.id,
            empresa: dueno.empresa,
            contacto: dueno.contacto,
          };
          throw new Error(
            `conflicto_codigo_cliente: el código ${codigoArchivo} ya pertenece al cliente ${dueno.empresa ?? dueno.id}`,
          );
        }
      }



      if (accion === "crear") {
        const conciliado = await asegurarCuenta(admin, n, profileByEmail, base.observaciones);
        base.user_id = conciliado.user_id;
        base.profile_id = conciliado.user_id;
        if (conciliado.password) base.password_provisional = conciliado.password;

        // Si al conciliar apareció una ficha ya vinculada, se actualiza en vez de duplicar
        const fichaExistente =
          existentes.find((c) => c.user_id === conciliado.user_id) ??
          (n.external_import_key
            ? existentes.find((c) => c.external_import_key === n.external_import_key)
            : undefined);
        if (fichaExistente) {
          await actualizarFicha(admin, fichaExistente.id, n, vendedor_id, lista_precio_id, conciliado.user_id);
          base.cliente_id = fichaExistente.id;
          base.accion_tomada = "actualizar";
          base.observaciones = [
            ...base.observaciones,
            "La cuenta ya tenía ficha de cliente: se actualizó en lugar de crear una nueva",
          ];
        } else {
          const nueva = await crearFicha(admin, n, vendedor_id, lista_precio_id, conciliado.user_id);
          base.cliente_id = nueva;
          base.accion_tomada = "crear";
          existentes.push({
            id: nueva,
            user_id: conciliado.user_id,
            empresa: n.empresa,
            contacto: n.original.nombre_completo?.trim() || n.nombre,
            celular: n.original.telefono,
            email: n.email,
            direccion: n.direccion,
            ciudad: n.ciudad,
            vendedor_id,
            lista_precio_id,
            telefono_normalizado: n.telefono_normalizado,
            external_import_key: n.external_import_key,
          });
        }
      } else if (accion === "actualizar" && clienteTarget) {
        const ficha = existentes.find((c) => c.id === clienteTarget);
        await actualizarFicha(admin, clienteTarget, n, vendedor_id, lista_precio_id, ficha?.user_id ?? null);
        base.cliente_id = clienteTarget;
        base.user_id = ficha?.user_id ?? null;
        base.profile_id = ficha?.user_id ?? null;
        base.accion_tomada = "actualizar";
      } else if (accion === "vincular" && clienteTarget) {
        const ficha = existentes.find((c) => c.id === clienteTarget);
        let userId = ficha?.user_id ?? null;
        if (!userId) {
          const conciliado = await asegurarCuenta(admin, n, profileByEmail, base.observaciones);
          userId = conciliado.user_id;
          if (conciliado.password) base.password_provisional = conciliado.password;
        }
        await admin
          .from("clientes")
          .update({ user_id: userId, external_import_key: n.external_import_key })
          .eq("id", clienteTarget);
        base.cliente_id = clienteTarget;
        base.user_id = userId;
        base.profile_id = userId;
        base.accion_tomada = "vincular";
      } else {
        base.accion_tomada = "ignorar";
      }
    };

    const results: ResultRow[] = [];

    /* -------------------- REINTENTO DE UNA INCIDENCIA -------------------- */
    if (mode === "retry_issue") {
      const { data: issue } = await admin
        .from("import_batch_issues")
        .select("*")
        .eq("id", issueId!)
        .maybeSingle();
      if (!issue) return json({ error: "La incidencia no existe" }, 404);

      const n = normalizados[0];
      const { m, observaciones } = evaluar(n);
      const base: ResultRow = {
        fila: issue.fila as number,
        nombre: n.nombre,
        empresa: n.empresa,
        telefono_normalizado: n.telefono_normalizado,
        email: n.email,
        email_provisional: n.email_provisional,
        estado: m.estado,
        accion_propuesta: issueAccion,
        accion_tomada: "ignorar",
        motivo: m.motivo,
        cambios: m.cambios,
        observaciones,
        external_import_key: n.external_import_key,
        cliente_id: issueClienteId ?? m.cliente_id,
        user_id: null,
        profile_id: null,
      };

      let ok = true;
      try {
        if (issueAccion === "ignorar") {
          base.accion_tomada = "ignorar";
        } else if (n.errores.length > 0) {
          throw new Error(
            `No se puede aplicar el reintento: ${n.errores.join(" · ")}. Corrige los datos de la fila primero.`,
          );
        } else {
          await ejecutarAccion(n, issueAccion, issueClienteId ?? m.cliente_id, base);
        }

      } catch (e) {
        ok = false;
        base.estado = "error";
        base.accion_tomada = "error";
        base.motivo = e instanceof Error ? e.message : "Error desconocido";
      }

      const claves = new Set<string>([
        ...((issue.claves_conocidas as string[]) ?? []),
        ...(n.external_import_key ? [n.external_import_key] : []),
      ]);
      const evento = {
        fecha: new Date().toISOString(),
        actor: callerId,
        accion: `reintento_${issueAccion}`,
        resultado: ok ? "ok" : "error",
        motivo: base.motivo,
        cambios: base.cambios,
      };

      await admin
        .from("import_batch_issues")
        .update({
          datos_corregidos: rows[0] as unknown as Record<string, unknown>,
          datos_normalizados: n as unknown as Record<string, unknown>,
          estado: base.estado,
          motivo: base.motivo,
          observaciones: base.observaciones,
          tipo_problema: ok ? issue.tipo_problema : clasificarProblema(base.estado, base.motivo),
          external_import_key: n.external_import_key || issue.external_import_key,
          claves_conocidas: [...claves],
          user_id: base.user_id ?? issue.user_id,
          profile_id: base.profile_id ?? issue.profile_id,
          cliente_id: base.cliente_id ?? issue.cliente_id,
          estado_caso: ok ? "resuelto" : "reintentado",
          intentos: ((issue.intentos as number) ?? 0) + 1,
          ultimo_intento: new Date().toISOString(),
          historial: [...((issue.historial as unknown[]) ?? []), evento],
          resuelto_por: ok ? callerId : null,
          resuelto_en: ok ? new Date().toISOString() : null,
        })
        .eq("id", issueId!);

      await admin.from("audit_logs").insert({
        user_id: callerId,
        accion: ok ? "reintento_incidencia_importacion" : "reintento_incidencia_importacion_fallido",
        entidad: "import_batch_issues",
        entidad_id: issueId,
        detalle: {
          accion: issueAccion,
          resultado: ok ? "ok" : "error",
          motivo: base.motivo,
          cliente_id: base.cliente_id,
          user_id: base.user_id,
        },
      });

      return json({ mode, ok, rules_version: RULES_VERSION, result: base });
    }


    if (mode === "dry_run") {
      for (const n of normalizados) {
        const { m, observaciones, accion } = evaluar(n);
        const c = m.cliente_id ? existentes.find((x) => x.id === m.cliente_id) : null;
        results.push({
          fila: n.fila,
          nombre: n.nombre,
          empresa: n.empresa,
          telefono_normalizado: n.telefono_normalizado,
          email: n.email,
          email_provisional: n.email_provisional,
          estado: m.estado,
          accion_propuesta: accion,
          motivo: m.motivo,
          cambios: m.cambios,
          observaciones,
          external_import_key: n.external_import_key,
          cliente_id: m.cliente_id,
          user_id: c?.user_id ?? null,
          profile_id: c?.user_id ?? null,
          coincide_con: c
            ? { id: c.id, empresa: c.empresa, contacto: c.contacto, email: c.email }
            : null,
        });
      }
      return json({ mode, rules_version: RULES_VERSION, results, resumen: resumir(results) });
    }

    /* ----------------------------- COMMIT ----------------------------- */
    const decisionByFila = new Map(decisions.map((d) => [d.fila, d]));

    for (const n of normalizados) {
      const { m, observaciones, accion: accionActual } = evaluar(n);
      const decision = decisionByFila.get(n.fila);
      const base: ResultRow = {
        fila: n.fila,
        nombre: n.nombre,
        empresa: n.empresa,
        telefono_normalizado: n.telefono_normalizado,
        email: n.email,
        email_provisional: n.email_provisional,
        estado: m.estado,
        accion_propuesta: accionActual,
        accion_tomada: "ignorar",
        motivo: m.motivo,
        cambios: m.cambios,
        observaciones,
        external_import_key: n.external_import_key,
        cliente_id: m.cliente_id,
        user_id: null,
        profile_id: null,
      };

      // Validación definitiva: una fila con error de validación (por ejemplo,
      // sin nombre de negocio/tienda) NUNCA se escribe, aunque el cliente haya
      // enviado la decisión "crear". Va directo a incidencias.
      if (m.estado === "error" || n.errores.length > 0) {
        base.estado = "error";
        base.accion_tomada = "ignorar";
        base.accion_propuesta = "revisar";
        base.observaciones = [
          ...observaciones,
          "Bloqueado por validación: requiere corrección manual en Revisión manual.",
        ];
        results.push(base);
        continue;
      }

      // Validación definitiva: una coincidencia probable NUNCA se escribe de
      // forma automática, aunque el cliente haya enviado otra decisión. Queda
      // como incidencia para resolverse a mano desde "Revisión manual".
      if (m.estado === "coincidencia_probable") {
        base.accion_tomada = "ignorar";
        base.accion_propuesta = "revisar";
        base.observaciones = [
          ...observaciones,
          "Bloqueado por coincidencia probable: requiere resolución manual en Revisión manual.",
        ];
        results.push(base);
        continue;
      }


      if (!decision || decision.accion === "ignorar" || decision.accion === "revisar") {
        base.accion_tomada = "ignorar";
        results.push(base);
        continue;
      }


      // Punto 3: el diagnóstico cambió entre el preview y el commit
      if (decision.estado_preview !== m.estado) {
        base.estado = "error";
        base.accion_tomada = "error";
        base.motivo = "conflicto_por_cambio_desde_preview";
        base.observaciones = [
          ...observaciones,
          `El registro cambió desde la validación: en el preview era "${decision.estado_preview}" y ahora es "${m.estado}". No se aplicó ningún cambio; vuelve a validar el archivo.`,
        ];
        results.push(base);
        continue;
      }

      try {
        await ejecutarAccion(n, decision.accion, decision.cliente_id ?? m.cliente_id, base);
      } catch (e) {
        base.estado = "error";
        base.accion_tomada = "error";
        base.motivo = e instanceof Error ? e.message : "Error desconocido";
      }

      results.push(base);
    }

    const resumen = resumir(results);

    const detalle = results.map((r) => ({
      fila: r.fila,
      nombre: r.nombre,
      empresa: r.empresa,
      email: r.email,
      email_provisional: r.email_provisional,
      telefono_normalizado: r.telefono_normalizado,
      estado: r.estado,
      accion_tomada: r.accion_tomada,
      motivo: r.motivo,
      observaciones: r.observaciones,
      external_import_key: r.external_import_key,
      user_id: r.user_id,
      profile_id: r.profile_id,
      cliente_id: r.cliente_id,
    }));

    const { data: batch } = await admin
      .from("import_batches")
      .insert({
        user_id: callerId,
        origen,
        archivo,
        total_filas: results.length,
        creados: resumen.creados,
        actualizados: resumen.actualizados,
        vinculados: resumen.vinculados,
        omitidos: resumen.omitidos,
        revision: resumen.revision,
        errores: resumen.errores,
        detalle,
      })
      .select("id")
      .maybeSingle();

    await admin.from("audit_logs").insert({
      user_id: callerId,
      accion: "importacion_clientes",
      entidad: "clientes",
      entidad_id: batch?.id ?? null,
      detalle: { origen, archivo, ...resumen },
    });

    /* -------- Persistencia de incidencias (bandeja de revisión) -------- */
    const rawByFila = new Map(rows.map((r) => [r.fila, r]));
    const normByFila = new Map(normalizados.map((n) => [n.fila, n]));
    let pendientes = 0;
    for (const r of results) {
      if (!requiereIncidencia(r)) continue;
      pendientes++;
      const n = normByFila.get(r.fila);
      const identidad = identidadKey(r);
      const evento = {
        fecha: new Date().toISOString(),
        actor: callerId,
        accion: "importacion_lote",
        resultado: "error",
        motivo: r.motivo,
        cambios: r.cambios,
      };

      // Punto 8/1: si ya existe un caso abierto para la misma identidad, se
      // actualiza en lugar de crear un duplicado. La búsqueda no depende solo
      // de external_import_key: primero por clave de identidad estable y, si la
      // clave cambió entre importaciones, por cualquiera de las claves ya
      // conocidas del caso o por la ficha/cuenta ya asociada.
      const SEL = "id,intentos,historial,claves_conocidas";
      const ABIERTOS = ["pendiente", "reintentado"];
      let abierto:
        | { id: string; intentos: number; historial: unknown[]; claves_conocidas: string[] }
        | null = null;

      const q1 = await admin
        .from("import_batch_issues")
        .select(SEL)
        .eq("identidad_key", identidad)
        .in("estado_caso", ABIERTOS)
        .maybeSingle();
      abierto = (q1.data as typeof abierto) ?? null;

      if (!abierto && r.external_import_key) {
        const q2 = await admin
          .from("import_batch_issues")
          .select(SEL)
          .contains("claves_conocidas", [r.external_import_key])
          .in("estado_caso", ABIERTOS)
          .limit(1)
          .maybeSingle();
        abierto = (q2.data as typeof abierto) ?? null;
      }
      if (!abierto && r.cliente_id) {
        const q3 = await admin
          .from("import_batch_issues")
          .select(SEL)
          .eq("cliente_id", r.cliente_id)
          .in("estado_caso", ABIERTOS)
          .limit(1)
          .maybeSingle();
        abierto = (q3.data as typeof abierto) ?? null;
      }


      const payload = {
        batch_id: batch?.id ?? null,
        fila: r.fila,
        datos_originales: (rawByFila.get(r.fila) ?? {}) as unknown as Record<string, unknown>,
        datos_normalizados: (n ?? {}) as unknown as Record<string, unknown>,
        estado: r.estado,
        motivo: r.motivo,
        observaciones: r.observaciones,
        tipo_problema: clasificarProblema(r.estado, r.motivo, r.observaciones),
        identidad_key: identidad,
        external_import_key: r.external_import_key || null,
        user_id: r.user_id,
        profile_id: r.profile_id,
        cliente_id: r.cliente_id,
        estado_caso: "pendiente" as const,
        ultimo_intento: new Date().toISOString(),
      };

      if (abierto) {
        await admin
          .from("import_batch_issues")
          .update({
            ...payload,
            claves_conocidas: [
              ...new Set([
                ...((abierto.claves_conocidas as string[]) ?? []),
                ...(r.external_import_key ? [r.external_import_key] : []),
              ]),
            ],
            intentos: ((abierto.intentos as number) ?? 0) + 1,
            historial: [...((abierto.historial as unknown[]) ?? []), evento],
          })
          .eq("id", abierto.id);
      } else {
        await admin.from("import_batch_issues").insert({
          ...payload,
          claves_conocidas: r.external_import_key ? [r.external_import_key] : [],
          intentos: 1,
          historial: [evento],
        });
      }
    }

    return json({
      mode,
      rules_version: RULES_VERSION,
      batch_id: batch?.id ?? null,
      results,
      resumen: { ...resumen, pendientes_revision: pendientes },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Error inesperado" }, 500);
  }
});

function resumir(results: ResultRow[]) {
  const cuenta = (fn: (r: ResultRow) => boolean) => results.filter(fn).length;
  return {
    total: results.length,
    nuevos: cuenta((r) => r.estado === "nuevo"),
    duplicados: cuenta((r) => r.estado === "duplicado_exacto"),
    actualizables: cuenta((r) => r.estado === "actualizable"),
    revision: cuenta((r) => r.estado === "coincidencia_probable"),
    errores: cuenta((r) => r.estado === "error"),
    creados: cuenta((r) => r.accion_tomada === "crear"),
    actualizados: cuenta((r) => r.accion_tomada === "actualizar"),
    vinculados: cuenta((r) => r.accion_tomada === "vincular"),
    omitidos: cuenta((r) => r.accion_tomada === "ignorar"),
  };
}

/**
 * Punto 4: si el email ya existe en Auth pero el vínculo con profile/rol está
 * incompleto, se concilia en lugar de devolver un error genérico.
 * Punto 1 del plan original: nunca se asume el trigger `handle_new_user`.
 */
async function asegurarCuenta(
  admin: ReturnType<typeof createClient>,
  n: NormalizedRow,
  profileByEmail: Map<string, { id: string; full_name: string | null; email: string | null; phone: string | null }>,
  observaciones: string[],
): Promise<{ user_id: string; password?: string }> {
  const password = buildProvisionalPassword(n.email, n.telefono_normalizado);
  let userId: string | null = null;
  let passwordDevuelta: string | undefined = password;

  // El nombre principal del perfil es el negocio (empresa); el contacto queda en la ficha de cliente.
  const nombrePerfil = n.empresa || n.nombre || n.email;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: n.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: nombrePerfil, phone: n.original.telefono },
  });


  if (createErr) {
    const msg = (createErr.message ?? "").toLowerCase();
    const yaExiste =
      msg.includes("already") || msg.includes("registered") || msg.includes("exists");
    if (!yaExiste) throw new Error(`No se pudo crear la cuenta: ${createErr.message}`);

    userId = profileByEmail.get(n.email)?.id ?? (await buscarUsuarioPorEmail(admin, n.email));
    if (!userId) throw new Error(`El email ${n.email} ya existe en el sistema y no se pudo conciliar`);
    passwordDevuelta = undefined;
    observaciones.push(
      "La cuenta ya existía: se conservó su contraseña actual y se completó la configuración faltante",
    );
  } else {
    userId = created.user?.id ?? null;
    if (!userId) throw new Error("No se obtuvo el id de la cuenta creada");
  }

  // Verificación explícita del profile
  const { data: prof } = await admin
    .from("profiles")
    .select("id,full_name,email,phone")
    .eq("id", userId)
    .maybeSingle();

  if (!prof) {
    const { error } = await admin.from("profiles").insert({
      id: userId,
      full_name: nombrePerfil,
      email: n.email,
      phone: n.original.telefono || null,
      email_provisional: n.email_provisional,
      must_change_password: true,
    });
    if (error) throw new Error(`No se pudo crear el perfil: ${error.message}`);
  } else {
    const patch: Record<string, unknown> = {
      email_provisional: n.email_provisional,
      must_change_password: passwordDevuelta ? true : prof.full_name === null ? true : undefined,
    };
    if (!prof.full_name && nombrePerfil) patch.full_name = nombrePerfil;
    if (!prof.email) patch.email = n.email;
    if (!prof.phone && n.original.telefono) patch.phone = n.original.telefono;
    Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
    if (Object.keys(patch).length > 0) {
      await admin.from("profiles").update(patch).eq("id", userId);
    }
  }

  // Verificación explícita del rol cliente
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const tieneCliente = (roles ?? []).some((r: { role: string }) => r.role === "cliente");
  if (!tieneCliente) {
    await admin.from("user_roles").insert({ user_id: userId, role: "cliente" });
  }

  return { user_id: userId, password: passwordDevuelta };
}

async function buscarUsuarioPorEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const found = data.users.find((u) => normalizeEmail(u.email) === email);
    if (found) return found.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function crearFicha(
  admin: ReturnType<typeof createClient>,
  n: NormalizedRow,
  vendedor_id: string | null,
  lista_precio_id: string | null,
  user_id: string,
): Promise<string> {
  const { data, error } = await admin
    .from("clientes")
    .insert({
      empresa: n.empresa || n.nombre,
      contacto: n.original.nombre_completo?.trim() || n.nombre || n.empresa,
      celular: n.original.telefono || n.telefono_normalizado || "—",
      email: n.email,
      direccion: n.direccion || null,
      ciudad: n.ciudad || null,
      notas: n.notas || null,
      user_id,
      vendedor_id,
      lista_precio_id,
      telefono_normalizado: n.telefono_normalizado || null,
      codigo_cliente_externo: n.codigo_cliente_externo || null,
      email_provisional: n.email_provisional,
      external_import_key: n.external_import_key,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error(`No se pudo crear la ficha: ${error?.message}`);
  return data.id as string;
}

async function actualizarFicha(
  admin: ReturnType<typeof createClient>,
  clienteId: string,
  n: NormalizedRow,
  vendedor_id: string | null,
  lista_precio_id: string | null,
  user_id: string | null,
) {
  const patch: Record<string, unknown> = {
    external_import_key: n.external_import_key,
  };
  if (n.empresa) patch.empresa = n.empresa;
  const contactoPersona = n.original.nombre_completo?.trim();
  if (contactoPersona) patch.contacto = contactoPersona;
  if (n.original.telefono) {
    patch.celular = n.original.telefono;
    patch.telefono_normalizado = n.telefono_normalizado;
  }
  if (n.email && !n.email_provisional) patch.email = n.email;
  if (n.direccion) patch.direccion = n.direccion;
  if (n.ciudad) patch.ciudad = n.ciudad;
  if (n.notas) patch.notas = n.notas;
  if (n.codigo_cliente_externo) patch.codigo_cliente_externo = n.codigo_cliente_externo;
  if (vendedor_id) patch.vendedor_id = vendedor_id;
  if (lista_precio_id) patch.lista_precio_id = lista_precio_id;
  if (user_id) patch.user_id = user_id;

  const { error } = await admin.from("clientes").update(patch).eq("id", clienteId);
  if (error) throw new Error(`No se pudo actualizar la ficha: ${error.message}`);
}

/* ==================== Bandeja de incidencias ==================== */

/** Una fila genera incidencia cuando no se aplicó correctamente o requiere decisión humana. */
function requiereIncidencia(r: ResultRow): boolean {
  return r.estado === "error" || r.accion_tomada === "error" || r.estado === "coincidencia_probable";
}

/**
 * Clave de identidad estable del caso. Prioriza external_import_key y, si no
 * existe, usa un hash de los identificadores naturales de la fila.
 */
function identidadKey(r: ResultRow): string {
  if (r.external_import_key) return r.external_import_key;
  return `fb:${stableHash([r.email ?? "", r.telefono_normalizado ?? "", r.empresa ?? "", r.nombre ?? ""].join("|"))}`;
}

/** Clasifica el problema en una taxonomía estable para poder filtrar la bandeja. */
function clasificarProblema(estado: string, motivo: string, observaciones: string[] = []) {
  const m = `${motivo} ${observaciones.join(" ")}`.toLowerCase();
  if (estado === "coincidencia_probable") return "duplicado_probable";
  if (m.includes("conflicto_por_cambio_desde_preview") || m.includes("desde la validación"))
    return "conflicto_desde_preview";
  if (m.includes("no se pudo crear la cuenta") || m.includes("auth") || m.includes("contraseña"))
    return "error_auth";
  if (m.includes("perfil") || m.includes("profile")) return "error_profile";
  if (m.includes("ficha") || m.includes("cliente")) return "error_cliente";
  if (m.includes("no encontrad")) return "referencia_no_encontrada";
  if (m.includes("falta") || m.includes("obligatorio") || m.includes("vacío"))
    return "datos_incompletos";
  if (m.includes("teléfono") || m.includes("telefono") || m.includes("email") || m.includes("formato"))
    return "error_de_formato";
  return "error_desconocido";
}
