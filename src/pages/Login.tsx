import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WestoneLogo } from "@/components/WestoneLogo";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname ?? "/app";
  const [busy, setBusy] = useState(false);

  // login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // signup
  const [sEmail, setSEmail] = useState("");
  const [sPwd, setSPwd] = useState("");
  const [sName, setSName] = useState("");

  if (!loading && user) return <Navigate to={from} replace />;

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) toast.error(error);
    else {
      toast.success("Bienvenido");
      navigate(from, { replace: true });
    }
  };

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sPwd.length < 8) return toast.error("La contraseña debe tener al menos 8 caracteres");
    setBusy(true);
    const { error } = await signUp(sEmail, sPwd, sName);
    setBusy(false);
    if (error) toast.error(error);
    else toast.success("Cuenta creada. Un administrador debe asignarte un rol para acceder.");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-dark p-4">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 64 64" className="h-14 w-14"><rect width="64" height="64" rx="10" fill="hsl(var(--brand))"/><path d="M10 46 L24 24 L32 35 L40 24 L54 46 Z" fill="hsl(var(--primary))"/></svg>
          <div>
            <h1 className="industrial-title text-3xl text-brand">WESTONE</h1>
            <p className="text-xs uppercase tracking-[0.3em] text-brand/70">Performance Ecosystem</p>
          </div>
        </div>
      </div>

      <Card className="w-full max-w-md shadow-industrial border-border/50">
        <CardContent className="p-6">
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Iniciar sesión</TabsTrigger>
              <TabsTrigger value="signup">Crear cuenta</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={onLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input id="password" type="password" required value={password}
                    onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-primary text-brand hover:bg-primary/90 font-semibold uppercase tracking-wide">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={onSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sname">Nombre completo</Label>
                  <Input id="sname" required value={sName} onChange={(e) => setSName(e.target.value)} maxLength={120} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="semail">Email</Label>
                  <Input id="semail" type="email" required value={sEmail}
                    onChange={(e) => setSEmail(e.target.value)} autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="spwd">Contraseña (mín. 8 caracteres)</Label>
                  <Input id="spwd" type="password" required minLength={8} value={sPwd}
                    onChange={(e) => setSPwd(e.target.value)} autoComplete="new-password" />
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-brand text-brand-foreground hover:bg-brand-dark font-semibold uppercase tracking-wide">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear cuenta"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Tu cuenta requerirá la asignación de un rol por parte del administrador antes de acceder a los módulos.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-brand/50 text-center">
        Acceso restringido · Plataforma B2B Westone Performance
      </p>
    </div>
  );
}
