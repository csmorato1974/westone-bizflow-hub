import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Save, MessageCircle, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { waLink } from "@/lib/whatsapp";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  vendedor: "Vendedor",
  logistica: "Logística",
  cliente: "Cliente",
};

interface ClienteInfo {
  id: string;
  empresa: string;
  contacto: string;
  celular: string;
  direccion: string | null;
  activo: boolean;
  vendedor_id: string | null;
  listas_precios: { nombre: string } | null;
}

interface VendedorInfo {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

export default function Perfil() {
  const { user, roles, isAdmin, hasRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [clienteInfo, setClienteInfo] = useState<ClienteInfo | null>(null);
  const [vendedor, setVendedor] = useState<VendedorInfo | null>(null);
  const [clientesCount, setClientesCount] = useState<number>(0);

  const load = async () => {
    if (!user) return;
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
      setEmail(profile.email ?? user.email ?? "");
    } else {
      setEmail(user.email ?? "");
    }

    if (hasRole("cliente")) {
      const { data: cli } = await supabase
        .from("clientes")
        .select("id, empresa, contacto, celular, direccion, activo, vendedor_id, listas_precios(nombre)")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cli) {
        setClienteInfo(cli as any);
        if (cli.vendedor_id) {
          const { data: vend } = await supabase
            .from("profiles")
            .select("id, full_name, email, phone")
            .eq("id", cli.vendedor_id)
            .maybeSingle();
          setVendedor(vend as any);
        }
      }
    }

    if (hasRole("vendedor")) {
      const { count } = await supabase
        .from("clientes")
        .select("id", { count: "exact", head: true })
        .eq("vendedor_id", user.id);
      setClientesCount(count ?? 0);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    // Realtime: refrescar cuando cambien asignaciones de clientes
    const channel = supabase
      .channel("perfil-clientes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clientes" },
        () => load(),
      )
      .subscribe();

    return () => {
      window.removeEventListener("focus", onFocus);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, phone })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    await logAudit("actualizar", "profiles", user.id, { full_name: fullName, phone });
    toast.success("Perfil actualizado");
  };

  const initials = (fullName || email || "U")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="industrial-title text-3xl">Mi Perfil</h1>
        <p className="text-sm text-muted-foreground">Gestiona tus datos personales y revisa tu cuenta.</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4 flex-wrap">
            <Avatar className="h-20 w-20 border-2 border-brand">
              <AvatarFallback className="bg-primary text-brand industrial-title text-xl">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-[200px] space-y-2">
              <p className="industrial-title text-xl">{fullName || "Sin nombre"}</p>
              <p className="text-sm text-muted-foreground">{email}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {roles.length === 0 && (
                  <Badge variant="outline" className="uppercase">Sin rol asignado</Badge>
                )}
                {roles.map((r) => (
                  <Badge key={r} className="bg-brand text-brand-foreground uppercase tracking-wide">
                    {ROLE_LABEL[r] ?? r}
                  </Badge>
                ))}
                {clienteInfo && (
                  <Badge
                    variant="outline"
                    className={clienteInfo.activo ? "border-green-500 text-green-600" : "border-destructive text-destructive"}
                  >
                    {clienteInfo.activo ? "Cuenta activa" : "Cuenta inactiva"}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="industrial-title text-lg flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-brand" />
            Datos personales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="full_name">Nombre completo</Label>
              <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Teléfono / Celular</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+591 ..." />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled />
              <p className="text-xs text-muted-foreground">El email no se puede cambiar desde aquí.</p>
            </div>
          </div>
          <div className="pt-2">
            <Button onClick={handleSave} disabled={saving} className="bg-brand text-brand-foreground hover:bg-brand/90">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="ml-1">Guardar cambios</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {clienteInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="industrial-title text-lg">Mi cuenta de cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Empresa</p>
                <p className="font-medium">{clienteInfo.empresa}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Contacto</p>
                <p className="font-medium">{clienteInfo.contacto}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Celular registrado</p>
                <p className="font-medium">{clienteInfo.celular}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Lista de precios asignada</p>
                <p className="font-medium">{clienteInfo.listas_precios?.nombre ?? "Sin lista asignada"}</p>
              </div>
              {clienteInfo.direccion && (
                <div className="sm:col-span-2">
                  <p className="text-xs uppercase text-muted-foreground">Dirección</p>
                  <p className="font-medium">{clienteInfo.direccion}</p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t">
              <p className="text-xs uppercase text-muted-foreground mb-2">Vendedor asignado</p>
              {vendedor ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <Avatar className="h-10 w-10 border border-brand">
                    <AvatarFallback className="bg-primary text-brand text-sm">
                      {(vendedor.full_name ?? vendedor.email ?? "V").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-medium">{vendedor.full_name ?? "Vendedor"}</p>
                    <p className="text-xs text-muted-foreground">{vendedor.email}</p>
                  </div>
                  {vendedor.phone && (
                    <Button asChild size="sm" variant="outline">
                      <a href={waLink(vendedor.phone, `Hola ${vendedor.full_name ?? ""}, soy ${clienteInfo.empresa}.`)} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="h-3 w-3" /> WhatsApp
                      </a>
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">Aún no tienes un vendedor asignado.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {hasRole("vendedor") && (
        <Card>
          <CardHeader>
            <CardTitle className="industrial-title text-lg">Resumen comercial</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="industrial-title text-3xl text-brand">{clientesCount}</div>
              <div className="text-sm text-muted-foreground">Clientes asignados a tu cartera</div>
            </div>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="industrial-title text-lg">Cuenta administrativa</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Tienes acceso completo de administración. Gestiona usuarios, roles y catálogos desde el menú de Administración.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
