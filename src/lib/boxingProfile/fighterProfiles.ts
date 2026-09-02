import type { Dimension } from "./dimensions";

export const FIGHTER_PROFILES = [
  "out_boxer",
  "pressure_fighter",
  "puncher",
  "counterpuncher",
  "boxer_puncher",
  "pressure_boxer",
] as const;

export type FighterProfileKey = (typeof FIGHTER_PROFILES)[number];

export const FIGHTER_PROFILE_LABELS: Record<FighterProfileKey, string> = {
  out_boxer: "Out-Boxer / Striker",
  pressure_fighter: "Pressure Fighter / Swarmer",
  puncher: "Puncher / Slugger",
  counterpuncher: "Counterpuncher",
  boxer_puncher: "Boxer-Puncher",
  pressure_boxer: "Pressure Boxer / Aggressive Boxer",
};

/** Texto do resultado — sempre em enquadramento de tendência/autopercepção, nunca de capacidade objetiva. */
export const FIGHTER_PROFILE_DESCRIPTIONS: Record<FighterProfileKey, string> = {
  out_boxer:
    "Seu perfil atual demonstra maior tendência a controlar a distância, usar o espaço do ringue e pontuar sem se expor à troca direta.",
  pressure_fighter:
    "Seu perfil atual demonstra maior tendência a encurtar distância, manter volume de golpes e desgastar o adversário com pressão constante.",
  puncher:
    "Seu perfil atual demonstra maior tendência a valorizar o impacto dos golpes, buscando oportunidades para finalizações contundentes.",
  counterpuncher:
    "Seu perfil atual demonstra maior tendência a observar o adversário, identificar padrões e transformar ataques em oportunidades de contra-ataque.",
  boxer_puncher:
    "Seu perfil atual demonstra maior tendência a combinar técnica e potência, adaptando entre construir ataques e responder ao adversário.",
  pressure_boxer:
    "Seu perfil atual demonstra maior tendência a manter pressão com organização técnica, combinando avanço constante com leitura tática.",
};

/**
 * MATRIZ DE PESOS — cada linha soma exatamente 1.00.
 *
 * Não é uma tentativa de "provar cientificamente" que alguém pertence a um perfil — é uma
 * heurística transparente: cada perfil recebe peso alto nas competências que o definem (a lista
 * "Dimensões relevantes" da especificação), e um resíduo pequeno nas outras, pra nenhuma
 * competência ficar em zero literal (mudar 1 ponto numa competência "irrelevante" ainda deveria
 * mexer minimamente no resultado, é assim que autoavaliação funciona na prática).
 *
 * Por que cada peso, perfil a perfil:
 *  - out_boxer: define-se por trabalhar à distância — movimentação/precisão/velocidade levam o
 *    peso principal; leitura entra porque controlar espaço exige antecipar o adversário; defesa
 *    tem um resíduo maior que os outros porque evitar troca também é evasão/distância.
 *  - pressure_fighter: ataque + condicionamento carregam a maior parte (volume e desgaste são a
 *    essência do swarmer); movimentação entra pelo corte de ringue; potência tem resíduo maior
 *    porque pressão de perto naturalmente aumenta o impacto percebido dos golpes.
 *  - puncher: potência domina, seguida de ataque (disposição pra trocar) e precisão (colocar o
 *    golpe certo); as demais ficam com resíduo mínimo — não é um estilo que depende delas.
 *  - counterpuncher: leitura + defesa + precisão são o próprio conceito de "ler e responder";
 *    velocidade entra porque o contra-golpe depende de reação rápida.
 *  - boxer_puncher: por definição um perfil versátil — cinco competências com peso próximo entre
 *    si (ataque/potência/precisão/movimentação/leitura), nenhuma isolada domina.
 *  - pressure_boxer: pressão "técnica" — ataque/movimentação/condicionamento/leitura, o que separa
 *    esse perfil do pressure_fighter puro é o peso maior em leitura e movimentação (pressão com
 *    inteligência tática, não só volume).
 */
export const FIGHTER_PROFILE_WEIGHTS: Record<FighterProfileKey, Record<Dimension, number>> = {
  out_boxer: {
    movement: 0.2,
    precision: 0.2,
    speed: 0.2,
    reading: 0.15,
    defense: 0.1,
    attack: 0.05,
    power: 0.05,
    conditioning: 0.05,
  },
  pressure_fighter: {
    attack: 0.28,
    conditioning: 0.22,
    movement: 0.15,
    power: 0.1,
    defense: 0.08,
    precision: 0.07,
    speed: 0.05,
    reading: 0.05,
  },
  puncher: {
    power: 0.3,
    attack: 0.25,
    precision: 0.15,
    conditioning: 0.1,
    movement: 0.06,
    defense: 0.06,
    speed: 0.04,
    reading: 0.04,
  },
  counterpuncher: {
    reading: 0.25,
    defense: 0.22,
    precision: 0.2,
    speed: 0.15,
    movement: 0.08,
    attack: 0.04,
    power: 0.03,
    conditioning: 0.03,
  },
  boxer_puncher: {
    attack: 0.18,
    power: 0.18,
    precision: 0.16,
    movement: 0.16,
    reading: 0.14,
    speed: 0.08,
    defense: 0.06,
    conditioning: 0.04,
  },
  pressure_boxer: {
    attack: 0.22,
    movement: 0.18,
    conditioning: 0.16,
    reading: 0.16,
    precision: 0.1,
    power: 0.08,
    defense: 0.06,
    speed: 0.04,
  },
};

/**
 * PESO DAS QUESTÕES COMPORTAMENTAIS (Q30-Q32) — bônus aditivo, em pontos (escala 0-100), somado
 * ao score de dimensões antes do clamp final. Cada questão contribui no máximo +4 pontos pro
 * perfil mais alinhado com a opção escolhida — um "voto" real, mas que nunca sozinho decide o
 * perfil (o grosso do score continua vindo das 29 questões técnicas). Um perfil que "vencesse" as
 * três questões comportamentais receberia no máximo +10 a +12 pontos de bônus total.
 *
 * A opção D de cada questão representa "alternar/variar" — por design, ela sempre favorece
 * boxer_puncher (a definição desse perfil é justamente versatilidade) e secundariamente
 * pressure_boxer (pressão que não depende só de trocação franca também é uma forma de variar).
 */
export const BEHAVIORAL_WEIGHTS: Record<string, Partial<Record<FighterProfileKey, number>>> = {
  // Q30 — adversário que recua bastante
  "q30:A": { out_boxer: 4, counterpuncher: 2 }, // controlar distância e pontuar de fora
  "q30:B": { pressure_fighter: 4, pressure_boxer: 2 }, // cortar o ringue, pressão contínua
  "q30:C": { puncher: 4, counterpuncher: 2 }, // esperar abertura clara pro golpe forte
  "q30:D": { boxer_puncher: 4, pressure_boxer: 2 }, // alternar pressão e movimentação

  // Q31 — adversário inicia o ataque
  "q31:A": { out_boxer: 4 }, // sair da distância e reconstruir
  "q31:B": { counterpuncher: 4, boxer_puncher: 2 }, // defender e contra-atacar imediatamente
  "q31:C": { puncher: 4, pressure_fighter: 2 }, // permanecer perto e trocar golpes
  "q31:D": { boxer_puncher: 3, out_boxer: 2 }, // criar ângulo e responder

  // Q32 — quando está em vantagem
  "q32:A": { out_boxer: 4, counterpuncher: 2 }, // controlar o ritmo, minimizar risco
  "q32:B": { pressure_fighter: 4, pressure_boxer: 2 }, // aumentar pressão e volume
  "q32:C": { puncher: 4, boxer_puncher: 2 }, // buscar golpes mais contundentes
  "q32:D": { boxer_puncher: 4, pressure_boxer: 2 }, // variar estratégia
};

/**
 * Desempate determinístico, em duas etapas — nunca depende da ordem de iteração de um objeto/array:
 *  1. Se os scores finais empatarem, vence quem tiver o maior score na sua própria competência de
 *     maior peso (a competência que mais define aquele perfil).
 *  2. Se ainda empatar, usa esta ordem de prioridade global fixa — arbitrária, mas documentada e
 *     estável: perfis mais "específicos" (dependem de poucas competências dominantes) vêm antes de
 *     perfis mais "genéricos" (versáteis por definição), na ideia de que um empate real tende a
 *     favorecer a leitura mais distintiva do resultado.
 */
export const PROFILE_TIEBREAK_PRIORITY: FighterProfileKey[] = [
  "counterpuncher",
  "puncher",
  "out_boxer",
  "pressure_fighter",
  "pressure_boxer",
  "boxer_puncher",
];
