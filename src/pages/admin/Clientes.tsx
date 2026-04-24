import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

interface Cliente { id: string; empresa: string; contacto: string; celular: string; vendedor_id: string | null; lista_precio_id: string | null; user_id: string | null; }
interface User { id: string; full_name: string | null; email: string | null; }

const UNASSIGNED = "__none__";

export default function AdminClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vendedores, setVendedores] = useState<User[]>([]);
  const [clientesUsers, setClientesUsers] = useState<User[]>([]);
  const [listas, setListas] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: cs }, { data: ur }, { data: lp }, { data: profs }] = await Promise.all([
      supabase.from("clientes").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id,role"),
      supabase.from("listas_precios").select("id,nombre").eq("activa", true),
      supabase.from("profiles").select("id,full_name,email"),
    ]);
    const vIds = new Set((ur ?? []).filter((r: any) => r.role === "vendedor").map((r: any) => r.user_id));
    const cIds = new Set((ur ?? []).filter((r: any) => r.role === "cliente").map((r: any) => r.user_id));
    setVendedores((profs ?? []).filter((p: any) => vIds.has(p.id)));
    setClientesUsers((profs ?? []).filter((p: any) => cIds.has(p.id)));
    setListas(lp ?? []);
    setClientes(cs ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const update = async (c: Cliente, patch: Partial<Cliente>) => {
    const normalized: Partial<Cliente> = { ...patch };
    if ("user_id" in patch) normalized.user_id = patch.user_id === UNASSIGNED ? null : patch.user_id;
    if ("vendedor_id" in patch) normalized.vendedor_id = patch.vendedor_id === UNASSIGNED ? null : patch.vendedor_id;
    if ("lista_precio_id" in patch) normalized.lista_precio_id = patch.lista_precio_id === UNASSIGNED ? null : patch.lista_precio_id;

    const { error } = await supabase.from("clientes").update(normalized).eq("id", c.id);
    if (error) return toast.error(error.message);

    if ("user_id" in normalized) {
      await logAudit("vincular_usuario_cliente", "clientes", c.id, {
        empresa: c.empresa,
        anterior_user_id: c.user_id,
        nuevo_user_id: normalized.user_id,
      });
    }
    toast.success("Actualizado");
    load();
  };

  // user_id ya tomados por OTRAS fichas (para no duplicar vinculación)
  const takenUserIds = new Set(clientes.filter((c) => c.user_id).map((c) => c.user_id as string));

  return (
    <div className="space-y-4">
      <div><h1 className="industrial-title text-3xl">Clientes</h1><p className="text-sm text-muted-foreground">Vista global · asignar vendedor, lista de precios y usuario portal</p></div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
        <div className="grid gap-3">
          {clientes.map((c) => {
            const availableUsers = clientesUsers.filter((u) => u.id === c.user_id || !takenUserIds.has(u.id));
            return (
              <Card key={c.id}>
                <CardContent className="p-4 grid md:grid-cols-2 gap-3">
                  <div>
                    <p className="industrial-title">{c.empresa}</p>
                    <p className="text-sm text-muted-foreground">{c.contacto} · {c.celular}</p>
                    {c.user_id ? (
                      <p className="text-xs text-success mt-1">✓ Vinculado a usuario portal</p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">Sin usuario portal vinculado</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Select value={c.vendedor_id ?? UNASSIGNED} onValueChange={(v) => update(c, { vendedor_id: v as any })}>
                      <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>— Sin asignar —</SelectItem>
                        {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.full_name ?? v.email}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={c.lista_precio_id ?? UNASSIGNED} onValueChange={(v) => update(c, { lista_precio_id: v as any })}>
                      <SelectTrigger><SelectValue placeholder="Lista de precios" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>— Sin lista —</SelectItem>
                        {listas.map((l) => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={c.user_id ?? UNASSIGNED} onValueChange={(v) => update(c, { user_id: v as any })}>
                      <SelectTrigger><SelectValue placeholder="Usuario portal cliente" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>— Sin vincular —</SelectItem>
                        {availableUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email}</SelectItem>)}
                      </SelectContent>
                    </Select>
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
