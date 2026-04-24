import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface Cliente { id: string; empresa: string; contacto: string; celular: string; vendedor_id: string | null; lista_precio_id: string | null; }
interface User { id: string; full_name: string | null; email: string | null; }

export default function AdminClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vendedores, setVendedores] = useState<User[]>([]);
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
    setVendedores((profs ?? []).filter((p: any) => vIds.has(p.id)));
    setListas(lp ?? []);
    setClientes(cs ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const update = async (id: string, patch: Partial<Cliente>) => {
    const { error } = await supabase.from("clientes").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Actualizado"); load();
  };

  return (
    <div className="space-y-4">
      <div><h1 className="industrial-title text-3xl">Clientes</h1><p className="text-sm text-muted-foreground">Vista global · asignar vendedor, lista de precios y usuario</p></div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
        <div className="grid gap-3">
          {clientes.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4 grid md:grid-cols-2 gap-3">
                <div>
                  <p className="industrial-title">{c.empresa}</p>
                  <p className="text-sm text-muted-foreground">{c.contacto} · {c.celular}</p>
                </div>
                <div className="grid gap-2">
                  <Select value={c.vendedor_id ?? ""} onValueChange={(v) => update(c.id, { vendedor_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
                    <SelectContent>{vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.full_name ?? v.email}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={c.lista_precio_id ?? ""} onValueChange={(v) => update(c.id, { lista_precio_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Lista de precios" /></SelectTrigger>
                    <SelectContent>{listas.map((l) => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={c.user_id ?? ""} onValueChange={(v) => update(c.id, { user_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Usuario portal cliente (opcional)" /></SelectTrigger>
                    <SelectContent>{clientesUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
