import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, X, Search, MessageCircle, Mail } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { useAuth } from "@/contexts/AuthContext";
import { waLink } from "@/lib/whatsapp";
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

type AppRole = "super_admin" | "admin" | "vendedor" | "logistica" | "cliente";
const ROLES: AppRole[] = ["super_admin", "admin", "vendedor", "logistica", "cliente"];

interface Row { id: string; full_name: string | null; email: string | null; phone: string | null; roles: AppRole[]; }

export default function AdminUsuarios() {
  const { user, hasRole } = useAuth();
  const isSuper = hasRole("super_admin");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<Record<string, AppRole>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState<AppRole | "all" | "sin_rol">("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: profs }, { data: ur }] = await Promise.all([
      supabase.from("profiles").select("id,full_name,email").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    const byUser = new Map<string, AppRole[]>();
    (ur ?? []).forEach((r: any) => { const a = byUser.get(r.user_id) ?? []; a.push(r.role); byUser.set(r.user_id, a); });
    setRows((profs ?? []).map((p: any) => ({ ...p, roles: byUser.get(p.id) ?? [] })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const addRole = async (userId: string, role: AppRole) => {
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) return toast.error(error.message);
    await logAudit("asignar_rol", "user_roles", userId, { role });
    toast.success("Rol asignado"); load();
  };
  const removeRole = async (userId: string, role: AppRole) => {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
    if (error) return toast.error(error.message);
    await logAudit("quitar_rol", "user_roles", userId, { role });
    toast.success("Rol removido"); load();
  };

  const deleteUser = async (userId: string) => {
    setDeletingId(userId);
    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { user_id: userId },
    });
    setDeletingId(null);
    if (error) return toast.error(error.message);
    if (data?.error) return toast.error(data.error);
    toast.success("Usuario eliminado");
    load();
  };

  const filteredRows = rows.filter((r) => {
    if (filterRole === "sin_rol" && r.roles.length !== 0) return false;
    if (filterRole !== "all" && filterRole !== "sin_rol" && !r.roles.includes(filterRole)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = (r.full_name ?? "").toLowerCase();
      const email = (r.email ?? "").toLowerCase();
      if (!name.includes(q) && !email.includes(q)) return false;
    }
    return true;
  });

  const counts = ROLES.reduce<Record<string, number>>((acc, rl) => {
    acc[rl] = rows.filter((r) => r.roles.includes(rl)).length;
    return acc;
  }, {});
  const sinRolCount = rows.filter((r) => r.roles.length === 0).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="industrial-title text-3xl">Usuarios y Roles</h1>
        <p className="text-sm text-muted-foreground">Asigna roles para controlar el acceso a los módulos</p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterRole} onValueChange={(v) => setFilterRole(v as AppRole | "all" | "sin_rol")}>
            <SelectTrigger className="md:w-64">
              <SelectValue placeholder="Filtrar por categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos ({rows.length})</SelectItem>
              {ROLES.map((rl) => (
                <SelectItem key={rl} value={rl}>
                  {rl} ({counts[rl] ?? 0})
                </SelectItem>
              ))}
              <SelectItem value="sin_rol">Sin rol ({sinRolCount})</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
        <div className="grid gap-3">
          <p className="text-xs text-muted-foreground">
            Mostrando {filteredRows.length} de {rows.length} usuarios
          </p>
          {filteredRows.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold">{r.full_name ?? "(sin nombre)"}</p>
                    <p className="text-xs text-muted-foreground">{r.email}</p>
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    {r.roles.map((rl) => (
                      <Badge key={rl} className="bg-brand text-brand-foreground gap-1">
                        {rl}
                        <button onClick={() => removeRole(r.id, rl)} aria-label="quitar"><X className="h-3 w-3" /></button>
                      </Badge>
                    ))}
                    {r.roles.length === 0 && <span className="text-xs text-muted-foreground">Sin roles</span>}
                  </div>
                </div>
                <div className="flex gap-2 pt-2 border-t flex-wrap">
                  <Select value={adding[r.id] ?? ""} onValueChange={(v) => setAdding({ ...adding, [r.id]: v as AppRole })}>
                    <SelectTrigger className="max-w-xs"><SelectValue placeholder="Agregar rol…" /></SelectTrigger>
                    <SelectContent>
                      {ROLES.filter((rl) => !r.roles.includes(rl)).map((rl) => <SelectItem key={rl} value={rl}>{rl}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={!adding[r.id]} onClick={() => { addRole(r.id, adding[r.id]); setAdding({ ...adding, [r.id]: undefined as any }); }} className="bg-primary text-brand">
                    <Plus className="h-4 w-4" /> Asignar
                  </Button>
                  {isSuper && r.id !== user?.id && !r.roles.includes("super_admin") && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive" className="ml-auto" disabled={deletingId === r.id}>
                          {deletingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Eliminar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar este usuario?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Se eliminará permanentemente la cuenta de <strong>{r.full_name ?? r.email}</strong>, sus roles, perfil y notificaciones. Esta acción no se puede deshacer.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteUser(r.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
