import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { CarregandoTela } from "@/components/CarregandoTela";
import { StudentBottomNav } from "@/components/StudentBottomNav";

export function StudentLayout() {
  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* Primeiro item do teclado: pula direto para o conteúdo (WCAG 2.4.1). Só aparece quando recebe o foco. */}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[110] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
      >
        Pular para o conteúdo
      </a>
      <main id="conteudo" tabIndex={-1} className="flex-1 flex flex-col min-h-0 focus:outline-none">
        {/* As telas carregam sob demanda (lazy em App.tsx): o Suspense fica AQUI para a barra de baixo não sumir enquanto a tela chega. */}
        <Suspense fallback={<CarregandoTela />}>
          <Outlet />
        </Suspense>
      </main>
      <StudentBottomNav />
    </div>
  );
}
