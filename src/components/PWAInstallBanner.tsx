import { useEffect, useState } from "react";
import { ArrowUpFromLine } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!deferred || dismissed) return null;

  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-accent/[0.07] border border-accent/25 px-4 py-3.5 mb-3.5">
      <ArrowUpFromLine className="h-[18px] w-[18px] text-accent shrink-0" />
      <div className="flex-1 text-[13px] text-accent/90">Instalar o Bahia Boxe na tela inicial</div>
      <Button
        size="sm"
        variant="accent"
        className="h-[34px] px-3.5"
        onClick={async () => {
          await deferred.prompt();
          await deferred.userChoice;
          setDeferred(null);
        }}
        onDoubleClick={() => setDismissed(true)}
      >
        Instalar
      </Button>
    </div>
  );
}
