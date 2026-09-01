import { useState } from "react";
import { Bell, CalendarClock, XCircle, CheckCircle2, Info } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/dateUtils";
import {
  clearNotifications,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  restoreNotifications,
} from "@/integrations/backend/api";
import type { AppNotification } from "@/integrations/backend/types";

const KIND_ICON = { booking: CalendarClock, cancel: XCircle, confirm: CheckCircle2, system: Info } as const;

interface NotificationBellProps {
  userId: string;
  /** where "booking"-kind notifications should navigate to on open */
  bookingRoute: string;
  /** where "cancel"-kind (suggestion) notifications should navigate to, if different */
  cancelRoute?: string;
}

export function NotificationBell({ userId, bookingRoute, cancelRoute }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const key = ["notifications", userId];

  const { data: notifs = [] } = useQuery({ queryKey: key, queryFn: () => getNotifications(userId) });
  const unread = notifs.filter((n) => !n.read).length;

  const openNotif = useMutation({
    mutationFn: (n: AppNotification) => markNotificationRead(n.id),
    onSuccess: (_r, n) => {
      queryClient.invalidateQueries({ queryKey: key });
      setOpen(false);
      if (n.kind === "booking") navigate(bookingRoute);
      if (n.kind === "cancel" && cancelRoute) navigate(cancelRoute);
    },
  });

  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.success("Todas as notificações marcadas como lidas");
    },
  });

  const clearAll = useMutation({
    mutationFn: () => clearNotifications(userId),
    onSuccess: (removed) => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.warning("Central limpa", {
        action: {
          label: "Desfazer",
          onClick: async () => {
            await restoreNotifications(removed);
            queryClient.invalidateQueries({ queryKey: key });
          },
        },
      });
    },
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Notificações"
        className="relative h-[42px] w-[42px] rounded-[13px] bg-secondary border border-border flex items-center justify-center active:scale-95 transition-transform"
      >
        <Bell className="h-[18px] w-[18px] text-foreground/90" />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[19px] h-[19px] px-1 rounded-full bg-primary text-primary-foreground text-[10.5px] font-bold flex items-center justify-center border-2 border-background">
            {unread}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex flex-col max-h-[78vh]">
          <div className="flex items-center gap-2.5 mb-3.5">
            <div className="flex-1">
              <SheetTitle>NOTIFICAÇÕES</SheetTitle>
              <div className="text-xs text-muted-foreground mt-0.5">{unread} não lida(s)</div>
            </div>
            {notifs.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => markAll.mutate()}>
                Marcar todas
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col gap-2.5">
            {notifs.length === 0 && (
              <EmptyState
                icon={Bell}
                title="Nenhuma notificação"
                description="Novos agendamentos e avisos aparecem aqui."
              />
            )}
            {notifs.map((n) => {
              const Icon = KIND_ICON[n.kind];
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openNotif.mutate(n)}
                  className={cn(
                    "w-full text-left flex gap-2.5 items-start p-3.5 rounded-2xl border transition-all active:scale-[0.985]",
                    n.read ? "bg-card border-border/60" : "bg-primary/[0.07] border-primary/30",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 mt-0.5 shrink-0",
                      n.kind === "cancel"
                        ? "text-destructive"
                        : n.kind === "confirm"
                          ? "text-accent"
                          : n.kind === "system"
                            ? "text-muted-foreground"
                            : "text-amber",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className={cn("text-sm font-semibold", n.read ? "text-muted-foreground" : "text-foreground")}>
                      {n.title}
                    </div>
                    <div className="text-[12.5px] text-muted-foreground mt-0.5 leading-snug">{n.description}</div>
                    <div className="text-[11px] text-muted-foreground/70 mt-1">{relativeTime(n.createdAt)}</div>
                  </div>
                  {!n.read && (
                    <span className="shrink-0 text-[10px] font-bold px-1.5 py-1 rounded-full bg-primary/20 text-primary">
                      Nova
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {notifs.length > 0 && (
            <Button variant="secondary" className="mt-3 h-11 shrink-0" onClick={() => setConfirmClear(true)}>
              Limpar central
            </Button>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="LIMPAR NOTIFICAÇÕES"
        description="Todas as notificações serão removidas da central."
        confirmLabel="Limpar"
        onConfirm={() => clearAll.mutate()}
      />
    </>
  );
}
