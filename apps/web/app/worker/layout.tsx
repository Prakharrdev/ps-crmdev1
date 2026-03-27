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
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    bottomNavigation: [],
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

              <div ref={profileMenuRef} className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isProfileMenuOpen}
                  onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-300 dark:hover:bg-[#2a2a2a]"
                >
                  <UserCircle2 size={18} />
                  <ChevronDown
                    size={16}
                    className={`transition-transform duration-200 ${isProfileMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isProfileMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Profile menu"
                    className="absolute right-0 z-[2000] mt-2 w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-[#2a2a2a] dark:bg-[#1e1e1e]"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-[#2a2a2a]"
                    >
                      <LogOut size={16} />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
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
