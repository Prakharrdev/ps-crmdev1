'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { Github, Linkedin, Mail } from 'lucide-react';
import Animatedheader from "@/components/Animatedheader";
import FadedText from "@/components/Fadedtext";
import { MegaFooter } from "@/components/MegaFooter";
import { useTheme } from "@/components/ThemeProvider";

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

const teamMembers = [
  { name: 'Shrey', role: 'Full Stack Developer' },
  { name: 'Pranika', role: 'UI/UX Designer' },
  { name: 'Shreyas', role: 'Frontend Developer' },
  { name: 'Prakhar', role: 'Backend Developer' },
  { name: 'Medhansh', role: 'Project Manager' },
];

const capabilities = [
  { num: '01', title: 'Citizen Engagement', desc: 'Empowering citizens to easily report, track, and stay updated on local issues, ensuring every voice is heard.' },
  { num: '02', title: 'Administrative Efficiency', desc: 'Providing powerful, streamlined tools for officials to manage, track, and resolve public concerns effectively.' },
  { num: '03', title: 'Seamless Resolution', desc: 'A unified digital ecosystem bridging the gap between public needs and administrative action for faster solutions.' },
];

const processes = [
  { num: '01.', title: 'Intuitive Design' },
  { num: '02.', title: 'Transparent Tracking' },
  { num: '03.', title: 'Secure Architecture' },
  { num: '04.', title: 'Community Driven' },
];

export default function AboutPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const mainRef = useRef<HTMLElement>(null);

  useGSAP(() => {
    // Smooth fade in for elements
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
    <main ref={mainRef} className={`flex min-h-screen flex-col transition-colors duration-500 font-sans ${isDark ? "bg-[#2a221c] text-[#e9ddce]" : "bg-[#ddd1c0] text-[#1c1612]"}`}>
      <Animatedheader />

      {/* Hero Section */}
      <section className="relative px-6 pt-32 pb-20 lg:px-20 min-h-[70vh] flex flex-col justify-center">
        <FadedText text="404" className="absolute top-20 left-1/2 -translate-x-1/2 text-[10rem] md:text-[20rem] opacity-5 pointer-events-none" />
        <div className="mx-auto w-full max-w-7xl animate-slide-up relative z-10">
          <h1 className="text-[5rem] md:text-[8rem] lg:text-[10rem] font-bold leading-[0.9] tracking-tighter">
            Team 404<br />Innovators.
          </h1>

          <div className="mt-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
            <div className={`max-w-md text-lg md:text-xl font-medium ${isDark ? "text-[#d3c2af]" : "text-[#4a3c31]"}`}>
              We are the passionate minds behind JanSamadhan. A dynamic group of developers, designers, and visionaries committed to transforming public service through technology and spotless design.
              <div className="mt-8">
                <a href="https://github.com/Prakharrdev/ps-crmdev1" target="_blank" rel="noopener noreferrer" className={`inline-block px-6 py-3 rounded-full text-sm font-semibold transition-transform hover:scale-105 ${isDark ? "bg-[#e9ddce] text-[#2a221c]" : "bg-[#1c1612] text-[#ddd1c0]"}`}>
                  View Repository
                </a>
              </div>
            </div>

            <div className={`text-sm tracking-wide uppercase ${isDark ? "text-[#a08c78]" : "text-[#7a6a58]"}`}>
              <p>Bridging the gap</p>
              <p>between the public</p>
              <p>and administration</p>
              <p>through technology.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Features Section */}
      <section className="px-6 py-24 lg:px-20 border-t border-opacity-10 border-current">
        <div className="mx-auto w-full max-w-7xl animate-slide-up">
          <h2 className="text-3xl md:text-4xl font-medium mb-16">The core of our platform ...</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {capabilities.map((cap, i) => (
              <div key={i} className="flex flex-col">
                <div className={`text-4xl font-light mb-6 opacity-30`}>{cap.num}</div>
                <div className="w-full h-[1px] bg-current opacity-10 mb-6" />
                <h3 className="text-xl font-semibold mb-4">{cap.title}</h3>
                <p className={`text-sm ${isDark ? "text-[#d3c2af]" : "text-[#4a3c31]"}`}>{cap.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team/Work Section */}
      <section className="px-6 py-24 lg:px-20 border-t border-opacity-10 border-current relative">
        <FadedText text="TEAM" className="absolute top-20 right-10 text-[6rem] md:text-[10rem] opacity-[0.03] pointer-events-none font-bold" />
        <div className="mx-auto w-full max-w-7xl animate-slide-up">
          <div className="flex justify-between items-end mb-12">
            <h2 className="text-2xl font-medium">Meet the team<sup className="text-xs ml-1">({teamMembers.length})</sup></h2>
            <p className={`text-xs uppercase tracking-wider ${isDark ? "text-[#8c7865]" : "text-[#7a6a58]"}`}>A peek at our talented team</p>
          </div>

          <div className="flex flex-col border-t border-opacity-10 border-current">
            {teamMembers.map((member, i) => (
              <div key={i} className={`group flex justify-between items-center py-10 border-b border-opacity-10 border-current transition-colors hover:bg-black/5 dark:hover:bg-white/5`}>
                <div>
                  <h3 className="text-4xl md:text-6xl font-semibold tracking-tight transition-transform group-hover:translate-x-4 duration-300">
                    {member.name}
                  </h3>
                  <p className={`mt-2 text-sm uppercase tracking-wider transition-transform group-hover:translate-x-4 duration-300 delay-75 ${isDark ? "text-[#a08c78]" : "text-[#7a6a58]"}`}>
                    {member.role}
                  </p>
                </div>
                <div className="flex gap-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 mr-8 items-center">
                  <button className={`p-2 transition-colors hover:scale-110`} aria-label={`${member.name}'s Github`}>
                    <Github size={24} />
                  </button>
                  <button className={`p-2 transition-colors hover:scale-110`} aria-label={`${member.name}'s LinkedIn`}>
                    <Linkedin size={24} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Principles Section */}
      <section className="px-6 py-24 lg:px-20 border-t border-opacity-10 border-current">
        <div className="mx-auto w-full max-w-7xl animate-slide-up flex flex-col md:flex-row gap-16 md:gap-8 justify-between">
          <div className="md:w-1/2 max-w-lg">
            <h2 className="text-4xl md:text-5xl font-semibold leading-tight tracking-tight mb-6">
              Our core principles
            </h2>
            <p className={`text-base leading-relaxed ${isDark ? "text-[#d3c2af]" : "text-[#4a3c31]"}`}>
              Built on transparency and accessibility, JanSamadhan represents our commitment to better governance. We are dedicated to creating a system that is secure, user-friendly, and truly serves the public interest.
            </p>
          </div>

          <div className="md:w-5/12 flex flex-col justify-center">
            {processes.map((process, i) => (
              <div key={i} className="flex items-center justify-between py-6 border-b border-opacity-10 border-current group cursor-pointer hover:pl-4 transition-all duration-300">
                <div className="flex items-center gap-4">
                  <span className={`text-sm font-medium ${isDark ? "text-[#8c7865]" : "text-[#7a6a58]"}`}>{process.num}</span>
                  <span className="text-xl md:text-2xl font-medium">{process.title}</span>
                </div>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">+</span >
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="px-6 py-32 lg:px-20 bg-black/5 dark:bg-white/5">
        <div className="mx-auto w-full max-w-6xl animate-slide-up text-center md:text-left flex flex-col md:flex-row items-center gap-10">
          <div className="mb-8 md:mb-0 shrink-0 flex items-center gap-5">
            <div
              className={`w-20 h-20 md:w-24 md:h-24 ${isDark ? "bg-[#e9ddce]" : "bg-[#1c1612]"}`}
              style={{
                WebkitMaskImage: "url(/Emblem.svg)",
                WebkitMaskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskImage: "url(/Emblem.svg)",
                maskSize: "contain",
                maskRepeat: "no-repeat",
                maskPosition: "center",
              }}
            />
            <span className="text-lg md:text-2xl font-semibold tracking-[0.24em] uppercase">JANSAMADHAN</span>
          </div>

          <div className="flex-1">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold leading-tight tracking-tight mb-10">
              Join us in our vision to simplify administration and empower communities
            </h2>
          </div>

          <div className="shrink-0 mt-8 md:mt-0 self-end md:self-auto">
            <a href="https://github.com/Prakharrdev/ps-crmdev1" target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-4 px-8 py-5 rounded-full text-lg font-semibold transition-transform hover:scale-105 ${isDark ? "bg-[#e9ddce] text-[#2a221c]" : "bg-[#1c1612] text-[#ddd1c0]"}`}>
              View the Project
              <span className="text-xl">→</span>
            </a>
          </div>
        </div>
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
