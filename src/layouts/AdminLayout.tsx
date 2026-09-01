import { Outlet } from "react-router-dom";
import { AdminBottomNav } from "@/components/AdminBottomNav";

export function AdminLayout() {
  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <main className="flex-1 flex flex-col min-h-0">
        <Outlet />
      </main>
      <AdminBottomNav />
    </div>
  );
}
