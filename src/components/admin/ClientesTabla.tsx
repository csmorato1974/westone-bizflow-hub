import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Loader2, Package, Pencil, Trash2, FileText } from "lucide-react";
import type { ClienteEstado } from "@/lib/clienteEstado";

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
}

interface Props {
  rows: ClienteRow[];
  isSuper: boolean;
  deletingId: string | null;
  highlightedId: string | null;
  rowRef: (id: string, el: HTMLTableRowElement | null) => void;
  onFicha: (id: string) => void;
  onPedidos: (id: string) => void;
  onEditar: (id: string) => void;
  onEliminar: (id: string) => void;
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });

export function ClientesTabla({
  rows,
  isSuper,
  deletingId,
  highlightedId,
  rowRef,
  onFicha,
  onPedidos,
  onEditar,
  onEliminar,
}: Props) {
  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empresa</TableHead>
            <TableHead className="hidden lg:table-cell">Contacto</TableHead>
            <TableHead className="hidden md:table-cell">Teléfono</TableHead>
            <TableHead className="hidden xl:table-cell">Email</TableHead>
            <TableHead>Estado</TableHead>
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
            return (
              <TableRow
                key={r.id}
                ref={(el) => rowRef(r.id, el)}
                className={`${!r.activo ? "opacity-60" : ""} ${
                  highlightedId === r.id ? "bg-brand/10" : ""
                }`}
              >
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
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {estado.principal && (
                      <Badge variant="outline" className={`${estado.principal.className} text-[10px] whitespace-nowrap`}>
                        {estado.principal.label}
                      </Badge>
                    )}
                    {estado.secundarios.map((b) => (
                      <Badge
                        key={b.key}
                        variant="outline"
                        className={`${b.className} text-[10px] px-1 py-0 opacity-80 whitespace-nowrap hidden md:inline-flex`}
                      >
                        {b.label}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">{r.vendedorNombre ?? "—"}</TableCell>
                <TableCell className="hidden xl:table-cell">{r.listaNombre ?? "—"}</TableCell>
                <TableCell className="hidden xl:table-cell whitespace-nowrap text-muted-foreground text-xs">
                  {fecha(r.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
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
