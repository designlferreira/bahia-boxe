/**
 * Formato do jsonb `class_guidelines.equipment`. Estruturado (não texto livre) porque luvas e
 * bandagem têm dimensões reais (tamanho, obrigatório x recomendado) que a tela de detalhe da aula
 * precisa renderizar como conteúdo, não só exibir de volta.
 */
export interface EquipmentConfig {
  gloves?: { level: "required" | "recommended"; sizes: string[] };
  wraps?: { level: "required" | "recommended"; lengths: string[] };
  mouthguard?: boolean;
  groinGuard?: boolean;
  headgear?: boolean;
  shinGuards?: boolean;
}

export interface ClassGuidelines {
  adminId: string;
  cep: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  referencePoint: string | null;
  arrivalMinutes: number | null;
  equipment: EquipmentConfig;
  notes: string | null;
}

export const GLOVE_SIZES = ["10oz", "12oz", "14oz", "16oz", "outra"];
export const WRAP_LENGTHS = ["3m", "5m", "outra"];
export const ARRIVAL_OPTIONS = [5, 10, 15, 20, 30];

/** Endereço em uma linha, pronto pra exibir — "" se não há nada preenchido. */
export function formatAddress(g: Pick<ClassGuidelines, "street" | "number" | "complement" | "neighborhood" | "city" | "state">) {
  if (!g.street) return "";
  const line1 = [g.street, g.number].filter(Boolean).join(", ");
  const line2 = [g.complement, g.neighborhood].filter(Boolean).join(" — ");
  const line3 = [g.city, g.state].filter(Boolean).join("/");
  return [line1, line2, line3].filter(Boolean).join(" · ");
}

export function hasAddress(g: Pick<ClassGuidelines, "street">) {
  return !!g.street?.trim();
}

export function mapsUrl(g: Pick<ClassGuidelines, "street" | "number" | "neighborhood" | "city" | "state">) {
  const q = [g.street, g.number, g.neighborhood, g.city, g.state].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** "Recomendamos chegar 15 minutos antes para se preparar para a aula." */
export function arrivalMessage(minutes: number | null) {
  if (!minutes || minutes <= 0) return null;
  return `Recomendamos chegar ${minutes} minutos antes para se preparar para a aula.`;
}

/** Converte a config estruturada em itens prontos pra lista "O que levar" — nunca inclui o que não foi marcado. */
export function equipmentItems(eq: EquipmentConfig | null | undefined): { label: string; sub?: string }[] {
  if (!eq) return [];
  const items: { label: string; sub?: string }[] = [];
  if (eq.gloves && eq.gloves.sizes.length > 0) {
    items.push({
      label: "Luvas",
      sub: `${eq.gloves.sizes.join(" ou ")}${eq.gloves.level === "required" ? " · obrigatório" : ""}`,
    });
  }
  if (eq.wraps && eq.wraps.lengths.length > 0) {
    items.push({
      label: "Bandagem",
      sub: `${eq.wraps.lengths.join(" ou ")}${eq.wraps.level === "required" ? " · obrigatório" : ""}`,
    });
  }
  if (eq.mouthguard) items.push({ label: "Protetor bucal" });
  if (eq.groinGuard) items.push({ label: "Coquilha" });
  if (eq.headgear) items.push({ label: "Capacete" });
  if (eq.shinGuards) items.push({ label: "Caneleiras" });
  return items;
}
