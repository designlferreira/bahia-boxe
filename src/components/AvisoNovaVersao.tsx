import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Além de conferir ao voltar para a tela, confere de hora em hora com o app aberto. */
const INTERVALO_MS = 60 * 60 * 1000;

/**
 * "Nova versão disponível": o service worker (`registerType: "prompt"`, vite.config.ts) baixa a versão nova em segundo plano e ESPERA;
 * a pessoa escolhe a hora de trocar tocando em "Atualizar" (recarrega a página). Nunca recarrega sozinho: quem estiver no meio de um
 * formulário não perde o que digitou. Antes (`autoUpdate`) a versão nova só aparecia na abertura seguinte — e no iPhone o app instalado
 * quase nunca é aberto "do zero", então a pessoa ficava dias na versão antiga.
 *
 * A conferência roda ao registrar, SEMPRE que o app volta para a tela (trocar de app e voltar) e de hora em hora.
 */
export function AvisoNovaVersao() {
  const [dispensado, setDispensado] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [registro, setRegistro] = useState<ServiceWorkerRegistration | null>(null);
  const {
    needRefresh: [temVersaoNova],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, r) {
      if (r) setRegistro(r);
    },
  });

  useEffect(() => {
    if (!registro) return;
    const conferir = () => {
      if (navigator.onLine && !registro.installing) registro.update().catch(() => {});
    };
    const aoVoltar = () => {
      if (document.visibilityState === "visible") conferir();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    const t = setInterval(conferir, INTERVALO_MS);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      clearInterval(t);
    };
  }, [registro]);

  // Uma versão ainda mais nova chegou depois do "Depois": avisa de novo.
  useEffect(() => {
    if (temVersaoNova) setDispensado(false);
  }, [temVersaoNova]);

  if (!temVersaoNova || dispensado) return null;
  return (
    <AvisoNovaVersaoView
      atualizando={atualizando}
      onAtualizar={() => {
        setAtualizando(true);
        updateServiceWorker(true).catch(() => setAtualizando(false));
      }}
      onDepois={() => setDispensado(true)}
    />
  );
}

/** Só a aparência: usada pelo aviso de verdade e pela galeria de amostras. */
export function AvisoNovaVersaoView({
  atualizando = false,
  onAtualizar,
  onDepois,
  amostra = false,
}: {
  atualizando?: boolean;
  onAtualizar: () => void;
  onDepois: () => void;
  amostra?: boolean;
}) {
  return (
    <div
      role="status"
      className={`${amostra ? "absolute" : "fixed"} inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[95] rounded-2xl border border-border bg-card px-4 py-3 shadow-lg`}
    >
      <div className="flex items-start gap-2.5">
        <RefreshCw aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-foreground">Nova versão disponível</div>
          <div className="text-[13px] text-muted-foreground">Atualize para ver as últimas mudanças do app.</div>
        </div>
      </div>
      <div className="mt-2.5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDepois} disabled={atualizando}>
          Depois
        </Button>
        <Button variant="soft" size="sm" onClick={onAtualizar} disabled={atualizando}>
          {atualizando ? "Atualizando…" : "Atualizar"}
        </Button>
      </div>
    </div>
  );
}
