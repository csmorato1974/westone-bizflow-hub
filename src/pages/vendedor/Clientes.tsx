import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MapPin, Plus, MessageCircle, Loader2, Pencil } from "lucide-react";
import { logAudit } from "@/lib/audit";
import { waLink, fillTemplate, mapsLink } from "@/lib/whatsapp";

interface Cliente {
  id: string; empresa: string; contacto: string; celular: string;
  direccion: string | null; latitud: number | null; longitud: number | null;
  lista_precio_id: string | null;
}

export default function VendedorClientes() {
  const { user } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [listas, setListas] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [welcomeTpl, setWelcomeTpl] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [empresa, setEmpresa] = useState("");
  const [contacto, setContacto] = useState("");
  const [celular, setCelular] = useState("");
  const [direccion, setDireccion] = useState("");
  const [latitud, setLat] = useState<number | null>(null);
  const [longitud, setLng] = useState<number | null>(null);
  const [listaPrecio, setListaPrecio] = useState<string>("");
  const [notas, setNotas] = useState("");
  const [gpsBusy, setGpsBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: cs }, { data: lp }, { data: tpl }] = await Promise.all([
      supabase.from("clientes").select("*").eq("vendedor_id", user.id).order("created_at", { ascending: false }),
      supabase.from("listas_precios").select("id,nombre").eq("activa", true),
      supabase.from("whatsapp_templates").select("mensaje").eq("clave", "bienvenida").maybeSingle(),
    ]);
    setClientes(cs ?? []);
    setListas(lp ?? []);
    setWelcomeTpl(tpl?.mensaje ?? "");
    setLoading(false);
  };
  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    const channel = supabase
      .channel("vendedor-clientes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clientes" },
        () => load(),
      )
      .subscribe();

    return () => {
      window.removeEventListener("focus", onFocus);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const captureGps = () => {
    if (!navigator.geolocation) return toast.error("Geolocalización no disponible");
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude); setLng(p.coords.longitude); setGpsBusy(false); toast.success("GPS capturado"); },
      (err) => { setGpsBusy(false); toast.error("Error GPS: " + err.message); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const reset = () => {
    setEmpresa(""); setContacto(""); setCelular(""); setDireccion("");
    setLat(null); setLng(null); setListaPrecio(""); setNotas("");
    setEditingId(null);
  };

  const openEdit = (c: Cliente & { notas?: string | null }) => {
    setEditingId(c.id);
    setEmpresa(c.empresa);
    setContacto(c.contacto);
    setCelular(c.celular);
    setDireccion(c.direccion ?? "");
    setLat(c.latitud);
    setLng(c.longitud);
    setListaPrecio(c.lista_precio_id ?? "");
    setNotas((c as { notas?: string | null }).notas ?? "");
    setOpen(true);
  };

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) reset();
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (empresa.trim().length < 2) return toast.error("Empresa requerida");
    if (!/^\+?\d{7,15}$/.test(celular.replace(/\s/g, ""))) return toast.error("Celular inválido");
    setSaving(true);

    const payload = {
      empresa: empresa.trim(), contacto: contacto.trim(), celular: celular.trim(),
      direccion: direccion.trim() || null, latitud, longitud,
      lista_precio_id: listaPrecio || null, notas: notas.trim() || null,
    };

    if (editingId) {
      const { data, error } = await supabase.from("clientes")
        .update(payload)
        .eq("id", editingId)
        .eq("vendedor_id", user.id)
        .select().single();
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      await logAudit("editar_cliente", "clientes", data.id, { empresa: data.empresa });
      toast.success("Cliente actualizado");
    } else {
      const { data, error } = await supabase.from("clientes").insert({
        ...payload,
        vendedor_id: user.id,
      }).select().single();
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      await logAudit("crear_cliente", "clientes", data.id, { empresa: data.empresa });
      toast.success("Cliente creado");
    }
    setOpen(false); reset(); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="industrial-title text-3xl">Mis Clientes</h1>
          <p className="text-sm text-muted-foreground">Cartera asignada a tu cuenta</p>
        </div>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogTrigger asChild>
            <Button onClick={() => { reset(); }} className="bg-primary text-brand hover:bg-primary/90">
              <Plus className="h-4 w-4" /> Nuevo cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="industrial-title">{editingId ? "Editar cliente" : "Registrar cliente"}</DialogTitle></DialogHeader>
            <form onSubmit={onSave} className="space-y-3">
              <div><Label>Empresa *</Label><Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} maxLength={200} required /></div>
              <div><Label>Contacto *</Label><Input value={contacto} onChange={(e) => setContacto(e.target.value)} maxLength={120} required /></div>
              <div><Label>Celular * (con código país, ej. 59170000000)</Label><Input value={celular} onChange={(e) => setCelular(e.target.value)} maxLength={20} required /></div>
              <div><Label>Dirección</Label><Input value={direccion} onChange={(e) => setDireccion(e.target.value)} maxLength={300} /></div>
              <div className="flex gap-2 items-end">
                <div className="flex-1"><Label>Latitud</Label><Input value={latitud ?? ""} readOnly /></div>
                <div className="flex-1"><Label>Longitud</Label><Input value={longitud ?? ""} readOnly /></div>
                <Button type="button" variant="outline" onClick={captureGps} disabled={gpsBusy}>
                  {gpsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                  GPS
                </Button>
              </div>
              <div><Label>Lista de precios</Label>
                <Select value={listaPrecio} onValueChange={setListaPrecio}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar lista" /></SelectTrigger>
                  <SelectContent>{listas.map((l) => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Notas</Label><Textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} /></div>
              <DialogFooter>
                <Button type="submit" disabled={saving} className="bg-brand text-brand-foreground hover:bg-brand-dark">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : clientes.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No tienes clientes registrados</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {clientes.map((c) => {
            const msg = fillTemplate(welcomeTpl, { contacto: c.contacto, empresa: c.empresa });
            const maps = mapsLink(c.latitud, c.longitud);
            return (
              <Card key={c.id} className="hover:border-brand transition-colors">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <h3 className="industrial-title text-lg truncate">{c.empresa}</h3>
                      <p className="text-sm text-muted-foreground">{c.contacto}</p>
                    </div>
                  </div>
                  <p className="text-sm">📞 {c.celular}</p>
                  {c.direccion && <p className="text-xs text-muted-foreground line-clamp-2">📍 {c.direccion}</p>}
                  <div className="flex gap-2 pt-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a href={waLink(c.celular, msg)} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="h-3 w-3" /> Bienvenida
                      </a>
                    </Button>
                    {maps && <Button asChild size="sm" variant="outline"><a href={maps} target="_blank" rel="noopener noreferrer"><MapPin className="h-3 w-3" /> Maps</a></Button>}
                    <Button asChild size="sm" className="bg-brand text-brand-foreground hover:bg-brand-dark">
                      <Link to={`/app/pedidos/nuevo/${c.id}`}>Pedido</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
