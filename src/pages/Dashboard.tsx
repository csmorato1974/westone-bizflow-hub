import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Package, ShoppingCart, Truck } from "lucide-react";
import { Link } from "react-router-dom";

type PendientesState =
  | { status: "loading" }
  | { status: "ok"; count: number }
  | { status: "error" };

export default function Dashboard() {
  const { isAdmin, hasRole, user } = useAuth();
  const [stats, setStats] = useState<{ clientes: number; pedidos: number; pendientes: number; despachos: number }>({
    clientes: 0, pedidos: 0, pendientes: 0, despachos: 0,
  });
  const [pendientes, setPendientes] = useState<PendientesState>({ status: "loading" });

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const cargarStats = async () => {
      const [{ count: clientes }, { count: pedidos }, { count: pend }, { count: despachos }] = await Promise.all([
        supabase.from("clientes").select("*", { count: "exact", head: true }),
        supabase.from("pedidos").select("*", { count: "exact", head: true }),
        supabase.from("pedidos").select("*", { count: "exact", head: true }).in("estado", ["enviado", "aprobado"]),
        supabase.from("pedidos").select("*", { count: "exact", head: true }).in("estado", ["listo_despacho", "en_ruta"]),
      ]);
      if (cancelled) return;
      setStats({ clientes: clientes ?? 0, pedidos: pedidos ?? 0, pendientes: pend ?? 0, despachos: despachos ?? 0 });
    };

    // Calcula perfiles "pendientes de configurar":
    //  A) sin ningún rol asignado, o
    //  B) solo rol 'cliente' y SIN ficha en 'clientes', o
    //  C) solo rol 'cliente' CON ficha pero ficha incompleta (falta dirección, lista de precio o vendedor).
    const calcularPendientes = async () => {
      try {
        const [{ data: profs, error: e1 }, { data: roles, error: e2 }, { data: clientesRows, error: e3 }] =
          await Promise.all([
            supabase.from("profiles").select("id"),
            supabase.from("user_roles").select("user_id, role"),
            supabase.from("clientes").select("user_id, direccion, lista_precio_id, vendedor_id"),
          ]);
        if (e1 || e2 || e3) throw (e1 || e2 || e3);

        const rolesByUser = new Map<string, string[]>();
        (roles ?? []).forEach((r: any) => {
          const arr = rolesByUser.get(r.user_id) ?? [];
          arr.push(r.role);
          rolesByUser.set(r.user_id, arr);
        });

        const clientesByUser = new Map<string, { direccion: string | null; lista_precio_id: string | null; vendedor_id: string | null }>();
        (clientesRows ?? []).forEach((c: any) => {
          if (c.user_id) clientesByUser.set(c.user_id, c);
        });

        const count = (profs ?? []).filter((p: any) => {
          const rls = rolesByUser.get(p.id) ?? [];
          // A) sin rol
          if (rls.length === 0) return true;
          // Solo si únicamente tiene 'cliente'
          if (rls.length === 1 && rls[0] === "cliente") {
            const ficha = clientesByUser.get(p.id);
            // B) sin ficha
            if (!ficha) return true;
            // C) ficha incompleta
            if (!ficha.direccion || !ficha.lista_precio_id || !ficha.vendedor_id) return true;
          }
          return false;
        }).length;

        if (!cancelled) setPendientes({ status: "ok", count });
      } catch (err) {
        console.error("[Dashboard] Error calculando perfiles pendientes:", err);
        if (!cancelled) setPendientes({ status: "error" });
      }
    };

    cargarStats();
    if (isAdmin) calcularPendientes();

    // Realtime: recalcular cuando cambien profiles, user_roles o clientes
    const channel = isAdmin
      ? supabase
          .channel("dashboard-pendientes")
          .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => calcularPendientes())
          .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => calcularPendientes())
          .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, () => {
            calcularPendientes();
            cargarStats();
          })
          .subscribe()
      : null;

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [user, isAdmin]);

  const cards = [
    { key: "clientes", label: "Clientes", value: stats.clientes, icon: Users, link: hasRole("vendedor") ? "/app/clientes" : "/app/admin/clientes", show: isAdmin || hasRole("vendedor") },
    { key: "pedidos", label: "Pedidos", value: stats.pedidos, icon: ShoppingCart, link: hasRole("cliente") ? "/app/mis-pedidos" : hasRole("vendedor") ? "/app/pedidos" : "/app/admin/pedidos", show: true },
    { key: "por_aprobar", label: "Por aprobar", value: stats.pendientes, icon: Package, link: "/app/admin/pedidos", show: isAdmin },
    { key: "despachos", label: "En despacho", value: stats.despachos, icon: Truck, link: "/app/logistica", show: isAdmin || hasRole("logistica") },
  ];

  const renderIndicadorPendientes = () => {
    if (!isAdmin) return null;
    if (pendientes.status === "loading") {
      return (
        <span
          className="absolute -top-2 -right-2 z-10 flex h-7 min-w-7 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-bold px-2 shadow ring-2 ring-background"
          title="Verificando perfiles pendientes…"
        >
          …
        </span>
      );
    }
    if (pendientes.status === "error") {
      return (
        <span
          className="absolute -top-2 -right-2 z-10 flex h-7 min-w-7 items-center justify-center rounded-full bg-muted text-foreground text-xs font-bold px-2 shadow ring-2 ring-background"
          title="No se pudo verificar perfiles pendientes"
        >
          !
        </span>
      );
    }
    if (pendientes.count > 0) {
      return (
        <Link
          to="/app/admin/usuarios?filter=pendientes"
          className="absolute -top-2 -right-2 z-10"
          title={`${pendientes.count} perfil(es) pendiente(s) de configurar`}
        >
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold px-2 shadow-lg animate-pulse ring-2 ring-background">
            {pendientes.count}
          </span>
        </Link>
      );
    }
    // count === 0 → indicador discreto verde
    return (
      <span
        className="absolute -top-1 -right-1 z-10 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-background shadow"
        title="Sin perfiles pendientes de configurar"
      />
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="industrial-title text-3xl">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Resumen operativo de Westone Performance</p>
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {cards.filter(c => c.show).map((c) => (
          <div key={c.key} className="relative">
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
            {c.key === "clientes" && renderIndicadorPendientes()}
          </div>
        ))}
      </div>
    </div>
  );
}
