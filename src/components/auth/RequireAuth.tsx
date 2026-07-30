import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface RequireAuthProps {
  children: ReactNode;
  roles?: AppRole[];
  /** Solo para la propia pantalla de cambio de contraseña obligatorio. */
  allowPasswordChange?: boolean;
}

export function RequireAuth({ children, roles, allowPasswordChange }: RequireAuthProps) {
  const { user, roles: userRoles, loading, isAdmin, profile } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-brand" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Bloqueo total de la app hasta que se cambie la contraseña provisional.
  if (profile?.must_change_password && !allowPasswordChange) {
    return <Navigate to="/cambiar-password" replace />;
  }

  if (roles && roles.length > 0) {
    const allowed = isAdmin || roles.some((r) => userRoles.includes(r));
    if (!allowed) {
      return <Navigate to="/no-autorizado" replace />;
    }
  }

  return <>{children}</>;
}

