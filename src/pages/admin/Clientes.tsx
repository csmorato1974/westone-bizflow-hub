import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, MapPin, Pencil, Search, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
interface User { id: string; full_name: string | null; email: string | null; }

export default function AdminClientes() {
  const { hasRole } = useAuth();
  const isSuper = hasRole("super_admin");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vendedores, setVendedores] = useState<User[]>([]);
  const [clienteUsers, setClienteUsers] = useState<User[]>([]);
  const [listas, setListas] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editing, setEditing] = useState<Cliente | null>(null);
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
      supabase.from("profiles").select("id,full_name,email"),
    ]);
    const vIds = new Set((ur ?? []).filter((r: { role: string }) => r.role === "vendedor").map((r: { user_id: string }) => r.user_id));
    const cIds = new Set((ur ?? []).filter((r: { role: string }) => r.role === "cliente").map((r: { user_id: string }) => r.user_id));
    setVendedores((profs ?? []).filter((p) => vIds.has(p.id)));
    setClienteUsers((profs ?? []).filter((p) => cIds.has(p.id)));
    setListas(lp ?? []);
    setClientes((cs ?? []) as Cliente[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

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
  const clienteUserMap = useMemo(() => {
    const m = new Map<string, string>();
    clienteUsers.forEach((u) => m.set(u.id, u.full_name ?? u.email ?? "—"));
    return m;
  }, [clienteUsers]);
  // user_ids ya enlazados a otra ficha (excluir del selector salvo el actual)
  const linkedUserIds = useMemo(() => {
    const s = new Set<string>();
    clientes.forEach((c) => { if (c.user_id) s.add(c.user_id); });
    return s;
  }, [clientes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) =>
      [c.empresa, c.contacto, c.celular, c.email ?? "", c.direccion ?? ""]
        .some((v) => v.toLowerCase().includes(q)),
    );
  }, [clientes, search]);

  const openEdit = (c: Cliente) => {
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

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) setEditing(null);
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (empresa.trim().length < 2) return toast.error("Empresa requerida");
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
      ) : filtered.length === 0 ? (
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
                    <div className="flex gap-2 flex-wrap">
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

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="industrial-title">Editar cliente</DialogTitle></DialogHeader>
          <form onSubmit={onSave} className="space-y-3">
            <div><Label>Empresa *</Label><Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} maxLength={200} required /></div>
            <div><Label>Contacto *</Label><Input value={contacto} onChange={(e) => setContacto(e.target.value)} maxLength={120} required /></div>
            <div><Label>Celular *</Label><Input value={celular} onChange={(e) => setCelular(e.target.value)} maxLength={20} required /></div>
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
            <div><Label>Notas</Label><Textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} /></div>
            <div className="flex items-center gap-2">
              <input id="activo" type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-4 w-4" />
              <Label htmlFor="activo" className="cursor-pointer">Activo</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="bg-brand text-brand-foreground hover:bg-brand-dark">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
