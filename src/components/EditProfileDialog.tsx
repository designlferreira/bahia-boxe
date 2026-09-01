import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateProfileName } from "@/integrations/backend/api";
import { useAuth } from "@/context/AuthContext";

export function EditProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.name ?? "");

  const save = useMutation({
    mutationFn: () => updateProfileName(profile!.id, name.trim()),
    onSuccess: () => {
      refreshProfile();
      onOpenChange(false);
      toast.success("Perfil atualizado");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setName(profile?.name ?? "");
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogTitle>EDITAR PERFIL</DialogTitle>
        <div className="mb-5">
          <Label htmlFor="profile-name">Nome</Label>
          <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex gap-2.5">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="lg" className="flex-1" onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
