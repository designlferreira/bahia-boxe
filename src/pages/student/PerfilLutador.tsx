import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

const PROFILES = [
  { name: "Pressure Fighter", desc: "Avança o tempo todo, pressiona e busca o corpo a corpo." },
  { name: "Out-Boxer", desc: "Controla a distância, usa o jab e se movimenta pela lateral." },
  { name: "Boxer-Puncher", desc: "Combina técnica apurada com poder de finalização." },
  { name: "Counter Puncher", desc: "Espera, lê o adversário e responde com precisão." },
];

/**
 * Placeholder deliberado — o teste em si (perguntas, pesos, resultado) ainda não foi definido.
 * O CTA da tela anterior não deve prometer um quiz funcional; esta tela cumpre isso mostrando o
 * que está por vir, sem simular um resultado.
 */
export default function StudentPerfilLutador() {
  return (
    <div className="page-container">
      <PageHeader title="PERFIL DE LUTADOR" back />

      <div className="rounded-[20px] p-5 mb-5 bg-[linear-gradient(150deg,#1F1B0C,#171717_60%)] border border-amber/30 text-center">
        <div className="h-12 w-12 rounded-full bg-amber/15 flex items-center justify-center mx-auto mb-3">
          <Sparkles className="h-[22px] w-[22px] text-amber" />
        </div>
        <div className="font-display text-xl tracking-wide text-foreground mb-1.5">EM BREVE</div>
        <div className="text-[13.5px] text-muted-foreground leading-relaxed">
          Estamos preparando um teste rápido pra descobrir qual estilo combina mais com o seu jeito de lutar.
        </div>
      </div>

      <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2.5">Os estilos</div>
      <div className="flex flex-col gap-2.5">
        {PROFILES.map((p) => (
          <div key={p.name} className="card-dark p-4">
            <div className="text-[14.5px] font-semibold text-foreground mb-1">{p.name}</div>
            <div className="text-[12.5px] text-muted-foreground leading-relaxed">{p.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
