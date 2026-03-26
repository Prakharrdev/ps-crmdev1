"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Flame,
  LayoutGrid,
  Target,
  FolderKanban,
  FileText,
  MessageSquare,
  Settings,
  X,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon
} from "lucide-react";
import gsap from "gsap";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

// 0. Color Interface & Constants
export interface SidebarThemeColors {
  background: string;
  border: string;
  textMain: string;
  textMuted: string;
  textHover: string;
  bgHover: string;
  activeText: string;
  activeBg: string;
  activeIndicator: string;
  badgeBg: string;
  badgeText: string;
  toggleButtonBg: string;
}

export interface SidebarNavigationItem {
  id: string;
  name: string;
  icon: React.ReactNode;
  href: string;
  isActive?: boolean;
  badge?: number;
}

export interface SidebarBottomNavigationItem {
  id: string;
  name: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
}

export const SIDEBAR_LIGHT_COLORS: SidebarThemeColors = {
  background: "bg-[#554035]",
  border: "border-[transparent]",
  textMain: "text-[#F5EBE1]",
  textMuted: "text-[#B4A396]",
  textHover: "hover:text-[#F5EBE1]",
  bgHover: "hover:bg-[#624D41]",
  activeText: "text-[#F5EBE1]",
  activeBg: "bg-[#B48470]",
  activeIndicator: "hidden",
  badgeBg: "bg-[#B48470]",
  badgeText: "text-[#F5EBE1]",
  toggleButtonBg: "bg-white",
};

export const SIDEBAR_DARK_COLORS: SidebarThemeColors = {
  background: "dark:bg-[#111111]",
  border: "dark:border-[#C9A84C]/20",
  textMain: "dark:text-white",
  textMuted: "dark:text-gray-400",
  textHover: "dark:hover:text-white",
  bgHover: "dark:hover:bg-[#2a2a2a]",
  activeText: "dark:text-[#C9A84C]",
  activeBg: "dark:bg-[#C9A84C]/10",
  activeIndicator: "dark:bg-[#C9A84C]",
  badgeBg: "dark:bg-[#C9A84C]/20",
  badgeText: "dark:text-white",
  toggleButtonBg: "dark:bg-[#1e1e1e]",
};

// 1. The Exported Interface for Maximum Customizability
export interface SidebarConfig {
  branding: {
    title: React.ReactNode;
    icon: React.ReactNode;
  };
  colors: SidebarThemeColors;
  navigation: SidebarNavigationItem[];
  bottomNavigation: SidebarBottomNavigationItem[];
  // Mobile drawer controls
  isOpen: boolean;
  onClose: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onLogout?: () => void;
  disableInternalScroll?: boolean;
}

// 2. Default Configuration (matches your Taskify UI design)
export const defaultSidebarConfig: Omit<SidebarConfig, "isOpen" | "onClose" | "isCollapsed" | "onToggleCollapse"> = {
  branding: {
    title: "Taskify",
    icon: (
      <div className="bg-[#B48470] dark:bg-purple-900/30 p-1.5 rounded-lg shrink-0">
        <Flame size={24} strokeWidth={2.5} className="text-[#FDF8F0] dark:text-purple-400" />
      </div>
    ),
  },
  colors: {
    background: `${SIDEBAR_LIGHT_COLORS.background} ${SIDEBAR_DARK_COLORS.background}`,
    border: `${SIDEBAR_LIGHT_COLORS.border} ${SIDEBAR_DARK_COLORS.border}`,
    textMain: `${SIDEBAR_LIGHT_COLORS.textMain} ${SIDEBAR_DARK_COLORS.textMain}`,
    textMuted: `${SIDEBAR_LIGHT_COLORS.textMuted} ${SIDEBAR_DARK_COLORS.textMuted}`,
    textHover: `${SIDEBAR_LIGHT_COLORS.textHover} ${SIDEBAR_DARK_COLORS.textHover}`,
    bgHover: `${SIDEBAR_LIGHT_COLORS.bgHover} ${SIDEBAR_DARK_COLORS.bgHover}`,
    activeText: `${SIDEBAR_LIGHT_COLORS.activeText} ${SIDEBAR_DARK_COLORS.activeText}`,
    activeBg: `${SIDEBAR_LIGHT_COLORS.activeBg} ${SIDEBAR_DARK_COLORS.activeBg}`,
    activeIndicator: `${SIDEBAR_LIGHT_COLORS.activeIndicator} ${SIDEBAR_DARK_COLORS.activeIndicator}`,
    badgeBg: `${SIDEBAR_LIGHT_COLORS.badgeBg} ${SIDEBAR_DARK_COLORS.badgeBg}`,
    badgeText: `${SIDEBAR_LIGHT_COLORS.badgeText} ${SIDEBAR_DARK_COLORS.badgeText}`,
    toggleButtonBg: `${SIDEBAR_LIGHT_COLORS.toggleButtonBg} ${SIDEBAR_DARK_COLORS.toggleButtonBg}`,
  },
  navigation: [
    {
      id: "dashboard",
      name: "Dashboard",
      icon: <LayoutGrid size={20} strokeWidth={2.5} />,
      href: "/authority"
    },
    {
      id: "track",
      name: "Track",
      icon: <Target size={20} strokeWidth={2} />,
      href: "/authority/track"
    },
    {
      id: "reports",
      name: "Reports",
      icon: <FileText size={20} strokeWidth={2} />,
      href: "/authority/reports"
    }
  ],
  bottomNavigation: [
    { id: "support", name: "Support", icon: <MessageSquare size={20} strokeWidth={2} />, href: "#" },
    { id: "settings", name: "Settings", icon: <Settings size={20} strokeWidth={2} />, href: "#" },
  ],
};


// 3. The Component
const Sidebar: React.FC<SidebarConfig> = ({
  branding,
  colors,
  navigation,
  bottomNavigation,
  isOpen,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
  onLogout,
  disableInternalScroll = false,
}) => {
  const sidebarRef = useRef<HTMLElement>(null);
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    // GSAP stagger animation - only runs when the sidebar is rendered/opened
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".menu-item",
        { y: 15, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.3,
          stagger: 0.05, // Faster stagger for a snappier feel
          ease: "power2.out",
          clearProps: "opacity,visibility,transform",
        }
      );
    }, sidebarRef);

    return () => ctx.revert();
  }, [isOpen]); // Re-run animation if mobile menu toggles

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-gray-900/50 dark:bg-black/60 z-[9998] lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Drawer / Static Sidebar */}
      <aside
        ref={sidebarRef}
        className={`
          fixed lg:relative top-0 left-0 z-[9999] flex flex-col font-sans transition-all duration-300 ease-in-out
          ${disableInternalScroll ? "h-full py-4" : "min-h-screen py-8"}
          ${colors.background} ${colors.border} lg:border-r lg:relative lg:translate-x-0
          ${isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}
          ${isCollapsed ? "w-20" : "w-64"}
        `}
      >
        {/* Desktop Collapse Toggle */}
        <button
          onClick={onToggleCollapse}
          className={`absolute -right-3 top-10 z-[3002] hidden lg:flex h-6 w-6 items-center justify-center rounded-full border text-gray-500 shadow-md hover:text-gray-900 dark:border-[#C9A84C]/40 dark:text-gray-400 dark:hover:text-[#C9A84C] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B48470] dark:focus-visible:ring-[#C9A84C] ${colors.toggleButtonBg}`}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {/* make top part scrollable so bottom nav stays visible */}
        <div className={`flex min-h-0 flex-col flex-1 overflow-x-hidden ${disableInternalScroll ? "overflow-y-hidden" : "overflow-y-auto"}`}>
          {/* Logo & Mobile Close Button */}
          <div className={`flex items-center ${isCollapsed ? "justify-center px-2" : "justify-between px-8"} ${disableInternalScroll ? "mb-6" : "mb-10"} menu-item transition-all duration-300`}>
            <div className={`flex items-center ${isCollapsed ? "justify-center gap-0" : "gap-3"} transition-all duration-300`}>
              <div className="shrink-0 flex items-center justify-center">
                {branding.icon}
              </div>
              <div className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[200px] opacity-100"}`}>
                <div className={`text-[21px] font-medium leading-tight ${colors.textMain}`}>
                  {branding.title}
                </div>
              </div>
            </div>
            {/* Close button only visible on mobile */}
            <button onClick={onClose} className={`lg:hidden text-gray-500 hover:text-gray-900 dark:hover:text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#B48470] dark:focus:ring-[#C9A84C] rounded-md ${isCollapsed ? "hidden" : "block"}`}>
              <X size={24} />
            </button>
          </div>

          {/* Main Navigation */}
          <nav className={`space-y-2 ${isCollapsed ? "px-2" : "px-4"} transition-all duration-300`}>
            {navigation.map((item) => (
              <div key={item.id} className="relative menu-item">
                {item.isActive && (
                  <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 rounded-r-md ${colors.activeIndicator}`} />
                )}
                <Link
                  href={item.href}
                  className={`
                    flex items-center ${isCollapsed ? "justify-center px-2" : "justify-start px-4"} py-3 ml-2 rounded-xl font-medium transition-all duration-200
                    focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#B48470] dark:focus:ring-[#C9A84C]
                    ${item.isActive
                      ? `${colors.activeBg} ${colors.activeText} font-semibold`
                      : `${colors.textMuted} ${colors.textHover} ${colors.bgHover}`
                    }
                  `}
                  title={isCollapsed ? item.name : undefined}
                >
                  <div className={`flex items-center ${isCollapsed ? "gap-0" : "gap-4"} transition-all duration-300`}>
                    <div className="shrink-0">{item.icon}</div>
                    <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[200px] opacity-100"}`}>
                      {item.name}
                    </span>
                  </div>
                  {item.badge && !isCollapsed && (
                    <span className={`ml-auto text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full ${colors.badgeBg} ${colors.badgeText} transition-all duration-300`}>
                      {item.badge}
                    </span>
                  )}
                </Link>

                {item.badge && isCollapsed && (
                  <div className={`pointer-events-none absolute top-2 right-2 w-2 h-2 rounded-full ${colors.badgeBg} transition-all duration-300 opacity-100 scale-100`} />
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Bottom Navigation */}
        <div className={`shrink-0 space-y-2 ${isCollapsed ? "px-2" : "px-4"} transition-all duration-300`}>
          <button
            type="button"
            onClick={toggleTheme}
            className={`menu-item flex w-full items-center ${isCollapsed ? "justify-center px-2 gap-0" : "justify-start px-4 gap-4"} py-3 ml-2 rounded-xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#B48470] dark:focus:ring-[#C9A84C] ${colors.textMuted} ${colors.textHover} ${colors.bgHover}`}
            title={isCollapsed ? (isDark ? "Light Mode" : "Dark Mode") : undefined}
          >
            <div className="shrink-0">
              {mounted && (isDark ? <Sun size={20} strokeWidth={2} /> : <Moon size={20} strokeWidth={2} />)}
            </div>
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[200px] opacity-100"}`}>
              {mounted && (isDark ? "Light Mode" : "Dark Mode")}
            </span>
          </button>

          {bottomNavigation.map((item) => {
            const classes = `menu-item flex items-center ${isCollapsed ? "justify-center px-2 gap-0" : "justify-start px-4 gap-4"} py-3 ml-2 rounded-xl font-medium transition-all duration-300 ${colors.textMuted} ${colors.textHover} ${colors.bgHover}`;

            if (item.onClick) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className={`${classes} w-full text-left`}
                  title={isCollapsed ? item.name : undefined}
                >
                  <div className="shrink-0">{item.icon}</div>
                  <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[200px] opacity-100"}`}>
                    {item.name}
                  </span>
                </button>
              );
            }

            return (
              <Link
                key={item.id}
                href={item.href ?? "#"}
                className={classes}
                title={isCollapsed ? item.name : undefined}
              >
                <div className="shrink-0">{item.icon}</div>
                <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[200px] opacity-100"}`}>
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
