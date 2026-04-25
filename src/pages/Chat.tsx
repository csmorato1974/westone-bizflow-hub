import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Send, MessageSquare, Hash, Loader2, Search, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ConvType = "direct" | "channel";

interface Conversation {
  id: string;
  tipo: ConvType;
  nombre: string | null;
  channel_role: AppRole | null;
  updated_at: string;
}

interface Participant {
  user_id: string;
  last_read_at: string;
  full_name?: string | null;
  roles?: AppRole[];
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  contenido: string;
  created_at: string;
}

interface UserOption {
  id: string;
  full_name: string | null;
  email: string | null;
  roles: AppRole[];
}

const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  vendedor: "Vendedor",
  logistica: "Logística",
  cliente: "Cliente",
};

const ROLE_CLASS: Record<AppRole, string> = {
  super_admin: "bg-brand/15 text-brand border-brand/30",
  admin: "bg-primary/15 text-primary border-primary/30",
  vendedor: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  logistica: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  cliente: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
};

function RoleBadge({ role }: { role?: AppRole }) {
  if (!role) return null;
  return (
    <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px] font-semibold", ROLE_CLASS[role])}>
      {ROLE_LABEL[role]}
    </Badge>
  );
}

function initials(name?: string | null) {
  if (!name) return "??";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

export default function Chat() {
  const { user, isAdmin } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [participantsMap, setParticipantsMap] = useState<Record<string, Participant[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<"all" | "direct" | "channel">("all");
  const [search, setSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Auto-scroll al fondo cuando cambian mensajes o conversación activa
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, activeId]);

  // Cargar conversaciones del usuario
  const loadConversations = async () => {
    if (!user) return;
    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", user.id);

    const ids = (parts ?? []).map((p) => p.conversation_id);
    if (ids.length === 0) {
      setConversations([]);
      setParticipantsMap({});
      setLoading(false);
      return;
    }

    const { data: convs } = await supabase
      .from("conversations")
      .select("*")
      .in("id", ids)
      .order("updated_at", { ascending: false });

    setConversations((convs ?? []) as Conversation[]);

    // Cargar participantes de todas
    const { data: allParts } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user_id, last_read_at")
      .in("conversation_id", ids);

    const userIds = Array.from(new Set((allParts ?? []).map((p) => p.user_id)));
    const [{ data: profs }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, full_name").in("id", userIds),
      supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
    ]);
    const profMap = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
    const roleMap = new Map<string, AppRole[]>();
    (roles ?? []).forEach((r) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role as AppRole);
      roleMap.set(r.user_id, arr);
    });

    const map: Record<string, Participant[]> = {};
    (allParts ?? []).forEach((p) => {
      const arr = map[p.conversation_id] ?? [];
      arr.push({
        user_id: p.user_id,
        last_read_at: p.last_read_at,
        full_name: profMap.get(p.user_id) ?? null,
        roles: roleMap.get(p.user_id) ?? [],
      });
      map[p.conversation_id] = arr;
    });
    setParticipantsMap(map);

    // Calcular no leídos
    const lastReadMap = new Map((parts ?? []).map((p) => [p.conversation_id, p.last_read_at]));
    const unreadCounts: Record<string, number> = {};
    await Promise.all(
      ids.map(async (cid) => {
        const lr = lastReadMap.get(cid) ?? new Date(0).toISOString();
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", cid)
          .gt("created_at", lr)
          .neq("sender_id", user.id);
        unreadCounts[cid] = count ?? 0;
      }),
    );
    setUnread(unreadCounts);
    setLoading(false);
  };

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Cargar mensajes al cambiar conversación
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", activeId)
        .order("created_at", { ascending: true });
      setMessages((data ?? []) as Message[]);
      // marcar como leído
      if (user) {
        await supabase
          .from("conversation_participants")
          .update({ last_read_at: new Date().toISOString() })
          .eq("conversation_id", activeId)
          .eq("user_id", user.id);
        setUnread((u) => ({ ...u, [activeId]: 0 }));
      }
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }, 50);
    })();
  }, [activeId, user?.id]);

  // Realtime: nuevos mensajes (suscripción estable, no depende de activeId)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`chat-messages-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          const currentActive = activeIdRef.current;
          if (msg.conversation_id === currentActive) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
            setTimeout(() => {
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
            }, 50);
            if (msg.sender_id !== user.id) {
              supabase
                .from("conversation_participants")
                .update({ last_read_at: new Date().toISOString() })
                .eq("conversation_id", currentActive)
                .eq("user_id", user.id);
            }
          } else if (msg.sender_id !== user.id) {
            setUnread((u) => ({ ...u, [msg.conversation_id]: (u[msg.conversation_id] ?? 0) + 1 }));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_participants", filter: `user_id=eq.${user.id}` },
        () => loadConversations(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const send = async () => {
    if (!user || !activeId || !text.trim()) return;
    const contenido = text.trim();
    const convId = activeId;
    setText(""); // limpiar de inmediato
    setSending(true);
    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: convId,
        sender_id: user.id,
        contenido,
      })
      .select()
      .single();
    setSending(false);
    if (error || !data) {
      toast.error(`No se pudo enviar el mensaje${error?.message ? `: ${error.message}` : ""}`);
      setText(contenido); // restaurar texto
      return;
    }
    // Inserción optimista (con dedupe por id si Realtime también la entrega)
    setMessages((prev) => {
      if (prev.some((m) => m.id === (data as Message).id)) return prev;
      return [...prev, data as Message];
    });
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, 50);
  };

  const filteredConvs = useMemo(() => {
    return conversations.filter((c) => {
      if (filter !== "all" && c.tipo !== filter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const name = convDisplayName(c, participantsMap[c.id], user?.id).toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [conversations, filter, search, participantsMap, user?.id]);

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  const activeParts = activeId ? participantsMap[activeId] ?? [] : [];

  const senderInfo = (sid: string): { name: string; role?: AppRole } => {
    const p = activeParts.find((x) => x.user_id === sid);
    return {
      name: p?.full_name ?? (sid === user?.id ? "Tú" : "Usuario"),
      role: p?.roles?.[0],
    };
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-xl font-semibold">Chat</h1>
          <p className="text-xs text-muted-foreground">
            Mensajería interna entre usuarios. {isAdmin ? "Como admin puedes iniciar conversaciones." : "Solo administradores pueden iniciar nuevas conversaciones."}
          </p>
        </div>
        {isAdmin && <NewConversationDialog onCreated={loadConversations} />}
      </div>

      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[320px_1fr]">
        {/* Lista de conversaciones */}
        <div className="flex flex-col border-r bg-muted/20">
          <div className="space-y-2 border-b p-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8"
              />
            </div>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <TabsList className="grid h-8 w-full grid-cols-3">
                <TabsTrigger value="all" className="text-xs">Todas</TabsTrigger>
                <TabsTrigger value="direct" className="text-xs">Directos</TabsTrigger>
                <TabsTrigger value="channel" className="text-xs">Canales</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : filteredConvs.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-40" />
                Sin conversaciones aún.
              </div>
            ) : (
              <ul className="divide-y">
                {filteredConvs.map((c) => {
                  const name = convDisplayName(c, participantsMap[c.id], user?.id);
                  const ucount = unread[c.id] ?? 0;
                  const otherRole = c.tipo === "direct"
                    ? participantsMap[c.id]?.find((p) => p.user_id !== user?.id)?.roles?.[0]
                    : c.channel_role ?? undefined;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => setActiveId(c.id)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted",
                          activeId === c.id && "bg-muted",
                        )}
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="text-xs">
                            {c.tipo === "channel" ? <Hash className="h-4 w-4" /> : initials(name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{name}</span>
                            {otherRole && <RoleBadge role={otherRole} />}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {c.tipo === "channel" ? "Canal" : "Directo"}
                          </span>
                        </div>
                        {ucount > 0 && (
                          <Badge className="h-5 min-w-5 justify-center bg-brand px-1.5 text-[10px] text-brand-foreground">
                            {ucount}
                          </Badge>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </div>

        {/* Panel de mensajes */}
        <div className="flex flex-col">
          {!activeConv ? (
            <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="mb-3 h-12 w-12 opacity-30" />
              <p>Selecciona una conversación</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b px-4 py-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="text-xs">
                    {activeConv.tipo === "channel"
                      ? <Hash className="h-4 w-4" />
                      : initials(convDisplayName(activeConv, activeParts, user?.id))}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-semibold">
                      {convDisplayName(activeConv, activeParts, user?.id)}
                    </h2>
                    {activeConv.tipo === "channel" && activeConv.channel_role && (
                      <RoleBadge role={activeConv.channel_role} />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {activeParts.length} participante{activeParts.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef as never}>
                <div className="space-y-3">
                  {messages.map((m) => {
                    const mine = m.sender_id === user?.id;
                    const info = senderInfo(m.sender_id);
                    return (
                      <div key={m.id} className={cn("flex gap-2", mine && "flex-row-reverse")}>
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="text-[10px]">{initials(info.name)}</AvatarFallback>
                        </Avatar>
                        <div className={cn("max-w-[75%] space-y-1", mine && "items-end")}>
                          <div className={cn("flex items-center gap-2 text-xs", mine && "flex-row-reverse")}>
                            <span className="font-medium">{mine ? "Tú" : info.name}</span>
                            <RoleBadge role={info.role} />
                            <span className="text-muted-foreground">
                              {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <div
                            className={cn(
                              "rounded-2xl px-3 py-2 text-sm",
                              mine
                                ? "bg-brand text-brand-foreground"
                                : "bg-muted text-foreground",
                            )}
                          >
                            {m.contenido}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {messages.length === 0 && (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      Aún no hay mensajes en esta conversación.
                    </p>
                  )}
                </div>
              </ScrollArea>

              <div className="border-t p-3">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder="Escribe un mensaje..."
                    className="min-h-[44px] resize-none"
                    rows={1}
                  />
                  <Button onClick={send} disabled={sending || !text.trim()} size="icon" className="h-11 w-11 shrink-0">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function convDisplayName(c: Conversation, parts: Participant[] | undefined, myId: string | undefined): string {
  if (c.tipo === "channel") return c.nombre ?? "Canal";
  const other = (parts ?? []).find((p) => p.user_id !== myId);
  return other?.full_name ?? c.nombre ?? "Conversación directa";
}

/* ----------------- Nueva conversación (solo admin) ----------------- */

function NewConversationDialog({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<ConvType>("direct");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nombre, setNombre] = useState("");
  const [channelRole, setChannelRole] = useState<AppRole | "">("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: profs }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const roleMap = new Map<string, AppRole[]>();
      (roles ?? []).forEach((r) => {
        const arr = roleMap.get(r.user_id) ?? [];
        arr.push(r.role as AppRole);
        roleMap.set(r.user_id, arr);
      });
      setUsers(
        (profs ?? [])
          .filter((p) => p.id !== user?.id)
          .map((p) => ({
            id: p.id,
            full_name: p.full_name,
            email: p.email,
            roles: roleMap.get(p.id) ?? [],
          })),
      );
    })();
  }, [open, user?.id]);

  const reset = () => {
    setTipo("direct");
    setSelected(new Set());
    setNombre("");
    setChannelRole("");
    setSearch("");
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (tipo === "direct") {
      next.clear();
      next.add(id);
    } else {
      next.has(id) ? next.delete(id) : next.add(id);
    }
    setSelected(next);
  };

  const filteredUsers = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (u.full_name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q);
  });

  const create = async () => {
    if (!user) return;
    if (tipo === "direct" && selected.size !== 1) {
      toast.error("Selecciona 1 usuario para conversación directa");
      return;
    }
    if (tipo === "channel") {
      if (!nombre.trim()) return toast.error("Ponle un nombre al canal");
      if (selected.size === 0) return toast.error("Agrega al menos 1 participante");
    }

    setCreating(true);
    const { data: conv, error } = await supabase
      .from("conversations")
      .insert({
        tipo,
        nombre: tipo === "channel" ? nombre.trim() : null,
        channel_role: tipo === "channel" && channelRole ? channelRole : null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error || !conv) {
      setCreating(false);
      toast.error("No se pudo crear la conversación");
      return;
    }

    const participantes = [user.id, ...Array.from(selected)];
    const { error: pe } = await supabase
      .from("conversation_participants")
      .insert(participantes.map((uid) => ({ conversation_id: conv.id, user_id: uid })));

    setCreating(false);
    if (pe) {
      toast.error("Error al agregar participantes");
      return;
    }
    toast.success("Conversación creada");
    setOpen(false);
    reset();
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Nueva
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva conversación</DialogTitle>
          <DialogDescription>Crea un mensaje directo o un canal grupal por rol.</DialogDescription>
        </DialogHeader>

        <Tabs value={tipo} onValueChange={(v) => { setTipo(v as ConvType); setSelected(new Set()); }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="direct">Directo</TabsTrigger>
            <TabsTrigger value="channel">Canal</TabsTrigger>
          </TabsList>
        </Tabs>

        {tipo === "channel" && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Nombre del canal</label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Vendedores Norte" />
            </div>
            <div>
              <label className="text-sm font-medium">Rol asociado (opcional)</label>
              <Select value={channelRole} onValueChange={(v) => setChannelRole(v as AppRole)}>
                <SelectTrigger><SelectValue placeholder="Sin rol específico" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium">
            {tipo === "direct" ? "Selecciona el destinatario" : "Selecciona participantes"}
          </label>
          <Input
            placeholder="Buscar usuario..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2"
          />
          <ScrollArea className="h-64 rounded-md border">
            <ul className="divide-y">
              {filteredUsers.map((u) => {
                const checked = selected.has(u.id);
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => toggle(u.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted",
                        checked && "bg-muted",
                      )}
                    >
                      <Avatar className="h-8 w-8"><AvatarFallback className="text-[10px]">{initials(u.full_name)}</AvatarFallback></Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{u.full_name ?? "Sin nombre"}</span>
                          {u.roles[0] && <RoleBadge role={u.roles[0]} />}
                        </div>
                        <span className="text-xs text-muted-foreground truncate">{u.email}</span>
                      </div>
                      {checked && <Badge className="bg-brand text-brand-foreground">✓</Badge>}
                    </button>
                  </li>
                );
              })}
              {filteredUsers.length === 0 && (
                <li className="p-4 text-center text-sm text-muted-foreground">Sin resultados</li>
              )}
            </ul>
          </ScrollArea>
          {tipo === "channel" && (
            <p className="mt-1 text-xs text-muted-foreground">{selected.size} seleccionado(s)</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={create} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
