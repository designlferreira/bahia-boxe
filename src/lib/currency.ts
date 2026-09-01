/**
 * Money is held in cents (integer) everywhere in the app — never a float — so the value never
 * drifts through arithmetic or JSON round-trips.
 */

/** "480" | "480,00" | "480.00" | "1.234,56" → 48000 | 48000 | 48000 | 123456. Empty/invalid → null. */
export function parseCurrencyToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;

  const negative = cleaned.startsWith("-");
  const digitsAndSeps = cleaned.replace(/-/g, "");
  if (!digitsAndSeps) return null;

  const decimalPos = Math.max(digitsAndSeps.lastIndexOf(","), digitsAndSeps.lastIndexOf("."));

  let normalized: string;
  if (decimalPos === -1) {
    normalized = digitsAndSeps;
  } else {
    // Whatever separator comes last is the decimal one; anything before it is a grouping mark.
    const intPart = digitsAndSeps.slice(0, decimalPos).replace(/[.,]/g, "");
    const decPart = digitsAndSeps.slice(decimalPos + 1).replace(/[.,]/g, "");
    normalized = `${intPart || "0"}.${decPart || "0"}`;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) * (negative ? -1 : 1);
}

/** 48000 → "480,00" */
export function formatCentsForInput(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
