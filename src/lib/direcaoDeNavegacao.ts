export type Direcao = "avancar" | "voltar" | "aba";

/** As telas das abas da barra de baixo (aluno e professor): irmãs entre si, sem "frente" nem "trás". */
const ABAS = new Set([
  "/app/home",
  "/app/agendar",
  "/app/historico",
  "/app/minha-conta",
  "/admin/dashboard",
  "/admin/agenda",
  "/admin/alunos",
  "/admin/historico",
  "/admin/minha-conta",
]);

const semBarraFinal = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
export const ehAba = (caminho: string) => ABAS.has(semBarraFinal(caminho));

/**
 * De que lado a tela nova entra:
 * - "voltar": o usuário voltou (botão voltar do navegador ou `navigate(-1)`, que chegam como POP): a tela entra pela ESQUERDA;
 * - "aba": trocou de aba da barra de baixo (ou chegou numa aba vinda de fora): só um esmaecimento, sem movimento (irmãs, sem direção);
 * - "avancar": abriu uma tela mais funda (detalhe, formulário): entra pela DIREITA.
 * `null` = primeira tela ou o mesmo caminho: fica a entrada padrão do app.
 */
export function direcaoDeNavegacao(tipo: "PUSH" | "POP" | "REPLACE", de: string | null, para: string): Direcao | null {
  if (de === null || semBarraFinal(de) === semBarraFinal(para)) return null;
  if (tipo === "POP") return "voltar";
  if (ehAba(para)) return "aba";
  return "avancar";
}
