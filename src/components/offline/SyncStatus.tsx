import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getOfflineStats, type OfflineStats } from "@/lib/offlineDb";
import { useConnectivity } from "@/hooks/useConnectivity";

const EMPTY: OfflineStats = { clientes: 0, catalogo: 0, pendientes: 0, ultimaSincronizacion: null };

function formatDate(value: string | null) {
  if (!value) return "Nunca";
  try {
    return new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

export function SyncStatus() {
  const { user } = useAuth();
  const online = useConnectivity();
  const [stats, setStats] = useState<OfflineStats>(EMPTY);
  const [refreshing, setRefreshing] = useState(false);

  const refreshStats = async () => {
    if (!user) return setStats(EMPTY);
    setStats(await getOfflineStats(user.id));
  };

  useEffect(() => {
    void refreshStats();
    const handler = () => void refreshStats();
    window.addEventListener("westone:offline-stats", handler);
    window.addEventListener("online", handler);
    window.addEventListener("offline", handler);
    return () => {
      window.removeEventListener("westone:offline-stats", handler);
      window.removeEventListener("online", handler);
      window.removeEventListener("offline", handler);
    };
  }, [user?.id]);

  const syncNow = async () => {
    if (!online) return;
    setRefreshing(true);
    window.dispatchEvent(new CustomEvent("westone:sync-request"));
    window.setTimeout(async () => {
      await refreshStats();
      setRefreshing(false);
    }, 700);
  };

  const label = online
    ? stats.pendientes > 0 ? `${stats.pendientes} pendientes` : "En línea"
    : "Sin conexión";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-brand hover:bg-primary/80 hover:text-brand">
          {online ? <Cloud className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}
          <span className="hidden md:inline text-xs">{label}</span>
          {stats.pendientes > 0 && <Badge className="h-5 min-w-5 justify-center px-1.5 bg-brand text-brand-foreground">{stats.pendientes}</Badge>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Sincronización</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Estado</span>
            <span className="font-medium">{online ? "En línea" : "Sin conexión"}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border p-3 text-center"><p className="text-xl font-semibold">{stats.clientes}</p><p className="text-xs text-muted-foreground">Clientes</p></div>
            <div className="rounded-md border p-3 text-center"><p className="text-xl font-semibold">{stats.catalogo}</p><p className="text-xs text-muted-foreground">Productos</p></div>
            <div className="rounded-md border p-3 text-center"><p className="text-xl font-semibold">{stats.pendientes}</p><p className="text-xs text-muted-foreground">Pendientes</p></div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Última sincronización</span>
            <span className="text-right font-medium">{formatDate(stats.ultimaSincronizacion)}</span>
          </div>
          <Button className="w-full" variant="outline" onClick={syncNow} disabled={!online || refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            {online ? "Sincronizar ahora" : "Conéctate para sincronizar"}
          </Button>
          {!online && <p className="text-xs text-muted-foreground">Puedes consultar los datos que ya fueron sincronizados en este dispositivo.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
