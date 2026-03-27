"use client";

import Animatedheader from "@/components/Animatedheader";
import { MegaFooter } from "@/components/MegaFooter";
import { useTheme } from "@/components/ThemeProvider";
import LeaderboardTable from "@/components/LeaderboardTable";

export default function LeaderboardPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <main className={`flex min-h-screen flex-col transition-colors duration-500 font-sans ${isDark ? "bg-[#2a221c] text-[#e9ddce]" : "bg-[#ddd1c0] text-[#1c1612]"}`}>
      <Animatedheader />

      <section className="px-6 pt-32 pb-16 lg:px-20 flex-1 flex flex-col items-center">
        <div className="mx-auto w-full max-w-7xl text-center mb-12">
          <h1 className="text-5xl md:text-7xl font-bold mb-4 tracking-tighter">
            Community <span className="text-yellow-500">Leaders</span>
          </h1>
          <p className={`max-w-2xl mx-auto text-lg md:text-xl ${isDark ? "text-[#d3c2af]" : "text-[#4a3c31]"} opacity-80`}>
            Honoring the citizens making the biggest impact in our city through active engagement and resolution.
          </p>
        </div>

        <LeaderboardTable />
      </section>

      <MegaFooter
        brandColor={isDark ? "#ffffff" : "#000000"}
        brandColorDark="#ffffff"
        newsletterTitleColor={isDark ? "#ffffff" : "#000000"}
        newsletterTitleColorDark="#ffffff"
        brandName="Team 404"
        tagline="Designing delightful digital experiences."
        socialLinks={[
          { platform: "twitter", href: "https://twitter.com" },
          { platform: "github", href: "https://github.com/Prakharrdev/ps-crmdev1" },
          { platform: "linkedin", href: "https://linkedin.com" },
        ]}
        showNewsletter={true}
        newsletterTitle="Stay updated"
        newsletterPlaceholder="Enter your email"
      />
    </main>
  );
}
