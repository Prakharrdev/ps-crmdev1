// apps/web/app/authority/layout.tsx
'use client'

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart2, ChevronDown, ClipboardList,
  LayoutGrid, LogOut, Menu, Users, UserCircle2,
} from "lucide-react"
import Sidebar, { defaultSidebarConfig } from "@/components/Sidebar"
import { supabase } from "@/src/lib/supabase"
import AuthorityNotificationBell from "@/app/authority/_components/AuthorityNotificationBell"

const PAGE_META: Record<string, { title: string; sub: string }> = {
  "/authority": { title: "Authority", sub: "Overview of department complaints, performance metrics, and recent activity." },
  "/authority/track": { title: "Track Complaints", sub: "Monitor and manage complaints across the city through the live complaint map." },
  "/authority/workers": { title: "Workers", sub: "View and manage department field workers and their availability status." },
  "/authority/reports": { title: "Reports", sub: "Analyze complaint trends, resolution performance, and SLA compliance." },
}

function usePageMeta(pathname: string) {
  const key = Object.keys(PAGE_META)
    .filter(k => k === "/authority" ? pathname === k : pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0] ?? ""
  return PAGE_META[key] ?? {
    title: pathname.split("/").filter(Boolean).slice(-1)[0]?.replace(/-/g, " ") ?? "Dashboard",
    sub: "",
  }
}

export default function AuthorityLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [profileOpen, setProfileOpen] = useState(false)
  const [userName, setUserName] = useState("")
  const profileRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const router = useRouter()
  const pageMeta = usePageMeta(pathname)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const name = data?.user?.user_metadata?.full_name
        ?? data?.user?.email?.split("@")[0]
        ?? "Officer"
      setUserName(name)
    })
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace("/login")
  }

  const initials = userName
    .split(" ")
    .map(p => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "AU"

  const sidebarConfig = {
    ...defaultSidebarConfig,
    branding: {
      ...defaultSidebarConfig.branding,
      title: "Authority",
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
    navigation: [
      { id: "dashboard", name: "Dashboard", icon: <LayoutGrid size={20} strokeWidth={2} />, href: "/authority", isActive: pathname === "/authority" },
      { id: "track", name: "Track Complaints", icon: <ClipboardList size={20} strokeWidth={2} />, href: "/authority/track", isActive: pathname.startsWith("/authority/track") },
      { id: "workers", name: "Workers", icon: <Users size={20} strokeWidth={2} />, href: "/authority/workers", isActive: pathname.startsWith("/authority/workers") },
      { id: "reports", name: "Reports", icon: <BarChart2 size={20} strokeWidth={2} />, href: "/authority/reports", isActive: pathname.startsWith("/authority/reports") },
    ],
    bottomNavigation: defaultSidebarConfig.bottomNavigation,
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-[#161616]">

      <Sidebar
        {...sidebarConfig}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(c => !c)}
        disableInternalScroll
      />

      <div className="flex flex-1 flex-col min-h-0 min-w-0 max-w-full overflow-hidden">

        {/* Topbar — from incoming: taller, with title + subtitle, higher z-index */}
        <header className="sticky top-0 z-[2100] border-b border-gray-200 bg-white shadow-sm
               dark:border-[#2a2a2a] dark:bg-[#161616]">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6
                          min-w-0 max-w-full">

            {/* Left: hamburger + page title/subtitle */}
            <div className="flex flex-1 items-center gap-3 min-w-0">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="flex-shrink-0 rounded-md bg-[#b4725a] p-2 text-white
                           transition-colors hover:bg-[#9a5f4a] lg:hidden"
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>

              <div className="flex-1 min-w-0">
                <h1 className="truncate text-lg font-bold capitalize text-gray-900
                               dark:text-gray-100 md:text-xl lg:text-2xl">
                  {pageMeta.title}
                </h1>
                {pageMeta.sub && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-gray-400
                                dark:text-gray-500 sm:text-sm">
                    {pageMeta.sub}
                  </p>
                )}
              </div>
            </div>

            {/* Right: bell + profile dropdown */}
            <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
              <AuthorityNotificationBell />

              <div ref={profileRef} className="relative">
                <button
                  type="button"
                  onClick={() => setProfileOpen(o => !o)}
                  className="flex h-10 items-center gap-2 rounded-full border border-gray-200
                             bg-white px-3 shadow-sm transition-colors
                             hover:bg-gray-50 dark:border-[#2a2a2a] dark:bg-[#1e1e1e]
                             dark:hover:bg-[#2a2a2a]"
                >
                  <UserCircle2 size={18} className="text-gray-700 dark:text-gray-300" />
                  <ChevronDown size={16} className={`text-gray-500 dark:text-gray-400 transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`} />
                </button>

                {profileOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden
                                  rounded-xl border border-gray-200 bg-white shadow-xl
                                  dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
                    <div className="border-b border-gray-100 px-4 py-3 dark:border-[#2a2a2a]">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {userName}
                      </p>
                      <p className="text-[11px] text-gray-400">Authority Officer</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium
                                 text-red-600 transition-colors hover:bg-red-50
                                 dark:hover:bg-red-900/20"
                    >
                      <LogOut size={15} />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>
        </header>

        <main className="flex-1 min-h-0 min-w-0 max-w-full overflow-y-auto overflow-x-hidden
                         px-4 py-6 sm:px-6">
          {children}
        </main>

      </div>
    </div>
  )
}
