import type { Guard, Laterality, Sex } from "@/integrations/backend/types";

export const SEX_LABELS: Record<Sex, string> = {
  female: "Feminino",
  male: "Masculino",
  other: "Outro",
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
export function lateralityLabel(v: Laterality | null) {
  return v ? LATERALITY_LABELS[v] : NOT_INFORMED;
}

export interface GuardInfo {
  label: string;
  /** Uma linha, pro card. */
  summary: string;
  /** O que é / como funciona — vai no corpo do modal. */
  description: string;
  pros: string[];
  cons: string[];
}

/**
 * As guardas reais do boxe — dois grupos diferentes de decisão que, na prática, um lutador só
 * escolhe uma resposta pra "qual é a sua guarda": orientação de base (orthodox/southpaw/switch) e
 * estilo de posicionamento de braço (peekaboo/cross_arm/philly_shell/long_guard).
 */
export const GUARD_INFO: Record<Guard, GuardInfo> = {
  orthodox: {
    label: "Ortodoxa",
    summary: "Pé esquerdo à frente, mão direita atrás — a base padrão para destros.",
    description:
      "Pé esquerdo e ombro esquerdo à frente, mão direita (a mais forte, para a maioria) atrás, pronta para o golpe de poder. É a orientação mais comum no boxe, usada pela maioria dos destros. O jab sai da mão da frente (esquerda) e o cruzado de poder da mão de trás (direita).",
    pros: [
      "Mais natural para quem é destro",
      "Maior volume de referência técnica e de parceiros de treino no mesmo estilo",
      "Facilita encontrar adversários acostumados a treinar contra essa orientação",
    ],
    cons: [
      "Mais previsível contra quem já enfrentou muitos ortodoxos",
      "Ângulo desfavorável contra um southpaw — os pés da frente se cruzam, exigindo ajuste de posicionamento",
    ],
  },
  southpaw: {
    label: "Southpaw (canhota)",
    summary: "Espelho da ortodoxa: pé direito à frente, mão esquerda atrás.",
    description:
      "O espelho da guarda ortodoxa — pé direito e ombro direito à frente, mão esquerda atrás como golpe de poder. Usada por muitos canhotos, mas também por destros que preferem essa orientação. O jab sai da mão da frente (direita) e o cruzado de poder da mão de trás (esquerda).",
    pros: [
      "Incomum no dia a dia de treino, o que confunde adversários pouco acostumados a essa orientação",
      "Ângulo natural para o cruzado de esquerda passar por fora da guarda de um ortodoxo",
    ],
    cons: [
      "Menos parceiros de treino no mesmo estilo",
      "Muitos southpaws enfrentam mais ortodoxos do que o contrário, então acumulam menos repertório contra o próprio espelho",
    ],
  },
  switch: {
    label: "Alternada (switch-hitter)",
    summary: "Alterna entre ortodoxa e southpaw durante a própria luta.",
    description:
      "Quem luta na guarda alternada troca de base — de ortodoxa para southpaw e vice-versa — no meio do combate, mudando o ângulo de ataque e a leitura que o adversário tem da distância.",
    pros: [
      "Imprevisibilidade: dobra os ângulos de ataque disponíveis",
      "Dificulta o adversário se adaptar a um único padrão",
    ],
    cons: [
      "Exige domínio técnico equivalente nos dois lados, não só em um",
      "Trocar de base no momento errado pode deixar a guarda momentaneamente aberta",
    ],
  },
  peekaboo: {
    label: "Peek-a-boo",
    summary: "Mãos bem altas perto do rosto, cotovelos fechados, cabeça sempre em movimento.",
    description:
      "Guarda alta e compacta: as luvas ficam próximas ao rosto, os cotovelos fecham as costelas, e a cabeça se movimenta constantemente para dificultar que o adversário acerte. Costuma vir acompanhada de pressão constante para fechar a distância e trabalhar de perto.",
    pros: [
      "Excelente proteção de cabeça e corpo ao mesmo tempo",
      "Favorece combinações rápidas em distância curta",
    ],
    cons: [
      "Exige ótimo condicionamento físico e trabalho de pernas para sustentar o movimento de cabeça",
      "Fica vulnerável a jabs e golpes longos enquanto ainda está fechando a distância",
    ],
  },
  cross_arm: {
    label: "Cruzada",
    summary: "Antebraços cruzados na frente do tronco, formando um bloqueio em \"X\".",
    description:
      "Os antebraços se cruzam na frente do corpo, um mais alto que o outro, bloqueando o caminho de socos ao corpo e à cabeça. O contra-ataque parte de dentro desse bloqueio, geralmente depois de absorver ou desviar o golpe do adversário.",
    pros: [
      "Defesa sólida contra golpes ao corpo",
      "Difícil de ler para quem não está acostumado a enfrentar essa guarda",
    ],
    cons: [
      "Limita a velocidade de saída dos golpes de poder, já que os braços partem de uma posição mais fechada",
      "Pouco usada — poucos parceiros de treino e referências para se aperfeiçoar nela",
    ],
  },
  philly_shell: {
    label: "Filipina (guarda de ombro)",
    summary: "Ombro de trás protege o queixo, mão da frente baixa — defesa por deslocamento de tronco.",
    description:
      "Também chamada de \"philly shell\": o ombro do braço de trás sobe para proteger o queixo, a mão da frente fica baixa e solta, e o tronco gira levemente para desviar golpes em vez de bloqueá-los com os braços. O contra-ataque sai do braço de trás, aproveitando o desvio.",
    pros: [
      "Economiza energia — a defesa vem do deslocamento do tronco, não de bloquear cada golpe",
      "Ótima para contra-ataque e leitura de distância; difícil de acertar para quem não tem experiência contra ela",
    ],
    cons: [
      "Exige excelente timing e anos de prática para ser eficaz",
      "A mão da frente baixa expõe a golpes rápidos se o timing falhar",
    ],
  },
  long_guard: {
    label: "Guarda longa",
    summary: "Braço da frente estendido na direção do adversário, controlando a distância.",
    description:
      "O braço da frente fica estendido em direção ao adversário, funcionando como uma régua que mede e controla a distância — empurra, desvia e atrapalha a aproximação antes mesmo de o golpe sair.",
    pros: [
      "Excelente para controlar a distância contra adversários mais agressivos",
      "Vantajosa para quem tem mais alcance ou envergadura",
    ],
    cons: [
      "O braço estendido gasta energia e pode ser agarrado ou puxado pelo adversário",
      "Menos natural para combinações rápidas em distância curta",
    ],
  },
};

export function guardLabel(v: Guard | null) {
  return v ? GUARD_INFO[v].label : NOT_INFORMED;
}

/** Mantido para quem só precisa do rótulo (ex.: gráficos), sem carregar o texto todo do modal. */
export const GUARD_LABELS: Record<Guard, string> = Object.fromEntries(
  (Object.keys(GUARD_INFO) as Guard[]).map((g) => [g, GUARD_INFO[g].label]),
) as Record<Guard, string>;
