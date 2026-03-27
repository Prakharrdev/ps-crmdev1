'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import Animatedheader from "@/components/Animatedheader";
import FadedText from "@/components/Fadedtext";
import AnimatedText from "@/components/Animatedtext";
import DecorativeLine from "@/components/Decorativeline";
import MapVisual from "@/components/Mapvisual";
import PhoneMockup from "@/components/PhoneMockup";
import { MegaFooter } from "@/components/MegaFooter";
import { useTheme } from "@/components/ThemeProvider";
import AnimatedLeaderboard from "@/components/Leaderboardanimation";

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

export default function HomePage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const dashboardRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!dashboardRef.current) return;
    gsap.fromTo(
      dashboardRef.current,
      { y: 50, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: dashboardRef.current,
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
      }
    );
  }, []);

  return (
    <main className={`flex min-h-screen flex-col transition-colors duration-500 ${isDark ? "bg-[#2a221c]" : "bg-[#ddd1c0]"}`}>
      <Animatedheader />

      <section className="relative flex min-h-screen items-center px-6 py-16 lg:px-20 lg:py-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 lg:flex-row lg:items-center lg:gap-16">
          <div className="relative order-2 w-full lg:order-1 lg:w-1/2">
            <FadedText text="Resolve" className="absolute -top-8 left-0 text-6xl md:text-8xl lg:text-9xl" />

            <div className="relative z-10 max-w-xl pt-10 lg:pt-16">
              <AnimatedText
                as="h1"
                text="The Centralized Digital Command Center"
                className="text-5xl font-bold tracking-tight md:text-6xl"
              />

              <DecorativeLine width="w-24" className="mt-6" />

              <AnimatedText
                as="p"
                text="Empowering communities with a smart Public Service CRM. Seamlessly organize citizen complaints, automate administrative workflows, and track resolution progress on a live interactive map."
                className="mt-6 max-w-md text-xl leading-relaxed"
                animationDelay={0.35}
              />
            </div>
          </div>

          <div className="order-1 flex w-full items-center justify-center lg:order-2 lg:w-1/2">
            <div className="relative w-full max-w-2xl lg:max-w-lg">
              <div className="absolute -bottom-3 -left-3 h-full w-full rounded-2xl bg-[#5b4238]/40 lg:-bottom-5 lg:-left-5" />
              <MapVisual
                imageSrc="/Image1.jpg"
                className="relative z-10 w-full rounded-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* second full screen page – Transforming Public Service */}
      <section className="relative flex min-h-screen items-center px-6 py-10 lg:px-20 lg:py-6">
        <div className="relative mx-auto w-full max-w-7xl">
          {/* Text block – upper left */}
          <div className="relative z-10 max-w-lg">
            <FadedText text="Empower" animateOnScroll className="absolute -top-6 left-0 text-5xl md:text-7xl lg:text-8xl" />
            <div className="relative z-10 pt-6 lg:pt-10">
              <AnimatedText
                as="h2"
                text="Transforming Public Service with the JanSamadhan Platform"
                className="text-3xl font-bold tracking-tight md:text-4xl lg:text-[2.75rem] lg:leading-tight"
                animateOnScroll
              />

              <DecorativeLine width="w-20" className="mt-4" />

              <AnimatedText
                as="p"
                text="Centralized, automated, and transparent grievance resolution for modern cities."
                className="mt-4 max-w-md text-lg leading-relaxed"
                animationDelay={0.2}
                animateOnScroll
              />
            </div>
          </div>

          {/* Dashboard image – wide landscape rectangle */}
          <div ref={dashboardRef} className="relative z-20 -mt-30 mx-auto w-full lg:w-[90%]">
            <AnimatedLeaderboard />
          </div>
        </div>
      </section>

      {/* third full screen page – Citizen Impact & Transparency */}
      <section className="relative flex min-h-screen items-center px-6 py-16 lg:px-20 lg:py-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 lg:flex-row lg:items-center lg:gap-16">
          {/* Left column – text content */}
          <div className="relative order-2 w-full lg:order-1 lg:w-1/2">
            <FadedText text="Impact" animateOnScroll className="absolute -top-8 left-0 text-6xl md:text-8xl lg:text-9xl" />
            <div className="relative z-10 pt-10 lg:pt-16">
              <AnimatedText
                as="h2"
                text="Citizen Impact and Transparency"
                className="text-4xl font-bold tracking-tight md:text-5xl"
                animateOnScroll
              />

              <DecorativeLine width="w-24" className="mt-6" />

              <AnimatedText
                as="h3"
                text="Building Trust through Accountability"
                className="mt-6 text-2xl font-semibold tracking-tight md:text-3xl"
                animationDelay={0.25}
                animateOnScroll
              />

              <AnimatedText
                as="p"
                text="Building trust through accountability. JanSamadhan provides citizens with a clear, real-time portal to track the entire grievance resolution process, from submission to final resolution."
                className="mt-6 max-w-md text-base leading-relaxed opacity-80"
                animationDelay={0.35}
                animateOnScroll
              />
            </div>
          </div>

          {/* Right column – phone mockup */}
          <div className="order-1 flex w-full items-center justify-center lg:order-2 lg:w-1/2">
            <PhoneMockup />
          </div>
        </div>
      </section>

      <MegaFooter
        brandColor="#000000"
        brandColorDark="#ffffff"
        newsletterTitleColor="#000000"
        newsletterTitleColorDark="#ffffff"
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
    </main>
  );
}
