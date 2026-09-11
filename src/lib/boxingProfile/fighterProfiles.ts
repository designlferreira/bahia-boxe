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
 * VOTOS DAS QUESTÕES DE ESCOLHA FORÇADA — cada opção escolhida vale até +4 "votos" pro perfil mais
 * alinhado (às vezes +2 pra um segundo, como voto de consolação). v1 somava isso como bônus
 * aditivo direto ao score de dimensões; v2 normaliza (votos recebidos ÷ votos possíveis nos itens
 * aplicáveis) num score próprio de 0-100 e faz uma MISTURA PONDERADA com o score de dimensões —
 * `FORCED_CHOICE_WEIGHT` em `assessmentLength.ts` decide a fração de cada um (24% completa / 30%
 * curta). Ver `computeProfileScoresRaw` em `scoring.ts`; a mudança de mecânica está registrada no
 * CLAUDE.md ("Peso da escolha forçada").
 *
 * Q30-Q32 são os 3 itens originais; Q33-Q35 (FC-A/B/C) são os 3 novos compartilhados entre aluno e
 * professor; Q36-Q37 (FC-D/E) são self-only, sobre motivação interna.
 *
 * Em Q30-Q32, a opção D representa "alternar/variar" — por design, ela sempre favorece
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

  // FC-A (q33) — comportamento sob fadiga: "fadiga remove controle consciente, o que sobra é a
  // tendência real" — o item mais discriminante do conjunto novo (CLAUDE.md, item 3).
  "q33:A": { pressure_fighter: 4, puncher: 2 }, // avançar mais, resolver logo
  "q33:B": { out_boxer: 4 }, // recuar e usar o jab para controlar o que sobrou
  "q33:C": { puncher: 4 }, // economizar e esperar o golpe decisivo
  "q33:D": { counterpuncher: 4 }, // esperar o erro do adversário

  // FC-B (q34) — depois de machucar o adversário
  "q34:A": { pressure_fighter: 4, puncher: 2 }, // ir para cima para finalizar
  "q34:B": { boxer_puncher: 4 }, // manter o plano, sem se afobar
  "q34:C": { out_boxer: 4 }, // recuar e reorganizar antes de voltar
  "q34:D": { counterpuncher: 4 }, // esperar a reação do adversário para aproveitar

  // FC-C (q35) — contra desvantagem física: obriga decisão estratégica com custo, sem opção confortável.
  "q35:A": { out_boxer: 4 }, // distância e movimentação
  "q35:B": { pressure_fighter: 4 }, // colar para anular a força
  "q35:C": { counterpuncher: 4 }, // esperar o adversário se abrir e punir o erro (timing, não potência)
  "q35:D": { puncher: 4 }, // trocar mesmo assim

  // FC-D (q36) — fonte de satisfação, SELF-ONLY: motivação interna é mais estável que técnica e
  // menos sujeita a desejabilidade social (nenhuma opção é "a resposta certa").
  "q36:A": { counterpuncher: 4, out_boxer: 2 }, // acertar um golpe difícil no momento exato
  "q36:B": { pressure_fighter: 4 }, // impor o ritmo do começo ao fim
  "q36:C": { puncher: 4 }, // ter batido forte
  "q36:D": { out_boxer: 4 }, // não ter sido tocado
  "q36:E": { boxer_puncher: 4 }, // ter feito tudo que treinou

  // FC-E (q37) — treino preferido, SELF-ONLY: mesma razão de q36.
  "q37:A": { out_boxer: 4, counterpuncher: 2 }, // sparring técnico, sem força
  "q37:B": { pressure_fighter: 4, puncher: 2 }, // sparring forte
  "q37:C": { puncher: 4 }, // saco pesado
  "q37:D": { boxer_puncher: 4 }, // manopla e coordenação
  "q37:E": { pressure_fighter: 4 }, // corda, corrida, condicionamento
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
