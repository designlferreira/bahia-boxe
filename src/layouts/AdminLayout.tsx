import { Outlet } from "react-router-dom";
import { AdminBottomNav } from "@/components/AdminBottomNav";

export function AdminLayout() {
  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <Outlet />
      <AdminBottomNav />
    </div>
  );
}
