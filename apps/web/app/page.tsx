'use client';

import LandNavbar from "@/components/LandNavbar";
import ChatBubble from "@/components/ChatBubble";
import { useTheme } from "@/components/ThemeProvider";

export default function Home() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <main className={`relative min-h-screen w-full transition-colors duration-500 ${isDark ? 'bg-gray-950' : 'bg-white'}`}>
      {/* Leaf background layer */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: "url('/green_leaf_bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          opacity: isDark ? 0.05 : 1,
        }}
      />
      {/* Content */}
      <div className="relative z-10">
        <LandNavbar />
        <ChatBubble />
      </div>
    </main>
  );
}
