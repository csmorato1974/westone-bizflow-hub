import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Package, ShoppingCart, Truck, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { WhatsAppFloatingButton } from "@/components/WhatsAppFloatingButton";
import { DashboardComercial } from "@/components/dashboard/DashboardComercial";

export default function Dashboard() {
  const { isAdmin, hasRole, user } = useAuth();
  const [stats, setStats] = useState({ clientes: 0, pedidos: 0, pendientes: 0, despachos: 0 });
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const cargar = async () => {
      const res = await Promise.all([
        supabase.from("clientes").select("*", { count: "exact", head: true }),
        supabase.from("pedidos").select("*", { count: "exact", head: true }),
        supabase.from("pedidos").select("*", { count: "exact", head: true }).in("estado", ["enviado", "aprobado"]),
        supabase.from("pedidos").select("*", { count: "exact", head: true }).in("estado", ["listo_despacho", "en_ruta"]),
      ]);
      if (cancelled) return;
      const fallo = res.find((r) => r.error);
      if (fallo) { setStatsError(true); return; }
      setStatsError(false);
      const [clientes, pedidos, pendientes, despachos] = res.map((r) => r.count ?? 0);
      setStats({ clientes, pedidos, pendientes, despachos });
    };
    cargar();
    return () => { cancelled = true; };
  }, [user]);

  const cards = [
    { key: "clientes", label: "Clientes", value: stats.clientes, icon: Users, link: hasRole("vendedor") ? "/app/clientes" : "/app/admin/clientes", show: isAdmin || hasRole("vendedor") },
    { key: "pedidos", label: "Pedidos", value: stats.pedidos, icon: ShoppingCart, link: hasRole("cliente") ? "/app/mis-pedidos" : hasRole("vendedor") ? "/app/pedidos" : "/app/admin/pedidos", show: true },
    { key: "por_aprobar", label: "Por aprobar", value: stats.pendientes, icon: Package, link: "/app/admin/pedidos", show: isAdmin },
    { key: "despachos", label: "En despacho", value: stats.despachos, icon: Truck, link: "/app/logistica", show: isAdmin || hasRole("logistica") },
  ];

  const puedeVerInteligencia = isAdmin || hasRole("vendedor");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="industrial-title text-3xl">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Resumen operativo e inteligencia comercial de Westone Performance</p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {cards.filter((c) => c.show).map((c) => (
          <Link key={c.key} to={c.link}>
            <Card className="hover:border-brand transition-colors cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{c.label}</CardTitle>
                <c.icon className="h-5 w-5 text-brand" />
              </CardHeader>
              <CardContent>
                {statsError ? (
                  <div className="flex items-center gap-1.5 text-destructive"><AlertCircle className="h-5 w-5"/><span className="text-sm font-medium">Sin datos</span></div>
                ) : <div className="text-3xl font-display font-bold">{c.value}</div>}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {puedeVerInteligencia && <DashboardComercial />}
      <WhatsAppFloatingButton />
    </div>
  );
}
