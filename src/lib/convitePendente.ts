/**
 * Convite que o aluno abriu mas ainda não conseguiu concluir. Com "Confirm email" ligado no Supabase,
 * criar a conta NÃO abre sessão: `accept_invite` (que exige usuário logado) não pode rodar na hora.
 * Guardamos o token e a conclusão acontece quando a sessão existir — depois do link do e-mail ou de
 * um login normal (`AuthProvider`). Por dispositivo, em `localStorage`, como o resto do app.
 */
const CHAVE = "bahiaboxe.convite-pendente";

export function guardarConvitePendente(token: string) {
  try {
    localStorage.setItem(CHAVE, token);
  } catch {
    /* sem armazenamento: o aluno reabre o link do professor */
  }
}

export function lerConvitePendente(): string | null {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

export function limparConvitePendente() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* nada a fazer */
  }
}
