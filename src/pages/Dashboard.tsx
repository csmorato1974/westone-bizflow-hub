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
    })();
  }, [user]);

  const cards = [
    { label: "Clientes", value: stats.clientes, icon: Users, link: hasRole("vendedor") ? "/app/clientes" : "/app/admin/clientes", show: isAdmin || hasRole("vendedor") },
    { label: "Pedidos", value: stats.pedidos, icon: ShoppingCart, link: hasRole("cliente") ? "/app/mis-pedidos" : hasRole("vendedor") ? "/app/pedidos" : "/app/admin/pedidos", show: true },
    { label: "Por aprobar", value: stats.pendientes, icon: Package, link: "/app/admin/pedidos", show: isAdmin },
    { label: "En despacho", value: stats.despachos, icon: Truck, link: "/app/logistica", show: isAdmin || hasRole("logistica") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="industrial-title text-3xl">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Resumen operativo de Westone Performance</p>
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {cards.filter(c => c.show).map((c) => (
          <Link key={c.label} to={c.link}>
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
        ))}
      </div>
    </div>
  );
}
