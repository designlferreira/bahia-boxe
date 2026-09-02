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

/**
 * As 32 questões, na ordem em que aparecem no questionário. `dimension` em cada questão 1-29 é o
 * mapa questão → competência inteiro — nenhum componente deve conhecer "Q3 é ataque" por conta
 * própria, sempre lê daqui.
 */
export const QUESTIONS: Question[] = [
  // Ataque — Q1-Q4
  { id: "q1", type: "likert", dimension: "attack", text: "Quando consigo encurtar a distância, consigo manter uma sequência de golpes sem me desorganizar." },
  { id: "q2", type: "likert", dimension: "attack", text: "Consigo alternar golpes na cabeça e no corpo durante minhas combinações." },
  { id: "q3", type: "likert", dimension: "attack", text: "Consigo iniciar ataques sem depender exclusivamente do adversário atacar primeiro." },
  { id: "q4", type: "likert", dimension: "attack", text: "Depois de acertar um golpe, normalmente consigo dar continuidade à ação em vez de interromper o ataque." },

  // Defesa — Q5-Q8
  { id: "q5", type: "likert", dimension: "defense", text: "Consigo defender golpes retos sem simplesmente recuar para longe." },
  { id: "q6", type: "likert", dimension: "defense", text: "Depois de atacar, consigo sair da linha de ataque ou me reposicionar defensivamente." },
  { id: "q7", type: "likert", dimension: "defense", text: "Uso diferentes recursos defensivos — bloqueio, esquiva, passo, pêndulo, paradas — dependendo da situação." },
  { id: "q8", type: "likert", dimension: "defense", text: "Quando sou pressionado, consigo manter a calma e me defender sem perder completamente minha organização." },

  // Movimentação — Q9-Q12
  { id: "q9", type: "likert", dimension: "movement", text: "Consigo entrar na minha distância de ataque sem receber golpes limpos com frequência." },
  { id: "q10", type: "likert", dimension: "movement", text: "Consigo sair da distância do adversário depois de atacar." },
  { id: "q11", type: "likert", dimension: "movement", text: "Uso passos laterais e mudanças de ângulo durante o combate." },
  { id: "q12", type: "likert", dimension: "movement", text: "Consigo perceber quando estou na distância adequada para atacar." },

  // Precisão — Q13-Q15
  { id: "q13", type: "likert", dimension: "precision", text: "Meus golpes costumam encontrar o alvo mesmo quando o adversário está se movimentando." },
  { id: "q14", type: "likert", dimension: "precision", text: "Consigo perceber aberturas na guarda e atacá-las rapidamente." },
  { id: "q15", type: "likert", dimension: "precision", text: "Consigo acertar golpes durante ou imediatamente após uma ação do adversário." },

  // Potência percebida — Q16-Q18
  { id: "q16", type: "likert", dimension: "power", text: "Quando acerto um golpe limpo, normalmente percebo impacto significativo no adversário ou nos aparadores." },
  { id: "q17", type: "likert", dimension: "power", text: "Consigo gerar golpes fortes sem precisar me desequilibrar ou carregar excessivamente o movimento." },
  { id: "q18", type: "likert", dimension: "power", text: "Mesmo em combinações, consigo manter impacto nos golpes." },

  // Velocidade — Q19-Q21
  { id: "q19", type: "likert", dimension: "speed", text: "Consigo executar combinações rapidamente sem perder a técnica." },
  { id: "q20", type: "likert", dimension: "speed", text: "Consigo atacar uma abertura antes que ela desapareça." },
  { id: "q21", type: "likert", dimension: "speed", text: "Consigo mudar rapidamente de ataque para defesa e de defesa para ataque." },

  // Leitura tática — Q22-Q25
  { id: "q22", type: "likert", dimension: "reading", text: "Durante o sparring, consigo identificar padrões no comportamento do adversário." },
  { id: "q23", type: "likert", dimension: "reading", text: "Quando uma estratégia não funciona, consigo mudar minha abordagem durante o round." },
  { id: "q24", type: "likert", dimension: "reading", text: "Uso fintas ou mudanças de ritmo para provocar reações no adversário." },
  { id: "q25", type: "likert", dimension: "reading", text: "Consigo perceber quais golpes ou movimentações estão funcionando melhor contra determinado adversário." },

  // Condicionamento — Q26-Q29
  { id: "q26", type: "likert", dimension: "conditioning", text: "Consigo manter meu volume de golpes nos últimos rounds." },
  { id: "q27", type: "likert", dimension: "conditioning", text: "Mesmo cansado, consigo manter minha técnica e minha guarda organizadas." },
  { id: "q28", type: "likert", dimension: "conditioning", text: "Minha movimentação continua eficiente conforme o treino ou sparring avança." },
  { id: "q29", type: "likert", dimension: "conditioning", text: "Recupero-me bem durante os intervalos entre rounds." },

  // Comportamentais — Q30-Q32
  {
    id: "q30",
    type: "behavioral",
    text: "Quando enfrento alguém que recua bastante, prefiro:",
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
    text: "Quando o adversário inicia um ataque, minha tendência natural é:",
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
    text: "Quando tenho vantagem no combate, prefiro:",
    options: [
      { value: "A", label: "Controlar o ritmo e minimizar riscos." },
      { value: "B", label: "Aumentar a pressão e o volume." },
      { value: "C", label: "Buscar oportunidades para golpes mais contundentes." },
      { value: "D", label: "Variar estratégia para dificultar a adaptação." },
    ],
  },
];

export const LIKERT_QUESTIONS = QUESTIONS.filter((q): q is LikertQuestion => q.type === "likert");
export const BEHAVIORAL_QUESTIONS = QUESTIONS.filter((q): q is BehavioralQuestion => q.type === "behavioral");

export const TOTAL_QUESTIONS = QUESTIONS.length;
