/** Disponíveis = (total − usadas) − agendadas futuras. */
export function calcCreditsAvailable(total: number, used: number, scheduledFuture: number) {
  return Math.max(0, total - used - scheduledFuture);
}

export function formatCentsToBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function packageProgressPct(total: number, used: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

/**
 * Preço de um modelo de pacote. Zero é um pacote gratuito, não "R$ 0,00"; null é um preço que
 * nunca foi preenchido (`package_templates.price_cents` aceita null).
 */
export function formatPriceLabel(cents: number | null) {
  if (cents === null) return "Preço a combinar";
  return cents === 0 ? "Grátis" : formatCentsToBRL(cents);
}
