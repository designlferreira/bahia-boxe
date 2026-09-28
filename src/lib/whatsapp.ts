/**
 * Normaliza o que o professor digitou pro formato do link wa.me: só dígitos, com código do país.
 * Aceita "(11) 94703-4983", "11947034983", "+55 11 94703-4983"... Número brasileiro sem código do
 * país (10 ou 11 dígitos) ganha o 55. Devolve null se não der um número válido — mesma regra do
 * CHECK `profiles_whatsapp_check` (0032), com o mínimo de 12 porque o país é obrigatório aqui.
 */
export function normalizeWhatsapp(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const withCountry = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return /^[0-9]{12,15}$/.test(withCountry) ? withCountry : null;
}
