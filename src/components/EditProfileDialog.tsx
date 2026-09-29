import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateProfileName } from "@/integrations/backend/api";
import { useAuth } from "@/context/AuthContext";
import { mensagemDeErro } from "@/lib/erros";

const MAX_NOME = 80;

export function EditProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.name ?? "");

  const save = useMutation({
    mutationFn: () => updateProfileName(profile!.id, name.trim()),
    onSuccess: () => {
      refreshProfile();
      onOpenChange(false);
      toast.success("Nome atualizado");
    },
    // Antes uma falha de gravação não mostrava nada: o diálogo ficava aberto e o botão voltava a "Salvar".
    onError: (err) => toast.error(mensagemDeErro(err, "Não foi possível salvar o nome. Tente de novo.")),
  });

  // O botão apagado diz por quê (antes só ficava apagado).
  const semMudanca = name.trim() === (profile?.name ?? "").trim();
  const motivo = !name.trim() ? "Escreva seu nome para salvar." : semMudanca ? "Você ainda não mudou o nome." : null;

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!motivo && !save.isPending) save.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setName(profile?.name ?? "");
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogTitle>EDITAR NOME</DialogTitle>
        {/* <form>: Enter salva, como em qualquer campo de texto. */}
        <form onSubmit={enviar}>
          <div className="mb-3">
            <Label htmlFor="profile-name">Nome</Label>
            <Input
              id="profile-name"
              value={name}
              maxLength={MAX_NOME}
              autoComplete="name"
              aria-describedby={motivo ? "profile-name-motivo" : undefined}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {motivo && (
            <p id="profile-name-motivo" className="text-[12.5px] text-muted-foreground mb-3 -mt-1">
              {motivo}
            </p>
          )}
          <div className="flex gap-2.5 mt-2">
            <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="lg" className="flex-1" disabled={!!motivo || save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
