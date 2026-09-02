import type { Dimension } from "./dimensions";

/**
 * Textos para as 3 competências mais altas ("Seus pontos fortes") e as mais baixas ("Prioridades
 * de evolução" — nunca "pontos fracos"). O resultado é autopercepção, não medição objetiva —
 * por isso nenhum texto afirma capacidade ("Você tem excelente defesa"); todos enquadram como
 * resposta/percepção ("suas respostas indicam", "você demonstra", "na sua autoavaliação").
 */
export const STRENGTH_TEXT: Record<Dimension, string> = {
  attack: "Suas respostas indicam iniciativa para construir ataque e manter sequências sem depender do adversário abrir o jogo primeiro.",
  defense: "Na sua autoavaliação, você demonstra bom repertório para lidar com diferentes situações defensivas.",
  power: "Você demonstra confiança em gerar impacto nos golpes sem abrir mão da organização técnica.",
  speed: "Suas respostas indicam boa velocidade de execução e transição entre ataque e defesa.",
  movement: "Você demonstra controle de distância — entrar, sair e mudar de ângulo com segurança.",
  precision: "Você demonstra confiança na escolha dos momentos e na colocação dos golpes.",
  reading: "Suas respostas indicam confiança para identificar padrões e adaptar sua estratégia durante o combate.",
  conditioning: "Na sua autoavaliação, você mantém volume e organização técnica ao longo do combate.",
};

export const PRIORITY_TEXT: Record<Dimension, string> = {
  attack: "Busque criar mais oportunidades de iniciar o ataque, em vez de depender do momento do adversário.",
  defense: "Experimente variar os recursos defensivos — bloqueio, esquiva, passo — em vez de recorrer sempre ao mesmo.",
  power: "Trabalhe transferência de força e eficiência mecânica sem sacrificar equilíbrio e velocidade.",
  speed: "Busque ganhar velocidade de execução sem abrir mão da técnica nas combinações.",
  movement: "Pratique entradas e saídas de distância com mais consistência, controlando o ângulo de ataque.",
  precision: "Busque refinar a leitura de aberturas para colocar os golpes com mais consistência.",
  reading: "Pratique observar padrões do adversário e ajustar sua estratégia durante o próprio round.",
  conditioning: "Busque preservar volume, movimentação e organização técnica conforme os rounds avançam.",
};
