import { Outlet } from "react-router-dom";
import { StudentBottomNav } from "@/components/StudentBottomNav";

export function StudentLayout() {
  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <main className="flex-1 flex flex-col min-h-0">
        <Outlet />
      </main>
      <StudentBottomNav />
    </div>
  );
}
