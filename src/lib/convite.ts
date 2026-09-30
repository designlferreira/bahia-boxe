/**
 * Convite de aluno: o link e a mensagem que o professor manda. O token vem do servidor (`criar_convite`, 0037);
 * aqui só se monta o endereço (`/convite/<token>`, a rota que `Convite.tsx` já atende) e o texto para o WhatsApp.
 */

export function linkDoConvite(token: string, origem: string = window.location.origin): string {
  return `${origem}/convite/${token}`;
}

/**
 * Sem o nome da marca de propósito: a marca é de cada professor (PRODUCT.md) e o texto sai do WhatsApp DELE, na voz dele.
 * `validoAte` já vem formatado ("07 out"): o prazo real é o que o servidor devolveu, não um número escrito aqui.
 */
export function mensagemDoConvite(link: string, validoAte: string): string {
  return `Oi! Te convidei para o app das minhas aulas de boxe. Crie sua conta por este link (vale só para você, até ${validoAte}): ${link}`;
}

/** `wa.me/?text=` sem número: o WhatsApp abre e deixa escolher para quem mandar. */
export function linkWhatsappConvite(link: string, validoAte: string): string {
  return `https://wa.me/?text=${encodeURIComponent(mensagemDoConvite(link, validoAte))}`;
}
