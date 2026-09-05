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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MapPin, Plus, MessageCircle, Loader2, Pencil, Package, Mic, Square, Wand2 } from "lucide-react";
import { logAudit } from "@/lib/audit";
import { waLink, mapsLink } from "@/lib/whatsapp";
import { PedidosRecientes } from "@/components/cliente/PedidosRecientes";
import { UbicacionGps } from "@/components/cliente/UbicacionGps";
import { OnboardingComercialPreview } from "@/components/vendedor/OnboardingComercialPreview";
import { contextoSeguro, mensajeErrorGeo, validarCoordenadas } from "@/lib/gps";
import { camposDetectados, extraerDatosAltaExpress } from "@/lib/altaExpress";
import { mensajeErrorGuardarCliente } from "@/lib/clienteErrores";
import {
  generarOnboardingComercial,
  type OnboardingComercialGenerado,
} from "@/lib/onboardingComercial";
import { useVoiceDictation } from "@/hooks/useVoiceDictation";

interface Cliente {
  id: string; empresa: string; contacto: string; celular: string;
  email: string | null;
  direccion: string | null; latitud: number | null; longitud: number | null;
  precision_metros?: number | null; gps_capturado_en?: string | null;
  lista_precio_id: string | null; notas: string | null;
  user_id: string | null; vendedor_id: string | null;
  onboarding_enviado_en?: string | null; onboarding_canal?: string | null;
}

export default function VendedorClientes() {
  const { user, profile } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [listas, setListas] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pedidosCliente, setPedidosCliente] = useState<Cliente | null>(null);
  const [onboardingActual, setOnboardingActual] = useState<OnboardingComercialGenerado | null>(null);
  const [onboardingBusyId, setOnboardingBusyId] = useState<string | null>(null);

  const [empresa, setEmpresa] = useState("");
  const [contacto, setContacto] = useState("");
  const [celular, setCelular] = useState("");
  const [email, setEmail] = useState("");
  const [direccion, setDireccion] = useState("");
  const [latitud, setLat] = useState<number | null>(null);
  const [longitud, setLng] = useState<number | null>(null);
  const [precisionMetros, setPrecisionMetros] = useState<number | null>(null);
  const [gpsPendiente, setGpsPendiente] = useState(false);
  const [listaPrecio, setListaPrecio] = useState<string>("");
  const [notas, setNotas] = useState("");
  const [gpsBusy, setGpsBusy] = useState(false);
  const dictado = useVoiceDictation();

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: cs }, { data: lp }] = await Promise.all([
      supabase.from("clientes").select("*").eq("vendedor_id", user.id).order("created_at", { ascending: false }),
      supabase.from("listas_precios").select("id,nombre").eq("activa", true),
    ]);
    setClientes(cs ?? []);
    setListas(lp ?? []);
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
    if (!contextoSeguro()) return toast.error("La ubicación requiere una conexión segura (HTTPS).");
    if (!navigator.geolocation) return toast.error("Geolocalización no disponible");
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const precision = Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null;
        const error = validarCoordenadas({
          latitud: p.coords.latitude,
          longitud: p.coords.longitude,
          precisionMetros: precision,
        });
        setGpsBusy(false);
        if (error) return toast.error(error);
        setLat(p.coords.latitude);
        setLng(p.coords.longitude);
        setPrecisionMetros(precision);
        setGpsPendiente(true);
        toast.success("GPS capturado. Se confirmará al guardar la ficha.");
      },
      (err) => { setGpsBusy(false); toast.error(mensajeErrorGeo(err.code, err.message)); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const reset = () => {
    dictado.stop();
    setEmpresa(""); setContacto(""); setCelular(""); setEmail(""); setDireccion("");
    setLat(null); setLng(null); setPrecisionMetros(null); setGpsPendiente(false); setListaPrecio(""); setNotas("");
    setEditingId(null);
    dictado.reset();
  };

  const openEdit = (c: Cliente & { notas?: string | null }) => {
    setEditingId(c.id);
    setEmpresa(c.empresa);
    setContacto(c.contacto);
    setCelular(c.celular);
    setEmail(c.email ?? "");
    setDireccion(c.direccion ?? "");
    setLat(c.latitud);
    setLng(c.longitud);
    setPrecisionMetros(c.precision_metros ?? null);
    setGpsPendiente(false);
    setListaPrecio(c.lista_precio_id ?? "");
    setNotas((c as { notas?: string | null }).notas ?? "");
    setOpen(true);
  };

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) reset();
  };

  const aplicarDictado = () => {
    const datos = extraerDatosAltaExpress(dictado.transcript);
    const detectados = camposDetectados(datos);
    if (detectados.length === 0) {
      toast.error("No reconocí campos. Usá frases como: Empresa..., Contacto..., Celular..., Dirección...");
      return;
    }

    if (datos.empresa) setEmpresa(datos.empresa);
    if (datos.contacto) setContacto(datos.contacto);
    if (datos.celular) setCelular(datos.celular);
    if (datos.direccion) setDireccion(datos.direccion);
    if (datos.notas) setNotas(datos.notas);
    if (datos.listaPrecio) {
      const buscada = datos.listaPrecio.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const lista = listas.find((item) =>
        item.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === buscada,
      );
      if (lista) setListaPrecio(lista.id);
      else toast.message(`Lista de precios “${datos.listaPrecio}” no encontrada. Seleccionala manualmente.`);
    }
    toast.success(`${detectados.length} campo(s) completado(s). Revisá la ficha antes de guardar.`);
  };

  const prepararOnboarding = async (cliente: Cliente) => {
    if (!user) return;
    setOnboardingBusyId(cliente.id);
    try {
      const generado = await generarOnboardingComercial({
        cliente,
        vendedorNombre: profile?.full_name || profile?.username || user.email || "tu asesor comercial",
        creadoPor: user.id,
      });
      setOnboardingActual(generado);
      await logAudit("onboarding_generado", "clientes", cliente.id, {
        snapshot_id: generado.id,
        lista: generado.listaNombre,
        precios_guardados: generado.items.length,
      });
      toast.success("Onboarding generado y precios guardados en el historial");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar el onboarding");
    } finally {
      setOnboardingBusyId(null);
    }
  };

  const abrirWhatsappOnboarding = async (data: OnboardingComercialGenerado) => {
    window.open(waLink(data.celular, data.mensaje), "_blank", "noopener,noreferrer");
    setOnboardingActual(null);
    if (!user) return;

    const ahora = new Date().toISOString();
    const { error } = await supabase
      .from("clientes")
      .update({ onboarding_enviado_en: ahora, onboarding_canal: "whatsapp", onboarding_enviado_por: user.id })
      .eq("id", data.clienteId)
      .eq("vendedor_id", user.id);
    if (error) toast.warning("WhatsApp se abrió, pero no se pudo actualizar el estado: " + error.message);
    await logAudit("onboarding_whatsapp_abierto", "clientes", data.clienteId, { snapshot_id: data.id });
    await load();
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (empresa.trim().length < 2) return toast.error("Empresa requerida");
    if (!/^\+?\d{7,15}$/.test(celular.replace(/\s/g, ""))) return toast.error("Celular inválido");
    const emailTrim = email.trim();
    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) return toast.error("Email inválido");
    setSaving(true);

    const payload = {
      empresa: empresa.trim(), contacto: contacto.trim(), celular: celular.trim(),
      email: emailTrim || null,
      direccion: direccion.trim() || null,
      lista_precio_id: listaPrecio || null, notas: notas.trim() || null,
    };

    let clienteGuardado: Cliente | null = null;

    if (editingId) {
      const { data, error } = await supabase.from("clientes")
        .update(payload)
        .eq("id", editingId)
        .eq("vendedor_id", user.id)
        .select().single();
      if (error) { setSaving(false); toast.error(mensajeErrorGuardarCliente(error)); return; }
      clienteGuardado = data;
    } else {
      // El código CLI, el teléfono normalizado y la clave técnica los genera la base de datos.
      const { data, error } = await supabase.from("clientes").insert({
        ...payload,
        vendedor_id: user.id,
        origen_registro: "manual",
      }).select().single();

      if (error) { setSaving(false); toast.error(mensajeErrorGuardarCliente(error)); return; }
      clienteGuardado = data;
    }

    if (clienteGuardado && gpsPendiente && latitud != null && longitud != null) {
      const { error } = await supabase.rpc("guardar_ubicacion_cliente", {
        _cliente_id: clienteGuardado.id,
        _latitud: latitud,
        _longitud: longitud,
        _precision_metros: precisionMetros,
        _fuente: "alta_express_gps",
      });
      if (error) toast.warning("La ficha se guardó, pero no se pudo registrar el GPS: " + error.message);
    }

    if (clienteGuardado) {
      await logAudit(editingId ? "editar_cliente" : "crear_cliente", "clientes", clienteGuardado.id, {
        empresa: clienteGuardado.empresa,
        captura: dictado.transcript.trim() ? "voz" : "manual",
        gps_capturado: gpsPendiente,
      });
      toast.success(editingId ? "Cliente actualizado" : "Cliente creado");
    }
    const generarAlCrear = !editingId && !!clienteGuardado?.lista_precio_id;
    setSaving(false);
    setOpen(false); reset(); await load();
    if (generarAlCrear && clienteGuardado) await prepararOnboarding(clienteGuardado);
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
              <div className="space-y-2 rounded-md border border-dashed border-brand/50 bg-brand/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Alta Express por voz</p>
                    <p className="text-xs text-muted-foreground">Dictá los datos y revisalos antes de guardar.</p>
                  </div>
                  {dictado.supported ? (
                    dictado.listening ? (
                      <Button type="button" size="sm" variant="destructive" onClick={dictado.stop}>
                        <Square className="h-3.5 w-3.5" /> Detener
                      </Button>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={dictado.start}>
                        <Mic className="h-3.5 w-3.5" /> Dictar datos
                      </Button>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">Podés pegar la transcripción manualmente.</span>
                  )}
                </div>
                <Textarea
                  value={dictado.transcript}
                  onChange={(event) => dictado.setTranscript(event.target.value)}
                  rows={3}
                  placeholder="Ejemplo: Empresa Repuestos Norte. Contacto Ana Pérez. Celular 591 700 12345. Dirección Avenida Blanco Galindo 123."
                />
                {dictado.listening && (
                  <p className="text-xs text-brand">Escuchando… {dictado.interimTranscript}</p>
                )}
                {dictado.error && <p className="text-xs text-destructive">{dictado.error}</p>}
                <Button type="button" size="sm" onClick={aplicarDictado} disabled={!dictado.transcript.trim()}>
                  <Wand2 className="h-3.5 w-3.5" /> Completar ficha
                </Button>
              </div>
              <div><Label>Empresa *</Label><Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} maxLength={200} required /></div>
              <div><Label>Contacto *</Label><Input value={contacto} onChange={(e) => setContacto(e.target.value)} maxLength={120} required /></div>
              <div><Label>Celular * (con código país, ej. 59170000000)</Label><Input value={celular} onChange={(e) => setCelular(e.target.value)} maxLength={20} required /></div>
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} placeholder="contacto@empresa.com" /></div>
              <div><Label>Dirección</Label><Input value={direccion} onChange={(e) => setDireccion(e.target.value)} maxLength={300} /></div>
              <div className="flex gap-2 items-end">
                <div className="flex-1"><Label>Latitud</Label><Input value={latitud ?? ""} readOnly /></div>
                <div className="flex-1"><Label>Longitud</Label><Input value={longitud ?? ""} readOnly /></div>
                <Button type="button" variant="outline" onClick={captureGps} disabled={gpsBusy}>
                  {gpsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                  GPS
                </Button>
              </div>
              {precisionMetros != null && <p className="text-xs text-muted-foreground">Precisión GPS: ±{precisionMetros} m</p>}
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
                  {c.email && <p className="text-xs text-muted-foreground truncate">✉️ {c.email}</p>}
                  {c.direccion && <p className="text-xs text-muted-foreground line-clamp-2">📍 {c.direccion}</p>}
                  <div>
                    {c.user_id ? (
                      <Badge variant="outline" className="border-success text-success text-xs">
                        🔗 Cuenta vinculada
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-muted-foreground text-muted-foreground text-xs">
                        Sin cuenta de acceso
                      </Badge>
                    )}
                  </div>
                  <UbicacionGps
                    clienteId={c.id}
                    empresa={c.empresa}
                    latitud={c.latitud}
                    longitud={c.longitud}
                    precisionMetros={c.precision_metros ?? null}
                    capturadoEn={c.gps_capturado_en ?? null}
                    onGuardado={load}
                  />
                  <div className="flex gap-2 pt-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPedidosCliente(c)}>
                      <Package className="h-3 w-3" /> Ver pedidos
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!c.lista_precio_id || onboardingBusyId === c.id}
                      title={c.lista_precio_id ? "Generar onboarding con snapshot de precios" : "Asigná una lista de precios"}
                      onClick={() => prepararOnboarding(c)}
                    >
                      {onboardingBusyId === c.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <MessageCircle className="h-3 w-3" />}
                      Onboarding
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

      <Dialog open={!!pedidosCliente} onOpenChange={(o) => !o && setPedidosCliente(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="industrial-title">
              Pedidos de {pedidosCliente?.empresa}
            </DialogTitle>
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

      <OnboardingComercialPreview
        data={onboardingActual}
        onClose={() => setOnboardingActual(null)}
        onWhatsapp={abrirWhatsappOnboarding}
      />
    </div>
  );
}
