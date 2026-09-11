import type { AppNotification } from "@/integrations/backend/types";
import type { Role } from "@/integrations/backend/types";

/**
 * Único lugar que sabe transformar `entity` em rota. Tocar numa notificação nunca deveria
 * precisar que o componente saiba "aula = /app/aula/:id para aluno, /admin/aula/:id para admin" —
 * isso fica aqui, uma vez.
 */
export function notificationHref(n: Pick<AppNotification, "entity">, role: Role): string | null {
  if (!n.entity) return null;
  if (n.entity.type === "booking") {
    return role === "admin" ? `/admin/aula/${n.entity.id}` : `/app/aula/${n.entity.id}`;
  }
  if (n.entity.type === "purchase_requests") {
    return role === "admin" ? "/admin/solicitacoes" : "/app/pacotes";
  }
  if (n.entity.type === "boxing_profile") {
    // Só o aluno recebe esta notificação (deriveNotifications só a gera no ramo dele) — a
    // comparação aparece inline em /app/perfil-lutador agora, sem rota própria.
    return role === "admin" ? null : "/app/perfil-lutador";
  }
  return null;
}
