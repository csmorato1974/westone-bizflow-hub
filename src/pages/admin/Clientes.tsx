import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, MapPin, Package, Pencil, Search, Trash2, UserPlus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { mapsLink } from "@/lib/whatsapp";
import { useAuth } from "@/contexts/AuthContext";
import { PedidosRecientes } from "@/components/cliente/PedidosRecientes";

interface Cliente {
  id: string;
  empresa: string;
  contacto: string;
  celular: string;
  email: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  notas: string | null;
  activo: boolean;
  vendedor_id: string | null;
  lista_precio_id: string | null;
  user_id: string | null;
}
type AppRole = "super_admin" | "admin" | "vendedor" | "logistica" | "cliente";
interface User { id: string; full_name: string | null; email: string | null; phone?: string | null; roles?: AppRole[]; }

type FormMode = "edit" | "create-from-user";

export default function AdminClientes() {
  const { hasRole } = useAuth();
  const isSuper = hasRole("super_admin");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vendedores, setVendedores] = useState<User[]>([]);
  const [clienteUsers, setClienteUsers] = useState<User[]>([]);
  const [allProfiles, setAllProfiles] = useState<User[]>([]);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [listas, setListas] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pedidosCliente, setPedidosCliente] = useState<{ id: string; empresa: string } | null>(null);
  const [searchParams] = useSearchParams();
  const focusClienteId = searchParams.get("focus");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [editing, setEditing] = useState<Cliente | null>(null);
  const [mode, setMode] = useState<FormMode>("edit");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // form fields
  const [empresa, setEmpresa] = useState("");
  const [contacto, setContacto] = useState("");
  const [celular, setCelular] = useState("");
  const [email, setEmail] = useState("");
  const [direccion, setDireccion] = useState("");
  const [latitud, setLat] = useState<number | null>(null);
  const [longitud, setLng] = useState<number | null>(null);
  const [notas, setNotas] = useState("");
  const [activo, setActivo] = useState(true);
  const [vendedorId, setVendedorId] = useState<string>("");
  const [listaPrecioId, setListaPrecioId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const [{ data: cs }, { data: ur }, { data: lp }, { data: profs }] = await Promise.all([
      supabase.from("clientes").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id,role"),
      supabase.from("listas_precios").select("id,nombre").eq("activa", true),
      supabase.from("profiles").select("id,full_name,email,phone"),
    ]);
    const rolesByUser = new Map<string, AppRole[]>();
    (ur ?? []).forEach((r: { user_id: string; role: string }) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role as AppRole);
      rolesByUser.set(r.user_id, arr);
    });
    const vIds = new Set((ur ?? []).filter((r: { role: string }) => r.role === "vendedor").map((r: { user_id: string }) => r.user_id));
    const cIds = new Set((ur ?? []).filter((r: { role: string }) => r.role === "cliente").map((r: { user_id: string }) => r.user_id));
    const profsWithRoles: User[] = (profs ?? []).map((p) => ({ ...p, roles: rolesByUser.get(p.id) ?? [] }));
    setVendedores(profsWithRoles.filter((p) => vIds.has(p.id)));
    setClienteUsers(profsWithRoles.filter((p) => cIds.has(p.id)));
    setAllProfiles(profsWithRoles);
    setListas(lp ?? []);
    setClientes((cs ?? []) as Cliente[]);
    setLoading(false);
  };
  useEffect(() => {
    load();
    const channel = supabase
      .channel("admin-clientes-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const vendedorMap = useMemo(() => {
    const m = new Map<string, string>();
    vendedores.forEach((v) => m.set(v.id, v.full_name ?? v.email ?? "—"));
    return m;
  }, [vendedores]);
  const listaMap = useMemo(() => {
    const m = new Map<string, string>();
    listas.forEach((l) => m.set(l.id, l.nombre));
    return m;
  }, [listas]);
  // user_ids ya enlazados a alguna ficha
  const linkedUserIds = useMemo(() => {
    const s = new Set<string>();
    clientes.forEach((c) => { if (c.user_id) s.add(c.user_id); });
    return s;
  }, [clientes]);

  // cuentas con rol cliente que no tienen ficha vinculada
  const huerfanos = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = clienteUsers.filter((u) => !linkedUserIds.has(u.id));
    if (!q) return list;
    return list.filter((u) =>
      [u.full_name ?? "", u.email ?? ""].some((v) => v.toLowerCase().includes(q)),
    );
  }, [clienteUsers, linkedUserIds, search]);

  // perfiles SIN rol cliente y SIN ficha vinculada — candidatos a convertir
  const convertibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = allProfiles.filter(
      (u) => !linkedUserIds.has(u.id) && !(u.roles ?? []).includes("cliente"),
    );
    if (!q) return list;
    return list.filter((u) =>
      [u.full_name ?? "", u.email ?? ""].some((v) => v.toLowerCase().includes(q)),
    );
  }, [allProfiles, linkedUserIds, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) =>
      [c.empresa, c.contacto, c.celular, c.email ?? "", c.direccion ?? ""]
        .some((v) => v.toLowerCase().includes(q)),
    );
  }, [clientes, search]);

  const resetForm = () => {
    setEmpresa(""); setContacto(""); setCelular(""); setEmail("");
    setDireccion(""); setLat(null); setLng(null); setNotas("");
    setActivo(true); setVendedorId(""); setListaPrecioId(""); setUserId("");
  };

  const openEdit = (c: Cliente) => {
    setMode("edit");
    setEditing(c);
    setEmpresa(c.empresa);
    setContacto(c.contacto);
    setCelular(c.celular);
    setEmail(c.email ?? "");
    setDireccion(c.direccion ?? "");
    setLat(c.latitud);
    setLng(c.longitud);
    setNotas(c.notas ?? "");
    setActivo(c.activo);
    setVendedorId(c.vendedor_id ?? "");
    setListaPrecioId(c.lista_precio_id ?? "");
    setUserId(c.user_id ?? "");
    setOpen(true);
  };

  const openCreateForUser = (u: User) => {
    setMode("create-from-user");
    setEditing(null);
    resetForm();
    const nombre = u.full_name ?? u.email ?? "";
    setEmpresa(nombre);
    setContacto(nombre);
    setEmail(u.email ?? "");
    setCelular(u.phone ?? "");
    setUserId(u.id);
    setActivo(true);
    setOpen(true);
  };

  const convertirYCrearFicha = async (u: User) => {
    setConvertingId(u.id);
    // Asignar rol cliente si aún no lo tiene (los demás roles se conservan)
    if (!(u.roles ?? []).includes("cliente")) {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: u.id, role: "cliente" });
      if (error && !/duplicate|unique/i.test(error.message)) {
        setConvertingId(null);
        return toast.error(error.message);
      }
      await logAudit("asignar_rol", "user_roles", u.id, {
        role: "cliente",
        origen: "clientes_admin",
      });
    }
    setConvertingId(null);
    toast.success("Rol cliente asignado · completá la ficha");
    openCreateForUser(u);
    // refrescar para que aparezca con su nuevo rol
    load();
  };

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setEditing(null);
      setMode("edit");
    }
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (empresa.trim().length < 2) return toast.error("Empresa requerida");
    if (contacto.trim().length < 2) return toast.error("Contacto requerido");
    if (!/^\+?\d{7,15}$/.test(celular.replace(/\s/g, ""))) return toast.error("Celular inválido");
    const emailTrim = email.trim();
    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) return toast.error("Email inválido");

    setSaving(true);
    const patch = {
      empresa: empresa.trim(),
      contacto: contacto.trim(),
      celular: celular.trim(),
      email: emailTrim || null,
      direccion: direccion.trim() || null,
      latitud,
      longitud,
      notas: notas.trim() || null,
      activo,
      vendedor_id: vendedorId || null,
      lista_precio_id: listaPrecioId || null,
      user_id: userId || null,
    };

    if (mode === "create-from-user") {
      const { data, error } = await supabase.from("clientes").insert(patch).select("id").single();
      setSaving(false);
      if (error) return toast.error(error.message);
      await logAudit("crear_cliente_admin", "clientes", data?.id ?? null, { empresa: patch.empresa, user_id: patch.user_id });
      toast.success("Ficha creada y vinculada");
      setOpen(false);
      load();
      return;
    }

    if (!editing) { setSaving(false); return; }
    const { error } = await supabase.from("clientes").update(patch).eq("id", editing.id);
    setSaving(false);
    if (error) return toast.error(error.message);

    const changes: Record<string, unknown> = { empresa: editing.empresa };
    if (editing.vendedor_id !== patch.vendedor_id) {
      changes.vendedor_anterior = editing.vendedor_id;
      changes.vendedor_nuevo = patch.vendedor_id;
    }
    if (editing.lista_precio_id !== patch.lista_precio_id) {
      changes.lista_anterior = editing.lista_precio_id;
      changes.lista_nueva = patch.lista_precio_id;
    }
    if (editing.user_id !== patch.user_id) {
      changes.cuenta_anterior = editing.user_id;
      changes.cuenta_nueva = patch.user_id;
    }
    await logAudit("editar_cliente_admin", "clientes", editing.id, changes);
    toast.success("Cliente actualizado");
    setOpen(false);
    setEditing(null);
    load();
  };

  const deleteCliente = async (c: Cliente) => {
    setDeletingId(c.id);
    // check pedidos
    const { count } = await supabase
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", c.id);
    if ((count ?? 0) > 0) {
      setDeletingId(null);
      return toast.error("El cliente tiene pedidos. Desactívalo en lugar de eliminarlo.");
    }

    if (c.user_id) {
      // delete linked auth user via edge function (also cascades clientes row)
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: c.user_id },
      });
      setDeletingId(null);
      if (error) return toast.error(error.message);
      if (data?.error) return toast.error(data.error);
      await logAudit("eliminar_cliente", "clientes", c.id, { empresa: c.empresa, with_user: true });
    } else {
      const { error } = await supabase.from("clientes").delete().eq("id", c.id);
      setDeletingId(null);
      if (error) return toast.error(error.message);
      await logAudit("eliminar_cliente", "clientes", c.id, { empresa: c.empresa, with_user: false });
    }
    toast.success("Cliente eliminado");
    load();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="industrial-title text-3xl">Clientes</h1>
        <p className="text-sm text-muted-foreground">Vista global · datos completos, asignación y edición</p>
      </div>

      <div className="relative max-w-md">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por empresa, contacto, email, celular…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : (
        <>
          {huerfanos.length > 0 && (
            <Card className="border-warning/50 bg-warning/5">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="industrial-title text-base">Cuentas sin ficha de cliente</p>
                    <p className="text-xs text-muted-foreground">
                      Usuarios con rol cliente que aún no están vinculados a una ficha. Crea una para que puedan operar.
                    </p>
                  </div>
                  <Badge variant="outline" className="border-warning text-warning">
                    {huerfanos.length} pendiente{huerfanos.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                <div className="grid gap-2">
                  {huerfanos.map((u) => (
                    <div key={u.id} className="flex items-center justify-between gap-3 flex-wrap rounded-md border bg-card p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{u.full_name ?? "(sin nombre)"}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email ?? "—"}{u.phone ? ` · ${u.phone}` : ""}</p>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {(u.roles ?? []).map((r) => (
                            <Badge key={r} className="bg-brand text-brand-foreground text-[10px] px-1.5 py-0">{r}</Badge>
                          ))}
                        </div>
                      </div>
                      <Button size="sm" onClick={() => openCreateForUser(u)} className="bg-brand text-brand-foreground hover:bg-brand-dark">
                        <UserPlus className="h-3 w-3" /> Crear ficha
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {convertibles.length > 0 && (
            <Card className="border-muted-foreground/30 bg-muted/20">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="industrial-title text-base">Otros perfiles disponibles para convertir</p>
                    <p className="text-xs text-muted-foreground">
                      Cualquier perfil registrado (vendedor, logística, sin rol, etc.) puede convertirse en cliente. Sus roles previos se conservan.
                    </p>
                  </div>
                  <Badge variant="outline">
                    {convertibles.length} perfil{convertibles.length === 1 ? "" : "es"}
                  </Badge>
                </div>
                <div className="grid gap-2">
                  {convertibles.map((u) => (
                    <div key={u.id} className="flex items-center justify-between gap-3 flex-wrap rounded-md border bg-card p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{u.full_name ?? "(sin nombre)"}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email ?? "—"}{u.phone ? ` · ${u.phone}` : ""}</p>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {(u.roles ?? []).length === 0 ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">sin rol</Badge>
                          ) : (
                            (u.roles ?? []).map((r) => (
                              <Badge key={r} className="bg-brand text-brand-foreground text-[10px] px-1.5 py-0">{r}</Badge>
                            ))
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={convertingId === u.id}
                        onClick={() => convertirYCrearFicha(u)}
                        className="bg-brand text-brand-foreground hover:bg-brand-dark"
                      >
                        {convertingId === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                        Convertir en cliente
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {filtered.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Sin resultados</CardContent></Card>
          ) : (
            <div className="grid gap-3">
              {filtered.map((c) => {
                const maps = mapsLink(c.latitud, c.longitud);
                return (
                  <Card key={c.id} className={!c.activo ? "opacity-60" : ""}>
                    <CardContent className="p-4 grid md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <p className="industrial-title text-lg">{c.empresa}</p>
                        <p className="text-sm">{c.contacto}</p>
                        <p className="text-sm text-muted-foreground">📞 {c.celular}</p>
                        {c.email && <p className="text-sm text-muted-foreground break-all">✉️ {c.email}</p>}
                        {!c.activo && <p className="text-xs text-destructive">Inactivo</p>}
                      </div>
                      <div className="space-y-1 text-sm">
                        {c.direccion && <p className="text-muted-foreground">📍 {c.direccion}</p>}
                        {maps && (
                          <a href={maps} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline text-xs">
                            <MapPin className="h-3 w-3" /> Ver en Maps
                          </a>
                        )}
                        {c.notas && <p className="text-xs text-muted-foreground line-clamp-3 pt-1">📝 {c.notas}</p>}
                      </div>
                      <div className="space-y-2 text-sm">
                        <p><span className="text-muted-foreground">Vendedor:</span> {c.vendedor_id ? vendedorMap.get(c.vendedor_id) ?? "—" : "Sin asignar"}</p>
                        <p><span className="text-muted-foreground">Lista:</span> {c.lista_precio_id ? listaMap.get(c.lista_precio_id) ?? "—" : "—"}</p>
                        <div>
                          {c.user_id ? (
                            <Badge variant="outline" className="border-success text-success">
                              🔗 Cuenta vinculada
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
                              Sin cuenta de acceso
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => setPedidosCliente({ id: c.id, empresa: c.empresa })}>
                            <Package className="h-3 w-3" /> Ver pedidos
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                            <Pencil className="h-3 w-3" /> Editar
                          </Button>
                          {isSuper && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="destructive" disabled={deletingId === c.id}>
                                  {deletingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                  Eliminar
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Se eliminará permanentemente <strong>{c.empresa}</strong>
                                    {c.user_id ? " y su cuenta de acceso asociada" : ""}. Si tiene pedidos, la eliminación será bloqueada.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteCliente(c)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Eliminar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="industrial-title">
              {mode === "create-from-user" ? "Crear ficha para cuenta" : "Editar cliente"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSave} className="space-y-3">
            <div><Label>Empresa *</Label><Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} maxLength={200} required /></div>
            <div><Label>Contacto *</Label><Input value={contacto} onChange={(e) => setContacto(e.target.value)} maxLength={120} required /></div>
            <div><Label>Celular *</Label><Input value={celular} onChange={(e) => setCelular(e.target.value)} maxLength={20} required placeholder="+593..." /></div>
            <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} placeholder="contacto@empresa.com" /></div>
            <div><Label>Dirección</Label><Input value={direccion} onChange={(e) => setDireccion(e.target.value)} maxLength={300} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Latitud</Label><Input type="number" step="any" value={latitud ?? ""} onChange={(e) => setLat(e.target.value === "" ? null : Number(e.target.value))} /></div>
              <div><Label>Longitud</Label><Input type="number" step="any" value={longitud ?? ""} onChange={(e) => setLng(e.target.value === "" ? null : Number(e.target.value))} /></div>
            </div>
            <div>
              <Label>Vendedor</Label>
              <Select value={vendedorId} onValueChange={setVendedorId}>
                <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.full_name ?? v.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Lista de precios</Label>
              <Select value={listaPrecioId} onValueChange={setListaPrecioId}>
                <SelectTrigger><SelectValue placeholder="Sin lista" /></SelectTrigger>
                <SelectContent>
                  {listas.map((l) => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cuenta de acceso vinculada</Label>
              <Select value={userId || "__none__"} onValueChange={(v) => setUserId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Sin cuenta vinculada" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sin cuenta vinculada —</SelectItem>
                  {clienteUsers
                    .filter((u) => u.id === userId || !linkedUserIds.has(u.id))
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {(u.full_name ?? u.email ?? u.id)}{u.email && u.full_name ? ` · ${u.email}` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Lista de usuarios registrados con rol cliente. Vincular permite acceder al catálogo y crear pedidos.
              </p>
            </div>
            <div><Label>Notas</Label><Textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} /></div>
            <div className="flex items-center gap-2">
              <input id="activo" type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-4 w-4" />
              <Label htmlFor="activo" className="cursor-pointer">Activo</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="bg-brand text-brand-foreground hover:bg-brand-dark">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "create-from-user" ? "Crear ficha" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pedidosCliente} onOpenChange={(o) => { if (!o) setPedidosCliente(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="industrial-title">Pedidos de {pedidosCliente?.empresa}</DialogTitle>
          </DialogHeader>
          {pedidosCliente && (
            <PedidosRecientes
              clienteId={pedidosCliente.id}
              limit={20}
              hideViewAll
              title="Historial de pedidos"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
