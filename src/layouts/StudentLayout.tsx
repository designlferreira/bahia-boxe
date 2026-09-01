import { Outlet } from "react-router-dom";
import { StudentBottomNav } from "@/components/StudentBottomNav";

export function StudentLayout() {
  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <Outlet />
      <StudentBottomNav />
    </div>
  );
}
