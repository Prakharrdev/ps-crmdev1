"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { useTheme } from "./ThemeProvider";

interface Player {
  id: string;
  name: string;
  score: number;
  rank: number;
}

const initialPlayers: Player[] = [
  { id: "p1", name: "Alex", score: 2100, rank: 0 },
  { id: "p2", name: "Jordan", score: 1850, rank: 1 },
  { id: "p3", name: "Taylor", score: 1600, rank: 2 },
  { id: "target", name: "Shrey", score: 1200, rank: 3 },
  { id: "p5", name: "Morgan", score: 950, rank: 4 },
];

const ROW_HEIGHT = 62;

export default function AnimatedLeaderboard() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;
  const hasAnimated = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const scoreRefs = useRef<{ [key: string]: HTMLSpanElement | null }>({});
  const arrowRef = useRef<SVGSVGElement | null>(null);

  const startAnimation = () => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;

    const tl = gsap.timeline();
    const targetId = "target";
    const targetRow = rowRefs.current[targetId];
    const targetScoreRef = scoreRefs.current[targetId];

    const startScore = 1200;
    const endScore = 2500;
    const scoreObj = { val: startScore };

    // 1. Pop out the target entry
    tl.to(targetRow, {
      scale: 1.05,
      zIndex: 20,
      boxShadow: isDarkRef.current
        ? "0 10px 20px -5px rgba(0, 0, 0, 0.4)"
        : "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
      duration: 0.3,
      ease: "power2.out",
    });

    // 2. The Step-by-Step Climb
    const startRank = 3;
    const endRank = 0;
    const jumps = startRank - endRank;
    const playersToOvertake = ["p3", "p2", "p1"];

    // Fade in the green up-arrow right as the first jump starts
    tl.to(arrowRef.current, {
      opacity: 1,
      y: -2,
      duration: 0.3,
      ease: "power2.out"
    }, "jump0");

    for (let i = 0; i < jumps; i++) {
      const stepLabel = `jump${i}`;
      const targetY = (startRank - 1 - i) * ROW_HEIGHT;
      const displacedId = playersToOvertake[i];
      const displacedRow = rowRefs.current[displacedId];

      const stepScoreTarget = Math.round(startScore + ((endScore - startScore) / jumps) * (i + 1));

      tl.addLabel(stepLabel, i === 0 ? "+=0.1" : "+=0.25");

      tl.to(targetRow, {
        y: targetY,
        duration: 0.6,
        ease: "back.inOut(1.2)",
      }, stepLabel);

      tl.to(displacedRow, {
        y: "+=" + ROW_HEIGHT,
        duration: 0.6,
        ease: "back.inOut(1.2)",
      }, stepLabel);

      tl.to(scoreObj, {
        val: stepScoreTarget,
        duration: 0.6,
        roundProps: "val",
        ease: "none",
        onUpdate: () => {
          if (targetScoreRef) {
            targetScoreRef.innerText = scoreObj.val.toLocaleString();
          }
        },
      }, stepLabel);
    }

    // 3. Final Settle
    // Fade out the arrow
    tl.to(arrowRef.current, {
      opacity: 0,
      y: 0,
      duration: 0.3,
      ease: "power2.in"
    }, "+=0.1");

    tl.to(targetRow, {
      scale: 1,
      zIndex: 1,
      boxShadow: isDarkRef.current ? "0 4px 6px -1px rgba(0, 0, 0, 0.3)" : "0 1px 3px rgba(0,0,0,0.04)",
      backgroundColor: isDarkRef.current ? "#3c4d3cff" : "#e6f4ea", // Distinct settle-in color
      duration: 0.3,
    }, "<");

    tl.to(targetRow, {
      backgroundColor: isDarkRef.current ? "#3d342c" : "#fcfbf8",
      clearProps: "backgroundColor, boxShadow, zIndex, scale",
      duration: 0.5
    }, "+=0.8");
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          startAnimation();
        }
      },
      { threshold: 0.5 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className={`w-full max-w-2xl ml-auto mr-12 p-6 rounded-xl transition-colors duration-500 font-sans overflow-hidden border
        ${isDark ? "bg-[#332a22] text-[#eadfd0] border-[#3e342c]" : "bg-[#f4f0e6] text-slate-800 border-transparent"}`}
    >
      <div className="mb-6">
        <h2 className={`text-xl font-bold tracking-tight ${isDark ? "text-[#eadfd0]" : "text-[#39444a]"}`}>
          Top Developers
        </h2>
      </div>

      <div className="relative w-full" style={{ height: `${initialPlayers.length * ROW_HEIGHT}px` }}>
        {initialPlayers.map((player) => (
          <div
            key={player.id}
            ref={(el) => { rowRefs.current[player.id] = el; }}
            className={`absolute left-0 right-0 h-[52px] rounded-xl flex items-center px-6 border
              ${isDark
                ? "bg-[#3d342c] border-[#4d443c] shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
                : "bg-[#fcfbf8] border-[#e6e2d8] shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
              }`}
            style={{
              transform: `translateY(${player.rank * ROW_HEIGHT}px)`,
              zIndex: 1,
            }}
          >
            <div className="flex items-center gap-6 w-full">
              <div
                className={`w-[38px] h-[38px] rounded-full flex items-center justify-center font-bold text-base flex-shrink-0
                  ${player.id === 'target'
                    ? 'bg-[#6cb2a6] text-white border-none'
                    : `bg-transparent border-[1.5px] ${isDark ? "text-[#eadfd0] border-[#eadfd0]" : "text-[#39444a] border-[#39444a]"}`
                  }`}
              >
                {player.name.charAt(0)}
              </div>

              <div className={`flex-1 text-[16px] font-medium ${isDark ? "text-[#eadfd0]" : "text-[#39444a]"}`}>
                {player.name}
              </div>

              <div className={`font-bold text-[18px] flex items-center relative gap-1.5 flex-shrink-0 ${isDark ? "text-[#eadfd0]" : "text-[#39444a]"}`}>
                {/* The Fading Up-Arrow */}
                {player.id === "target" && (
                  <svg
                    ref={arrowRef}
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4 text-emerald-500 absolute -left-6 opacity-0"
                  >
                    <path d="M12 19V5" />
                    <path d="M5 12l7-7 7 7" />
                  </svg>
                )}
                <span ref={(el) => { scoreRefs.current[player.id] = el; }}>
                  {player.score.toLocaleString()}
                </span>
                <span className={`text-[12px] font-bold mt-[2px] ${isDark ? "text-[#a09a8e]" : "text-[#7a7367]"}`}>
                  PTS
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}