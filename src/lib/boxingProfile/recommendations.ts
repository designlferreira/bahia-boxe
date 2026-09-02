import type { Dimension } from "./dimensions";
import type { FighterProfileKey } from "./fighterProfiles";
import { evolutionPriorities, type ScoringResult } from "./scoring";

interface ProfileRecommendations {
  byDimension: Partial<Record<Dimension, string>>;
  /** Usado quando nenhuma das prioridades de evolução do aluno tem texto específico configurado. */
  fallback: string;
}

/**
 * "No que focar nos próximos treinos" — determinístico, combina perfil principal + a competência
 * mais baixa do aluno. Nunca gerado em runtime por IA. Configuração centralizada, não
 * condicionais na UI: `getRecommendation` só percorre esta tabela.
 */
const RECOMMENDATIONS: Record<FighterProfileKey, ProfileRecommendations> = {
  out_boxer: {
    byDimension: {
      movement: "Reforce as entradas e saídas de curta duração para não ficar exposto ao tentar controlar a distância.",
      reading: "Trabalhe a leitura de padrões do adversário para antecipar o melhor momento de abrir ou fechar distância.",
      defense: "Combine o controle de distância com recursos defensivos mais variados, sem depender só de se afastar.",
    },
    fallback: "Continue reforçando a leitura de distância e o timing das entradas, que são a base do seu estilo.",
  },
  pressure_fighter: {
    byDimension: {
      defense: "Trabalhe entradas protegidas e defesa após as combinações para sustentar a pressão com mais organização.",
      conditioning: "Busque construir volume de forma mais econômica, preservando fôlego para manter a pressão nos rounds finais.",
      precision: "Trabalhe a seleção de alvos dentro da pressão, priorizando qualidade sobre quantidade de golpes.",
    },
    fallback: "Continue desenvolvendo o volume e o corte de ringue, que sustentam sua pressão constante.",
  },
  puncher: {
    byDimension: {
      movement: "Trabalhe a movimentação de pés para criar ângulos antes de buscar o golpe de maior impacto.",
      defense: "Reforce a defesa nos momentos de troca, para não depender só de resistir ao contra-ataque.",
      speed: "Busque ganhar velocidade de execução para aproveitar aberturas antes que se fechem.",
    },
    fallback: "Continue trabalhando a técnica que sustenta seu impacto, mantendo o equilíbrio nos golpes.",
  },
  counterpuncher: {
    byDimension: {
      movement: "Pratique defender e responder criando um novo ângulo, evitando permanecer na linha de ataque.",
      attack: "Experimente iniciar mais trocas você mesmo, em vez de depender apenas da ação do adversário.",
      conditioning: "Trabalhe para manter a paciência tática também nos rounds finais, quando o cansaço reduz a leitura.",
    },
    fallback: "Continue refinando o timing de resposta, que é a base do seu jogo de contra-ataque.",
  },
  boxer_puncher: {
    byDimension: {
      conditioning: "Busque sustentar a versatilidade do seu jogo também nos rounds finais, sem perder potência nem leitura.",
      defense: "Reforce a defesa para sustentar as trocas sem abrir mão da versatilidade que já tem.",
      speed: "Trabalhe a velocidade de transição entre construir e finalizar as ações.",
    },
    fallback: "Continue equilibrando ataque, potência e leitura — é essa combinação que define seu estilo.",
  },
  pressure_boxer: {
    byDimension: {
      defense: "Trabalhe a defesa durante a pressão, para sustentar o avanço sem abrir espaços.",
      power: "Busque mais eficiência mecânica nos golpes dentro do volume que você já sustenta.",
      speed: "Trabalhe velocidade de combinação para tornar a pressão técnica ainda mais efetiva.",
    },
    fallback: "Continue combinando pressão com leitura tática, que é o que diferencia seu estilo.",
  },
};

/** Percorre as prioridades de evolução da mais baixa pra mais alta até achar uma com texto configurado. */
export function getRecommendation(result: Pick<ScoringResult, "primaryProfile" | "dimensionScores">): string {
  const config = RECOMMENDATIONS[result.primaryProfile];
  const priorities = evolutionPriorities(result.dimensionScores, 8);
  for (const dim of priorities) {
    const text = config.byDimension[dim];
    if (text) return text;
  }
  return config.fallback;
}
