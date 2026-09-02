import type { AssessmentType } from "./assessmentType";
import type { Dimension } from "./dimensions";

export const LIKERT_OPTIONS = [
  { value: 1, label: "Quase nunca" },
  { value: 2, label: "Raramente" },
  { value: 3, label: "Às vezes" },
  { value: 4, label: "Frequentemente" },
  { value: 5, label: "Quase sempre" },
] as const;

export interface LikertQuestion {
  id: string; // "q1".."q29"
  type: "likert";
  dimension: Dimension;
  text: string;
}

export interface BehavioralOption {
  value: "A" | "B" | "C" | "D";
  label: string;
}

export interface BehavioralQuestion {
  id: string; // "q30".."q32"
  type: "behavioral";
  text: string;
  options: BehavioralOption[];
}

export type Question = LikertQuestion | BehavioralQuestion;

type LikertSkeleton = { id: string; type: "likert"; dimension: Dimension };
type BehavioralSkeleton = { id: string; type: "behavioral"; options: BehavioralOption[] };
type QuestionSkeleton = LikertSkeleton | BehavioralSkeleton;

/**
 * Os 32 ids, na ordem do questionário, com dimensão (Q1-29) ou opções (Q30-32) — a ÚNICA fonte
 * disso. 'self' e 'coach' compartilham exatamente este esqueleto: mesmo id, mesma dimensão, mesmas
 * opções comportamentais. Só o texto muda de voz (ver `SELF_TEXT`/`COACH_TEXT` abaixo), então o
 * motor de pontuação (que só olha `id`/`dimension`/`options`, nunca `text`) funciona sem alteração
 * pras duas avaliações.
 */
const QUESTION_SKELETON: QuestionSkeleton[] = [
  // Ataque — Q1-Q4
  { id: "q1", type: "likert", dimension: "attack" },
  { id: "q2", type: "likert", dimension: "attack" },
  { id: "q3", type: "likert", dimension: "attack" },
  { id: "q4", type: "likert", dimension: "attack" },

  // Defesa — Q5-Q8
  { id: "q5", type: "likert", dimension: "defense" },
  { id: "q6", type: "likert", dimension: "defense" },
  { id: "q7", type: "likert", dimension: "defense" },
  { id: "q8", type: "likert", dimension: "defense" },

  // Movimentação — Q9-Q12
  { id: "q9", type: "likert", dimension: "movement" },
  { id: "q10", type: "likert", dimension: "movement" },
  { id: "q11", type: "likert", dimension: "movement" },
  { id: "q12", type: "likert", dimension: "movement" },

  // Precisão — Q13-Q15
  { id: "q13", type: "likert", dimension: "precision" },
  { id: "q14", type: "likert", dimension: "precision" },
  { id: "q15", type: "likert", dimension: "precision" },

  // Potência percebida — Q16-Q18
  { id: "q16", type: "likert", dimension: "power" },
  { id: "q17", type: "likert", dimension: "power" },
  { id: "q18", type: "likert", dimension: "power" },

  // Velocidade — Q19-Q21
  { id: "q19", type: "likert", dimension: "speed" },
  { id: "q20", type: "likert", dimension: "speed" },
  { id: "q21", type: "likert", dimension: "speed" },

  // Leitura tática — Q22-Q25
  { id: "q22", type: "likert", dimension: "reading" },
  { id: "q23", type: "likert", dimension: "reading" },
  { id: "q24", type: "likert", dimension: "reading" },
  { id: "q25", type: "likert", dimension: "reading" },

  // Condicionamento — Q26-Q29
  { id: "q26", type: "likert", dimension: "conditioning" },
  { id: "q27", type: "likert", dimension: "conditioning" },
  { id: "q28", type: "likert", dimension: "conditioning" },
  { id: "q29", type: "likert", dimension: "conditioning" },

  // Comportamentais — Q30-Q32 (as opções já são neutras em 3ª pessoa, valem pras duas vozes)
  {
    id: "q30",
    type: "behavioral",
    options: [
      { value: "A", label: "Controlar a distância e pontuar de fora." },
      { value: "B", label: "Cortar o ringue e pressionar continuamente." },
      { value: "C", label: "Esperar uma abertura clara para colocar um golpe forte." },
      { value: "D", label: "Alternar pressão e movimentação conforme a situação." },
    ],
  },
  {
    id: "q31",
    type: "behavioral",
    options: [
      { value: "A", label: "Sair da distância e reconstruir a ação." },
      { value: "B", label: "Defender e imediatamente contra-atacar." },
      { value: "C", label: "Permanecer perto e trocar golpes." },
      { value: "D", label: "Criar um ângulo e responder." },
    ],
  },
  {
    id: "q32",
    type: "behavioral",
    options: [
      { value: "A", label: "Controlar o ritmo e minimizar riscos." },
      { value: "B", label: "Aumentar a pressão e o volume." },
      { value: "C", label: "Buscar oportunidades para golpes mais contundentes." },
      { value: "D", label: "Variar estratégia para dificultar a adaptação." },
    ],
  },
];

/** Texto na voz do aluno, respondendo sobre si mesmo — o questionário original (Fase 1). */
const SELF_TEXT: Record<string, string> = {
  q1: "Quando consigo encurtar a distância, consigo manter uma sequência de golpes sem me desorganizar.",
  q2: "Consigo alternar golpes na cabeça e no corpo durante minhas combinações.",
  q3: "Consigo iniciar ataques sem depender exclusivamente do adversário atacar primeiro.",
  q4: "Depois de acertar um golpe, normalmente consigo dar continuidade à ação em vez de interromper o ataque.",

  q5: "Consigo defender golpes retos sem simplesmente recuar para longe.",
  q6: "Depois de atacar, consigo sair da linha de ataque ou me reposicionar defensivamente.",
  q7: "Uso diferentes recursos defensivos — bloqueio, esquiva, passo, pêndulo, paradas — dependendo da situação.",
  q8: "Quando sou pressionado, consigo manter a calma e me defender sem perder completamente minha organização.",

  q9: "Consigo entrar na minha distância de ataque sem receber golpes limpos com frequência.",
  q10: "Consigo sair da distância do adversário depois de atacar.",
  q11: "Uso passos laterais e mudanças de ângulo durante o combate.",
  q12: "Consigo perceber quando estou na distância adequada para atacar.",

  q13: "Meus golpes costumam encontrar o alvo mesmo quando o adversário está se movimentando.",
  q14: "Consigo perceber aberturas na guarda e atacá-las rapidamente.",
  q15: "Consigo acertar golpes durante ou imediatamente após uma ação do adversário.",

  q16: "Quando acerto um golpe limpo, normalmente percebo impacto significativo no adversário ou nos aparadores.",
  q17: "Consigo gerar golpes fortes sem precisar me desequilibrar ou carregar excessivamente o movimento.",
  q18: "Mesmo em combinações, consigo manter impacto nos golpes.",

  q19: "Consigo executar combinações rapidamente sem perder a técnica.",
  q20: "Consigo atacar uma abertura antes que ela desapareça.",
  q21: "Consigo mudar rapidamente de ataque para defesa e de defesa para ataque.",

  q22: "Durante o sparring, consigo identificar padrões no comportamento do adversário.",
  q23: "Quando uma estratégia não funciona, consigo mudar minha abordagem durante o round.",
  q24: "Uso fintas ou mudanças de ritmo para provocar reações no adversário.",
  q25: "Consigo perceber quais golpes ou movimentações estão funcionando melhor contra determinado adversário.",

  q26: "Consigo manter meu volume de golpes nos últimos rounds.",
  q27: "Mesmo cansado, consigo manter minha técnica e minha guarda organizadas.",
  q28: "Minha movimentação continua eficiente conforme o treino ou sparring avança.",
  q29: "Recupero-me bem durante os intervalos entre rounds.",

  q30: "Quando enfrento alguém que recua bastante, prefiro:",
  q31: "Quando o adversário inicia um ataque, minha tendência natural é:",
  q32: "Quando tenho vantagem no combate, prefiro:",
};

/**
 * Texto na voz do professor, observando o aluno — Fase 2 (avaliação 'coach'). Mesmo conteúdo
 * técnico de cada pergunta do `SELF_TEXT`, reformulado em 3ª pessoa; nenhuma pergunta foi
 * adicionada, removida ou trocada de dimensão.
 */
const COACH_TEXT: Record<string, string> = {
  q1: "Quando consegue encurtar a distância, o aluno mantém uma sequência de golpes sem se desorganizar.",
  q2: "O aluno consegue alternar golpes na cabeça e no corpo durante as combinações dele.",
  q3: "O aluno consegue iniciar ataques sem depender exclusivamente do adversário atacar primeiro.",
  q4: "Depois de acertar um golpe, o aluno normalmente dá continuidade à ação em vez de interromper o ataque.",

  q5: "O aluno consegue defender golpes retos sem simplesmente recuar para longe.",
  q6: "Depois de atacar, o aluno consegue sair da linha de ataque ou se reposicionar defensivamente.",
  q7: "O aluno usa diferentes recursos defensivos — bloqueio, esquiva, passo, pêndulo, paradas — dependendo da situação.",
  q8: "Quando é pressionado, o aluno mantém a calma e se defende sem perder completamente a organização.",

  q9: "O aluno consegue entrar na distância de ataque sem receber golpes limpos com frequência.",
  q10: "O aluno consegue sair da distância do adversário depois de atacar.",
  q11: "O aluno usa passos laterais e mudanças de ângulo durante o combate.",
  q12: "O aluno percebe quando está na distância adequada para atacar.",

  q13: "Os golpes do aluno costumam encontrar o alvo mesmo quando o adversário está se movimentando.",
  q14: "O aluno percebe aberturas na guarda do adversário e as ataca rapidamente.",
  q15: "O aluno consegue acertar golpes durante ou imediatamente após uma ação do adversário.",

  q16: "Quando o aluno acerta um golpe limpo, normalmente há impacto significativo no adversário ou nos aparadores.",
  q17: "O aluno consegue gerar golpes fortes sem precisar se desequilibrar ou carregar excessivamente o movimento.",
  q18: "Mesmo em combinações, o aluno mantém impacto nos golpes.",

  q19: "O aluno consegue executar combinações rapidamente sem perder a técnica.",
  q20: "O aluno consegue atacar uma abertura antes que ela desapareça.",
  q21: "O aluno consegue mudar rapidamente de ataque para defesa e de defesa para ataque.",

  q22: "Durante o sparring, o aluno identifica padrões no comportamento do adversário.",
  q23: "Quando uma estratégia não funciona, o aluno muda a abordagem durante o round.",
  q24: "O aluno usa fintas ou mudanças de ritmo para provocar reações no adversário.",
  q25: "O aluno percebe quais golpes ou movimentações estão funcionando melhor contra determinado adversário.",

  q26: "O aluno mantém o volume de golpes nos últimos rounds.",
  q27: "Mesmo cansado, o aluno mantém a técnica e a guarda organizadas.",
  q28: "A movimentação do aluno continua eficiente conforme o treino ou sparring avança.",
  q29: "O aluno se recupera bem durante os intervalos entre rounds.",

  q30: "Quando o aluno enfrenta alguém que recua bastante, ele tende a:",
  q31: "Quando o adversário inicia um ataque, a tendência natural do aluno é:",
  q32: "Quando o aluno tem vantagem no combate, ele tende a:",
};

function buildQuestions(textById: Record<string, string>): Question[] {
  return QUESTION_SKELETON.map((s) =>
    s.type === "likert"
      ? { id: s.id, type: "likert", dimension: s.dimension, text: textById[s.id] }
      : { id: s.id, type: "behavioral", text: textById[s.id], options: s.options },
  );
}

/** As 32 perguntas na voz do aluno (autoavaliação — 'self'). */
export const QUESTIONS: Question[] = buildQuestions(SELF_TEXT);

/** As mesmas 32 perguntas (mesmos ids/dimensões), na voz do professor observando o aluno ('coach'). */
export const COACH_QUESTIONS: Question[] = buildQuestions(COACH_TEXT);

export function getQuestions(assessmentType: AssessmentType): Question[] {
  return assessmentType === "coach" ? COACH_QUESTIONS : QUESTIONS;
}

export const LIKERT_QUESTIONS = QUESTIONS.filter((q): q is LikertQuestion => q.type === "likert");
export const BEHAVIORAL_QUESTIONS = QUESTIONS.filter((q): q is BehavioralQuestion => q.type === "behavioral");

export const TOTAL_QUESTIONS = QUESTIONS.length;
