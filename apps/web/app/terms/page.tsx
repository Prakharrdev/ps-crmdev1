'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import Animatedheader from "@/components/Animatedheader";
import FadedText from "@/components/Fadedtext";
import { MegaFooter } from "@/components/MegaFooter";
import { useTheme } from "@/components/ThemeProvider";

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

export default function TermsAndConditionsPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const mainRef = useRef<HTMLElement>(null);

  const bgClass = isDark ? "bg-[#2a221c] text-[#e9ddce]" : "bg-[#ddd1c0] text-[#1c1612]";
  const textMutedClass = isDark ? "text-[#d3c2af]" : "text-[#4a3c31]";

  useGSAP(() => {
    gsap.utils.toArray('.animate-slide-up').forEach((el: any) => {
      gsap.fromTo(el,
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: el,
            start: "top 85%",
            toggleActions: "play none none reverse"
          }
        }
      );
    });
  }, { scope: mainRef });

  return (
    <main ref={mainRef} className={`flex min-h-screen flex-col transition-colors duration-500 font-sans ${bgClass}`}>
      <Animatedheader />

      {/* Hero Section */}
      <section className="relative px-6 pt-32 pb-20 lg:px-20 flex flex-col items-center text-center">
        <FadedText text="TERMS" className="absolute top-20 left-1/2 -translate-x-1/2 text-[10rem] md:text-[15rem] opacity-5 pointer-events-none font-bold" />
        <div className="mx-auto w-full max-w-4xl animate-slide-up relative z-10">
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter mb-6">
            Terms & Conditions.
          </h1>
          <p className={`text-lg md:text-xl font-medium ${textMutedClass}`}>
            Last Updated: March 2026
          </p>
        </div>
      </section>

      {/* Content Section */}
      <section className="px-6 py-20 lg:px-20 border-t border-opacity-10 border-current">
        <div className="mx-auto w-full max-w-4xl space-y-16">
          
          <div className="animate-slide-up">
            <h2 className="text-3xl font-bold mb-6 tracking-tight">1. Acceptance of Terms</h2>
            <div className={`space-y-4 text-lg leading-relaxed ${textMutedClass}`}>
              <p>
                By accessing or using JanSamadhan, you agree to be bound by these Terms and Conditions. If you do not agree, please do not use the platform.
              </p>
            </div>
          </div>

          <div className="animate-slide-up">
            <h2 className="text-3xl font-bold mb-6 tracking-tight">2. Purpose of the Platform</h2>
            <div className={`space-y-4 text-lg leading-relaxed ${textMutedClass}`}>
              <p>
                JanSamadhan is a civic grievance reporting and management platform that allows citizens to report public issues and enables authorities and workers to manage and resolve those issues.
              </p>
              <p>
                JanSamadhan acts as a technology platform that facilitates communication and tracking between citizens and authorities. We do not directly perform physical repair work.
              </p>
            </div>
          </div>

          <div className="animate-slide-up">
            <h2 className="text-3xl font-bold mb-6 tracking-tight">4. User Responsibilities</h2>
            <div className={`space-y-4 text-lg leading-relaxed ${textMutedClass}`}>
              <p>By using JanSamadhan, you agree that you will NOT:</p>
              <ul className="list-disc pl-6 space-y-2 opacity-80">
                <li>Submit false or fake complaints</li>
                <li>Upload fake, edited, or misleading photos</li>
                <li>Spam duplicate complaints intentionally</li>
                <li>Attempt to manipulate AI detection systems or disrupt the platform</li>
                <li>Misuse worker, authority, or admin accounts</li>
              </ul>
              <p className="font-bold text-red-500/80">Violation may result in account suspension or permanent ban.</p>
            </div>
          </div>

          <div className="animate-slide-up">
            <h2 className="text-3xl font-bold mb-6 tracking-tight">5. AI System & CCTV Disclaimer</h2>
            <div className={`space-y-4 text-lg leading-relaxed ${textMutedClass}`}>
              <p>
                JanSamadhan uses AI for classification, pothole detection, and duplicate detection. AI systems are not 100% accurate and may make errors. Final decisions may be reviewed by human authorities.
              </p>
              <p>
                On selected major roads, CCTV footage may be analyzed by AI systems to detect potholes and verify repair work. This system is used only for infrastructure monitoring and public safety.
              </p>
            </div>
          </div>

          <div className="animate-slide-up p-8 rounded-2xl bg-black/5 dark:bg-white/5 border border-opacity-10 border-current font-medium">
            <h2 className="text-3xl font-bold mb-6 tracking-tight">9. Limitation of Liability</h2>
            <p className={`text-lg leading-relaxed ${textMutedClass} opacity-80 mb-6`}>
              JanSamadhan is a facilitation platform that connects citizens and authorities. We are not responsible for:
            </p>
            <ul className="list-disc pl-6 space-y-2 opacity-80 text-sm italic">
              <li>Delays in complaint resolution</li>
              <li>Quality of physical repair work</li>
              <li>Actions taken by government authorities or contractors</li>
              <li>Incorrect AI detections or technical errors</li>
            </ul>
          </div>

          <div className="animate-slide-up pt-10 text-center">
            <p className={`text-sm tracking-widest uppercase font-bold opacity-30`}>End of Terms</p>
            <div className="mt-8 flex justify-center gap-6">
               <a href="mailto:support@jansamadhan.in" className="text-sm font-semibold opacity-60 hover:opacity-100 transition-opacity underline">Contact Support</a>
            </div>
          </div>
        </div>
      </section>

      <MegaFooter
        brandColor={isDark ? "#ffffff" : "#000000"}
        brandColorDark="#ffffff"
        brandName="Team 404"
        tagline="Designing delightful digital experiences."
        socialLinks={[
          { platform: "twitter", href: "https://twitter.com" },
          { platform: "github", href: "https://github.com/Prakharrdev/ps-crmdev1" },
          { platform: "linkedin", href: "https://linkedin.com" },
        ]}
        showNewsletter={true}
        newsletterTitle="Stay updated"
      />
    </main>
  );
}
