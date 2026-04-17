'use client';

import { useEffect, useRef, useState } from "react";
import { LayoutGrid, ClipboardList, MapPin, Menu, Ticket, Bell, UserCircle2, ChevronDown, LogOut, Gift, Coins, Shield } from "lucide-react";
import Sidebar, { defaultSidebarConfig, SidebarNavigationItem } from "@/components/Sidebar";
import { usePathname } from "next/navigation";
import { supabase } from '@/src/lib/supabase';
import { useRouter } from "next/navigation";
import type { Database } from "@/src/types/database.types";

type ComplaintRow = Database["public"]["Tables"]["complaints"]["Row"];
type NotificationRow = Pick<ComplaintRow, "id" | "title" | "status" | "citizen_id" | "created_at" | "updated_at">;

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function statusClasses(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "submitted") return "bg-amber-100 text-amber-700";
  if (normalized === "assigned") return "bg-blue-100 text-blue-700";
  if (normalized === "in_progress" || normalized === "under_review") return "bg-amber-100 text-[#C9A84C]";
  if (normalized === "resolved") return "bg-green-100 text-green-700";
  if (normalized === "rejected") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-600";
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationLoading, setNotificationLoading] = useState(true);
  const [citizenId, setCitizenId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [hasUnreadUpdates, setHasUnreadUpdates] = useState(false);
  const [globalJsPoints, setGlobalJsPoints] = useState<number | null>(null);
  const notificationMenuRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  useEffect(() => {
    const bootstrapCitizen = async () => {
      // getSession() reads the cached session from localStorage — no network
      // request and no race condition with OAuth hash/code tokens.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setCitizenId(null);
        setUser(null);
        setNotificationLoading(false);
        return;
      }
      setCitizenId(session.user.id);
      setUser(session.user);
    };

    void bootstrapCitizen();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (notificationMenuRef.current && !notificationMenuRef.current.contains(target)) {
        setIsNotificationOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleUpdate = (e: any) => setGlobalJsPoints(e.detail);
    window.addEventListener('update-js-points', handleUpdate);
    return () => window.removeEventListener('update-js-points', handleUpdate);
  }, []);

  useEffect(() => {
    const fetchPoints = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      try {
        const response = await fetch("/api/citizen/wallet", {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });

        if (response.ok) {
          const data = await response.json();
          setGlobalJsPoints(data.wallet.points_balance ?? 0);
        }
      } catch (err) {
        console.error("Failed to fetch JS points:", err);
      }
    };

    if (citizenId) {
      void fetchPoints();
    }
  }, [citizenId]);

  useEffect(() => {
    if (!citizenId) return;

    const fetchNotifications = async () => {
      setNotificationLoading(true);
      setNotificationError(null);

      const { data, error } = await supabase
        .from("complaints")
        .select("id, title, status, citizen_id, created_at, updated_at")
        .eq("citizen_id", citizenId)
        .order("updated_at", { ascending: false })
        .limit(6);

      if (error) {
        setNotificationError("Failed to load updates");
        setNotificationLoading(false);
        return;
      }

      setNotifications((data ?? []) as NotificationRow[]);
      setNotificationLoading(false);
    };

    const mergeIncoming = (incoming: NotificationRow, markUnread: boolean) => {
      setNotifications((prev) => {
        const withoutCurrent = prev.filter((item) => item.id !== incoming.id);
        return [incoming, ...withoutCurrent].slice(0, 6);
      });

      if (markUnread && !isNotificationOpen) {
        setHasUnreadUpdates(true);
      }
    };

    void fetchNotifications();

    const channel = supabase
      .channel(`citizen-notifications-${citizenId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "complaints",
          filter: `citizen_id=eq.${citizenId}`,
        },
        (payload) => {
          // New complaints should appear in the list, but should not trigger a status-change unread dot.
          mergeIncoming(payload.new as NotificationRow, false);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "complaints",
          filter: `citizen_id=eq.${citizenId}`,
        },
        (payload) => {
          const nextRow = payload.new as NotificationRow;
          const prevRow = payload.old as Partial<NotificationRow>;
          const statusChanged = (prevRow.status ?? '') !== (nextRow.status ?? '');

          if (!statusChanged) {
            return;
          }

          mergeIncoming(nextRow, true);
        }
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [citizenId, isNotificationOpen]);

  const toggleNotifications = () => {
    setIsNotificationOpen((prev) => {
      const nextValue = !prev;
      if (nextValue) {
        setHasUnreadUpdates(false);
      }
      return nextValue;
    });
  };

  const initial = user?.user_metadata?.full_name?.[0] || user?.email?.[0] || 'U';

  const citizenNavigation: SidebarNavigationItem[] = [
    {
      id: "dashboard",
      name: "Dashboard",
      icon: <LayoutGrid size={20} strokeWidth={2.5} />,
      href: "/citizen",
      isActive: pathname === "/citizen",
    },
    {
      id: "report",
      name: "Report Issue",
      icon: <ClipboardList size={20} strokeWidth={2} />,
      href: "/citizen/report",
      isActive: pathname === "/citizen/report",
    },
    {
      id: "track",
      name: "Your Tickets",
      icon: <Ticket size={20} strokeWidth={2} />,
      href: "/citizen/tickets",
      isActive: pathname === "/citizen/tickets",
    },
    {
      id: "reports",
      name: "Nearby Tickets",
      icon: <MapPin size={20} strokeWidth={2} />,
      href: "/citizen/nearby",
      isActive: pathname === "/citizen/nearby",
    },
    {
      id: "rewards",
      name: "Rewards",
      icon: <Gift size={20} strokeWidth={2} />,
      href: "/citizen/rewards",
      isActive: pathname === "/citizen/rewards",
    },
  ];

  const sidebarConfig = {
    ...defaultSidebarConfig,
    branding: {
      ...defaultSidebarConfig.branding,
      title: "Citizen",
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
    colors: {
      ...defaultSidebarConfig.colors,
      textMain: "text-white dark:text-white",
    },
    navigation: citizenNavigation,
    bottomNavigation: [
      { id: "logout", name: "Logout", icon: <LogOut size={20} strokeWidth={2} />, onClick: handleLogout },
      { id: "profile", name: "Profile", icon: <div className="w-[26px] h-[26px] rounded-full bg-[#f59e0b] dark:bg-[#f59e0b] text-[#111111] flex items-center justify-center font-bold text-xs uppercase shadow-sm">{initial}</div>, href: "/citizen/profile" },
    ],
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-[#161616]">
      <Sidebar
        {...sidebarConfig}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        disableInternalScroll
        onLogout={handleLogout}
      />

      {/* Main content area - flex-1 fills remaining space naturally */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 max-w-full overflow-x-hidden">
        {/* Fixed Header - edge to edge */}
        <header className="sticky top-0 z-[2100] bg-white dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-[#2a2a2a] shadow-sm">
          <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-4 min-w-0 max-w-full">
            {/* Left side - Hamburger and Title */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 bg-[#C9A84C] text-white rounded-md hover:bg-[#B39340] transition-colors flex-shrink-0"
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
                  {pathname === '/citizen/tickets' ? 'Your Tickets' : pathname === '/citizen/nearby' ? 'Nearby Tickets' : pathname === '/citizen/report' ? 'Report Issue' : pathname === '/citizen/rewards' ? 'Rewards' : 'JanSamadhan AI Assistant'}
                </h1>
                <p className="mt-0.5 text-xs sm:text-sm text-gray-600 dark:text-gray-300 line-clamp-1">
                  {pathname === '/citizen/tickets' ? 'Track all complaints you have reported in one list.' : pathname === '/citizen/nearby' ? 'See complaints reported near your location.' : pathname === '/citizen/report' ? 'Report a civic issue to the relevant authorities.' : pathname === '/citizen/rewards' ? 'View your earned rewards and points.' : 'Report an issue quickly, then track what happened next.'}
                </p>
              </div>
            </div>

            {/* Right side - Notifications and Profile */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* Rewards Currencies */}
              <div className="hidden lg:flex items-center gap-4 mr-2">
                <div className="flex items-center bg-amber-50 dark:bg-[#C9A84C]/10 rounded-full pl-1 pr-4 py-1 border border-amber-200 dark:border-[#C9A84C]/30 shadow-sm">
                  <div className="bg-amber-100 dark:bg-[#C9A84C] text-amber-700 dark:text-[#1A1C23] rounded-full p-1.5 mr-2">
                    <Coins size={16} className="fill-current" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-amber-700 dark:text-[#C9A84C] font-semibold leading-none mb-0.5">JS POINTS</span>
                    <span className="text-sm font-bold leading-none text-amber-900 dark:text-white">
                      {globalJsPoints === null ? "Loading..." : globalJsPoints.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notification Bell */}
              <div ref={notificationMenuRef} className="relative">
                <button
                  type="button"
                  aria-label="Notifications"
                  aria-haspopup="menu"
                  aria-expanded={isNotificationOpen}
                  onClick={toggleNotifications}
                  className="relative h-10 w-10 rounded-full border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1e1e1e] text-gray-600 dark:text-gray-300 shadow-sm transition-colors hover:bg-gray-50 dark:hover:bg-[#2a2a2a] flex items-center justify-center"
                >
                  <Bell size={18} />
                  {hasUnreadUpdates && (
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
                  )}
                </button>

                {isNotificationOpen && (
                  <div
                    role="menu"
                    aria-label="Notifications"
                    className="absolute right-0 z-[2000] mt-2 w-80 rounded-xl border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1e1e1e] p-2 shadow-lg"
                  >
                    <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Latest Updates
                    </p>

                    <div className="max-h-72 overflow-y-auto">
                      {notificationLoading ? (
                        <p className="px-2 py-3 text-sm text-gray-500 dark:text-gray-400">Loading updates...</p>
                      ) : notificationError ? (
                        <p className="px-2 py-3 text-sm text-red-600 dark:text-red-400">{notificationError}</p>
                      ) : notifications.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-gray-500 dark:text-gray-400">No recent updates</p>
                      ) : (
                        notifications.slice(0, 6).map((notification) => (
                          <div
                            key={notification.id}
                            role="menuitem"
                            className="rounded-lg px-2 py-2 hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors"
                          >
                            <p className="line-clamp-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                              {notification.title || "Untitled issue"}
                            </p>
                            <span
                              className={`mt-1 inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${statusClasses(notification.status || "")}`}
                            >
                              {formatStatus(notification.status || "submitted")}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>


            </div>
          </div>
        </header>

        {/* Page Content - edge to edge, no padding */}
        <main className="flex-1 min-h-0 min-w-0 max-w-full overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
