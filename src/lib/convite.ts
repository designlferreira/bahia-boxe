/**
 * Convite de aluno: o link e a mensagem que o professor manda. O token vem do servidor (`criar_convite`, 0037); aqui só se monta o
 * endereço (`/convite/<token>`, a rota que `Convite.tsx` já atende) e o texto para o WhatsApp.
 */

export function linkDoConvite(token: string, origem: string = window.location.origin): string {
  return `${origem}/convite/${token}`;
}

/** Tamanho máximo do nome do convidado (o banco recusa mais que isso, 0038). */
export const NOME_CONVIDADO_MAX = 80;

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

/**
 * Sem o nome da marca de propósito: a marca é de cada professor (PRODUCT.md) e o texto sai do WhatsApp DELE, na voz dele.
 * `validoAte` já vem formatado ("07 out"): o prazo real é o que o servidor devolveu, não um número escrito aqui.
 * Com o nome do convidado a mensagem o chama pelo primeiro nome ("Oi, Ana!"); sem nome, continua "Oi!".
 */
export function mensagemDoConvite(link: string, validoAte: string, nomeConvidado?: string | null): string {
  const primeiro = nomeConvidado ? primeiroNome(nomeConvidado) : "";
  const saudacao = primeiro ? `Oi, ${primeiro}!` : "Oi!";
  return `${saudacao} Te convidei para o app das minhas aulas de boxe. Crie sua conta por este link (vale só para você, até ${validoAte}): ${link}`;
}

/** `wa.me/?text=` sem número: o WhatsApp abre e deixa escolher para quem mandar. */
export function linkWhatsappConvite(link: string, validoAte: string, nomeConvidado?: string | null): string {
  return `https://wa.me/?text=${encodeURIComponent(mensagemDoConvite(link, validoAte, nomeConvidado))}`;
}
