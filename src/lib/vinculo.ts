/**
 * Vínculo do aluno com um professor. Sem a linha em `students`, NADA do app do aluno funciona (agendar, aulas, pacotes): antes cada tela
 * mostrava "Não foi possível carregar" com "Tentar novamente", um beco sem saída para quem criou a conta sem usar o link do convite
 * (ou cujo convite venceu). Agora o erro é tipado e o `StudentLayout` troca o app por uma tela que explica e resolve.
 */
export class SemVinculoError extends Error {
  constructor() {
    super("Sua conta ainda não está vinculada a um professor.");
    this.name = "SemVinculoError";
  }
}

/**
 * Tira o token de um convite do que a pessoa colou: o link inteiro (`…/convite/<token>`, com ou sem `?…`) ou só o código.
 * Devolve null se não parece um convite (evita chamar o servidor com lixo).
 */
export function extrairTokenDeConvite(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  const doLink = t.match(/\/convite\/([A-Za-z0-9_-]{16,})/);
  if (doLink) return doLink[1];
  return /^[A-Za-z0-9_-]{16,}$/.test(t) ? t : null;
}
