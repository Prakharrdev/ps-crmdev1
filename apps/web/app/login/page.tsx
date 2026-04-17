'use client';

import { MegaFooter } from "@/components/MegaFooter";
import AnimatedAuth, {
  AUTH_COLORS_LIGHT,
  AUTH_COLORS_DARK,
  AnimatedAuthProps,
} from "@/components/AnimatedAuth";
import Animatedheader, { HeaderTheme } from "@/components/Animatedheader";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

// exported so other modules/pages can reuse or tweak the login palette
export const loginAuthColors: Partial<AnimatedAuthProps> = {
  ...AUTH_COLORS_LIGHT,
  // explicit overrides that match the screenshot
  themeColor: "#585151",
  themeColorDark: "#8c6a5d",
  glowColor: "rgba(32, 10, 8, 0.46)",
  glowColorDark: "rgba(16, 5, 4, 0.6)",
  transitionTintColor: "#d2b48c",
  transitionTintColorDark: "#2c241b",
  backgroundColor: "#e4e3e1",
  backgroundColorDark: "#2c241b",
  backdrop: "#ddd1c0",
  backdropDark: "#1f1515",
  placeholderColor: "rgb(0, 0, 0)",
  placeholderColorDark: "rgba(255, 255, 255, 1)",
  textColor: "#000000",
  textColorDark: "#ffffff",
  secondaryTextColor: "#6b7280",
  secondaryTextColorDark: "#9ca3af",
  borderColor: "#d1d5db",
  borderColorDark: "#4b5563",
  // panel text color overrides
  leftPanelTitleColor: '#000000',
  leftPanelSubtitleColor: '#000000',
  rightPanelTitleColor: '#000000',
  rightPanelSubtitleColor: '#000000',
};

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#e4e3e1] dark:bg-[#2c241b]" />}>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || undefined;
  
  const loginHeaderTheme: HeaderTheme = {
    light: {
      bgInitial: (loginAuthColors.backgroundColor as string) || "#e4e3e1",
      bgScrolled: "#4a3c31",
      textInitial: (loginAuthColors.textColor as string) || "#000000",
      textScrolled: "#ffffff",
    },
    dark: {
      bgInitial: (loginAuthColors.backgroundColorDark as string) || "#2c241b",
      bgScrolled: "#110e0c",
      textInitial: (loginAuthColors.textColorDark as string) || "#ffffff",
      textScrolled: "#ffffff",
    },
  };

  return (
    <div className="flex flex-col min-h-screen ">
      <Animatedheader hideLoginButton={true} themeColors={loginHeaderTheme} />
      <main>
        <AnimatedAuth
          {...loginAuthColors}
          leftPanelSubtitle='Create an account to organize citizen complaints and ensure transparent grievance resolution.'
          leftPanelTitle="JOIN Jansamadhan!"
          rightPanelTitle='WELCOME TO Jansamadhan!'
          rightPanelSubtitle='Log in to your digital command center. Manage workflows, assign tasks, and track real-time progress.'
          leftPanelImage='/Image1.jpg'
          rightPanelImage='/Image2.jpg'
          redirectTo={redirectTo}
        // text color props can also be overridden here directly if needed
        />
      </main>
      <MegaFooter
        brandName="Team 404"
        tagline="Designing delightful digital experiences."
        socialLinks={[
          { platform: "twitter", href: "https://twitter.com" },
          { platform: "github", href: "https://github.com/Medhansh-741/ps-crm" },
          { platform: "linkedin", href: "https://linkedin.com" },
        ]}
        showNewsletter={true}
        newsletterTitle="Stay updated"
        newsletterPlaceholder="Enter your email"
      />
    </div>
  );
}