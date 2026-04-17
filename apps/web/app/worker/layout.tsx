'use client';

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Menu, Trophy, UserCircle2 } from "lucide-react";
import Sidebar, { defaultSidebarConfig } from "@/components/Sidebar";
import { ClipboardList, LayoutGrid, LogOut } from "lucide-react";
import { supabase } from "@/src/lib/supabase";
import NotificationBell from "@/components/NotificationBell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [user, setUser] = useState<any>(null);
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }



  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user);
    });
  }, []);

  const initial = user?.user_metadata?.full_name?.[0] || user?.email?.[0] || 'U';

  const sidebarConfig = {
    ...defaultSidebarConfig,
    branding: {
      ...defaultSidebarConfig.branding,
      title: "Worker",
      icon: (
        <div
          className="w-10 h-10 lg:w-[42px] lg:h-[42px] bg-[#C9A84C]"
          style={{
            WebkitMaskImage: 'url(/Emblem.svg)',
            WebkitMaskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskImage: 'url(/Emblem.svg)',
            maskSize: 'contain',
            maskRepeat: 'no-repeat',
            maskPosition: 'center',
          }}
        />
      ),
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
        id: "tasks",
        name: "Tasks",
        icon: <ClipboardList size={20} strokeWidth={2} />,
        href: "/worker/tasks",
        isActive: pathname === "/worker/tasks",
      },
      {
        id: "profile",
        name: "Profile",
        icon: <Trophy size={20} strokeWidth={2} />,
        href: "/worker/profile",
        isActive: pathname === "/worker/profile",
      },
    ],
    bottomNavigation: [
      { id: "logout", name: "Logout", icon: <LogOut size={20} strokeWidth={2} />, onClick: handleLogout },
      { id: "profile", name: "Profile", icon: <div className="w-[26px] h-[26px] rounded-full bg-[#f59e0b] dark:bg-[#f59e0b] text-[#111111] flex items-center justify-center font-bold text-xs uppercase shadow-sm">{initial}</div>, href: "/worker/profile" },
    ],
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-gray-50 dark:bg-[#161616]">
      <Sidebar
        {...sidebarConfig}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        disableInternalScroll
      />

      <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-[2100] border-b border-gray-200 bg-white shadow-sm dark:border-[#2a2a2a] dark:bg-[#1a1a1a]">
          <div className="flex min-w-0 max-w-full items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="flex-shrink-0 rounded-md bg-[#C9A84C] p-2 text-white transition-colors hover:bg-[#B39340] lg:hidden"
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>

              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-bold text-gray-900 dark:text-gray-100 md:text-xl lg:text-2xl">
                  {pathname === '/worker/tasks' ? 'Tasks' : pathname === '/worker/profile' ? 'My Profile' : 'Worker Dashboard'}
                </h1>
                <p className="mt-0.5 line-clamp-1 text-xs text-gray-600 dark:text-gray-300 sm:text-sm">
                  {pathname === '/worker/tasks' 
                    ? 'View and manage all your assigned tasks.' 
                    : pathname === '/worker/profile'
                    ? 'Track your performance metrics and keep your worker status up to date.'
                    : 'Manage assigned complaints, track progress, and close tasks quickly.'}
                </p>
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
              <NotificationBell />


            </div>
          </div>
        </header>

        <main className="flex-1 min-h-0 w-full max-w-full overflow-y-auto overflow-x-hidden p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
