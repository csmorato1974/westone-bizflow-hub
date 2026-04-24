import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  borrador: "Borrador",
  enviado: "Enviado",
  aprobado: "Aprobado",
  listo_despacho: "Listo despacho",
  en_ruta: "En ruta",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

const STYLES: Record<string, string> = {
  borrador: "bg-muted text-muted-foreground",
  enviado: "bg-info text-info-foreground",
  aprobado: "bg-brand text-brand-foreground",
  listo_despacho: "bg-warning text-warning-foreground",
  en_ruta: "bg-info text-info-foreground",
  entregado: "bg-success text-success-foreground",
  cancelado: "bg-destructive text-destructive-foreground",
};

export function EstadoBadge({ estado }: { estado: string }) {
  return (
    <Badge className={cn("font-semibold uppercase tracking-wide border-0", STYLES[estado])}>
      {LABELS[estado] ?? estado}
    </Badge>
  );
}
