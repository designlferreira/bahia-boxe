import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { CarregandoTela } from "@/components/CarregandoTela";
import { AdminBottomNav } from "@/components/AdminBottomNav";

export function AdminLayout() {
  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <main className="flex-1 flex flex-col min-h-0">
        {/* As telas carregam sob demanda (lazy em App.tsx): o Suspense fica AQUI para a barra de baixo não sumir enquanto a tela chega. */}
        <Suspense fallback={<CarregandoTela />}>
          <Outlet />
        </Suspense>
      </main>
      <AdminBottomNav />
    </div>
  );
}
