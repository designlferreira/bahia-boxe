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
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { formatPriceLabel } from "@/lib/packageUtils";
import {
  createPackageTemplate,
  deletePackageTemplate,
  getPackageTemplates,
  restorePackageTemplate,
  updatePackageTemplate,
} from "@/integrations/backend/api";
import type { PackageTemplate } from "@/integrations/backend/types";

const empty = { name: "", description: "", totalClasses: 10, priceCents: null as number | null, validityDays: null as number | null };

function priceError(priceCents: number | null): string | null {
  if (priceCents === null) return "Informe o preço do pacote.";
  if (priceCents < 0) return "O preço não pode ser negativo.";
  return null;
}

type PriceMode = "defined" | "tbd";

const MAX_AULAS = 99;
function aulasError(texto: string): string | null {
  if (!texto) return "Informe quantas aulas tem o pacote.";
  const n = parseInt(texto, 10);
  if (!(n >= 1 && n <= MAX_AULAS)) return `Use de 1 a ${MAX_AULAS} aulas.`;
  return null;
}

export default function AdminPacotes() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<PackageTemplate | null>(null);
  const [form, setForm] = useState(empty);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PackageTemplate | null>(null);
  const [priceTouched, setPriceTouched] = useState(false);
  const [priceMode, setPriceMode] = useState<PriceMode>("defined");
  // Texto do campo (não número): apagar e digitar de novo funciona, e vazio/0/negativo/decimal não passam.
  const [aulasTexto, setAulasTexto] = useState(String(empty.totalClasses));
  const [aulasTouched, setAulasTouched] = useState(false);
  const aulasValidation = aulasError(aulasTexto);
  const priceValidation = priceMode === "tbd" ? null : priceError(form.priceCents);

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
        // Não inventa 60 dias para modelo sem prazo: antes abrir e salvar um modelo gravava 60 sem o professor pedir.
        validityDays: editing.validityDays,
      });
      setPriceMode(editing.priceCents === null ? "tbd" : "defined");
      setAulasTexto(String(editing.totalClasses));
    } else {
      setForm(empty);
      setPriceMode("defined");
      setAulasTexto(String(empty.totalClasses));
    }
    setAulasTouched(false);
  }, [editing]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["package-templates"] });
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form, totalClasses: parseInt(aulasTexto, 10), priceCents: priceMode === "tbd" ? null : (form.priceCents ?? 0) };
      return editing ? updatePackageTemplate(editing.id, payload) : createPackageTemplate(profile!.id, payload);
    },
    onSuccess: () => {
      invalidate();
      setSheetOpen(false);
      toast.success(editing ? "Modelo atualizado" : "Modelo criado");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar o modelo.");
    },
  });

  const remove = useMutation({
    mutationFn: (t: PackageTemplate) => deletePackageTemplate(t.id),
    onSuccess: (_r, t) => {
      invalidate();
      toast.warning(`"${t.name}" removido`, {
        duration: 8000,
        action: {
          label: "Desfazer",
          onClick: async () => {
            try {
              await restorePackageTemplate(t.id);
              invalidate();
              toast.success("Modelo de volta");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Não foi possível desfazer. Crie o modelo de novo.");
            }
          },
        },
      });
    },
    // Antes uma falha aqui não mostrava nada: o professor achava que tinha removido.
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível remover o modelo."),
  });

  // O botão desativado diz por quê (antes só ficava apagado).
  const motivoBloqueio = !form.name.trim()
    ? "Dê um nome ao modelo para salvar."
    : aulasValidation
      ? aulasValidation
      : priceValidation
        ? priceValidation
        : null;

  function openCreate() {
    setEditing(null);
    setPriceTouched(false);
    setSheetOpen(true);
  }

  function openEdit(t: PackageTemplate) {
    setEditing(t);
    setPriceTouched(false);
    setSheetOpen(true);
  }

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-3xl tracking-wide text-foreground leading-none">PACOTES</h1>
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
                <div className="text-base text-accent font-semibold mt-1.5">{formatPriceLabel(t.priceCents)}</div>
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
                placeholder="2x por semana"
                className="h-16"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="total">Nº de aulas</Label>
                <Input
                  id="total"
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={aulasTexto}
                  onChange={(e) => setAulasTexto(e.target.value.replace(/\D/g, ""))}
                  onBlur={() => setAulasTouched(true)}
                  aria-invalid={!!(aulasTouched && aulasValidation)}
                  aria-describedby={aulasTouched && aulasValidation ? "total-error" : undefined}
                />
                {aulasTouched && aulasValidation && (
                  <div id="total-error" role="alert" className="text-[12.5px] text-[hsl(var(--red-text))] mt-1.5">
                    {aulasValidation}
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="validity">Prazo sugerido (dias)</Label>
                <Input
                  id="validity"
                  type="text"
                  inputMode="numeric"
                  maxLength={3}
                  placeholder="Opcional"
                  aria-describedby="validity-help"
                  value={form.validityDays ?? ""}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    setForm((f) => ({ ...f, validityDays: digits ? Number(digits) : null }));
                  }}
                />
              </div>
            </div>
            <p id="validity-help" className="text-[12.5px] text-muted-foreground -mt-1.5">
              O prazo é só uma sugestão que o aluno vê: o pacote não vence sozinho. Deixe em branco para não sugerir nada.
            </p>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="price" className="mb-0">
                  Preço
                </Label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground min-h-11">
                  <input
                    type="checkbox"
                    checked={priceMode === "tbd"}
                    onChange={(e) => {
                      const tbd = e.target.checked;
                      setPriceMode(tbd ? "tbd" : "defined");
                      setForm((f) => ({ ...f, priceCents: tbd ? null : (f.priceCents ?? 0) }));
                      setPriceTouched(false);
                    }}
                    className="h-4 w-4 accent-primary"
                  />
                  Preço a combinar
                </label>
              </div>
              {priceMode === "tbd" ? (
                <div className="text-[12.5px] text-muted-foreground rounded-[13px] border border-dashed border-[#333] px-3.5 py-3">
                  Sem valor fixo — o preço será combinado diretamente com o aluno.
                </div>
              ) : (
                <>
                  <CurrencyInput
                    id="price"
                    valueCents={form.priceCents}
                    onValueChange={(cents) => setForm((f) => ({ ...f, priceCents: cents }))}
                    placeholder="0,00"
                    aria-invalid={!!(priceTouched && priceValidation)}
                    aria-describedby={priceTouched && priceValidation ? "price-error" : undefined}
                    onBlur={() => setPriceTouched(true)}
                  />
                  {priceTouched && priceValidation ? (
                    <div id="price-error" role="alert" className="text-[12.5px] text-destructive mt-1.5">
                      {priceValidation}
                    </div>
                  ) : (
                    <div className="text-[12.5px] text-muted-foreground mt-1.5">Use 0 para um pacote gratuito.</div>
                  )}
                </>
              )}
            </div>
          </div>
          {editing && (
            <p className="text-[12.5px] text-muted-foreground mt-4">
              A mudança vale para os próximos pedidos. Pedidos que já foram aprovados não mudam.
            </p>
          )}
          {motivoBloqueio && (
            <p id="salvar-motivo" className="text-[12.5px] text-muted-foreground mt-4">
              {motivoBloqueio}
            </p>
          )}
          <div className="flex gap-2.5 mt-3">
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => setSheetOpen(false)}>
              Voltar
            </Button>
            <Button
              size="lg"
              className="flex-[1.4]"
              onClick={() => save.mutate()}
              disabled={!!motivoBloqueio || save.isPending}
              aria-describedby={motivoBloqueio ? "salvar-motivo" : undefined}
            >
              {save.isPending ? "Salvando…" : editing ? "Salvar alterações" : "Criar modelo"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="REMOVER MODELO"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" deixa de aparecer para novos pedidos. Pedidos que os alunos já fizeram continuam valendo. Você tem 8 segundos para desfazer.`
            : ""
        }
        confirmLabel="Remover"
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget)}
      />
    </div>
  );
}
