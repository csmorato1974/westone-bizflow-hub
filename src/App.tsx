import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AppLayout } from "@/components/layout/AppLayout";

import Index from "./pages/Index";
import Login from "./pages/Login";
import Unauthorized from "./pages/Unauthorized";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";

import VendedorClientes from "./pages/vendedor/Clientes";
import VendedorPedidos from "./pages/vendedor/Pedidos";
import NuevoPedido from "./pages/vendedor/NuevoPedido";

import ClienteCatalogo from "./pages/cliente/Catalogo";
import ClienteMisPedidos from "./pages/cliente/MisPedidos";

import Logistica from "./pages/logistica/Logistica";

import AdminUsuarios from "./pages/admin/Usuarios";
import AdminClientes from "./pages/admin/Clientes";
import AdminProductos from "./pages/admin/Productos";
import AdminListas from "./pages/admin/ListasPrecios";
import AdminStock from "./pages/admin/Stock";
import AdminPedidos from "./pages/admin/Pedidos";
import AdminWhatsapp from "./pages/admin/Whatsapp";
import AdminAuditoria from "./pages/admin/Auditoria";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/no-autorizado" element={<Unauthorized />} />

            <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route index element={<Dashboard />} />

              <Route path="clientes" element={<RequireAuth roles={["vendedor"]}><VendedorClientes /></RequireAuth>} />
              <Route path="pedidos" element={<RequireAuth roles={["vendedor"]}><VendedorPedidos /></RequireAuth>} />
              <Route path="pedidos/nuevo/:clienteId" element={<RequireAuth roles={["vendedor"]}><NuevoPedido /></RequireAuth>} />

              <Route path="catalogo" element={<RequireAuth roles={["cliente"]}><ClienteCatalogo /></RequireAuth>} />
              <Route path="mis-pedidos" element={<RequireAuth roles={["cliente"]}><ClienteMisPedidos /></RequireAuth>} />

              <Route path="logistica" element={<RequireAuth roles={["logistica"]}><Logistica /></RequireAuth>} />

              <Route path="admin/usuarios" element={<RequireAuth roles={["admin","super_admin"]}><AdminUsuarios /></RequireAuth>} />
              <Route path="admin/clientes" element={<RequireAuth roles={["admin","super_admin"]}><AdminClientes /></RequireAuth>} />
              <Route path="admin/productos" element={<RequireAuth roles={["admin","super_admin"]}><AdminProductos /></RequireAuth>} />
              <Route path="admin/listas-precios" element={<RequireAuth roles={["admin","super_admin"]}><AdminListas /></RequireAuth>} />
              <Route path="admin/stock" element={<RequireAuth roles={["admin","super_admin"]}><AdminStock /></RequireAuth>} />
              <Route path="admin/pedidos" element={<RequireAuth roles={["admin","super_admin"]}><AdminPedidos /></RequireAuth>} />
              <Route path="admin/whatsapp" element={<RequireAuth roles={["admin","super_admin"]}><AdminWhatsapp /></RequireAuth>} />
              <Route path="admin/auditoria" element={<RequireAuth roles={["admin","super_admin"]}><AdminAuditoria /></RequireAuth>} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
