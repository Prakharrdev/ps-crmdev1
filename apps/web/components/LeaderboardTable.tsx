"use client";

import React, { useState, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useTheme } from "./ThemeProvider";
import { Trophy, Medal, Award } from "lucide-react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP);
}

interface Citizen {
  id: string;
  full_name: string;
  avatar_url: string | null;
  points: number;
}

const mockCitizens: Citizen[] = [
  { id: "1", full_name: "Shreyas Gupta", avatar_url: null, points: 2850 },
  { id: "2", full_name: "Pranika Singh", avatar_url: null, points: 2420 },
  { id: "3", full_name: "Medhansh Arora", avatar_url: null, points: 2180 },
  { id: "4", full_name: "Prakhar Sharma", avatar_url: null, points: 1950 },
  { id: "5", full_name: "Shrey Dev", avatar_url: null, points: 1720 },
  { id: "6", full_name: "Amit Kumar", avatar_url: null, points: 1540 },
  { id: "7", full_name: "Sneha Reddy", avatar_url: null, points: 1320 },
  { id: "8", full_name: "Rohan Varma", avatar_url: null, points: 1100 },
  { id: "9", full_name: "Ananya Iyer", avatar_url: null, points: 950 },
  { id: "10", full_name: "Vikram Shah", avatar_url: null, points: 820 },
];

export default function LeaderboardTable() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const containerRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<(HTMLDivElement | null)[]>([]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useGSAP(() => {
    // Entrance animation
    gsap.from(rowsRef.current, {
      y: 30,
      opacity: 0,
      stagger: 0.1,
      duration: 0.8,
      ease: "power3.out",
      clearProps: "all",
    });

    // Header entrance
    gsap.from(".leaderboard-header", {
      y: -20,
      opacity: 0,
      duration: 0.6,
      ease: "power2.out",
      clearProps: "all",
    });
  }, { scope: containerRef });

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="w-6 h-6 text-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]" />;
      case 1:
        return <Medal className="w-6 h-6 text-gray-400 drop-shadow-[0_0_8px_rgba(156,163,175,0.5)]" />;
      case 2:
        return <Award className="w-6 h-6 text-amber-600 drop-shadow-[0_0_8px_rgba(180,83,9,0.5)]" />;
      default:
        return <span className={`text-sm font-bold ${isDark ? "text-[#eadfd0]/60" : "text-slate-500"}`}>{index + 1}</span>;
    }
  };

  return (
    <div ref={containerRef} className="w-full max-w-4xl mx-auto py-8 px-4">
      {/* Table Header */}
      <div className={`leaderboard-header grid grid-cols-[80px_1fr_120px] gap-4 px-6 py-4 mb-2 font-bold text-sm uppercase tracking-wider border-b ${isDark ? "text-white/70 border-white/10" : "text-[#2a221c]/60 border-[#2a221c]/10"}`}>
        <span>Rank</span>
        <span>Citizen</span>
        <span className="text-right">Points</span>
      </div>

      {/* Table Rows */}
      <div className="flex flex-col gap-3">
        {mockCitizens.map((citizen, index) => (
          <div
            key={citizen.id}
            ref={(el) => { rowsRef.current[index] = el; }}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            className={`
              grid grid-cols-[80px_1fr_120px] gap-4 items-center px-6 py-4 rounded-2xl
              ${isDark 
                ? "bg-[#332a22] border border-[#4d443c] hover:bg-[#4d443c]" 
                : "bg-[#f4f0e6] border border-[#e6e2d8] hover:bg-white"}
              relative overflow-hidden group shadow-sm
              ${index < 3 ? (isDark ? "shadow-[0_8px_30px_rgb(0,0,0,0.5)]" : "shadow-md") : ""}
            `}
          >
            {/* Rank */}
            <div className="flex items-center justify-center">
              {getRankIcon(index)}
            </div>

            {/* Name & Avatar */}
            <div className="flex items-center gap-4">
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg
                ${isDark ? "bg-[#4d443c] text-[#eadfd0] border border-white/10" : "bg-white text-[#2a221c] border border-slate-200 shadow-sm"}
              `}>
                {citizen.full_name.charAt(0)}
              </div>
              <span className={`text-lg font-bold transition-colors duration-300 ${isDark ? "text-white" : "text-[#2a221c]"}`}>
                {citizen.full_name}
              </span>
            </div>

            {/* Points */}
            <div className="text-right flex items-center justify-end gap-2">
              <span className={`text-xl font-bold ${isDark ? "text-white" : "text-[#2a221c]"}`}>
                {citizen.points.toLocaleString()}
              </span>
              <span className={`text-xs font-bold ${isDark ? "text-white/40" : "text-[#2a221c]/40"}`}>
                PTS
              </span>
            </div>

            {/* Hover Decorator */}
            <div className={`
              absolute left-0 top-0 w-1.5 h-full transition-transform duration-500 origin-top
              ${index === 0 ? "bg-yellow-500" : index === 1 ? "bg-gray-400" : index === 2 ? "bg-amber-600" : "bg-primary/40"}
              ${hoveredIndex === index ? "scale-y-100" : "scale-y-0"}
            `} title="rank-bar" />
          </div>
        ))}
      </div>
    </div>
  );
}
