"use client";

import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
// lucide icons for social links and theme toggle
import { useTheme } from "./ThemeProvider";
import ThemeToggle from "./Themetogglebutton";
import LoginButton3D from "./Loginbutton";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

// 1. Exported interface containing all colors and configurable elements
export interface HeaderTheme {
  light: {
    bgInitial: string;
    bgScrolled: string;
    textInitial: string;
    textScrolled: string;
  };
  dark: {
    bgInitial: string;
    bgScrolled: string;
    textInitial: string;
    textScrolled: string;
  };
}

export interface HeaderProps {
  logoText?: string;
  navLinks?: { label: string; href: string }[];
  themeColors?: HeaderTheme;
  hideLoginButton?: boolean;
}

const defaultTheme: HeaderTheme = {
  light: {
    bgInitial: "#e9ddce", // Lighter beige from the design
    bgScrolled: "#4a3c31", // Darker brown
    textInitial: "#4a3c31",
    textScrolled: "#ffffff",
  },
  dark: {
    bgInitial: "#2a221c",
    bgScrolled: "#110e0c",
    textInitial: "#e9ddce",
    textScrolled: "#ffffff",
  },
};

export default function Header({
  logoText = "JANSAMADHAN",
  navLinks = [
    { label: "HOME", href: "/" },
    { label: "LEADERBOARD", href: "/leaderboard" },
    { label: "CONTACT", href: "/contact" },
    { label: "ABOUT", href: "/about" },
  ],
  themeColors = defaultTheme,
  hideLoginButton = false,
}: HeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { theme } = useTheme();

  // Determine the resolved theme directly from the DOM so we never flash the wrong
  // colour during the SSR→hydration→useEffect cycle.  The inline <head> script has
  // already set the correct class before any JS runs, so this is always accurate.
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark") ? "dark" : "light";
    }
    return "dark";
  });

  // Keep resolvedTheme in sync whenever ThemeProvider toggles the theme.
  useEffect(() => {
    setResolvedTheme(theme);
  }, [theme]);

  const isDarkMode = resolvedTheme === "dark";
  const currentTheme = isDarkMode ? themeColors.dark : themeColors.light;

  // One-time entrance animation — slides the header in from above on mount.
  // Starting opacity:0 is set directly on the element (style prop below) to
  // prevent any flash before this effect runs.
  useGSAP(() => {
    if (!headerRef.current) return;
    gsap.fromTo(
      headerRef.current,
      { y: -80, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.8, delay: 0.1, ease: "power3.out" }
    );
  }, []);

  // 2. GSAP Animation for scroll color change
  useGSAP(() => {
    if (!headerRef.current) return;

    // Immediately apply the correct background for the current theme so there's
    // no flash of the wrong colour while the animation is being set up.
    const atTop = window.scrollY <= 50;
    gsap.set(headerRef.current, {
      backgroundColor: atTop ? currentTheme.bgInitial : currentTheme.bgScrolled,
      color: atTop ? currentTheme.textInitial : currentTheme.textScrolled,
    });

    const anim = gsap.fromTo(
      headerRef.current,
      {
        backgroundColor: currentTheme.bgInitial,
        color: currentTheme.textInitial,
      },
      {
        backgroundColor: currentTheme.bgScrolled,
        color: currentTheme.textScrolled,
        duration: 0.1,
        ease: "power2.out",
        paused: true,
        overwrite: "auto",
      }
    );

    if (window.scrollY > 50) {
      anim.progress(1);
    }

    const st = ScrollTrigger.create({
      start: 50,
      onEnter: () => anim.play(),
      onLeaveBack: () => anim.reverse(),
    });

    return () => {
      st.kill();
      anim.kill();
    };
  }, [currentTheme]);

  return (
    <header
      ref={headerRef}
      className="fixed top-0 left-0 w-full z-50 transition-colors duration-300 shadow-sm"
      style={{ opacity: 0 }}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">

        {/* Left Side: theme toggle, Avatar, Logo & Socials */}
        <div className="flex items-center gap-6">
          <div className="scale-65">
            <ThemeToggle />
          </div>
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity" aria-label="Go to home page">
            <div
              className="w-10 h-10"
              style={{
                backgroundColor: 'currentColor',
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
            <span className="font-bold text-lg tracking-wider hidden sm:block">
              {logoText}
            </span>
          </Link>
        </div>

        {/* Right Side: Desktop Nav (links + login) */}
        <nav className="hidden md:flex items-center gap-4 text-sm font-medium tracking-widest uppercase">
          {navLinks.map((link, idx) => (
            <Link
              key={idx}
              href={link.href}
              className="hover:opacity-60 transition-opacity relative group"
            >
              {link.label}
              <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-current transition-all duration-300 group-hover:w-full"></span>
            </Link>
          ))}
          {!hideLoginButton && (
            <LoginButton3D className="scale-65" onClick={() => (window.location.href = "/login")} />
          )}
        </nav>

        {/* Mobile Menu Toggle */}
        <div className="md:hidden flex items-center gap-2">
          <button
            className="flex flex-col gap-1.5 z-50 p-2"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <span className={`block w-6 h-0.5 bg-current transition-transform ${isMobileMenuOpen ? "rotate-45 translate-y-2" : ""}`}></span>
            <span className={`block w-6 h-0.5 bg-current transition-opacity ${isMobileMenuOpen ? "opacity-0" : ""}`}></span>
            <span className={`block w-6 h-0.5 bg-current transition-transform ${isMobileMenuOpen ? "-rotate-45 -translate-y-2" : ""}`}></span>
          </button>
        </div>

        {/* Mobile Nav Overlay */}
        {isMobileMenuOpen && (
          <div
            className="md:hidden absolute top-full left-0 w-full py-6 px-6 flex flex-col gap-4 shadow-lg border-t border-black/10"
            style={{ backgroundColor: currentTheme.bgScrolled, color: currentTheme.textScrolled }}
          >
            {navLinks.map((link, idx) => (
              <Link
                key={idx}
                href={link.href}
                className="text-sm font-medium tracking-widest uppercase"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {!hideLoginButton && (
              <div className="mt-4">
                <LoginButton3D onClick={() => (window.location.href = "/login")} />
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}