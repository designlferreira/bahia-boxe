import { FIGHTER_PROFILE_GLOSS_PT, type FighterProfileKey } from "@/lib/boxingProfile";
import { cn } from "@/lib/utils";

/**
 * Tradução do estilo de luta em português, embaixo do nome em inglês (decisão do Lucas, 2026-09-28:
 * "manter inglês + tradução embaixo"). Antes só o cartão da Home mostrava; nas telas de resultado o
 * aluno lia "Swarmer" e "Slugger" sem saber o que era.
 */
export function FighterProfileGloss({ profile, className }: { profile: FighterProfileKey; className?: string }) {
  return <span className={cn("block text-xs text-muted-foreground leading-snug", className)}>{FIGHTER_PROFILE_GLOSS_PT[profile]}</span>;
}
