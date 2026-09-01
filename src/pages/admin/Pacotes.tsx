import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Package, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SkeletonList } from "@/components/SkeletonCard";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { formatCentsToBRL } from "@/lib/packageUtils";
import {
  createPackageTemplate,
  deletePackageTemplate,
  getPackageTemplates,
  updatePackageTemplate,
} from "@/integrations/backend/api";
import type { PackageTemplate } from "@/integrations/backend/types";

const empty = { name: "", description: "", totalClasses: 10, priceCents: 0, validityDays: 60 };

export default function AdminPacotes() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<PackageTemplate | null>(null);
  const [form, setForm] = useState(empty);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PackageTemplate | null>(null);

  const key = ["package-templates", profile?.id];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: key,
    queryFn: () => getPackageTemplates(profile!.id),
    enabled: !!profile,
  });

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        description: editing.description,
        totalClasses: editing.totalClasses,
        priceCents: editing.priceCents,
        validityDays: editing.validityDays,
      });
    } else {
      setForm(empty);
    }
  }, [editing]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["package-templates"] });
  }

  const save = useMutation({
    mutationFn: () =>
      editing ? updatePackageTemplate(editing.id, form) : createPackageTemplate(profile!.id, form),
    onSuccess: () => {
      invalidate();
      setSheetOpen(false);
      toast.success(editing ? "Modelo atualizado" : "Modelo criado");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deletePackageTemplate(id),
    onSuccess: () => {
      invalidate();
      toast.warning("Modelo removido");
    },
  });

  function openCreate() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(t: PackageTemplate) {
    setEditing(t);
    setSheetOpen(true);
  }

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-4">
        <div className="font-display text-3xl tracking-wide text-foreground leading-none">PACOTES</div>
        <Button size="sm" onClick={openCreate}>
          Novo modelo
        </Button>
      </div>

      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading && !isError && <SkeletonList count={3} height={92} />}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {data.map((t) => (
            <div key={t.id} className="card-dark p-4 flex items-center gap-3">
              <div className="flex-1">
                <div className="text-[15px] font-semibold text-foreground">{t.name}</div>
                <div className="text-[12.5px] text-muted-foreground mt-0.5">{t.description}</div>
                <div className="text-base text-accent font-semibold mt-1.5">{formatCentsToBRL(t.priceCents)}</div>
              </div>
              <button
                type="button"
                onClick={() => openEdit(t)}
                aria-label="Editar modelo"
                className="h-11 w-11 rounded-[10px] border border-border bg-secondary flex items-center justify-center active:scale-95"
              >
                <Pencil className="h-[15px] w-[15px] text-foreground/80" />
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(t)}
                aria-label="Remover modelo"
                className="h-11 w-11 rounded-[10px] border border-destructive/35 bg-destructive/10 flex items-center justify-center active:scale-95"
              >
                <Trash2 className="h-[15px] w-[15px] text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !isError && data && data.length === 0 && (
        <EmptyState icon={Package} title="Nenhum modelo de pacote" description="Crie um modelo para seus alunos solicitarem." ctaLabel="Novo modelo" onCta={openCreate} />
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetTitle>{editing ? "EDITAR MODELO" : "NOVO MODELO"}</SheetTitle>
          <div className="flex flex-col gap-3.5 mt-4">
            <div>
              <Label htmlFor="name">Nome</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Pacote 10 aulas" />
            </div>
            <div>
              <Label htmlFor="desc">Descrição</Label>
              <Textarea
                id="desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="2x por semana · 60 dias"
                className="h-16"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="total">Nº de aulas</Label>
                <Input
                  id="total"
                  type="number"
                  min={1}
                  value={form.totalClasses}
                  onChange={(e) => setForm((f) => ({ ...f, totalClasses: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label htmlFor="validity">Validade (dias)</Label>
                <Input
                  id="validity"
                  type="number"
                  min={1}
                  value={form.validityDays}
                  onChange={(e) => setForm((f) => ({ ...f, validityDays: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="price">Preço (R$)</Label>
              <Input
                id="price"
                type="number"
                min={0}
                step="0.01"
                value={(form.priceCents / 100).toFixed(2)}
                onChange={(e) => setForm((f) => ({ ...f, priceCents: Math.round(Number(e.target.value) * 100) }))}
              />
            </div>
          </div>
          <div className="flex gap-2.5 mt-5">
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => setSheetOpen(false)}>
              Voltar
            </Button>
            <Button
              size="lg"
              className="flex-[1.4]"
              onClick={() => save.mutate()}
              disabled={!form.name.trim() || save.isPending}
            >
              {editing ? "Salvar alterações" : "Criar modelo"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="REMOVER MODELO"
        description={`"${deleteTarget?.name}" deixará de aparecer para solicitação de novos pacotes.`}
        confirmLabel="Remover"
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
      />
    </div>
  );
}
