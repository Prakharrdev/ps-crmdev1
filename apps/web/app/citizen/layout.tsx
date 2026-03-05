'use client';

import { useState } from "react";
import { Flame, LayoutGrid, MapPin, Menu, Ticket } from "lucide-react";
import Sidebar, { defaultSidebarConfig, SidebarNavigationItem } from "@/components/Sidebar";
import { usePathname } from "next/navigation";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  const citizenNavigation: SidebarNavigationItem[] = [
    { id: "dashboard", name: "Dashboard", icon: <LayoutGrid size={20} strokeWidth={2.5} />, href: "/citizen", isActive: pathname === "/citizen" },
    { id: "track", name: "Your Tickets", icon: <Ticket size={20} strokeWidth={2} />, href: "/citizen/tickets", isActive: pathname === "/citizen/tickets" },
    { id: "projects", name: "Heatmap", icon: <Flame size={20} strokeWidth={2} />, href: "/citizen/heatmap", isActive: pathname === "/citizen/heatmap" },
    { id: "reports", name: "Nearby Tickets", icon: <MapPin size={20} strokeWidth={2} />, href: "/citizen/reports", isActive: pathname === "/citizen/reports" },
  ];

  const sidebarConfig = {
    ...defaultSidebarConfig,
    branding: {
      ...defaultSidebarConfig.branding,
      title: "Citizen",
    },
    colors: {
      ...defaultSidebarConfig.colors,
      textMain: "text-white dark:text-white",
    },
    navigation: citizenNavigation,
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


      {/* Add a temporary button to test mobile toggle */}
      <main className="flex-1 w-full p-4">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="lg:hidden p-2 bg-purple-600 text-white rounded-md mb-4"
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>
        {children}
      </main>
    </div>
  );
}