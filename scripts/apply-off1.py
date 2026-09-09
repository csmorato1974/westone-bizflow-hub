from pathlib import Path


def replace(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Pattern not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))

# Vendedor Clientes ---------------------------------------------------------
p = Path("src/pages/vendedor/Clientes.tsx")
text = p.read_text()
if "getClientesCache" not in text:
    replace(
        str(p),
        'import { useVoiceDictation } from "@/hooks/useVoiceDictation";\n',
        'import { useVoiceDictation } from "@/hooks/useVoiceDictation";\nimport { getClientesCache, getOfflineMetadata, putClientesCache } from "@/lib/offlineDb";\nimport { useConnectivity } from "@/hooks/useConnectivity";\n',
    )
    replace(
        str(p),
        '  const dictado = useVoiceDictation();\n\n  const load = async () => {\n    if (!user) return;\n    setLoading(true);\n    const [{ data: cs }, { data: lp }] = await Promise.all([\n      supabase.from("clientes").select("*").eq("vendedor_id", user.id).order("created_at", { ascending: false }),\n      supabase.from("listas_precios").select("id,nombre").eq("activa", true),\n    ]);\n    setClientes(cs ?? []);\n    setListas(lp ?? []);\n    setLoading(false);\n  };\n',
        '  const dictado = useVoiceDictation();\n  const online = useConnectivity();\n  const [usingOfflineCache, setUsingOfflineCache] = useState(false);\n  const [offlineSyncedAt, setOfflineSyncedAt] = useState<string | null>(null);\n\n  const load = async () => {\n    if (!user) return;\n    setLoading(true);\n\n    const loadCache = async () => {\n      const [cached, meta] = await Promise.all([\n        getClientesCache<Cliente>(user.id),\n        getOfflineMetadata(user.id, "clientes"),\n      ]);\n      setClientes(cached);\n      setUsingOfflineCache(true);\n      setOfflineSyncedAt(meta?.synced_at ?? null);\n      setLoading(false);\n    };\n\n    if (!online) {\n      await loadCache();\n      return;\n    }\n\n    const [csResult, lpResult] = await Promise.all([\n      supabase.from("clientes").select("*").eq("vendedor_id", user.id).order("created_at", { ascending: false }),\n      supabase.from("listas_precios").select("id,nombre").eq("activa", true),\n    ]);\n\n    if (csResult.error) {\n      await loadCache();\n      return;\n    }\n\n    const fresh = (csResult.data ?? []) as Cliente[];\n    setClientes(fresh);\n    setListas(lpResult.data ?? []);\n    setUsingOfflineCache(false);\n    setOfflineSyncedAt(new Date().toISOString());\n    await putClientesCache(user.id, fresh);\n    window.dispatchEvent(new CustomEvent("westone:offline-stats"));\n    setLoading(false);\n  };\n',
    )
    replace(
        str(p),
        '    const onFocus = () => load();\n    window.addEventListener("focus", onFocus);\n\n    const channel = supabase\n      .channel("vendedor-clientes")\n',
        '    const onFocus = () => load();\n    const onSyncRequest = () => load();\n    window.addEventListener("focus", onFocus);\n    window.addEventListener("westone:sync-request", onSyncRequest);\n\n    const channel = supabase\n      .channel("vendedor-clientes")\n',
    )
    replace(
        str(p),
        '      window.removeEventListener("focus", onFocus);\n      supabase.removeChannel(channel);\n',
        '      window.removeEventListener("focus", onFocus);\n      window.removeEventListener("westone:sync-request", onSyncRequest);\n      supabase.removeChannel(channel);\n',
    )
    replace(
        str(p),
        '  const openEdit = (c: Cliente & { notas?: string | null }) => {\n',
        '  const openEdit = (c: Cliente & { notas?: string | null }) => {\n    if (!online) return toast.info("La edición offline se habilitará en una fase posterior.");\n',
    )
    replace(
        str(p),
        '  const onSave = async (e: React.FormEvent) => {\n    e.preventDefault();\n',
        '  const onSave = async (e: React.FormEvent) => {\n    e.preventDefault();\n    if (!online) return toast.info("Las altas y ediciones offline se habilitarán en una fase posterior.");\n',
    )
    replace(
        str(p),
        '    <div className="space-y-6">\n',
        '    <div className="space-y-6">\n      {usingOfflineCache && <Card className="border-warning/50 bg-warning/5"><CardContent className="p-3 text-sm"><strong>Modo sin conexión.</strong> Mostrando clientes de la última sincronización{offlineSyncedAt ? ` (${new Date(offlineSyncedAt).toLocaleString("es-BO")})` : ""}. Las altas y ediciones requieren conexión.</CardContent></Card>}\n      {usingOfflineCache && clientes.length === 0 && <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Sin datos disponibles offline todavía. Conéctate una vez para sincronizar.</CardContent></Card>}\n',
    )
    replace(
        str(p),
        '<Button onClick={() => { reset(); }} className="bg-primary text-brand hover:bg-primary/90">',
        '<Button onClick={() => { reset(); }} disabled={!online} className="bg-primary text-brand hover:bg-primary/90">',
    )

# Admin Clientes ------------------------------------------------------------
p = Path("src/pages/admin/Clientes.tsx")
text = p.read_text()
if "getClientesCache" not in text:
    replace(
        str(p),
        'import { norm } from "@/lib/reportes";\n',
        'import { norm } from "@/lib/reportes";\nimport { getClientesCache, getOfflineMetadata, putClientesCache } from "@/lib/offlineDb";\nimport { useConnectivity } from "@/hooks/useConnectivity";\n',
    )
    replace(
        str(p),
        '  const fichaAbiertaRef = useRef<string | null>(null);\n',
        '  const fichaAbiertaRef = useRef<string | null>(null);\n  const online = useConnectivity();\n  const [usingOfflineCache, setUsingOfflineCache] = useState(false);\n  const [offlineSyncedAt, setOfflineSyncedAt] = useState<string | null>(null);\n',
    )
    old_load = '''  const load = async () => {\n    setLoading(true);\n    const [{ data: cs }, { data: ur }, { data: lp }, { data: profs }] = await Promise.all([\n      supabase.from("clientes").select("*").order("created_at", { ascending: false }),\n      supabase.from("user_roles").select("user_id,role"),\n      supabase.from("listas_precios").select("id,nombre").eq("activa", true),\n      supabase.from("profiles").select("id,full_name,email,phone,must_change_password,email_provisional,username,username_provisional"),\n    ]);\n    const rolesByUser = new Map<string, AppRole[]>();\n    (ur ?? []).forEach((r: { user_id: string; role: string }) => {\n      const arr = rolesByUser.get(r.user_id) ?? [];\n      arr.push(r.role as AppRole);\n      rolesByUser.set(r.user_id, arr);\n    });\n    const vIds = new Set((ur ?? []).filter((r: { role: string }) => r.role === "vendedor").map((r: { user_id: string }) => r.user_id));\n    const cIds = new Set((ur ?? []).filter((r: { role: string }) => r.role === "cliente").map((r: { user_id: string }) => r.user_id));\n    const profsWithRoles: User[] = (profs ?? []).map((p) => ({ ...p, roles: rolesByUser.get(p.id) ?? [] }));\n    setVendedores(profsWithRoles.filter((p) => vIds.has(p.id)));\n    setClienteUsers(profsWithRoles.filter((p) => cIds.has(p.id)));\n    setAllProfiles(profsWithRoles);\n    setListas(lp ?? []);\n    setClientes((cs ?? []) as Cliente[]);\n    setLoading(false);\n  };\n'''
    new_load = '''  const load = async () => {\n    if (!user) return;\n    setLoading(true);\n\n    const loadCache = async () => {\n      const [cached, meta] = await Promise.all([\n        getClientesCache<Cliente>(user.id),\n        getOfflineMetadata(user.id, "clientes"),\n      ]);\n      setClientes(cached);\n      setVendedores([]);\n      setClienteUsers([]);\n      setAllProfiles([]);\n      setListas([]);\n      setUsingOfflineCache(true);\n      setOfflineSyncedAt(meta?.synced_at ?? null);\n      setLoading(false);\n    };\n\n    if (!online) {\n      await loadCache();\n      return;\n    }\n\n    const [csResult, urResult, lpResult, profsResult] = await Promise.all([\n      supabase.from("clientes").select("*").order("created_at", { ascending: false }),\n      supabase.from("user_roles").select("user_id,role"),\n      supabase.from("listas_precios").select("id,nombre").eq("activa", true),\n      supabase.from("profiles").select("id,full_name,email,phone,must_change_password,email_provisional,username,username_provisional"),\n    ]);\n    if (csResult.error) {\n      await loadCache();\n      return;\n    }\n    const cs = (csResult.data ?? []) as Cliente[];\n    const ur = urResult.data ?? [];\n    const lp = lpResult.data ?? [];\n    const profs = profsResult.data ?? [];\n    const rolesByUser = new Map<string, AppRole[]>();\n    ur.forEach((r: { user_id: string; role: string }) => {\n      const arr = rolesByUser.get(r.user_id) ?? [];\n      arr.push(r.role as AppRole);\n      rolesByUser.set(r.user_id, arr);\n    });\n    const vIds = new Set(ur.filter((r: { role: string }) => r.role === "vendedor").map((r: { user_id: string }) => r.user_id));\n    const cIds = new Set(ur.filter((r: { role: string }) => r.role === "cliente").map((r: { user_id: string }) => r.user_id));\n    const profsWithRoles: User[] = profs.map((p) => ({ ...p, roles: rolesByUser.get(p.id) ?? [] }));\n    setVendedores(profsWithRoles.filter((p) => vIds.has(p.id)));\n    setClienteUsers(profsWithRoles.filter((p) => cIds.has(p.id)));\n    setAllProfiles(profsWithRoles);\n    setListas(lp);\n    setClientes(cs);\n    setUsingOfflineCache(false);\n    setOfflineSyncedAt(new Date().toISOString());\n    await putClientesCache(user.id, cs);\n    window.dispatchEvent(new CustomEvent("westone:offline-stats"));\n    setLoading(false);\n  };\n'''
    replace(str(p), old_load, new_load)
    old_eff = '''  useEffect(() => {\n    load();\n    const channel = supabase\n      .channel("admin-clientes-sync")\n      .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, () => load())\n      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => load())\n      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())\n      .subscribe();\n    return () => {\n      supabase.removeChannel(channel);\n    };\n  }, []);\n'''
    new_eff = '''  useEffect(() => {\n    load();\n    const onSyncRequest = () => load();\n    window.addEventListener("westone:sync-request", onSyncRequest);\n    const channel = online ? supabase\n      .channel("admin-clientes-sync")\n      .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, () => load())\n      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => load())\n      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())\n      .subscribe() : null;\n    return () => {\n      window.removeEventListener("westone:sync-request", onSyncRequest);\n      if (channel) supabase.removeChannel(channel);\n    };\n  }, [user?.id, online]);\n'''
    replace(str(p), old_eff, new_eff)
    replace(
        str(p),
        '    <div className="space-y-4">\n',
        '    <div className="space-y-4">\n      {usingOfflineCache && <Card className="border-warning/50 bg-warning/5"><CardContent className="p-3 text-sm"><strong>Modo sin conexión.</strong> Mostrando la cartera guardada en este dispositivo{offlineSyncedAt ? ` (${new Date(offlineSyncedAt).toLocaleString("es-BO")})` : ""}. La gestión administrativa requiere conexión.</CardContent></Card>}\n      {usingOfflineCache && clientes.length === 0 && <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Sin datos disponibles offline todavía. Conéctate una vez para sincronizar.</CardContent></Card>}\n',
    )
    replace(
        str(p),
        '  const deleteCliente = async (c: Cliente) => {\n',
        '  const deleteCliente = async (c: Cliente) => {\n    if (!online) return toast.info("La gestión de clientes requiere conexión.");\n',
    )

# Cliente Catalogo ----------------------------------------------------------
p = Path("src/pages/cliente/Catalogo.tsx")
text = p.read_text()
if "getCatalogoCache" not in text:
    replace(
        str(p),
        'import { Image as ImageIcon } from "lucide-react";\n',
        'import { Image as ImageIcon } from "lucide-react";\nimport { getCatalogoCache, getOfflineMetadata, putCatalogoCache } from "@/lib/offlineDb";\nimport { useConnectivity } from "@/hooks/useConnectivity";\n',
    )
    replace(
        str(p),
        '  const [selectedVar, setSelectedVar] = useState<Record<string, string>>({});\n\n  const loadProductos = useCallback(async (listaId: string) => {\n',
        '  const [selectedVar, setSelectedVar] = useState<Record<string, string>>({});\n  const online = useConnectivity();\n  const [usingOfflineCache, setUsingOfflineCache] = useState(false);\n  const [offlineSyncedAt, setOfflineSyncedAt] = useState<string | null>(null);\n\n  const loadProductos = useCallback(async (listaId: string) => {\n    if (!user) return;\n    const loadCache = async () => {\n      const [cached, meta] = await Promise.all([\n        getCatalogoCache<Producto>(user.id),\n        getOfflineMetadata(user.id, "catalogo"),\n      ]);\n      setProductos(cached);\n      setUsingOfflineCache(true);\n      setOfflineSyncedAt(meta?.synced_at ?? null);\n      return cached;\n    };\n    if (!online) {\n      await loadCache();\n      return;\n    }\n',
    )
    replace(
        str(p),
        '    if (itemsErr) { toast.error(itemsErr.message); return; }\n',
        '    if (itemsErr) {\n      const cached = await loadCache();\n      if (cached.length === 0) toast.error("No se pudo cargar el catálogo y todavía no hay datos offline.");\n      return;\n    }\n',
    )
    replace(
        str(p),
        '    setProductos(list);\n    // pre-seleccionar primera variante con stock (o la primera)\n',
        '    setProductos(list);\n    setUsingOfflineCache(false);\n    setOfflineSyncedAt(new Date().toISOString());\n    await putCatalogoCache(user.id, list);\n    window.dispatchEvent(new CustomEvent("westone:offline-stats"));\n    // pre-seleccionar primera variante con stock (o la primera)\n',
    )
    replace(
        str(p),
        '  }, []);\n\n  useEffect(() => {\n    (async () => {\n      if (!user) return;\n',
        '  }, [online, user?.id]);\n\n  useEffect(() => {\n    (async () => {\n      if (!user) return;\n      if (!online) {\n        await loadProductos("offline");\n        setLoading(false);\n        return;\n      }\n',
    )
    replace(
        str(p),
        '  }, [user, loadProductos]);\n',
        '  }, [user, loadProductos, online]);\n',
    )
    replace(
        str(p),
        '    if (!cliente?.lista_precio_id) return;\n    const channel = supabase\n',
        '    if (!online || !cliente?.lista_precio_id) return;\n    const channel = supabase\n',
    )
    replace(
        str(p),
        '  }, [cliente?.lista_precio_id]);\n',
        '  }, [cliente?.lista_precio_id, online]);\n',
    )
    replace(
        str(p),
        '  const refresh = async () => {\n    if (!cliente?.lista_precio_id) return;\n',
        '  const refresh = async () => {\n    if (!online) return toast.info("Conéctate para actualizar precios y stock.");\n    if (!cliente?.lista_precio_id) return;\n',
    )
    replace(
        str(p),
        '  const submit = async () => {\n    if (!user || !cliente) return;\n',
        '  const submit = async () => {\n    if (!online) return toast.info("Los pedidos offline se habilitarán en una fase posterior.");\n    if (!user || !cliente) return;\n',
    )
    replace(
        str(p),
        '  if (!cliente) return <Card><CardContent className="p-8 text-center text-muted-foreground">Tu cuenta de cliente aún no está vinculada. Contacta a tu vendedor.</CardContent></Card>;\n  if (!cliente.lista_precio_id) return <Card><CardContent className="p-8 text-center text-muted-foreground">No tienes una lista de precios asignada.</CardContent></Card>;\n',
        '  if (!cliente && !usingOfflineCache) return <Card><CardContent className="p-8 text-center text-muted-foreground">Tu cuenta de cliente aún no está vinculada. Contacta a tu vendedor.</CardContent></Card>;\n  if (!cliente?.lista_precio_id && !usingOfflineCache) return <Card><CardContent className="p-8 text-center text-muted-foreground">No tienes una lista de precios asignada.</CardContent></Card>;\n',
    )
    replace(
        str(p),
        '    <div className="space-y-4">\n',
        '    <div className="space-y-4">\n      {usingOfflineCache && <Card className="border-warning/50 bg-warning/5"><CardContent className="p-3 text-sm"><strong>Catálogo offline.</strong> Precios y stock corresponden a la última sincronización{offlineSyncedAt ? ` (${new Date(offlineSyncedAt).toLocaleString("es-BO")})` : ""}. Los pedidos requieren conexión en esta fase.</CardContent></Card>}\n      {usingOfflineCache && productos.length === 0 && <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Sin datos disponibles offline todavía. Conéctate una vez para sincronizar.</CardContent></Card>}\n',
    )
    replace(
        str(p),
        '<Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>',
        '<Button variant="outline" size="sm" onClick={refresh} disabled={refreshing || !online}>',
    )

print("OFF-1 integration applied")
