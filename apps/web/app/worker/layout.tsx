'use client';

import { useState } from "react";
import { Menu } from "lucide-react";
import Sidebar, { defaultSidebarConfig } from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sidebarConfig = {
    ...defaultSidebarConfig,
    branding: {
      ...defaultSidebarConfig.branding,
      title: "Worker",
    },
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