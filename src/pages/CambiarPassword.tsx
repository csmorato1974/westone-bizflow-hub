import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CambiarPassword() {
  const { user, updatePassword, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setGuardando(true);
    const { error: updErr } = await updatePassword(password);
    if (updErr) {
      setGuardando(false);
      setError(updErr);
      return;
    }

    if (user) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", user.id);
      await refreshProfile();
    }

    setGuardando(false);
    toast.success("Contraseña actualizada correctamente");
    navigate("/app", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Cambio de contraseña obligatorio
          </CardTitle>
          <CardDescription>
            Tu cuenta se creó con una contraseña provisional. Debes definir una contraseña
            personal antes de poder usar la aplicación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nueva">Nueva contraseña</Label>
              <Input
                id="nueva"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                maxLength={72}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmar">Repetir contraseña</Label>
              <Input
                id="confirmar"
                type="password"
                autoComplete="new-password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                required
                minLength={8}
                maxLength={72}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={guardando}>
              {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar contraseña
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={async () => {
                await signOut();
                navigate("/login", { replace: true });
              }}
            >
              Cerrar sesión
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
