import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Quanto tempo o "Agora não" esconde o banner na Home antes de oferecer de novo. */
const SNOOZE_DAYS = 30;
const SNOOZE_KEY = "bb.install-banner.snoozed-until";

function isSnoozed() {
  try {
    const until = Number(localStorage.getItem(SNOOZE_KEY));
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
  } catch {
    // Sem armazenamento (aba privada, bloqueio): o banner some só nesta visita.
  }
}

interface PWAInstallBannerProps {
  /**
   * `optional` (Home): tem "Agora não", que esconde o banner por 30 dias — sem isso ele ocupava o
   * topo da tela inicial a cada visita, e o único jeito de fechar era um toque duplo em "Instalar"
   * que ninguém descobria. `settings` (Minha Conta): é o lugar onde o aluno vai procurar a
   * instalação de propósito, então aparece sempre que o navegador permitir instalar.
   */
  placement?: "optional" | "settings";
}

export function PWAInstallBanner({ placement = "optional" }: PWAInstallBannerProps) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(() => placement === "optional" && isSnoozed());

  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!deferred || hidden) return null;

  return (
    // Neutro de propósito: dourado é crédito/conquista no spec (§12.1), e isto não é nenhum dos dois.
    <section aria-label="Instalar o aplicativo" className="rounded-2xl border border-border bg-card p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
          <Smartphone className="h-[18px] w-[18px] text-foreground/85" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-foreground">Instale o Bahia Boxe no celular</div>
          <div className="text-sm text-muted-foreground mt-0.5">Abre direto da tela inicial, como um aplicativo.</div>
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <Button
          variant="secondary"
          className="flex-1 h-11"
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice;
            setDeferred(null);
          }}
        >
          Instalar
        </Button>
        {placement === "optional" && (
          <Button
            variant="ghost"
            className="flex-1 h-11 text-muted-foreground"
            onClick={() => {
              snooze();
              setHidden(true);
            }}
          >
            Agora não
          </Button>
        )}
      </div>
    </section>
  );
}
