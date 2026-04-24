import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Shield, Truck, Users, Package } from "lucide-react";

const Index = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gradient-dark"><Loader2 className="h-10 w-10 animate-spin text-brand" /></div>;
  }
  if (user) return <Navigate to="/app" replace />;

  return (
    <div className="min-h-screen bg-gradient-dark text-brand">
      <header className="border-b border-brand/20">
        <div className="container mx-auto flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 64 64" className="h-10 w-10"><rect width="64" height="64" rx="10" fill="hsl(var(--brand))"/><path d="M10 46 L24 24 L32 35 L40 24 L54 46 Z" fill="hsl(var(--primary))"/></svg>
            <div>
              <h1 className="industrial-title text-xl text-brand">WESTONE</h1>
              <p className="text-[10px] uppercase tracking-[0.3em] text-brand/60">Performance Ecosystem</p>
            </div>
          </div>
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-dark font-semibold uppercase">
            <Link to="/login">Iniciar sesión</Link>
          </Button>
        </div>
      </header>

      <section className="container mx-auto py-16 sm:py-24 text-center">
        <h2 className="industrial-title text-4xl sm:text-6xl text-brand mb-4">
          Plataforma B2B<br />Westone Performance
        </h2>
        <p className="text-brand/70 max-w-2xl mx-auto text-lg mb-8">
          Gestión integral de fuerza de ventas, clientes, pedidos y logística.
          Refrigerantes, anticongelantes, Heavy Duty, DEF y línea de limpieza con formulación americana.
        </p>
        <Button asChild size="lg" className="bg-brand text-brand-foreground hover:bg-brand-dark font-semibold uppercase tracking-wide">
          <Link to="/login">Acceder a la plataforma</Link>
        </Button>
      </section>

      <section className="container mx-auto pb-20 grid gap-4 md:grid-cols-4">
        {[
          { icon: Users, t: "Vendedores", d: "Cartera con GPS y WhatsApp" },
          { icon: Package, t: "Catálogo", d: "Por lista de precios autorizada" },
          { icon: Truck, t: "Logística", d: "Despachos con mapas y contacto" },
          { icon: Shield, t: "Seguridad", d: "Roles, RLS y auditoría" },
        ].map((f) => (
          <div key={f.t} className="border border-brand/20 rounded-lg p-5 bg-primary/40">
            <f.icon className="h-7 w-7 text-brand mb-3" />
            <h3 className="industrial-title text-brand mb-1">{f.t}</h3>
            <p className="text-sm text-brand/60">{f.d}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-brand/20 py-6 text-center text-xs text-brand/40">
        © Westone Performance — Plataforma B2B
      </footer>
    </div>
  );
};

export default Index;
