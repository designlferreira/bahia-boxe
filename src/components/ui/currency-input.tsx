import * as React from "react";
import { cn } from "@/lib/utils";
import { formatCentsForInput, parseCurrencyToCents } from "@/lib/currency";

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** Value in cents. */
  valueCents: number | null;
  /** Called with the parsed value in cents, or null when the field is empty/unparseable. */
  onValueChange: (cents: number | null) => void;
}

/**
 * Owns the raw typed string while focused, so re-formatting can't fight the keystroke (the
 * previous `value={(cents/100).toFixed(2)}` made the field unusable), and normalizes on blur.
 */
export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ valueCents, onValueChange, className, onBlur, onFocus, ...props }, ref) => {
    const [raw, setRaw] = React.useState(() => (valueCents === null ? "" : formatCentsForInput(valueCents)));
    const [focused, setFocused] = React.useState(false);

    // Adopt external changes (e.g. opening the sheet on a different template) — but never while
    // the user is mid-edit.
    React.useEffect(() => {
      if (focused) return;
      setRaw(valueCents === null ? "" : formatCentsForInput(valueCents));
    }, [valueCents, focused]);

    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
          R$
        </span>
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={cn("input-dark h-[50px] pl-11", className)}
          value={raw}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onChange={(e) => {
            const next = e.target.value.replace(/[^\d.,]/g, "");
            setRaw(next);
            onValueChange(parseCurrencyToCents(next));
          }}
          onBlur={(e) => {
            setFocused(false);
            const cents = parseCurrencyToCents(raw);
            setRaw(cents === null ? "" : formatCentsForInput(cents));
            onValueChange(cents);
            onBlur?.(e);
          }}
          {...props}
        />
      </div>
    );
  },
);
CurrencyInput.displayName = "CurrencyInput";

export { parseCurrencyToCents, formatCentsForInput };
