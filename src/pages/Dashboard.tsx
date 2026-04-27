import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Package, ShoppingCart, Truck } from "lucide-react";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const { isAdmin, hasRole, user } = useAuth();
  const [stats, setStats] = useState<{ clientes: number; pedidos: number; pendientes: number; despachos: number }>({
    clientes: 0, pedidos: 0, pendientes: 0, despachos: 0,
  });
  const [perfilesPendientes, setPerfilesPendientes] = useState(0);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const [{ count: clientes }, { count: pedidos }, { count: pendientes }, { count: despachos }] = await Promise.all([
        supabase.from("clientes").select("*", { count: "exact", head: true }),
        supabase.from("pedidos").select("*", { count: "exact", head: true }),
        supabase.from("pedidos").select("*", { count: "exact", head: true }).in("estado", ["enviado", "aprobado"]),
        supabase.from("pedidos").select("*", { count: "exact", head: true }).in("estado", ["listo_despacho", "en_ruta"]),
      ]);
      setStats({ clientes: clientes ?? 0, pedidos: pedidos ?? 0, pendientes: pendientes ?? 0, despachos: despachos ?? 0 });

      // Conteo de perfiles pendientes de configurar (solo admin/super_admin).
      // Un perfil está "pendiente" si:
      //  (a) no tiene ningún rol asignado, o
      //  (b) solo tiene el rol 'cliente' por defecto (auto-asignado por el trigger)
      //      y aún no fue vinculado a una ficha en la tabla 'clientes'.
      if (isAdmin) {
        const [{ data: profs }, { data: roles }, { data: clientesRows }] = await Promise.all([
          supabase.from("profiles").select("id"),
          supabase.from("user_roles").select("user_id, role"),
          supabase.from("clientes").select("user_id"),
        ]);
        const rolesByUser = new Map<string, string[]>();
        (roles ?? []).forEach((r: any) => {
          const arr = rolesByUser.get(r.user_id) ?? [];
          arr.push(r.role);
          rolesByUser.set(r.user_id, arr);
        });
        const clientesVinculados = new Set(
          (clientesRows ?? []).map((c: any) => c.user_id).filter(Boolean)
        );
        const sinConfigurar = (profs ?? []).filter((p: any) => {
          const rls = rolesByUser.get(p.id) ?? [];
          if (rls.length === 0) return true;
          if (rls.length === 1 && rls[0] === "cliente" && !clientesVinculados.has(p.id)) return true;
          return false;
        }).length;
        setPerfilesPendientes(sinConfigurar);
      }
    })();
  }, [user, isAdmin]);

  const cards = [
    { label: "Clientes", value: stats.clientes, icon: Users, link: hasRole("vendedor") ? "/app/clientes" : "/app/admin/clientes", show: isAdmin || hasRole("vendedor"), badge: isAdmin ? perfilesPendientes : 0 },
    { label: "Pedidos", value: stats.pedidos, icon: ShoppingCart, link: hasRole("cliente") ? "/app/mis-pedidos" : hasRole("vendedor") ? "/app/pedidos" : "/app/admin/pedidos", show: true, badge: 0 },
    { label: "Por aprobar", value: stats.pendientes, icon: Package, link: "/app/admin/pedidos", show: isAdmin, badge: 0 },
    { label: "En despacho", value: stats.despachos, icon: Truck, link: "/app/logistica", show: isAdmin || hasRole("logistica"), badge: 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="industrial-title text-3xl">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Resumen operativo de Westone Performance</p>
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {cards.filter(c => c.show).map((c) => (
          <div key={c.label} className="relative">
            <Link to={c.link}>
              <Card className="hover:border-brand transition-colors cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{c.label}</CardTitle>
                  <c.icon className="h-5 w-5 text-brand" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-display font-bold">{c.value}</div>
                </CardContent>
              </Card>
            </Link>
            {c.badge > 0 && (
              <Link
                to="/app/admin/usuarios?filter=sin_rol"
                className="absolute -top-2 -right-2 z-10"
                title={`${c.badge} perfil(es) nuevo(s) pendiente(s) de configurar`}
              >
                <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold px-2 shadow-lg animate-pulse ring-2 ring-background">
                  {c.badge}
                </span>
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
