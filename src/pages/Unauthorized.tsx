import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ShieldAlert } from "lucide-react";

export default function Unauthorized() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-dark p-6 text-center">
      <ShieldAlert className="h-16 w-16 text-brand mb-4" />
      <h1 className="industrial-title text-3xl text-brand mb-2">Acceso restringido</h1>
      <p className="text-brand/70 max-w-md mb-6">
        Tu cuenta aún no tiene un rol asignado o no tienes permisos para acceder a este módulo.
        Contacta a un administrador.
      </p>
      <div className="flex gap-3">
        <Button asChild variant="outline" className="border-brand text-brand hover:bg-brand hover:text-brand-foreground">
          <Link to="/app">Ir al inicio</Link>
        </Button>
        <Button onClick={signOut} className="bg-brand text-brand-foreground hover:bg-brand-dark">
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}
