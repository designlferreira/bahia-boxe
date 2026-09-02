import type { Guard, Laterality, Sex } from "@/integrations/backend/types";

export const SEX_LABELS: Record<Sex, string> = {
  female: "Feminino",
  male: "Masculino",
  other: "Outro",
};

export const GUARD_LABELS: Record<Guard, string> = {
  orthodox: "Ortodoxa",
  southpaw: "Southpaw",
  switch: "Alternada",
};

export const LATERALITY_LABELS: Record<Laterality, string> = {
  right: "Destro",
  left: "Canhoto",
  ambidextrous: "Ambidestro",
};

const NOT_INFORMED = "Não informado";

export function sexLabel(v: Sex | null) {
  return v ? SEX_LABELS[v] : NOT_INFORMED;
}
export function guardLabel(v: Guard | null) {
  return v ? GUARD_LABELS[v] : NOT_INFORMED;
}
export function lateralityLabel(v: Laterality | null) {
  return v ? LATERALITY_LABELS[v] : NOT_INFORMED;
}
