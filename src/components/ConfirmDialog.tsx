import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** "destructive" (padrão) para ações que removem/desfazem algo; "default" para uma declaração
   * positiva do professor (ex.: concluir aula), onde um botão vermelho passaria a mensagem errada. */
  tone?: "destructive" | "default";
  confirmDisabled?: boolean;
  /** "Voltar" (padrão, preserva o texto já usado em toda a base) — "Cancelar" faz mais sentido
   * quando a ação principal não é destrutiva (ex.: concluir aula). */
  cancelLabel?: string;
}

/** Confirmação de ações com consequência real — único padrão da aplicação. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  tone = "destructive",
  confirmDisabled,
  cancelLabel = "Voltar",
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="whitespace-pre-line">{description}</DialogDescription>
        <div className="flex gap-2.5">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "destructive" ? "destructive" : "default"}
            size="lg"
            className={tone === "destructive" ? "flex-1 !bg-destructive !text-destructive-foreground !border-none" : "flex-1"}
            disabled={confirmDisabled}
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
