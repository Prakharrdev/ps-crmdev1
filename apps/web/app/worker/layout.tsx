'use client';

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar, { defaultSidebarConfig } from "@/components/Sidebar";
import { CheckCircle2, ClipboardList, LayoutGrid, LogOut, MapPinned, User } from "lucide-react";
import { supabase } from "@/src/lib/supabase";
import NotificationBell from "@/components/NotificationBell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const sidebarConfig = {
    ...defaultSidebarConfig,
    branding: {
      ...defaultSidebarConfig.branding,
      title: "Worker",
    },
    navigation: [
      {
        id: "dashboard",
        name: "Dashboard",
        icon: <LayoutGrid size={20} strokeWidth={2.5} />,
        href: "/worker",
        isActive: pathname === "/worker",
      },
      {
        id: "assigned-tasks",
        name: "Assigned Tasks",
        icon: <ClipboardList size={20} strokeWidth={2} />,
        href: "/worker?view=assigned",
        isActive: false,
      },
      {
        id: "map",
        name: "Map View",
        icon: <MapPinned size={20} strokeWidth={2} />,
        href: "/map",
        isActive: pathname === "/map",
      },
      {
        id: "completed-tasks",
        name: "Completed Tasks",
        icon: <CheckCircle2 size={20} strokeWidth={2} />,
        href: "/worker?view=completed",
        isActive: false,
      },
    ],
    bottomNavigation: [
      {
        id: "profile",
        name: "Profile",
        icon: <User size={20} strokeWidth={2} />,
        href: "/worker?view=profile",
      },
      {
        id: "logout",
        name: "Logout",
        icon: <LogOut size={20} strokeWidth={2} />,
        onClick: handleLogout,
      },
    ],
  };

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar 
        {...sidebarConfig} 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
      />


      <main className={`flex-1 w-full p-4 ${isCollapsed ? "lg:ml-20" : "lg:ml-64"}`}>
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="rounded-md bg-purple-600 p-2 text-white lg:hidden"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}