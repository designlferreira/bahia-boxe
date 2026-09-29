import { AuthClient } from "@supabase/auth-js";
import { PostgrestClient } from "@supabase/postgrest-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Tempo máximo de uma chamada ao servidor. Sem isto, uma rede que trava (sem falhar) deixava o esqueleto na tela para sempre. */
export const TEMPO_LIMITE_MS = 25_000;

/** `fetch` com tempo limite. Respeita o cancelamento de quem chamou. O erro tem o texto "conexao_lenta", que `mensagemDeErro` traduz. */
function fetchComTempoLimite(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controle = new AbortController();
  const origem = init?.signal;
  if (origem) {
    if (origem.aborted) controle.abort(origem.reason);
    else origem.addEventListener("abort", () => controle.abort(origem.reason), { once: true });
  }
  const timer = setTimeout(() => controle.abort(new DOMException("conexao_lenta", "TimeoutError")), TEMPO_LIMITE_MS);
  return fetch(input, { ...init, signal: controle.signal }).finally(() => clearTimeout(timer));
}

/**
 * Cliente ENXUTO do Supabase: só login (`@supabase/auth-js`) e consultas/funções (`@supabase/postgrest-js`).
 * Antes era `createClient` do `@supabase/supabase-js`, que também traz realtime, storage e functions — o app não usa nenhum dos três
 * e eles pesavam ~110 kB no primeiro carregamento. A montagem abaixo REPRODUZ o que o `createClient` faz por dentro (conferido no código
 * de `supabase-js` 2.112): a mesma chave de sessão no armazenamento do navegador (`sb-<projeto>-auth-token`, senão todo mundo seria
 * deslogado), o mesmo fluxo de login (`implicit`), renovação automática do token, sessão guardada e leitura do link do e-mail (`detectSessionInUrl`),
 * e cada consulta leva `apikey` + `Authorization: Bearer <token da sessão>` (ou a chave pública quando não há sessão).
 * **Se um dia o app precisar de realtime, storage ou edge functions, este é o lugar: ou volta o `createClient`, ou acrescenta o pacote certo.**
 * A superfície usada pelo app é só `auth`, `from` e `rpc`.
 */
function criarCliente(url: string, chave: string) {
  const base = new URL(url);
  const chaveDaSessao = `sb-${base.hostname.split(".")[0]}-auth-token`;
  const cabecalhos = { "X-Client-Info": "bahia-boxe-web" };

  const auth = new AuthClient({
    url: new URL("auth/v1", base).href,
    headers: { Authorization: `Bearer ${chave}`, apikey: chave, ...cabecalhos },
    storageKey: chaveDaSessao,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: "implicit",
    fetch: fetchComTempoLimite,
  });

  const fetchComLogin: typeof fetch = async (input, init) => {
    const { data } = await auth.getSession();
    const cab = new Headers(init?.headers);
    if (!cab.has("apikey")) cab.set("apikey", chave);
    if (!cab.has("Authorization")) cab.set("Authorization", `Bearer ${data.session?.access_token ?? chave}`);
    return fetchComTempoLimite(input, { ...init, headers: cab });
  };

  const rest = new PostgrestClient(new URL("rest/v1", base).href, { headers: cabecalhos, schema: "public", fetch: fetchComLogin });

  return {
    auth,
    from: rest.from.bind(rest) as PostgrestClient["from"],
    rpc: rest.rpc.bind(rest) as PostgrestClient["rpc"],
  };
}

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? criarCliente(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export const isSupabaseConfigured = Boolean(supabase);
