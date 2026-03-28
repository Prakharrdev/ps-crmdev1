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

export default function PrivacyPolicyPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const mainRef = useRef<HTMLElement>(null);

  const bgClass = isDark ? "bg-[#2a221c] text-[#e9ddce]" : "bg-[#ddd1c0] text-[#1c1612]";
  const textMutedClass = isDark ? "text-[#d3c2af]" : "text-[#4a3c31]";
  const borderClass = isDark ? "border-[#4a3c31]" : "border-[#b8a99a]";

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
        <FadedText text="PRIVACY" className="absolute top-20 left-1/2 -translate-x-1/2 text-[10rem] md:text-[15rem] opacity-5 pointer-events-none font-bold" />
        <div className="mx-auto w-full max-w-4xl animate-slide-up relative z-10">
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter mb-6">
            Privacy Policy.
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
            <h2 className="text-3xl font-bold mb-6 tracking-tight">1. Introduction</h2>
            <div className={`space-y-4 text-lg leading-relaxed ${textMutedClass}`}>
              <p>
                JanSamadhan is a civic grievance management platform that enables citizens to report public infrastructure issues, track complaint resolution, and allows authorities to manage and resolve civic issues efficiently.
              </p>
              <p>
                This Privacy Policy explains how we collect, use, store, and protect your information when you use JanSamadhan through our website, mobile interface, or WhatsApp integration.
              </p>
              <p>
                By using JanSamadhan, you agree to the collection and use of information in accordance with this policy.
              </p>
            </div>
          </div>

          <div className="animate-slide-up">
            <h2 className="text-3xl font-bold mb-6 tracking-tight">2. Information We Collect</h2>
            <div className={`space-y-8 ${textMutedClass}`}>
              <div>
                <h3 className="text-xl font-bold mb-3 text-current">2.1 Personal Information</h3>
                <ul className="list-disc pl-6 space-y-2 opacity-80">
                  <li>Name</li>
                  <li>Email address</li>
                  <li>Phone number</li>
                  <li>Login information (Google login or email login)</li>
                  <li>User role (Citizen, Worker, Authority, Admin)</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-3 text-current">2.2 Complaint Information</h3>
                <ul className="list-disc pl-6 space-y-2 opacity-80">
                  <li>Complaint title and description</li>
                  <li>Complaint photos</li>
                  <li>Location data (GPS coordinates)</li>
                  <li>DIGIPIN location code</li>
                  <li>Complaint category and severity</li>
                  <li>Ticket history and status updates</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-3 text-current">2.3 WhatsApp Communication Data</h3>
                <p className="opacity-80">
                  If you contact JanSamadhan via WhatsApp, we may collect: your phone number, messages sent, photos, and location shared. This is used only for complaint registration, tracking, and support.
                </p>
              </div>
            </div>
          </div>

          <div className="animate-slide-up">
            <h2 className="text-3xl font-bold mb-6 tracking-tight">3. How We Use Your Information</h2>
            <div className={`space-y-4 text-lg leading-relaxed ${textMutedClass}`}>
              <p>We use the collected information to:</p>
              <ul className="list-disc pl-6 space-y-2 opacity-80">
                <li>Create and manage user accounts</li>
                <li>Register and route complaints to the correct authority</li>
                <li>Detect duplicate complaints and track resolution</li>
                <li>Detect potholes using AI systems and verify repair work using CCTV verification</li>
                <li>Prevent spam, fraud, and misuse of the platform</li>
              </ul>
            </div>
          </div>

          <div className="animate-slide-up p-8 rounded-2xl bg-black/5 dark:bg-white/5 border border-opacity-10 border-current">
            <h2 className="text-3xl font-bold mb-6 tracking-tight">4. AI and Automated Processing</h2>
            <p className={`text-lg leading-relaxed ${textMutedClass} opacity-80 mb-6`}>
              JanSamadhan uses AI systems for complaint classification, pothole detection from images and CCTV, duplicate detection, and severity estimation.
            </p>
            <div className="flex items-center gap-4 p-4 bg-orange-500/10 rounded-lg text-orange-600 dark:text-orange-400 font-bold text-sm uppercase tracking-widest">
              <span>Notice: AI is used as a decision-support system. Final decisions may be reviewed by human authorities.</span>
            </div>
          </div>

          <div className="animate-slide-up">
            <h2 className="text-3xl font-bold mb-6 tracking-tight">5. Data Sharing & Security</h2>
            <div className={`space-y-4 text-lg leading-relaxed ${textMutedClass}`}>
              <p>
                We may share data with government authorities, field workers, and secure cloud providers. We do **NOT** sell or rent personal data to third parties.
              </p>
              <p>
                We use secure cloud infrastructure and role-based access control to protect user data.
              </p>
            </div>
          </div>

          <div className="animate-slide-up">
            <h2 className="text-3xl font-bold mb-6 tracking-tight">8. Your Rights & Consent</h2>
            <div className={`space-y-4 text-lg leading-relaxed ${textMutedClass}`}>
              <p>
                You have the right to access, correct, or request deletion of your data. To request deletion, contact: <a href="mailto:support@jansamadhan.in" className="underline font-bold text-current">support@jansamadhan.in</a>
              </p>
              <p>
                By using JanSamadhan, you consent to location data collection, AI-based processing, and CCTV monitoring on selected roads for public safety.
              </p>
            </div>
          </div>

          <div className="animate-slide-up pt-10 text-center">
            <p className={`text-sm tracking-widest uppercase font-bold opacity-30`}>End of Policy</p>
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
