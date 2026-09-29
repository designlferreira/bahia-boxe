import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Real Supabase client, wired up per spec §2/§4. No live project is configured
 * for this environment yet — until VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 * are set, the app runs against the local mock backend in
 * src/integrations/backend instead (see src/integrations/backend/README.md).
 */
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

export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch: fetchComTempoLimite } }) : null;

export const isSupabaseConfigured = Boolean(supabase);
