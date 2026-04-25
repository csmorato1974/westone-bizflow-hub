import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Package, ShoppingCart, Truck, Shield,
  ListOrdered, ClipboardList, Settings, MessageCircle, FileText,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { WestoneLogo } from "@/components/WestoneLogo";
import { cn } from "@/lib/utils";

type NavItem = { title: string; url: string; icon: typeof Users };

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { isAdmin, hasRole } = useAuth();
  const isSuper = hasRole("super_admin");
  const location = useLocation();

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const generalItems: NavItem[] = [
    { title: "Dashboard", url: "/app", icon: LayoutDashboard },
  ];

  const vendedorItems: NavItem[] = hasRole("vendedor")
    ? [
        { title: "Mis Clientes", url: "/app/clientes", icon: Users },
        { title: "Mis Pedidos", url: "/app/pedidos", icon: ShoppingCart },
      ]
    : [];

  const clienteItems: NavItem[] = hasRole("cliente")
    ? [
        { title: "Catálogo", url: "/app/catalogo", icon: Package },
        { title: "Mis Pedidos", url: "/app/mis-pedidos", icon: ClipboardList },
      ]
    : [];

  const logisticaItems: NavItem[] = hasRole("logistica")
    ? [{ title: "Despachos", url: "/app/logistica", icon: Truck }]
    : [];

  const adminItems: NavItem[] = isAdmin
    ? [
        { title: "Usuarios", url: "/app/admin/usuarios", icon: Shield },
        { title: "Clientes", url: "/app/admin/clientes", icon: Users },
        { title: "Productos", url: "/app/admin/productos", icon: Package },
        { title: "Listas de Precios", url: "/app/admin/listas-precios", icon: ListOrdered },
        { title: "Stock", url: "/app/admin/stock", icon: Package },
        { title: "Pedidos", url: "/app/admin/pedidos", icon: ShoppingCart },
        { title: "WhatsApp", url: "/app/admin/whatsapp", icon: MessageCircle },
        { title: "Auditoría", url: "/app/admin/auditoria", icon: FileText },
      ]
    : [];

  const renderGroup = (label: string, items: NavItem[]) => {
    if (items.length === 0) return null;
    return (
      <SidebarGroup>
        {!collapsed && (
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/50">
            {label}
          </SidebarGroupLabel>
        )}
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={isActive(item.url)}>
                  <NavLink
                    to={item.url}
                    end={item.url === "/app"}
                    className={({ isActive: a }) =>
                      cn(
                        "flex items-center gap-3 rounded-md transition-colors",
                        a
                          ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-brand"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground",
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="text-sm font-medium">{item.title}</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent className="bg-sidebar">
        <div className="px-3 py-4 border-b border-sidebar-border">
          {collapsed ? (
            <div className="flex justify-center">
              <svg viewBox="0 0 64 64" className="h-7 w-7"><rect width="64" height="64" rx="10" fill="hsl(var(--brand))"/><path d="M10 46 L24 24 L32 35 L40 24 L54 46 Z" fill="hsl(var(--primary))"/></svg>
            </div>
          ) : (
            <WestoneLogo />
          )}
        </div>
        {renderGroup("General", generalItems)}
        {renderGroup("Ventas", vendedorItems)}
        {renderGroup("Cliente", clienteItems)}
        {renderGroup("Logística", logisticaItems)}
        {renderGroup("Administración", adminItems)}
      </SidebarContent>
    </Sidebar>
  );
}
