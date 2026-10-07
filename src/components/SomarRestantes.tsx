import { useId } from "react";
import { Switch } from "@/components/ui/switch";

interface SomarRestantesProps {
  /** Aulas que sobraram do pacote que será encerrado (> 0; com 0 não há o que perguntar). */
  aulas: number;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  /** O que acontece em cada escolha, dito com os números desta tela (ex.: "O pacote novo fica com 10 aulas."). */
  efeitoSomando: string;
  efeitoDescartando: string;
  disabled?: boolean;
}

/**
 * Pergunta da troca de pacote (migration 0040): somar as aulas que sobraram do pacote atual ao novo, ou
 * descartá-las. Começa ligada — perder aula do aluno é a exceção, não o padrão. Usada nas três telas que
 * trocam pacote (atribuir, aprovar pedido, gerar recorrência) pra a pergunta e o texto serem os mesmos.
 */
export function SomarRestantes({ aulas, checked, onCheckedChange, efeitoSomando, efeitoDescartando, disabled }: SomarRestantesProps) {
  const id = useId();
  return (
    <div className="rounded-xl border border-border bg-background p-3.5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div id={`${id}-t`} className="text-[14px] font-semibold text-foreground">
          Somar {aulas === 1 ? "a aula restante" : `as ${aulas} aulas restantes`} ao pacote novo
        </div>
        <div id={`${id}-d`} className="text-[12.5px] text-muted-foreground mt-0.5">
          {checked ? efeitoSomando : efeitoDescartando}
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-d`}
      />
    </div>
  );
}
