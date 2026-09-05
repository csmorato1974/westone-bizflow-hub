import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ExternalLink, Loader2, Package, Pencil, Trash2, FileText, MessageCircle, Mail } from "lucide-react";
import type { ClienteEstado } from "@/lib/clienteEstado";
import { fechaEnvio } from "@/lib/onboarding";

export interface ClienteRow {
  id: string;
  empresa: string;
  contacto: string;
  celular: string;
  email: string | null;
  activo: boolean;
  created_at: string;
  vendedorNombre: string | null;
  listaNombre: string | null;
  estado: ClienteEstado;
  /** Puede recibir el mensaje de onboarding (tiene clave provisional). */
  onboardingListo: boolean;
  onboardingEmail: string | null;
  onboardingEnviadoEn: string | null;
  onboardingCanal: string | null;
}

interface Props {
  rows: ClienteRow[];
  isSuper: boolean;
  deletingId: string | null;
  highlightedId: string | null;
  rowRef: (id: string, el: HTMLTableRowElement | null) => void;
  selectedIds: string[];
  onToggleSelected: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onFicha: (id: string) => void;
  onPedidos: (id: string) => void;
  onEditar: (id: string) => void;
  onEliminar: (id: string) => void;
  onWhatsapp: (id: string) => void;
  onEmail: (id: string) => void;
  onPortal: (id: string) => void;
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });

export function ClientesTabla({
  rows,
  isSuper,
  deletingId,
  highlightedId,
  rowRef,
  selectedIds,
  onToggleSelected,
  onToggleAll,
  onFicha,
  onPedidos,
  onEditar,
  onEliminar,
  onWhatsapp,
  onEmail,
  onPortal,
}: Props) {
  const seleccionables = rows.filter((r) => r.onboardingListo);
  const allSelected =
    seleccionables.length > 0 && seleccionables.every((r) => selectedIds.includes(r.id));
  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[36px]">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => onToggleAll(!!v)}
                aria-label="Seleccionar todos"
                disabled={seleccionables.length === 0}
              />
            </TableHead>
            <TableHead>Empresa</TableHead>
            <TableHead className="hidden lg:table-cell">Contacto</TableHead>
            <TableHead className="hidden md:table-cell">Teléfono</TableHead>
            <TableHead className="hidden xl:table-cell">Email</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="hidden lg:table-cell">Onboarding</TableHead>
            <TableHead className="hidden lg:table-cell">Vendedor</TableHead>
            <TableHead className="hidden xl:table-cell">Lista</TableHead>
            <TableHead className="hidden xl:table-cell">Alta</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const { estado } = r;
            // En pantallas chicas mostramos como máximo 2 metadatos bajo el nombre.
            const meta = [r.contacto, r.celular].filter(Boolean).slice(0, 2);
            const enviado = fechaEnvio(r.onboardingEnviadoEn);
            return (
              <TableRow
                key={r.id}
                ref={(el) => rowRef(r.id, el)}
                className={`${!r.activo ? "opacity-60" : ""} ${
                  highlightedId === r.id ? "bg-brand/10" : ""
                }`}
              >
                <TableCell>
                  <Checkbox
                    checked={selectedIds.includes(r.id)}
                    onCheckedChange={() => onToggleSelected(r.id)}
                    disabled={!r.onboardingListo}
                    aria-label={`Seleccionar ${r.empresa}`}
                  />
                </TableCell>
                <TableCell className="max-w-[220px]">
                  <button
                    type="button"
                    onClick={() => onFicha(r.id)}
                    className="text-left font-semibold text-brand hover:underline truncate block w-full"
                  >
                    {r.empresa}
                  </button>
                  <p className="text-xs text-muted-foreground truncate lg:hidden">{meta.join(" · ")}</p>
                </TableCell>
                <TableCell className="hidden lg:table-cell">{r.contacto}</TableCell>
                <TableCell className="hidden md:table-cell whitespace-nowrap">{r.celular}</TableCell>
                <TableCell className="hidden xl:table-cell max-w-[200px] truncate">{r.email ?? "—"}</TableCell>
                <TableCell className="min-w-[150px]">
                  <div className="flex flex-wrap gap-1">
                    {estado.principal && (
                      <Badge variant="outline" className={`${estado.principal.className} text-[10px] whitespace-nowrap`}>
                        {estado.principal.label}
                      </Badge>
                    )}
                    {estado.secundarios.slice(0, 2).map((b) => (
                      <Badge
                        key={b.key}
                        variant="outline"
                        className={`${b.className} text-[10px] px-1 py-0 opacity-80 whitespace-nowrap hidden md:inline-flex`}
                      >
                        {b.label}
                      </Badge>
                    ))}
                    {estado.secundarios.length > 2 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0 text-muted-foreground hidden md:inline-flex"
                        title={estado.secundarios.slice(2).map((b) => b.label).join(" · ")}
                      >
                        +{estado.secundarios.length - 2}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell whitespace-nowrap text-xs">
                  {enviado ? (
                    <span className="text-success">
                      ✓ {enviado}
                      {r.onboardingCanal ? ` · ${r.onboardingCanal}` : ""}
                    </span>
                  ) : r.onboardingListo ? (
                    <span className="text-muted-foreground">Sin enviar</span>
                  ) : (
                    "—"
                  )}
                </TableCell>

                <TableCell className="hidden lg:table-cell">{r.vendedorNombre ?? "—"}</TableCell>
                <TableCell className="hidden xl:table-cell">{r.listaNombre ?? "—"}</TableCell>
                <TableCell className="hidden xl:table-cell whitespace-nowrap text-muted-foreground text-xs">
                  {fecha(r.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    {r.onboardingListo && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Enviar por WhatsApp"
                          onClick={() => onWhatsapp(r.id)}
                        >
                          <MessageCircle className="h-4 w-4 text-success" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title={r.onboardingEmail ? "Enviar por Email" : "Sin email real para escribir"}
                          disabled={!r.onboardingEmail}
                          onClick={() => onEmail(r.id)}
                        >
                          <Mail className="h-4 w-4 text-info" />
                        </Button>
                      </>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Generar portal personalizado"
                      onClick={() => onPortal(r.id)}
                    >
                      <ExternalLink className="h-4 w-4 text-brand" />
                    </Button>
                    <Button size="icon" variant="ghost" title="Ver ficha" onClick={() => onFicha(r.id)}>
                      <FileText className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" title="Ver pedidos" onClick={() => onPedidos(r.id)}>
                      <Package className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" title="Editar" onClick={() => onEditar(r.id)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {isSuper && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" title="Eliminar" disabled={deletingId === r.id}>
                            {deletingId === r.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-destructive" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Se eliminará permanentemente <strong>{r.empresa}</strong>. Si tiene pedidos, la
                              eliminación será bloqueada.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onEliminar(r.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
