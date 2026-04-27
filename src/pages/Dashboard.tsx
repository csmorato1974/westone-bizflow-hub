import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Package, ShoppingCart, Truck, AlertCircle, ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Motivo =
  | "sin_rol"
  | "sin_ficha"
  | "sin_lista"
  | "sin_vendedor"
  | "ficha_sin_usuario"
  | "sin_direccion";

const MOTIVO_LABEL: Record<Motivo, string> = {
  sin_rol: "Sin rol asignado",
  sin_ficha: "Sin ficha de cliente vinculada",
  sin_lista: "Sin lista de precios",
  sin_vendedor: "Sin vendedor asignado",
  ficha_sin_usuario: "Ficha sin usuario vinculado",
  sin_direccion: "Sin dirección",
};

// Solo estos motivos disparan la alerta roja. "sin_direccion" es informativo.
const MOTIVOS_CRITICOS: Motivo[] = [
  "sin_rol",
  "sin_ficha",
  "sin_lista",
  "sin_vendedor",
  "ficha_sin_usuario",
];

interface PerfilPendiente {
  user_id: string | null; // null cuando es una ficha huérfana sin usuario
  cliente_id: string | null;
  full_name: string | null;
  email: string | null;
  motivos: Motivo[];
}

type PendientesState =
  | { status: "loading" }
  | { status: "ok"; perfiles: PerfilPendiente[] }
  | { status: "error" };

export default function Dashboard() {
  const { isAdmin, hasRole, user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<{ clientes: number; pedidos: number; pendientes: number; despachos: number }>({
    clientes: 0, pedidos: 0, pendientes: 0, despachos: 0,
  });
  const [pendientes, setPendientes] = useState<PendientesState>({ status: "loading" });
  const [popoverOpen, setPopoverOpen] = useState(false);

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

    // Calcula perfiles "pendientes de configurar" con sus motivos (multimodal):
    //  - sin_rol: 0 roles
    //  - sin_ficha: rol cliente y no hay registro en clientes
    //  - sin_direccion / sin_lista / sin_vendedor: rol cliente con ficha pero campos vacíos
    const calcularPendientes = async () => {
      try {
        const [{ data: profs, error: e1 }, { data: roles, error: e2 }, { data: clientesRows, error: e3 }] =
          await Promise.all([
            supabase.from("profiles").select("id, full_name, email"),
            supabase.from("user_roles").select("user_id, role"),
            supabase.from("clientes").select("id, user_id, direccion, lista_precio_id, vendedor_id, empresa, contacto, email"),
          ]);
        if (e1 || e2 || e3) throw (e1 || e2 || e3);

        const rolesByUser = new Map<string, string[]>();
        (roles ?? []).forEach((r: any) => {
          const arr = rolesByUser.get(r.user_id) ?? [];
          arr.push(r.role);
          rolesByUser.set(r.user_id, arr);
        });

        const clientesByUser = new Map<string, { id: string; direccion: string | null; lista_precio_id: string | null; vendedor_id: string | null }>();
        (clientesRows ?? []).forEach((c: any) => {
          if (c.user_id) clientesByUser.set(c.user_id, c);
        });

        const perfiles: PerfilPendiente[] = [];

        // 1) Perfiles (usuarios) con problemas de configuración
        (profs ?? []).forEach((p: any) => {
          const rls = rolesByUser.get(p.id) ?? [];
          const motivos: Motivo[] = [];

          if (rls.length === 0) {
            motivos.push("sin_rol");
          } else if (rls.length === 1 && rls[0] === "cliente") {
            const ficha = clientesByUser.get(p.id);
            if (!ficha) {
              motivos.push("sin_ficha");
            } else {
              if (!ficha.lista_precio_id) motivos.push("sin_lista");
              if (!ficha.vendedor_id) motivos.push("sin_vendedor");
              // Dirección es informativa, no crítica
              if (!ficha.direccion || !ficha.direccion.trim()) motivos.push("sin_direccion");
            }
          }

          // Solo se incluye si tiene al menos un motivo crítico
          const tieneCritico = motivos.some((m) => MOTIVOS_CRITICOS.includes(m));
          if (tieneCritico) {
            const ficha = clientesByUser.get(p.id);
            perfiles.push({
              user_id: p.id,
              cliente_id: ficha?.id ?? null,
              full_name: p.full_name,
              email: p.email,
              motivos,
            });
          }
        });

        // 2) Fichas de clientes huérfanas (sin user_id vinculado)
        (clientesRows ?? []).forEach((c: any) => {
          if (!c.user_id) {
            perfiles.push({
              user_id: null,
              cliente_id: c.id,
              full_name: (c as any).empresa ?? (c as any).contacto ?? "(ficha sin usuario)",
              email: (c as any).email ?? null,
              motivos: ["ficha_sin_usuario"],
            });
          }
        });

        if (!cancelled) setPendientes({ status: "ok", perfiles });
      } catch (err) {
        console.error("[Dashboard] Error calculando perfiles pendientes:", err);
        if (!cancelled) setPendientes({ status: "error" });
      }
    };

    cargarStats();
    if (isAdmin) calcularPendientes();

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

  const irAResolver = (perfil: PerfilPendiente) => {
    setPopoverOpen(false);
    // Si el problema es de ficha comercial y existe ficha → ir a Clientes con focus
    const necesitaClientes =
      perfil.cliente_id &&
      perfil.motivos.some((m) => m === "sin_direccion" || m === "sin_lista" || m === "sin_vendedor");
    if (necesitaClientes) {
      navigate(`/app/admin/clientes?focus=${perfil.cliente_id}`);
    } else {
      navigate(`/app/admin/usuarios?focus=${perfil.user_id}`);
    }
  };

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
    if (pendientes.perfiles.length > 0) {
      return (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="absolute -top-2 -right-2 z-20"
              aria-label={`${pendientes.perfiles.length} perfiles pendientes de configurar`}
              onPointerDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold px-2 shadow-lg animate-pulse ring-2 ring-background cursor-pointer">
                {pendientes.perfiles.length}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[360px] p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-2 border-b p-3">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold leading-tight">
                  {pendientes.perfiles.length} perfil{pendientes.perfiles.length === 1 ? "" : "es"} requiere{pendientes.perfiles.length === 1 ? "" : "n"} configuración
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cuentas nuevas o fichas incompletas
                </p>
              </div>
            </div>
            <div className="max-h-[320px] overflow-y-auto divide-y">
              {pendientes.perfiles.map((p) => (
                <div key={p.user_id} className="p-3 space-y-2">
                  <div>
                    <p className="text-sm font-medium leading-tight">
                      {p.full_name ?? "(sin nombre)"}
                    </p>
                    {p.email && (
                      <p className="text-[11px] text-muted-foreground truncate">{p.email}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.motivos.map((m) => (
                      <Badge
                        key={m}
                        variant="outline"
                        className="text-[10px] border-destructive/40 text-destructive bg-destructive/5 px-1.5 py-0"
                      >
                        {MOTIVO_LABEL[m]}
                      </Badge>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 w-full justify-center"
                    onClick={() => irAResolver(p)}
                  >
                    Configurar <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="border-t p-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs w-full justify-center"
                onClick={() => {
                  setPopoverOpen(false);
                  navigate("/app/admin/usuarios?filter=pendientes");
                }}
              >
                Ver todos en Usuarios
              </Button>
            </div>
          </PopoverContent>
        </Popover>
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
