import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface Desfase {
  user_id: string;
  email_auth: string | null;
  email_profile: string | null;
}

interface Informe {
  total_revisados: number;
  desfases: Desfase[];
}

/** Herramienta de super admin: compara el email de la cuenta con el del perfil y lo corrige. */
export function ReconciliarEmails() {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [informe, setInforme] = useState<Informe | null>(null);
  const [aplicado, setAplicado] = useState<number | null>(null);

  const run = async (modo: "informe" | "aplicar") => {
    if (modo === "informe") setLoading(true);
    else setApplying(true);

    const { data, error } = await supabase.functions.invoke("reconciliar-emails", {
      body: { modo },
    });

    setLoading(false);
    setApplying(false);

    if (error || data?.error) {
      return toast.error(data?.error ?? "No se pudo ejecutar la reconciliación");
    }

    if (modo === "informe") {
      setAplicado(null);
      setInforme({
        total_revisados: data?.total_revisados ?? 0,
        desfases: (data?.desfases ?? []) as Desfase[],
      });
      toast.success("Informe generado");
    } else {
      setAplicado(data?.actualizados ?? 0);
      setInforme(null);
      toast.success(`Perfiles corregidos: ${data?.actualizados ?? 0}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="industrial-title text-lg flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-brand" />
          Reconciliar emails de acceso
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Compara el email real de cada cuenta con el guardado en su perfil. Primero generá el informe;
          los cambios sólo se aplican cuando lo confirmás.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => run("informe")} disabled={loading || applying}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1">Generar informe</span>
          </Button>
          {informe && informe.desfases.length > 0 && (
            <Button
              className="bg-brand text-brand-foreground hover:bg-brand-dark"
              onClick={() => run("aplicar")}
              disabled={applying}
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className="ml-1">Aplicar corrección ({informe.desfases.length})</span>
            </Button>
          )}
        </div>

        {aplicado !== null && (
          <p className="text-sm">
            Corrección aplicada. Perfiles actualizados: <strong>{aplicado}</strong>
          </p>
        )}

        {informe && (
          <div className="space-y-2">
            <p className="text-sm">
              Cuentas revisadas: <strong>{informe.total_revisados}</strong> · Desfases:{" "}
              <Badge variant={informe.desfases.length ? "destructive" : "secondary"}>
                {informe.desfases.length}
              </Badge>
            </p>
            {informe.desfases.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-md border divide-y">
                {informe.desfases.map((d) => (
                  <div key={d.user_id} className="p-2 text-xs">
                    <div className="font-medium">{d.email_auth ?? "sin email en la cuenta"}</div>
                    <div className="text-muted-foreground">
                      perfil: {d.email_profile ?? "vacío"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
