import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, KeyRound, AlertCircle } from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [show, setShow] = useState(false);
  const [show2, setShow2] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase procesa el hash automáticamente y emite PASSWORD_RECOVERY
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryReady(true);
        setChecking(false);
      }
    });

    // Fallback: si ya existe sesión (Supabase ya procesó el token), permitir
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setRecoveryReady(true);
      setChecking(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 8) return toast.error("La contraseña debe tener al menos 8 caracteres");
    if (pwd !== pwd2) return toast.error("Las contraseñas no coinciden");
    setBusy(true);
    const { error } = await updatePassword(pwd);
    setBusy(false);
    if (error) return toast.error(error);
    toast.success("Contraseña actualizada");
    navigate("/app", { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-dark p-4">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 64 64" className="h-14 w-14">
            <rect width="64" height="64" rx="10" fill="hsl(var(--brand))" />
            <path d="M10 46 L24 24 L32 35 L40 24 L54 46 Z" fill="hsl(var(--primary))" />
          </svg>
          <div>
            <h1 className="industrial-title text-3xl text-brand">WESTONE</h1>
            <p className="text-xs uppercase tracking-[0.3em] text-brand/70">Performance Ecosystem</p>
          </div>
        </div>
      </div>

      <Card className="w-full max-w-md shadow-industrial border-border/50">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold uppercase tracking-wide">Restablecer contraseña</h2>
          </div>

          {checking ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !recoveryReady ? (
            <>
              <Alert className="mb-4 border-destructive/40 bg-destructive/5">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <AlertDescription className="text-xs leading-relaxed">
                  El enlace de recuperación no es válido o ha caducado. Solicita uno nuevo desde el inicio de sesión.
                </AlertDescription>
              </Alert>
              <Button onClick={() => navigate("/login")} className="w-full">
                Volver al inicio de sesión
              </Button>
            </>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Ingresa tu nueva contraseña. Debe tener al menos 8 caracteres.
              </p>
              <div className="space-y-2">
                <Label htmlFor="pwd">Nueva contraseña</Label>
                <div className="relative">
                  <Input
                    id="pwd"
                    type={show ? "text" : "password"}
                    required
                    minLength={8}
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    className="pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                    tabIndex={-1}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pwd2">Confirmar contraseña</Label>
                <div className="relative">
                  <Input
                    id="pwd2"
                    type={show2 ? "text" : "password"}
                    required
                    minLength={8}
                    value={pwd2}
                    onChange={(e) => setPwd2(e.target.value)}
                    className="pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShow2((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                    tabIndex={-1}
                  >
                    {show2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="w-full bg-primary text-brand hover:bg-primary/90 font-semibold uppercase tracking-wide"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar contraseña"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
