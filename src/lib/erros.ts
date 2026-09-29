/**
 * Texto de erro que o usuário pode ler. Antes, ~35 telas faziam `err instanceof Error ? err.message : fallback`,
 * e o que chegava ao aviso era o texto CRU do servidor: "Failed to fetch", "not_allowed", "JWT expired",
 * "new row violates row-level security policy". Aqui:
 * - sem internet / falha de rede → frase única em português;
 * - sessão vencida → pede para entrar de novo;
 * - códigos técnicos (snake_case, mensagens do Postgres/PostgREST/JS) → o texto de reserva de cada tela;
 * - o resto passa como veio: as RPCs e o `api.ts` já lançam frases em português de propósito (ex.: "Esse horário
 *   acabou de ser ocupado."), e trocá-las apagaria o motivo real.
 */
const SEM_CONEXAO = "Sem conexão com a internet. Confira o sinal e tente de novo.";
const SESSAO_VENCIDA = "Sua sessão venceu. Entre de novo para continuar.";

const REDE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out|econn|err_internet/i;
const SESSAO = /jwt (expired|invalid)|invalid jwt|refresh token|not authenticated|session (missing|expired)|auth session/i;
const TECNICA =
  /row-level security|violates|duplicate key|permission denied|pgrst\d|syntax error|does not exist|undefined|typeerror|referenceerror|unexpected token|cannot read|is not a function|null value in column|invalid input syntax|could not (serialize|obtain lock)|deadlock|schema cache/i;

export function mensagemDeErro(err: unknown, fallback: string): string {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (!(err instanceof Error)) return offline ? SEM_CONEXAO : fallback;
  const m = (err.message ?? "").trim();
  if (offline || REDE.test(m)) return SEM_CONEXAO;
  if (SESSAO.test(m)) return SESSAO_VENCIDA;
  if (!m || /^[a-z0-9_.:-]+$/.test(m) || TECNICA.test(m)) return fallback;
  return m;
}
