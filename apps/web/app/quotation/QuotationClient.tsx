"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Animatedheader from "@/components/Animatedheader";
import { MegaFooter } from "@/components/MegaFooter";
import { useTheme } from "@/components/ThemeProvider";
import styles from "./quotation.module.css";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

const SUPABASE_PLAN_PER_MONTH = 2085;
const SUPABASE_CAPACITY_WARDS = 18;
const MAPPLS_PLAN_PER_MONTH = 10000;
const MAPPLS_CAPACITY_WARDS = 42;
const RESEND_PLAN_PER_MONTH = 1668;
const RESEND_CAPACITY_WARDS = 10;
const GCP_PER_WARD_PER_MONTH = 3500;
const VARIABLE_PER_WARD_PER_MONTH = 114 + 650 + 186 + 499 + 250 + 800;
const COMPLAINTS_PER_WARD_PER_MONTH = 1860;

interface NavItem {
  href: string;
  label: string;
}

interface MetricCard {
  label: string;
  value: string;
  sub: string;
}

interface Deliverable {
  id: string;
  title: string;
  description: string;
  badge?: string;
}

interface Integration {
  name: string;
  purpose: string;
  status: string;
}

interface SpecItem {
  layer: string;
  tech: string;
  note: string;
}

interface TimelineItem {
  phase: string;
  title: string;
  description: string;
  completed: boolean;
}

interface InfraRow {
  service: string;
  badge: string;
  badgeClass: string;
  billing: string;
  detail: string;
  plan: string;
  amount: string;
}

interface QuotationRow {
  item: string;
  note: string;
  basis: string;
  amount: string;
}

interface MaintenanceRow {
  scale: string;
  annual: string;
  perGrievance: string;
}

interface CapabilityRow {
  capability: string;
  cpgrams: string;
  salesforce: string;
  jansamadhan: string;
}

const navItems: NavItem[] = [
  { href: "#basics", label: "01 Basics" },
  { href: "#scope", label: "02 Scope" },
  { href: "#tech", label: "03 Tech" },
  { href: "#timeline", label: "04 Timeline" },
  { href: "#resources", label: "05 Resources" },
  { href: "#costs", label: "06 Costs" },
  { href: "#scale", label: "07 Scale" },
  { href: "#maintenance", label: "08 Maintenance" },
  { href: "#benchmark", label: "09 Benchmark" },
];

const overviewMetrics: MetricCard[] = [
  { label: "Routes", value: "39", sub: "Citizen + Authority + Admin" },
  { label: "DB Tables", value: "19", sub: "28 RLS policies" },
  { label: "API Endpoints", value: "56+", sub: "FastAPI + Next.js" },
  { label: "Languages", value: "10", sub: "Sarvam STT voice input" },
];

const frontendDeliverables: Deliverable[] = [
  {
    id: "01",
    title: "Citizen Portal",
    description:
      "9 routes. Seva AI chatbot complaint filing, geo-pin with DIGIPIN, real-time tracking, heatmap, upvoting, gamification, SLA escalation, closure confirmation.",
    badge: "Live",
  },
  {
    id: "02",
    title: "Authority Dashboard",
    description:
      "8 routes. Department-scoped view (RLS enforced), worker assignment, material request review, map visualization, performance reports.",
    badge: "Live",
  },
  {
    id: "03",
    title: "Worker Mobile PWA",
    description:
      "3 routes. Task list with SLA countdown, proof photo upload, Google Maps navigation to 4m² DIGIPIN coordinates.",
    badge: "Live",
  },
  {
    id: "04",
    title: "Admin Control Panel",
    description:
      "11 routes. Platform-wide analytics, user management, CCTV surveillance dashboard, complaint moderation, wallet sync.",
    badge: "Live",
  },
  {
    id: "05",
    title: "Public Routes",
    description:
      "8 routes. Landing page, public heatmap, leaderboard, legal pages. No login required.",
    badge: "Live",
  },
];

const backendDeliverables: Deliverable[] = [
  {
    id: "06",
    title: "FastAPI Backend",
    description:
      "35+ endpoints. Complaint intake, authority ops, worker ops, admin dashboard, CCTV proxy, WhatsApp webhook, notifications.",
    badge: "Live",
  },
  {
    id: "07",
    title: "AI Service",
    description:
      "6 endpoints. YOLO v8 inference, CCTV multi-frame reliability engine, citizen corroboration, auto-ticket creation, geocoding proxy.",
    badge: "Live",
  },
  {
    id: "08",
    title: "Database Stack",
    description:
      "Supabase (Postgres 15 + PostGIS 3.4). 19 tables, 28 RLS policies, 14 RPC functions, 8 triggers, spatial GIST indexes, immutable audit trail.",
    badge: "Live",
  },
  {
    id: "09",
    title: "Integrations",
    description:
      "Gemini LLM, Mappls geocoding, Sarvam STT (10 languages), Meta WhatsApp Bot, Resend email, reCAPTCHA v2, Redis. All operational.",
    badge: "Live",
  },
  {
    id: "10",
    title: "GCP Deployment",
    description:
      "3 Cloud Run services (Web, API, AI) with Cloud Build CI/CD pipeline, Artifact Registry, GCP Secret Manager.",
    badge: "Live",
  },
];

const integrations: Integration[] = [
  { name: "Google Gemini", purpose: "Seva chatbot · Classification", status: "Live" },
  { name: "Mappls API", purpose: "Geocoding · Map visualization", status: "Live" },
  { name: "Sarvam STT", purpose: "Voice input · 10 languages", status: "Live" },
  { name: "WhatsApp (Meta)", purpose: "Bot intake · Notifications", status: "Live" },
  { name: "Resend", purpose: "Transactional email", status: "Live" },
  { name: "reCAPTCHA v2", purpose: "Spam prevention", status: "Live" },
  { name: "Redis (Upstash)", purpose: "Cache · Sessions", status: "Live" },
  { name: "Supabase", purpose: "DB · Auth · Storage", status: "Live" },
];

const specs: SpecItem[] = [
  {
    layer: "Presentation",
    tech: "Next.js 15 · React 19",
    note: "Desktop + mobile PWA. Hindi & English UI. No installation required. Tailwind CSS v4, Leaflet.js + Mappls maps.",
  },
  {
    layer: "Backend API",
    tech: "FastAPI (Python 3.10+)",
    note: "35+ REST endpoints on GCP Cloud Run. Auto-scaling, zero-downtime, 99.9% uptime SLA. JWT auth + reCAPTCHA on all public endpoints.",
  },
  {
    layer: "AI Service",
    tech: "Gemini Flash · YOLO v8",
    note: "Gemini classifies 42 complaint categories and 4 severity levels. YOLO v8 runs a multi-frame CCTV reliability engine with citizen corroboration.",
  },
  {
    layer: "Database",
    tech: "PostgreSQL 15 + PostGIS 3.4",
    note: "19 tables, 28 Row-Level Security policies, 14 stored RPC functions, and GIST spatial indexes.",
  },
  {
    layer: "Location",
    tech: "DIGIPIN (India Post)",
    note: "Official 10-character location code with 4m² precision. Works offline and helps prevent duplicate filings.",
  },
  {
    layer: "Deployment",
    tech: "GCP Cloud Run · Cloud Build",
    note: "3 services (Web, API, AI), CI/CD on push, secrets in GCP Secret Manager, and portable container deployment.",
  },
  {
    layer: "Security",
    tech: "JWT · RLS · reCAPTCHA",
    note: "Google OAuth + email/password with PostgreSQL RLS and controlled workflow transitions via ENUM state machine.",
  },
  {
    layer: "Voice Input",
    tech: "Sarvam STT — 10 Languages",
    note: "Hindi, English, Tamil, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, and Punjabi.",
  },
];

const timelineA: TimelineItem[] = [
  {
    phase: "Months 1–2.5 · Complete",
    title: "Prototype & MVP Build",
    description:
      "Core architecture, all 4 portals, Seva chatbot, DIGIPIN integration, Supabase schema, and GCP Cloud Run deployment.",
    completed: true,
  },
  {
    phase: "Months 2.5–5.5 · Current",
    title: "Pilot Deployment",
    description:
      "1–5 ward pilot with real complaints, field worker onboarding, authority training, WhatsApp bot activation, and CCTV reliability tuning.",
    completed: true,
  },
];

const timelineB: TimelineItem[] = [
  {
    phase: "Months 5.5–8 · Planned",
    title: "Full Delhi Deployment",
    description:
      "Scale to 20+ wards across 1–2 zones, onboard all 9 zones, and expand multi-department authority operations.",
    completed: false,
  },
  {
    phase: "Month 9 · Planned",
    title: "DPCC / MCD Handover",
    description:
      "Documentation, admin training, infra transfer readiness, SLA finalization, and support transition.",
    completed: false,
  },
];

const permissionDeliverables: Deliverable[] = [
  {
    id: "R1",
    title: "Server deployment access",
    description:
      "Permission to deploy on NIC/MeghRaj infrastructure, or approval to continue on existing GCP setup.",
  },
  {
    id: "R2",
    title: "CCTV network integration",
    description:
      "Permission to integrate YOLO v8 model workflows against existing Delhi CCTV streams managed by relevant departments.",
  },
  {
    id: "R3",
    title: "Department onboarding",
    description:
      "Designation of authority accounts for participating departments with verified government email IDs.",
  },
];

const infraRows: InfraRow[] = [
  {
    service: "Supabase",
    badge: "DB + Auth + Storage",
    badgeClass: "badgeBlue",
    billing: "Pro plan: 100K MAU flat",
    detail: "Covers ~18 wards per plan. Shared, not multiplied.",
    plan: "Pro $25 ÷ 18 wards",
    amount: "₹116",
  },
  {
    service: "GCP Cloud Run",
    badge: "Web + API + AI",
    badgeClass: "badgeAmber",
    billing: "~30K requests / ward / month",
    detail: "3 services: crm-web, crm-api, crm-ai. Min instances = 0.",
    plan: "Pay-per-use",
    amount: "₹3,500",
  },
  {
    service: "Mappls API",
    badge: "Maps + Geocode",
    badgeClass: "badgeAmber",
    billing: "12,090 calls / ward / month",
    detail: "1,860 complaints × 6.5 calls avg. Pro plan shared across 42 wards.",
    plan: "Pro ₹10,000 ÷ 42 wards",
    amount: "₹238",
  },
  {
    service: "Gemini Flash",
    badge: "AI — text",
    badgeClass: "badgeGreen",
    billing: "5.2M tokens / ward / month",
    detail: "~2,800 tokens per complaint. ₹22 / M tokens (Google AI API).",
    plan: "₹22 / million tokens",
    amount: "₹114",
  },
  {
    service: "Gemini Vision",
    badge: "CCTV analysis",
    badgeClass: "badgeAmber",
    billing: "~500 image calls / ward / month",
    detail: "YOLO-flagged incidents sent to Gemini for verification.",
    plan: "₹1,300 / million tokens",
    amount: "₹650",
  },
  {
    service: "Sarvam STT",
    badge: "Voice input",
    badgeClass: "badgeBlue",
    billing: "~372 calls × 30s average",
    detail: "20% of complaints use voice. 10 Indian languages.",
    plan: "₹0.50 / minute",
    amount: "₹186",
  },
  {
    service: "Resend",
    badge: "Email notifications",
    badgeClass: "badgeBlue",
    billing: "~5,580 emails / ward / month",
    detail: "3 per complaint lifecycle: created, assigned, resolved.",
    plan: "Pro $20 ÷ 10 wards",
    amount: "₹167",
  },
  {
    service: "WhatsApp Cloud API",
    badge: "Meta",
    badgeClass: "badgeAmber",
    billing: "1,860 conversations / ward / month",
    detail: "First 1,000 free. ~860 overage × ₹0.58 / conversation.",
    plan: "Business tier",
    amount: "₹499",
  },
  {
    service: "Redis — Upstash",
    badge: "Cache + sessions",
    badgeClass: "badgeGreen",
    billing: "Pay-as-you-go commands",
    detail: "Session cache, rate limiting, and real-time deduplication.",
    plan: "₹0.20 / 100K commands",
    amount: "₹250",
  },
  {
    service: "GCP Monitoring",
    badge: "Observability",
    badgeClass: "badgeBlue",
    billing: "Cloud Logging + Alerting",
    detail: "SLA breach alerting and anomaly detection.",
    plan: "Pay-per-use",
    amount: "₹800",
  },
];

const quotationRows: QuotationRow[] = [
  {
    item: "Prototype & Testing Cost",
    note: "Development on cloud — no hardware costs",
    basis: "Deployment on GCP Cloud Run (free tier during development)",
    amount: "₹0",
  },
  {
    item: "Machinery / Hardware",
    note: "No proprietary hardware required",
    basis: "Cloud infrastructure provided by government data centres or GCP",
    amount: "₹0",
  },
  {
    item: "Team Stipends",
    note: "Student development team",
    basis: "5 members × 9 months × ₹22,000 / month",
    amount: "₹9,90,000",
  },
  {
    item: "Execution & Deployment",
    note: "Site visits: survey, commissioning, handover",
    basis: "2 visits × 5 members × ₹25,000 / visit (transport + commissioning)",
    amount: "₹50,000",
  },
  {
    item: "Cloud & Connectivity (Year 1)",
    note: "20-ward pilot infrastructure",
    basis: "₹6,520 / ward / month × 20 wards × 12 months",
    amount: "₹15,64,800",
  },
  {
    item: "Dashboard & App Dev",
    note: "API toolkit + third-party development costs",
    basis: "Verified receipts on file — Gemini, Supabase, hosting, travel",
    amount: "₹12,724",
  },
  {
    item: "Contingency Fund (10%)",
    note: "Cost revision, hardware renewal, and upgrades",
    basis: "10% of cloud + deployment + API costs",
    amount: "₹2,62,752",
  },
];

const maintenanceRows: MaintenanceRow[] = [
  { scale: "1 ward (pilot)", annual: "₹78,240", perGrievance: "₹3.52" },
  { scale: "20 wards (1 zone)", annual: "₹15,64,800", perGrievance: "₹3.52" },
  { scale: "100 wards (5 zones)", annual: "₹78,24,000", perGrievance: "₹3.52" },
  { scale: "250 wards (all Delhi)", annual: "₹1,95,60,000", perGrievance: "₹3.52" },
];

const maintenanceInclusions: Deliverable[] = [
  {
    id: "M1",
    title: "Cloud infrastructure operations",
    description: "Monitoring, uptime management, and auto-scaling configuration.",
  },
  {
    id: "M2",
    title: "Security and dependencies",
    description: "Security patches, dependency upgrades, and Supabase schema migrations.",
  },
  {
    id: "M3",
    title: "AI lifecycle management",
    description: "Gemini version upgrades and YOLO retraining for Delhi-specific CCTV patterns.",
  },
  {
    id: "M4",
    title: "WhatsApp policy compliance",
    description: "Meta policy alignment and integration maintenance.",
  },
  {
    id: "M5",
    title: "Dedicated support retainer",
    description: "One dedicated developer for fixes, requests, and SLA reporting.",
  },
];

const capabilityRows: CapabilityRow[] = [
  {
    capability: "AI complaint classification",
    cpgrams: "No",
    salesforce: "Partial",
    jansamadhan: "Yes — 42 categories, 4 severity levels",
  },
  {
    capability: "Spatial deduplication",
    cpgrams: "No",
    salesforce: "No",
    jansamadhan: "Yes — PostGIS 20m radius",
  },
  {
    capability: "Field worker dispatch + DIGIPIN navigation",
    cpgrams: "No",
    salesforce: "No",
    jansamadhan: "Yes — 4m² precision",
  },
  {
    capability: "WhatsApp bot intake",
    cpgrams: "No",
    salesforce: "No",
    jansamadhan: "Yes — full flow",
  },
  {
    capability: "CCTV auto-detection",
    cpgrams: "No",
    salesforce: "No",
    jansamadhan: "Yes — YOLO v8 + reliability engine",
  },
  {
    capability: "Community severity escalation",
    cpgrams: "No",
    salesforce: "No",
    jansamadhan: "Yes — upvote to severity bump",
  },
  {
    capability: "Indian language voice input",
    cpgrams: "No",
    salesforce: "No",
    jansamadhan: "Yes — 10 languages (Sarvam STT)",
  },
  {
    capability: "Annual cost (20-ward scale)",
    cpgrams: "₹10–20 Cr (national)",
    salesforce: "₹5–15 Cr (licensing)",
    jansamadhan: "₹15.65 L",
  },
];

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function calculateMonthlyInfrastructureCost(wards: number): number {
  const sharedFixedCost =
    Math.ceil(wards / SUPABASE_CAPACITY_WARDS) * SUPABASE_PLAN_PER_MONTH +
    Math.ceil(wards / MAPPLS_CAPACITY_WARDS) * MAPPLS_PLAN_PER_MONTH +
    Math.ceil(wards / RESEND_CAPACITY_WARDS) * RESEND_PLAN_PER_MONTH;

  return Math.round(sharedFixedCost + (GCP_PER_WARD_PER_MONTH + VARIABLE_PER_WARD_PER_MONTH) * wards);
}

function formatCurrencyCompact(value: number): string {
  if (value >= 10000000) {
    return `₹${(value / 10000000).toFixed(2)} Cr`;
  }
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(2)} L`;
  }
  return `₹${value.toLocaleString("en-IN")}`;
}

function zoneLabel(wards: number): string {
  if (wards === 1) return "single ward";
  if (wards <= 5) return "sub-zone cluster";
  if (wards <= 15) return "part of a zone";
  if (wards <= 30) return "≈ 1–2 zones";
  if (wards <= 80) return "several zones";
  if (wards <= 180) return "most of Delhi";
  return "all of Delhi";
}

function SectionHeader({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description?: string;
}) {
  return (
    <>
      <div className={styles.secHeader}>
        <span className={styles.secNumber}>{number}</span>
        <h2 className={styles.secTitle}>{title}</h2>
      </div>
      {description ? <p className={styles.secDescription}>{description}</p> : null}
    </>
  );
}

function DeliverableList({ items }: { items: Deliverable[] }) {
  return (
    <ul className={styles.deliverableList}>
      {items.map((item) => (
        <li key={item.id}>
          <span className={styles.deliverableId}>{item.id}</span>
          <div className={styles.deliverableBody}>
            <p>
              <strong>{item.title}</strong> — {item.description}
            </p>
          </div>
          {item.badge ? <span className={cx(styles.badgeSmall, styles.badgeLive)}>{item.badge}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function TimelineColumn({ items }: { items: TimelineItem[] }) {
  return (
    <div className={styles.timeline}>
      {items.map((item) => (
        <article key={item.title} className={styles.timelineItem}>
          <span className={cx(styles.timelineDot, item.completed && styles.timelineDotDone)} />
          <p className={styles.timelinePhase}>{item.phase}</p>
          <h3 className={styles.timelineTitle}>{item.title}</h3>
          <p className={styles.timelineDescription}>{item.description}</p>
        </article>
      ))}
    </div>
  );
}

export default function QuotationClient() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const rootRef = useRef<HTMLElement>(null);
  const [wardCount, setWardCount] = useState(20);
  const [activeSection, setActiveSection] = useState(navItems[0]?.href ?? "#basics");

  const handlePrint = () => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      window.print();
    });
  };

  const monthlyCost = useMemo(() => calculateMonthlyInfrastructureCost(wardCount), [wardCount]);
  const annualCost = monthlyCost * 12;
  const yearlyComplaints = wardCount * COMPLAINTS_PER_WARD_PER_MONTH * 12;
  const perGrievance = (annualCost / yearlyComplaints).toFixed(2);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateActiveSection = () => {
      const offset = 132;
      const scrollY = window.scrollY + offset;
      let current = navItems[0]?.href ?? "#basics";

      for (const item of navItems) {
        const section = document.querySelector(item.href);
        if (section instanceof HTMLElement && scrollY >= section.offsetTop) {
          current = item.href;
        }
      }

      setActiveSection((prev) => (prev === current ? prev : current));
    };

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);

    return () => {
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, []);

  useGSAP(
    () => {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReducedMotion) return;

      const heroTimeline = gsap.timeline();
      heroTimeline
        .fromTo(
          "[data-hero-kicker]",
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.55, ease: "power3.out" }
        )
        .fromTo(
          "[data-hero-title]",
          { opacity: 0, y: 32, scale: 0.98 },
          { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power3.out" },
          "-=0.2"
        )
        .fromTo(
          "[data-hero-sub]",
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" },
          "-=0.35"
        )
        .fromTo(
          "[data-hero-chip]",
          { opacity: 0, y: 16, scale: 0.95 },
          { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.05, ease: "power2.out" },
          "-=0.25"
        )
        .fromTo(
          "[data-hero-status]",
          { opacity: 0, x: 20 },
          { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" },
          "-=0.45"
        );

      gsap.fromTo(
        "[data-metric]",
        { opacity: 0, y: 24, rotateX: 7 },
        {
          opacity: 1,
          y: 0,
          rotateX: 0,
          duration: 0.7,
          stagger: 0.08,
          ease: "power3.out",
          scrollTrigger: {
            trigger: "[data-metric-grid]",
            start: "top 86%",
            toggleActions: "play none none none",
          },
        }
      );

      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((element) => {
        gsap.fromTo(
          element,
          { opacity: 0, y: 42, scale: 0.985, filter: "blur(5px)" },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            filter: "blur(0px)",
            duration: 0.85,
            ease: "power3.out",
            scrollTrigger: {
              trigger: element,
              start: "top 83%",
              toggleActions: "play none none reverse",
            },
          }
        );
      });
    },
    { scope: rootRef }
  );

  useGSAP(
    () => {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReducedMotion) return;

      gsap.fromTo(
        "[data-scale-card]",
        { opacity: 0.45, y: 14 },
        { opacity: 1, y: 0, duration: 0.38, stagger: 0.05, ease: "power2.out" }
      );
    },
    { scope: rootRef, dependencies: [wardCount], revertOnUpdate: true }
  );

  return (
    <main ref={rootRef} className={cx(styles.page, isDark ? styles.dark : styles.light)}>
      <div className={styles.printHidden}>
        <Animatedheader />
      </div>

      <div className={styles.container}>
        <header className={styles.cover}>
          <div>
            <p className={styles.coverEyebrow} data-hero-kicker>
              Detailed Project Quotation · Solution Challenge 2026
            </p>
            <h1 className={styles.coverTitle} data-hero-title>
              JanSamadhan — <br />
              <em>Citizen Resolution Platform</em>
            </h1>
            <p className={styles.coverSub} data-hero-sub>
              AI-assisted autonomous civic grievance management system for Indian urban local bodies.
              Built for 4,000+ ULBs, piloting in Delhi across 9 zones and 42+ complaint categories.
            </p>
            <div className={styles.coverChips}>
              {[
                "Team 404",
                "MVP Live",
                "SDG 11 · SDG 16",
                "9 months development",
                "April 2026",
              ].map((chip, index) => (
                <span
                  key={chip}
                  className={cx(styles.chip, index < 2 && styles.chipAccent)}
                  data-hero-chip
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
          <div className={styles.coverRight} data-hero-status>
            <p className={styles.docNumber}>DOC-JS-2026-Q1</p>
            <p className={styles.docStatus}>
              <span className={styles.liveDot} />
              97% Complete · MVP Live
            </p>
          </div>
        </header>

        <div className={styles.contentLayout}>
          <aside className={cx(styles.docSidebar, styles.printHidden)}>
            <p className={styles.docSidebarLabel}>In This Document</p>
            <nav className={styles.docSidebarNav} aria-label="Quotation section navigation">
              {navItems.map((item) => {
                const [index, ...words] = item.label.split(" ");
                const title = words.join(" ");

                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setActiveSection(item.href)}
                    className={cx(
                      styles.docSidebarLink,
                      activeSection === item.href && styles.docSidebarLinkActive
                    )}
                  >
                    <span className={styles.docSidebarIndex}>{index}</span>
                    <span className={styles.docSidebarText}>{title}</span>
                  </a>
                );
              })}
            </nav>
            <button type="button" className={styles.docSidebarPrintButton} onClick={handlePrint}>
              Print / Save PDF
            </button>
          </aside>

          <div className={styles.contentMain}>

        <section id="basics" className={styles.section}>
          <SectionHeader number="01" title="Basic Details" />
          <div className={styles.twoCol}>
            <article className={styles.card} data-reveal>
              <h3 className={styles.cardTitle}>Project Identity</h3>
              <table className={styles.simpleTable}>
                <tbody>
                  <tr>
                    <th>Team Name</th>
                    <td>Team 404</td>
                  </tr>
                  <tr>
                    <th>Project Title</th>
                    <td>JanSamadhan — AI-Assisted Autonomous Civic System</td>
                  </tr>
                  <tr>
                    <th>Live URL</th>
                    <td>
                      <a href="https://jansamadhan.perkkk.dev/" target="_blank" rel="noreferrer">
                        jansamadhan.perkkk.dev
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <th>Category</th>
                    <td>Smart Resource Allocation</td>
                  </tr>
                  <tr>
                    <th>SDG Targets</th>
                    <td>SDG 11 (Sustainable Cities), SDG 16 (Accountable Institutions)</td>
                  </tr>
                </tbody>
              </table>
            </article>

            <article className={styles.card} data-reveal>
              <h3 className={styles.cardTitle}>Platform at a Glance</h3>
              <div className={styles.metricGrid} data-metric-grid>
                {overviewMetrics.map((metric) => (
                  <div key={metric.label} className={styles.metricCard} data-metric>
                    <p className={styles.metricLabel}>{metric.label}</p>
                    <p className={styles.metricValue}>{metric.value}</p>
                    <p className={styles.metricSub}>{metric.sub}</p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section id="scope" className={styles.section}>
          <SectionHeader
            number="02"
            title="Scope of Work & Deliverables"
            description="All modules are production-complete and live. The platform covers every stakeholder — citizens, field workers, authorities, and administrators."
          />

          <div className={styles.twoCol}>
            <article className={styles.card} data-reveal>
              <h3 className={styles.cardTitle}>Frontend Modules</h3>
              <DeliverableList items={frontendDeliverables} />
            </article>

            <article className={styles.card} data-reveal>
              <h3 className={styles.cardTitle}>Backend & AI Modules</h3>
              <DeliverableList items={backendDeliverables} />
            </article>
          </div>

          <article className={styles.card} data-reveal>
            <h3 className={styles.cardTitle}>Third-Party Integrations — All Operational</h3>
            <div className={styles.integrationGrid}>
              {integrations.map((integration) => (
                <div key={integration.name} className={styles.integrationRow}>
                  <div>
                    <p className={styles.integrationName}>{integration.name}</p>
                    <p className={styles.integrationPurpose}>{integration.purpose}</p>
                  </div>
                  <span className={cx(styles.badgeSmall, styles.badgeLive)}>{integration.status}</span>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section id="tech" className={styles.section}>
          <SectionHeader
            number="03"
            title="Technical Specifications"
            description="Four-layer architecture designed for Indian civic infrastructure — no proprietary hardware required, and portable to government data centres."
          />
          <div className={styles.specGrid}>
            {specs.map((item) => (
              <article key={item.layer} className={styles.specItem} data-reveal>
                <p className={styles.specLayer}>{item.layer}</p>
                <h3 className={styles.specTech}>{item.tech}</h3>
                <p className={styles.specNote}>{item.note}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="timeline" className={styles.section}>
          <SectionHeader
            number="04"
            title="Project Timeline"
            description="9-month development cycle from prototype to full Delhi deployment and DPCC handover."
          />
          <div className={styles.twoCol}>
            <div data-reveal>
              <TimelineColumn items={timelineA} />
            </div>
            <div data-reveal>
              <TimelineColumn items={timelineB} />
            </div>
          </div>
        </section>

        <section id="resources" className={styles.section}>
          <SectionHeader number="05" title="Resource Requirements" />
          <div className={styles.twoCol}>
            <article className={styles.card} data-reveal>
              <h3 className={styles.cardTitle}>Government Permissions Required</h3>
              <DeliverableList items={permissionDeliverables} />
            </article>

            <article className={styles.card} data-reveal>
              <h3 className={styles.cardTitle}>Infrastructure & Hardware</h3>
              <div className={styles.callout}>
                No proprietary hardware is required. JanSamadhan runs fully on standard cloud
                infrastructure, and containers can migrate to NIC/MeghRaj with minimal configuration
                changes.
              </div>
            </article>
          </div>
        </section>

        <section id="costs" className={styles.section}>
          <SectionHeader
            number="06"
            title="Cost Allocation"
            description="Costs are calculated per ward using a population of 93,000 and a 2% monthly complaint filing rate (1,860 complaints/ward/month)."
          />

          <div className={styles.callout} data-reveal>
            <strong>Ward-unit pricing model:</strong> Delhi has ~250 wards post-delimitation. Costs are quoted per
            ward for flexible scaling, while shared-plan services are amortized and do not multiply linearly.
          </div>

          <p className={styles.tableLabel}>CLOUD INFRASTRUCTURE — PER WARD / MONTH</p>
          <div className={styles.tableWrap} data-reveal>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Billing basis</th>
                  <th>Plan / tier</th>
                  <th className={styles.right}>₹ / month</th>
                </tr>
              </thead>
              <tbody>
                {infraRows.map((row) => (
                  <tr key={row.service}>
                    <td>
                      <span className={styles.serviceName}>{row.service}</span>
                      <span className={cx(styles.badge, styles[row.badgeClass as keyof typeof styles])}>{row.badge}</span>
                    </td>
                    <td>
                      {row.billing}
                      <small>{row.detail}</small>
                    </td>
                    <td>{row.plan}</td>
                    <td className={styles.right}>{row.amount}</td>
                  </tr>
                ))}
                <tr className={styles.rowTotal}>
                  <td colSpan={3}>Infrastructure total — 1 ward / month</td>
                  <td className={styles.right}>₹6,520</td>
                </tr>
                <tr className={styles.rowTotal}>
                  <td colSpan={3}>Infrastructure total — 1 ward / year</td>
                  <td className={styles.right}>₹78,240</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className={styles.tableLabel}>FULL YEAR-1 QUOTATION — RECOMMENDED 20-WARD PILOT</p>
          <div className={styles.tableWrap} data-reveal>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Line item</th>
                  <th>Calculation basis</th>
                  <th className={styles.right}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {quotationRows.map((row) => (
                  <tr key={row.item}>
                    <td>
                      <strong>{row.item}</strong>
                      <small>{row.note}</small>
                    </td>
                    <td>{row.basis}</td>
                    <td className={styles.right}>{row.amount}</td>
                  </tr>
                ))}
                <tr className={styles.rowGrand}>
                  <td colSpan={2}>Total Estimated Cost — Year 1 · 20-Ward Pilot (Excl. Taxes)</td>
                  <td className={styles.right}>₹28,80,276</td>
                </tr>
                <tr className={styles.rowMaintenance}>
                  <td colSpan={2}>Per-Grievance Infrastructure Cost</td>
                  <td className={styles.right}>₹6.43</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="scale" className={styles.section}>
          <SectionHeader
            number="07"
            title="Scale Cost Model — Interactive"
            description="Drag the slider to project infrastructure cost at any ward count. Shared-plan services are amortized and only scale at capacity thresholds."
          />

          <div className={styles.sliderRow} data-reveal>
            <span className={styles.sliderLabel}>Wards:</span>
            <div className={styles.sliderInner}>
              <input
                type="range"
                min={1}
                max={250}
                value={wardCount}
                onChange={(event) => setWardCount(Number(event.target.value))}
                className={styles.slider}
              />
              <span className={styles.sliderValue}>{wardCount}</span>
            </div>
            <span className={styles.sliderContext}>{zoneLabel(wardCount)}</span>
          </div>

          <div className={styles.scaleGrid}>
            {[
              {
                label: "Monthly infra cost",
                value: formatCurrencyCompact(monthlyCost),
                sub: `${wardCount} ward${wardCount > 1 ? "s" : ""}`,
              },
              {
                label: "Annual infra cost",
                value: formatCurrencyCompact(annualCost),
                sub: "cloud services only",
                highlight: true,
              },
              {
                label: "Complaints / year",
                value: `${Math.round(yearlyComplaints / 1000).toLocaleString("en-IN")}K`,
                sub: "at 2% filing rate",
              },
              {
                label: "Per-grievance cost",
                value: `₹${perGrievance}`,
                sub: "infrastructure only",
              },
            ].map((item) => (
              <article
                key={item.label}
                className={cx(styles.scaleCard, item.highlight && styles.scaleCardHighlight)}
                data-scale-card
              >
                <p className={styles.scaleLabel}>{item.label}</p>
                <p className={styles.scaleValue}>{item.value}</p>
                <p className={styles.scaleSub}>{item.sub}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="maintenance" className={styles.section}>
          <SectionHeader number="08" title="Annual Maintenance Cost" />
          <div className={styles.twoCol}>
            <div className={styles.tableWrap} data-reveal>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Scale</th>
                    <th>Annual Infra</th>
                    <th className={styles.right}>Per-Grievance</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenanceRows.map((row) => (
                    <tr key={row.scale}>
                      <td>{row.scale}</td>
                      <td>{row.annual}</td>
                      <td className={styles.right}>{row.perGrievance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <article className={styles.card} data-reveal>
              <h3 className={styles.cardTitle}>Maintenance Inclusions</h3>
              <DeliverableList items={maintenanceInclusions} />
            </article>
          </div>
        </section>

        <section id="benchmark" className={styles.section}>
          <SectionHeader
            number="09"
            title="Competitive Benchmark"
            description="JanSamadhan is purpose-built for urban local bodies that central systems and generic CRM vendors underserve, with a strong per-grievance cost advantage."
          />

          <div className={styles.compareGrid}>
            <article className={styles.compareCard} data-reveal>
              <p className={styles.compareLabel}>CPGRAMS cost / grievance</p>
              <p className={styles.compareValue}>₹83–250</p>
              <p className={styles.compareSub}>National scale estimate · DARPG budget</p>
            </article>
            <article className={cx(styles.compareCard, styles.compareAccent)} data-reveal>
              <p className={styles.compareLabel}>JanSamadhan cost / grievance</p>
              <p className={styles.compareValue}>₹6.43</p>
              <p className={styles.compareSub}>20-ward Delhi pilot projection</p>
            </article>
            <article className={styles.compareCard} data-reveal>
              <p className={styles.compareLabel}>Cost advantage</p>
              <p className={styles.compareValue}>13–39×</p>
              <p className={styles.compareSub}>Cheaper per resolved grievance</p>
            </article>
            <article className={styles.compareCard} data-reveal>
              <p className={styles.compareLabel}>Feature depth vs CPGRAMS</p>
              <p className={styles.compareValue}>5×</p>
              <p className={styles.compareSub}>AI + spatial + field ops + WhatsApp</p>
            </article>
          </div>

          <div className={styles.tableWrap} data-reveal>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Capability</th>
                  <th>CPGRAMS</th>
                  <th>Salesforce Gov Cloud</th>
                  <th>JanSamadhan</th>
                </tr>
              </thead>
              <tbody>
                {capabilityRows.map((row) => (
                  <tr key={row.capability}>
                    <td>{row.capability}</td>
                    <td className={styles.dimmedCell}>{row.cpgrams}</td>
                    <td className={styles.dimmedCell}>{row.salesforce}</td>
                    <td className={styles.positiveCell}>{row.jansamadhan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className={styles.documentFooter}>
          <p>
            All costs exclude GST · USD at ₹83.40 · GCP billed on actual CPU/memory seconds consumed
            <br />
            Ward population: 93,000 (Census 2011 interpolated) · Filing rate: 2% = 1,860 complaints/ward/month
          </p>
          <span className={styles.footerBrand}>Team 404 · JanSamadhan · 2026</span>
        </footer>
          </div>
        </div>
      </div>

      <div className={styles.printHidden}>
        <MegaFooter
          brandName="Team 404"
          tagline="Designing delightful digital experiences."
          socialLinks={[
            { platform: "twitter", href: "https://twitter.com" },
            { platform: "github", href: "https://github.com/Prakharrdev/ps-crmdev1" },
            { platform: "linkedin", href: "https://linkedin.com" },
          ]}
          showNewsletter
          newsletterTitle="Stay updated"
          newsletterPlaceholder="Enter your email"
          brandColor="#1c1612"
          brandColorDark="#ffffff"
          newsletterTitleColor="#1c1612"
          newsletterTitleColorDark="#ffffff"
        />
      </div>
    </main>
  );
}
