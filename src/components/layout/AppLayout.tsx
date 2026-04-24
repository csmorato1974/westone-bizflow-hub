import { Outlet, Link, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User as UserIcon } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  vendedor: "Vendedor",
  logistica: "Logística",
  cliente: "Cliente",
};

export function AppLayout() {
  const { signOut, user, roles } = useAuth();
  const primaryRole = roles[0];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between gap-3 border-b border-border bg-primary px-3 sm:px-4 sticky top-0 z-30">
            <div className="flex items-center gap-2 min-w-0">
              <SidebarTrigger className="text-brand hover:bg-primary/80" />
              <span className="industrial-title text-brand text-base sm:text-lg truncate">
                Westone Performance
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {primaryRole && (
                <Badge className="bg-brand text-brand-foreground border-0 font-semibold uppercase tracking-wide hidden sm:inline-flex">
                  {ROLE_LABEL[primaryRole] ?? primaryRole}
                </Badge>
              )}
              <span className="hidden md:block text-xs text-brand/80 truncate max-w-[180px]">
                {user?.email}
              </span>
              <Button size="sm" variant="ghost" onClick={signOut} className="text-brand hover:bg-primary/80 hover:text-brand">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Salir</span>
              </Button>
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
