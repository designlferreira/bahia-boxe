import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { GUARD_INFO } from "@/lib/studentProfile";
import type { Guard } from "@/integrations/backend/types";

interface GuardInfoDialogProps {
  guard: Guard | null;
  onOpenChange: (open: boolean) => void;
}

/** "O que é a guarda X?" — definição, como funciona, vantagens e desvantagens. */
export function GuardInfoDialog({ guard, onOpenChange }: GuardInfoDialogProps) {
  const info = guard ? GUARD_INFO[guard] : null;

  return (
    <Dialog open={!!guard} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        {info && (
          <>
            <DialogTitle>{info.label.toUpperCase()}</DialogTitle>
            <div className="text-[13.5px] text-foreground/85 leading-relaxed mb-4">{info.description}</div>

            <div className="mb-3">
              <div className="text-[11px] uppercase tracking-wide text-accent font-semibold mb-1.5">Vantagens</div>
              <ul className="flex flex-col gap-1">
                {info.pros.map((p) => (
                  <li key={p} className="text-[13px] text-foreground/80 leading-snug pl-3.5 relative before:content-['+'] before:absolute before:left-0 before:text-accent before:font-bold">
                    {p}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wide text-destructive font-semibold mb-1.5">Desvantagens</div>
              <ul className="flex flex-col gap-1">
                {info.cons.map((c) => (
                  <li key={c} className="text-[13px] text-foreground/80 leading-snug pl-3.5 relative before:content-['–'] before:absolute before:left-0 before:text-destructive before:font-bold">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
