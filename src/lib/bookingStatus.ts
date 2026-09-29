import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  History,
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
  | "rejected_with_suggestion"
  /** RECORRENCIA, Etapa 6: a aula foi movida — esta linha fica como registro, a sucessora é a que vale. */
  | "rescheduled";

export interface StatusConfig {
  label: string;
  badgeClass: string;
  icon: LucideIcon;
}

const STATUS_MAP: Record<BookingStatus, StatusConfig> = {
  // Neutro: "agendada" é o estado calmo, está tudo certo. Vermelho (spec §12.1) fica pra ação e
  // urgência — aqui ele dividia a cor com "Faltou"/"Rejeitada" e com o botão principal.
  scheduled: { label: "Agendada", badgeClass: "bg-foreground/10 text-foreground", icon: Calendar },
  // Neutro com ✓ (StatusBadge): feito não disputa atenção. Era dourado e se confundia com o âmbar
  // de "Pendente"/"Sem registro" no selo pequeno.
  completed: { label: "Concluída", badgeClass: "border border-border text-muted-foreground", icon: CheckCircle },
  cancelled: { label: "Cancelada", badgeClass: "bg-muted text-muted-foreground", icon: XCircle },
  no_show: { label: "Faltou", badgeClass: "bg-destructive/20 text-[hsl(var(--red-text))]", icon: AlertTriangle },
  pending_confirmation: { label: "Pendente", badgeClass: "bg-amber/20 text-amber", icon: Clock },
  rejected: { label: "Rejeitada", badgeClass: "bg-destructive/20 text-[hsl(var(--red-text))]", icon: XCircle },
  rejected_with_suggestion: {
    label: "Sugestão enviada",
    badgeClass: "bg-amber/20 text-amber",
    icon: AlertTriangle,
  },
  rescheduled: { label: "Remarcada", badgeClass: "bg-muted text-muted-foreground", icon: History },
};

const FALLBACK: StatusConfig = {
  label: "—",
  badgeClass: "bg-muted text-muted-foreground",
  icon: XCircle,
};

/** Never index STATUS_MAP directly — always go through this so an unknown/legacy status renders safely. */
/**
 * Rótulos que mudam quando quem lê é o aluno. "Pendente" é a palavra do professor (ele tem uma
 * pendência pra resolver); pro aluno, o que importa é de quem ele está esperando.
 */
const STUDENT_LABEL: Partial<Record<BookingStatus, string>> = {
  pending_confirmation: "Aguardando o professor",
};

export function getStatusConfig(status: string | null | undefined, audience: "admin" | "student" = "admin"): StatusConfig {
  if (!status) return FALLBACK;
  const cfg = STATUS_MAP[status as BookingStatus] ?? FALLBACK;
  const studentLabel = audience === "student" ? STUDENT_LABEL[status as BookingStatus] : undefined;
  return studentLabel ? { ...cfg, label: studentLabel } : cfg;
}

export function isFutureStatus(status: BookingStatus) {
  return status === "scheduled" || status === "pending_confirmation";
}

/**
 * Derived, not a status of its own: a `scheduled` lesson whose time has already passed is not
 * silently completed anymore (that was the reconciliation bug) — it just waits for the professor
 * to declare what actually happened.
 */
export function isAwaitingConfirmation(status: BookingStatus, endTime: string) {
  return status === "scheduled" && new Date(endTime).getTime() < Date.now();
}
