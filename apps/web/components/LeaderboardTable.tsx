"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useTheme } from "./ThemeProvider";
import { Trophy, Medal, Award } from "lucide-react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP);
}

type LeaderboardRow = {
  user_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  points: number;
  rank: number | null;
};

type LeaderboardResponse = {
  items: LeaderboardRow[];
};

export default function LeaderboardTable() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const containerRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<(HTMLDivElement | null)[]>([]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadLeaderboard = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/citizen/leaderboard", {
          method: "GET",
          cache: "no-store",
        });

        const data = (await response.json().catch(() => null)) as
          | LeaderboardResponse
          | { error?: string }
          | null;

        if (!response.ok) {
          throw new Error((data as { error?: string } | null)?.error || "Failed to fetch leaderboard");
        }

        setRows((data as LeaderboardResponse).items ?? []);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch leaderboard";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void loadLeaderboard();
  }, []);

  useGSAP(
    () => {
      if (loading || rows.length === 0) return;

      gsap.from(rowsRef.current, {
        y: 30,
        opacity: 0,
        stagger: 0.1,
        duration: 0.8,
        ease: "power3.out",
        clearProps: "all",
      });

      gsap.from(".leaderboard-header", {
        y: -20,
        opacity: 0,
        duration: 0.6,
        ease: "power2.out",
        clearProps: "all",
      });
    },
    { scope: containerRef, dependencies: [loading, rows.length] },
  );

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-6 h-6 text-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]" />;
      case 2:
        return <Medal className="w-6 h-6 text-gray-400 drop-shadow-[0_0_8px_rgba(156,163,175,0.5)]" />;
      case 3:
        return <Award className="w-6 h-6 text-amber-600 drop-shadow-[0_0_8px_rgba(180,83,9,0.5)]" />;
      default:
        return <span className={`text-sm font-bold ${isDark ? "text-[#eadfd0]/60" : "text-slate-500"}`}>{rank}</span>;
    }
  };

  return (
    <div ref={containerRef} className="w-full max-w-4xl mx-auto py-8 px-4">
      <div
        className={`leaderboard-header grid grid-cols-[80px_1fr_120px] gap-4 px-6 py-4 mb-2 font-bold text-sm uppercase tracking-wider border-b ${
          isDark ? "text-white/70 border-white/10" : "text-[#2a221c]/60 border-[#2a221c]/10"
        }`}
      >
        <span>Rank</span>
        <span>Citizen</span>
        <span className="text-right">Points</span>
      </div>

      {loading ? <p className={`px-6 py-4 text-sm ${isDark ? "text-white/60" : "text-[#2a221c]/60"}`}>Loading leaderboard...</p> : null}
      {error ? <p className="px-6 py-4 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <p className={`px-6 py-4 text-sm ${isDark ? "text-white/60" : "text-[#2a221c]/60"}`}>No leaderboard data yet.</p>
      ) : null}

      <div className="flex flex-col gap-3">
        {rows.map((citizen, index) => {
          const rank = citizen.rank ?? index + 1;
          const displayName = citizen.full_name?.trim() || "Citizen";

          return (
            <div
              key={`${citizen.user_id ?? "unknown"}-${rank}`}
              ref={(el) => {
                rowsRef.current[index] = el;
              }}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              className={`
              grid grid-cols-[80px_1fr_120px] gap-4 items-center px-6 py-4 rounded-2xl
              ${
                isDark
                  ? "bg-[#332a22] border border-[#4d443c] hover:bg-[#4d443c]"
                  : "bg-[#f4f0e6] border border-[#e6e2d8] hover:bg-white"
              }
              relative overflow-hidden group shadow-sm
              ${rank <= 3 ? (isDark ? "shadow-[0_8px_30px_rgb(0,0,0,0.5)]" : "shadow-md") : ""}
            `}
            >
              <div className="flex items-center justify-center">{getRankIcon(rank)}</div>

              <div className="flex items-center gap-4">
                <div
                  className={`
                w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg
                ${
                  isDark
                    ? "bg-[#4d443c] text-[#eadfd0] border border-white/10"
                    : "bg-white text-[#2a221c] border border-slate-200 shadow-sm"
                }
              `}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <span className={`text-lg font-bold transition-colors duration-300 ${isDark ? "text-white" : "text-[#2a221c]"}`}>
                  {displayName}
                </span>
              </div>

              <div className="text-right flex items-center justify-end gap-2">
                <span className={`text-xl font-bold ${isDark ? "text-white" : "text-[#2a221c]"}`}>
                  {citizen.points.toLocaleString()}
                </span>
                <span className={`text-xs font-bold ${isDark ? "text-white/40" : "text-[#2a221c]/40"}`}>PTS</span>
              </div>

              <div
                className={`
              absolute left-0 top-0 w-1.5 h-full transition-transform duration-500 origin-top
              ${rank === 1 ? "bg-yellow-500" : rank === 2 ? "bg-gray-400" : rank === 3 ? "bg-amber-600" : "bg-primary/40"}
              ${hoveredIndex === index ? "scale-y-100" : "scale-y-0"}
            `}
                title="rank-bar"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
