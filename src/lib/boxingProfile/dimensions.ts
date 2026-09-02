/**
 * As oito competências do radar. Única fonte da lista — nada mais no app deve declarar essa
 * enumeração de novo.
 */
export const DIMENSIONS = [
  "attack",
  "defense",
  "power",
  "speed",
  "movement",
  "precision",
  "reading",
  "conditioning",
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<Dimension, string> = {
  attack: "Ataque",
  defense: "Defesa",
  power: "Potência",
  speed: "Velocidade",
  movement: "Movimentação",
  precision: "Precisão",
  reading: "Leitura tática",
  conditioning: "Condicionamento",
};

/** Curto, pra caber no eixo do radar. */
export const DIMENSION_SHORT_LABELS: Record<Dimension, string> = {
  attack: "Ataque",
  defense: "Defesa",
  power: "Potência",
  speed: "Veloc.",
  movement: "Moviment.",
  precision: "Precisão",
  reading: "Leitura",
  conditioning: "Condic.",
};
