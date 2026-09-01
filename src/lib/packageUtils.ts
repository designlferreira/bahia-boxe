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
