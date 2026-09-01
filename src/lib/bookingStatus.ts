import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export type BookingStatus =
  | "scheduled"
  | "completed"
  | "cancelled"
  | "no_show"
  | "pending_confirmation"
  | "rejected"
  | "rejected_with_suggestion";

export interface StatusConfig {
  label: string;
  badgeClass: string;
  icon: LucideIcon;
}

const STATUS_MAP: Record<BookingStatus, StatusConfig> = {
  scheduled: { label: "Agendada", badgeClass: "bg-primary/20 text-primary", icon: Calendar },
  completed: { label: "Concluída", badgeClass: "bg-accent/20 text-accent", icon: CheckCircle },
  cancelled: { label: "Cancelada", badgeClass: "bg-muted text-muted-foreground", icon: XCircle },
  no_show: { label: "Faltou", badgeClass: "bg-destructive/20 text-destructive", icon: AlertTriangle },
  pending_confirmation: { label: "Pendente", badgeClass: "bg-amber/20 text-amber", icon: Clock },
  rejected: { label: "Rejeitada", badgeClass: "bg-destructive/20 text-destructive", icon: XCircle },
  rejected_with_suggestion: {
    label: "Sugestão enviada",
    badgeClass: "bg-amber/20 text-amber",
    icon: AlertTriangle,
  },
};

const FALLBACK: StatusConfig = {
  label: "—",
  badgeClass: "bg-muted text-muted-foreground",
  icon: XCircle,
};

/** Never index STATUS_MAP directly — always go through this so an unknown/legacy status renders safely. */
export function getStatusConfig(status: string | null | undefined): StatusConfig {
  if (!status) return FALLBACK;
  return STATUS_MAP[status as BookingStatus] ?? FALLBACK;
}

export function isFutureStatus(status: BookingStatus) {
  return status === "scheduled" || status === "pending_confirmation";
}
