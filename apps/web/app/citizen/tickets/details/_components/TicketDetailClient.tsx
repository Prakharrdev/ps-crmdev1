"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { 
  ChevronLeft, 
  MapPin, 
  Clock, 
  Tag, 
  Share2, 
  ArrowUp,
  ShieldCheck,
  Activity,
  FileText
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabase";
import type { Database } from "@/src/types/database.types";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { getTieredTwitterHandles } from "@/src/lib/twitter-handles";

type Complaint = Database["public"]["Tables"]["complaints"]["Row"];

// ─── Location Parser (EWKB/Hex) ──────────────────────────────────────────────────────────

function parseEwkbHexPoint(hex: string): { lat: number; lng: number } | null {
  const normalized = hex.trim();
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length < 42) return null;
  try {
    const bytes = new Uint8Array(normalized.length / 2);
    for (let i = 0; i < normalized.length; i += 2)
      bytes[i / 2] = parseInt(normalized.slice(i, i + 2), 16);
    const view = new DataView(bytes.buffer);
    const littleEndian = view.getUint8(0) === 1;
    const typeWithFlags = view.getUint32(1, littleEndian);
    const hasSrid = (typeWithFlags & 0x20000000) !== 0;
    const geomType = typeWithFlags & 0x000000ff;
    if (geomType !== 1) return null;
    const coordOffset = hasSrid ? 9 : 5;
    if (bytes.byteLength < coordOffset + 16) return null;
    const lng = view.getFloat64(coordOffset, littleEndian);
    const lat = view.getFloat64(coordOffset + 8, littleEndian);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

function parseLocation(location: unknown): { lat: number; lng: number } | null {
  if (!location) return null;
  if (typeof location === "object") {
    const o = location as Record<string, unknown>;
    if (Array.isArray(o.coordinates) && o.coordinates.length >= 2) {
      const lng = Number(o.coordinates[0]);
      const lat = Number(o.coordinates[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    const latVal = o.lat ?? o.latitude;
    const lngVal = o.lng ?? o.lon ?? o.longitude;
    if (latVal !== undefined && lngVal !== undefined) {
      const lat = Number(latVal); const lng = Number(lngVal);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  }
  if (typeof location === "string") {
    const ewkb = parseEwkbHexPoint(location);
    if (ewkb) return ewkb;
    const m = location.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
    if (m) return { lng: Number(m[1]), lat: Number(m[2]) };
  }
  return null;
}

// ── Workflow steps (adapted from authority panel) ─────────────────────────────
const WORKFLOW_STEPS = [
  { key: "submitted",    label: "Filed",        actor: "Citizen"   },
  { key: "under_review", label: "Under Review", actor: "Admin"     },
  { key: "assigned",     label: "Assigned",     actor: "Authority" },
  { key: "in_progress",  label: "In Progress",  actor: "Worker"    },
  { key: "resolved",     label: "Resolved",     actor: "Worker"    },
  { key: "spam",         label: "Spam",         actor: "System"    },
] as const;

function WorkflowStepper({ status }: { status: string }) {
  // Handle 'reopened' by showing progress until 'resolved' or 'spam'
  const isTerminal = status === "resolved" || status === "rejected" || status === "spam" || status === "closed";
  const currentIdx = WORKFLOW_STEPS.findIndex(s => s.key === status);
  
  // If reopened, show everything up to "in_progress" as active
  const activeIdx = currentIdx !== -1 
    ? currentIdx 
    : (status === "reopened" ? 3 : 0);

  return (
    <div>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#b48470] dark:text-gray-500">Workflow Progress</p>
      <div className="flex items-start">
        {WORKFLOW_STEPS.map((step, idx) => {
          const done   = idx < activeIdx;
          const active = idx === activeIdx;

          return (
            <div key={step.key} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                {idx > 0 && (
                  <div className={`h-0.5 flex-1 transition-colors ${done || active ? "bg-[#b48470]" : "bg-gray-200 dark:bg-[#333]"}`} />
                )}
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors
                  ${active
                    ? "bg-[#b48470] text-white shadow-sm shadow-[#b48470]/30"
                    : done
                    ? "bg-[#b48470]/20 text-[#b48470]"
                    : "bg-gray-100 text-gray-400 dark:bg-[#2a2a2a] dark:text-gray-600"}`}
                >
                  {done ? "✓" : idx + 1}
                </div>
                {idx < WORKFLOW_STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 transition-colors ${done ? "bg-[#b48470]" : "bg-gray-200 dark:bg-[#333]"}`} />
                )}
              </div>
              <p className={`mt-1.5 text-center text-[9px] font-semibold leading-tight ${active || done ? "text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-600"}`}>
                {step.label}
              </p>
              <p className="text-[8px] text-gray-400 dark:text-gray-600">{step.actor}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TicketDetailClient({
  ticketIdParam,
  onClose,
  isModal = false
}: {
  ticketIdParam?: string;
  onClose?: () => void;
  isModal?: boolean;
} = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const ticketId = ticketIdParam || searchParams.get("id");
  
  const [ticket, setTicket] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasUpvoted, setHasUpvoted] = useState(false);
  const [upvoteCount, setUpvoteCount] = useState(0);
  const [showToast, setShowToast] = useState(false);
  
  const [viewMode, setViewMode] = useState<"details" | "lifecycle">("details");
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ticketId) return;

    const fetchTicket = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("complaints")
        .select("*")
        .eq("id", ticketId)
        .single();

      if (error) {
        console.error("Error fetching ticket details:", error.message, error.details);
      } else {
        setTicket(data);
        setUpvoteCount(data.upvote_count ?? 0);
        
        // Check if user has upvoted
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: upvoteData } = await supabase
            .from("upvotes")
            .select("id")
            .eq("citizen_id", user.id)
            .eq("complaint_id", ticketId)
            .maybeSingle();
          
          setHasUpvoted(!!upvoteData);
        }
      }
      setLoading(false);
    };

    fetchTicket();

    // ─── Realtime Subscription for Live Upvote Updates ───────────────────────
    const channel = supabase
      .channel(`ticket-detail-${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "complaints",
          filter: `id=eq.${ticketId}`,
        },
        (payload) => {
          const newData = payload.new as Complaint;
          if (newData && newData.upvote_count !== undefined) {
            setUpvoteCount(newData.upvote_count);
            setTicket(newData);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ticketId]);

  // Entry animations optimally managed with useGSAP to prevent lag
  useGSAP(() => {
    if (isModal) {
      gsap.fromTo(".modal-overlay", 
        { opacity: 0 }, 
        { opacity: 1, duration: 0.4, ease: "power2.out", clearProps: "all" }
      );
      gsap.fromTo(".modal-box",
        { opacity: 0, scale: 0.95, y: 20 },
        { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "power3.out", clearProps: "all" }
      );
    } else {
      gsap.fromTo(".modal-box",
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", clearProps: "all" }
      );
    }

    if (!loading && ticket) {
      // Content fade in
      gsap.fromTo(".animate-fade-in", 
        { opacity: 0, y: 15 }, 
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, ease: "power2.out", clearProps: "all" }
      );
      
      // Image scale in
      gsap.fromTo(".animate-image-in",
        { opacity: 0, scale: 1.05, transformOrigin: "center center" },
        { opacity: 1, scale: 1, duration: 0.6, ease: "power3.out", clearProps: "all" }
      );
    }
  }, { scope: containerRef, dependencies: [loading, ticket, isModal, viewMode] });

  const handleToggleLifecycle = async () => {
    if (!ticketId) return;
    if (viewMode === "details") {
      setViewMode("lifecycle");
      if (history.length === 0) {
        setLoadingHistory(true);
        const { data, error } = await supabase
          .from("ticket_history")
          .select(`
            id,
            created_at,
            old_status,
            new_status,
            note,
            changed_by,
            profiles(full_name, role)
          `)
          .eq("complaint_id", ticketId)
          .eq("is_internal", false)
          .order("created_at", { ascending: false });

        if (!error && data) {
          setHistory(data);
        } else {
          console.error("Error fetching history:", error);
        }
        setLoadingHistory(false);
      }
    } else {
      setViewMode("details");
    }
  };

  const handleUpvote = async () => {
    if (!ticket || !ticketId) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Smooth UX: Redirect to login and come back here after
      router.push(`/login?redirectTo=${encodeURIComponent(window.location.href)}`);
      return;
    }

    const wasUpvoted = hasUpvoted;
    
    // Optimistic UI
    setHasUpvoted(!wasUpvoted);
    setUpvoteCount(prev => wasUpvoted ? Math.max(0, prev - 1) : prev + 1);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/complaints', {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ 
          complaint_id: ticketId, 
          action: wasUpvoted ? 'downvote' : 'upvote' 
        })
      });
      
      if (!response.ok) throw new Error("Failed to sync upvote");
      
    } catch (err: any) {
      console.error("Upvote persistence failed:", err);
      // Rollback optimistic UI
      setHasUpvoted(wasUpvoted);
      setUpvoteCount(wasUpvoted ? upvoteCount + 1 : upvoteCount - 1);
      
      // Inform the user why it failed
      const msg = err?.message || "Check your internet or permissions.";
      alert(`Upvote failed: ${msg}`);
    }
  };

  const copyImageToClipboard = async (imageUrl: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
      // We need to ensure it's PNG for the Clipboard API in most browsers
      // If it's JPEG, we convert it via canvas
      let pngBlob = blob;
      if (blob.type !== 'image/png') {
        const img = new Image();
        img.src = URL.createObjectURL(blob);
        await new Promise((resolve) => (img.onload = resolve));
        
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        
        pngBlob = await new Promise((resolve) => 
          canvas.toBlob((b) => resolve(b!), 'image/png')
        ) as Blob;
      }
      
      const item = new ClipboardItem({ 'image/png': pngBlob });
      await navigator.clipboard.write([item]);
      return true;
    } catch (err) {
      console.error("Failed to copy image to clipboard:", err);
      return false;
    }
  };

  const handleShareToX = async () => {
    if (!ticket || !ticketId) return;
    
    const { primary, escalated, tier } = getTieredTwitterHandles(
      ticket.category_id, 
      ticket.assigned_department, 
      upvoteCount
    );
    
    const handles = `${primary} ${escalated}`.trim();
    const shareUrl = `${window.location.protocol}//${window.location.host}/citizen/tickets/details?id=${ticketId}`;
    
    // Time-based urgency
    const daysSince = Math.floor((new Date().getTime() - new Date(ticket.created_at).getTime()) / (1000 * 60 * 60 * 24));
    const urgencyMarker = (ticket.status === 'submitted' && daysSince >= 3) 
      ? `⚠️ UNRESOLVED FOR ${daysSince} DAYS\n` 
      : (tier >= 3) ? `📊 HIGH PUBLIC INTEREST\n` : "";

    // Smart Truncation Logic for 280 characters
    const locality = ticket.ward_name || "Delhi";
    const ref = ticket.ticket_id || "N/A";
    
    // Dynamic hashtags: Global + Hyper-local ward tag
    const wardTag = ticket.ward_name ? `#${ticket.ward_name.replace(/\s+/g, '')} ` : "";
    const hashtags = `${wardTag}#JanSamadhan #Delhi #Accountability`;
    
    // Template pieces (excluding Title)
    const baseText = `\n📍 ${locality}\n🎫 Ref: ${ref}\n📣 ${handles}\n\n🗳️ Upvote here: ${shareUrl}\n${hashtags}`;
    
    const maxTitleLen = 280 - (baseText.length + urgencyMarker.length + 15);
    let title = ticket.title || "Civic Issue";
    if (title.length > maxTitleLen) {
      title = title.substring(0, maxTitleLen - 3) + "...";
    }

    const shareText = `${urgencyMarker}🚨 Issue: ${title}${baseText}`;
    
    // PATH A: Mobile / Native Share (Direct File Attachment)
    if (navigator.share && navigator.canShare && ticket.photo_urls?.[0]) {
      try {
        const imageUrl = ticket.photo_urls[0];
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], "issue.jpg", { type: "image/jpeg" });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `Issue: ${title}`,
            text: shareText,
          });
          return;
        }
      } catch (err) {
        console.warn("Web Share failed, attempting Desktop fallback:", err);
      }
    }

    // PATH B: Desktop Fallback (Auto-Copy Image + Intent)
    if (ticket.photo_urls?.[0]) {
      const copied = await copyImageToClipboard(ticket.photo_urls[0]);
      if (copied) {
        setShowToast(true);
        setTimeout(() => setShowToast(false), 5000);
      }
    }

    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(twitterUrl, "_blank");
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex h-full w-full items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#b48470] shadow-sm"></div>
        </div>
      );
    }

    if (!ticket) {
      return (
        <div className="flex flex-col items-center justify-center text-gray-800 dark:text-white bg-white dark:bg-[#161616] p-12 rounded-[2.5rem] shadow-2xl border border-gray-200 dark:border-[#2a2a2a] m-4">
          <h2 className="text-xl font-bold">Ticket not found</h2>
          {isModal ? (
            <button onClick={onClose} className="mt-4 text-[#b48470] hover:underline font-bold">Close details</button>
          ) : (
            <Link href="/citizen/tickets" className="mt-4 text-[#b48470] hover:underline font-bold">Go back to tickets</Link>
          )}
        </div>
      );
    }

    const coords = parseLocation(ticket.location);
    const mapsUrl = coords 
      ? `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ticket.address_text || "")}`;

    return (
      <div className="modal-box relative z-10 flex h-[90vh] sm:h-[85vh] sm:min-h-[600px] max-h-[800px] w-[95%] sm:w-[90%] max-w-[1024px] overflow-hidden rounded-[1.5rem] md:rounded-[2.5rem] border border-gray-200 bg-white shadow-xl dark:border-[#2a2a2a] dark:bg-[#161616] will-change-[transform,opacity]">
        <div className="flex h-full w-full flex-col lg:flex-row">
          {/* Image Section */}
          <div className="relative h-52 sm:h-64 lg:h-full lg:w-[45%] shrink-0 bg-gray-100 dark:bg-[#111] overflow-hidden">
            {ticket.photo_urls?.[0] ? (
              <img 
                src={ticket.photo_urls[0]} 
                alt="Ticket issue" 
                className="animate-image-in h-full w-full object-cover border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-[#2a2a2a]"
              />
            ) : (
              <div className="animate-image-in flex h-full w-full items-center justify-center border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-[#2a2a2a]">
                <Tag size={48} className="text-gray-400 dark:text-gray-600" />
              </div>
            )}
            
            {/* DIGIPIN Badge */}
            <div className="absolute bottom-6 left-6 animate-fade-in z-10">
              <div className="flex items-center gap-2 rounded-xl bg-[#b48470] px-4 py-2.5 text-xs font-bold text-white shadow-lg">
                <MapPin size={14} className="fill-white" />
                <span>DIGIPIN: {ticket.digipin || "N/A"}</span>
              </div>
            </div>
          </div>

          {/* Content Section */}
          <div className="relative flex flex-1 flex-col p-5 sm:p-6 lg:p-10 min-h-0">
            {/* Close Button X */}
            <button 
              onClick={() => onClose ? onClose() : router.back()}
              className="absolute top-4 right-4 sm:top-6 sm:right-6 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900 dark:bg-[#2a2a2a] dark:text-gray-400 dark:hover:bg-[#333] dark:hover:text-white z-20"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>

            <div className="animate-fade-in pr-10 md:pr-12">
              <h1 className="text-xl md:text-2xl font-black leading-tight text-gray-900 dark:text-white lg:text-[28px] text-balance">
                {ticket.title}
              </h1>
              <p className="mt-1.5 md:mt-3 text-xs md:text-sm font-medium tracking-wide text-gray-500 dark:text-[#888]">
                Ref: {ticket.ticket_id}
              </p>
            </div>

            {viewMode === "details" ? (
              <>
                {/* Quick Metadata */}
                <div className="mt-4 md:mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4 animate-fade-in">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#b48470] dark:text-gray-500">
                      <ShieldCheck size={14} className="text-[#b48470] dark:text-gray-500" />
                      DEPARTMENT
                    </div>
                    <div className="text-base font-bold text-gray-900 dark:text-white">
                      {ticket.assigned_department || "UNASSIGNED"}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#b48470] dark:text-gray-500">
                      <Clock size={14} className="text-[#b48470] dark:text-gray-500" />
                      REPORTED
                    </div>
                    <div className="text-base font-bold text-gray-900 dark:text-white">
                      {new Date(ticket.created_at).toLocaleDateString('en-US', { 
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
                      })}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#b48470] dark:text-gray-500">
                      < ShieldCheck size={14} className="text-[#b48470] dark:text-gray-500" />
                      SPAM STATUS
                    </div>
                    <div className={`text-base font-bold ${ticket.is_spam ? "text-red-500 dark:text-red-400" : "text-green-600 dark:text-green-500"}`}>
                      {ticket.is_spam ? "SPAM" : "LEGIT"}
                    </div>
                  </div>
                </div>

                {/* Full Address */}
                <div className="mt-4 md:mt-8 space-y-1.5 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#b48470] dark:text-gray-500">
                      <MapPin size={14} className="text-[#b48470] dark:text-gray-500" />
                      FULL ADDRESS
                    </div>
                    {ticket.address_text && (
                      <a 
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-[#b48470]/10 px-2 py-1 text-[10px] font-bold text-[#b48470] transition-all hover:bg-[#b48470] hover:text-white"
                      >
                        GET DIRECTIONS →
                      </a>
                    )}
                  </div>
                  <p className="text-sm font-bold leading-relaxed text-gray-700 dark:text-gray-200">
                    {ticket.address_text?.split('|')[0] || "Address unavailable"}
                  </p>
                </div>

                {/* Description */}
                <div className="mt-4 md:mt-8 space-y-1.5 animate-fade-in flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#b48470] dark:text-gray-500">
                    <Tag size={14} className="text-[#b48470] dark:text-gray-500" />
                    ISSUE DESCRIPTION
                  </div>
                  <p className="text-sm font-medium leading-relaxed text-gray-600 dark:text-[#a1a1aa] whitespace-pre-wrap">
                    {ticket.description || "No description provided."}
                  </p>
                </div>
              </>
            ) : (
              /* ── Lifecycle View (from authority panel logic) ─────────────── */
              <div className="mt-4 md:mt-6 flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0 flex flex-col gap-4 md:gap-6">
                {/* Workflow Stepper */}
                <div className="animate-fade-in">
                  <WorkflowStepper status={ticket.status} />
                </div>

                <div className="h-px bg-gray-100 dark:bg-[#2a2a2a]" />

                {/* Timeline History */}
                <div className="animate-fade-in flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#b48470] dark:text-gray-500 mb-4">
                    <Activity size={14} className="text-[#b48470] dark:text-gray-500" />
                    STATUS HISTORY
                  </div>

                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#b48470]"></div>
                    </div>
                  ) : history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-100 dark:border-[#2a2a2a] rounded-xl py-8 px-4">
                      <Activity size={28} className="text-gray-300 dark:text-gray-600 mb-2" />
                      <p className="text-sm font-bold text-gray-700 dark:text-gray-300">No activity yet</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Updates will appear here as your ticket is processed.</p>
                    </div>
                  ) : (
                    <div className="relative pl-4 border-l-2 border-[#b48470]/20 dark:border-[#333] space-y-5">
                      {history.map((item) => (
                        <div key={item.id} className="relative animate-fade-in">
                          <div className="absolute -left-[21px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#b48470] dark:border-[#161616]" />
                          <div className="pl-1">
                            <div className="text-[11px] font-bold uppercase text-gray-400 dark:text-gray-500">
                              {new Date(item.created_at).toLocaleString('en-US', {
                                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                              })}
                            </div>
                            <div className="mt-1 flex items-center flex-wrap gap-1.5">
                              <span className="text-sm font-bold text-gray-900 dark:text-white capitalize">
                                {item.new_status.replace(/_/g, ' ')}
                              </span>
                              {item.old_status && (
                                <span className="text-[10px] text-gray-400">
                                  ← {item.old_status.replace(/_/g, ' ')}
                                </span>
                              )}
                              {item.profiles?.full_name && (
                                <span className="text-[10px] font-medium text-gray-500 bg-gray-100 dark:bg-[#2a2a2a] dark:text-gray-400 px-1.5 py-0.5 rounded">
                                  by {item.profiles.full_name}
                                </span>
                              )}
                            </div>
                            {item.note && (
                              <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 italic">
                                "{item.note}"
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="mt-4 md:mt-6 pt-4 md:pt-6 animate-fade-in flex flex-wrap gap-2 md:gap-3 items-center w-full shrink-0 border-t border-gray-100 dark:border-[#2a2a2a]">
              <button 
                onClick={handleToggleLifecycle}
                className="flex-1 min-w-[140px] flex items-center justify-center gap-2 h-11 md:h-[52px] rounded-xl bg-[#b48470] hover:bg-[#a37562] text-[13px] md:text-[15px] font-bold text-white shadow-md shadow-[#b48470]/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {viewMode === "details" ? (
                  <><Activity size={18} /> Track Lifecycle</>
                ) : (
                  <><FileText size={18} /> View Details</>
                )}
              </button>
              
              <button 
                onClick={handleUpvote}
                className={`flex h-11 md:h-[52px] min-w-[60px] md:min-w-[80px] justify-center items-center gap-1.5 md:gap-2 rounded-xl border px-3 md:px-4 transition-all font-bold text-sm md:text-base ${
                  hasUpvoted 
                    ? 'border-[#b48470] bg-[#b48470] text-white shadow-md shadow-[#b48470]/40 hover:bg-[#a37562]' 
                    : 'border-gray-200 bg-white text-gray-700 shadow-sm hover:border-gray-300 hover:bg-gray-50 dark:border-[#333] dark:bg-[#2a2a2a] dark:text-gray-300 dark:hover:bg-[#444]'
                }`}
              >
                <ArrowUp size={20} className={hasUpvoted ? "stroke-[3px]" : "stroke-[2.5px]"} />
                <span>{upvoteCount}</span>
              </button>

              {/* Pressure Level Indicator */}
              {ticket && (
                <div className="flex flex-col gap-1 min-w-[100px]">
                  <div className="flex justify-between text-[8px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-tighter">
                    <span>Pressure</span>
                    <span className="text-[#b48470]">Tier {getTieredTwitterHandles(ticket.category_id, ticket.assigned_department, upvoteCount).tier}</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-200 dark:bg-[#333] rounded-full overflow-hidden flex">
                    {[1, 2, 3, 4].map((t) => (
                      <div 
                        key={t}
                        className={`h-full flex-1 border-r border-white dark:border-[#161616] last:border-0 transition-colors duration-500 ${
                          getTieredTwitterHandles(ticket.category_id, ticket.assigned_department, upvoteCount).tier >= t 
                            ? 'bg-[#b48470]' 
                            : 'bg-transparent'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              <button 
                onClick={handleShareToX}
                className="flex h-11 w-11 md:h-[52px] md:w-[52px] items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm hover:border-gray-300 hover:bg-gray-50 hover:text-black dark:border-[#333] dark:bg-[#2a2a2a] dark:text-gray-300 dark:hover:bg-[#444] dark:hover:text-white transition-all shrink-0 relative"
                title="Share to X / Twitter"
              >
                <Share2 size={20} />
                {ticket && getTieredTwitterHandles(ticket.category_id, ticket.assigned_department, upvoteCount).tier >= 3 && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#b48470] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-[#b48470]"></span>
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (isModal) {
    return (
      <div ref={containerRef} className="modal-overlay fixed inset-0 z-[3000] flex items-center justify-center bg-black/80 p-4 sm:p-6 lg:p-8 will-change-[opacity]">
        {/* Copy Instruction Toast */}
        {showToast && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[3100] animate-fade-in">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-[#b48470]/50 bg-white/95 dark:bg-[#161616]/95 px-8 py-5 text-center shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-3 text-[#b48470] font-black tracking-widest text-sm uppercase">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#b48470] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[#b48470]"></span>
                </span>
                IMAGE COPIED TO CLIPBOARD
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-xs font-medium">
                Press <span className="text-gray-900 dark:text-white font-bold bg-gray-100 dark:bg-[#2a2a2a] px-1.5 py-0.5 rounded">Cmd + V</span> in your Twitter draft to attach!
              </p>
              <button 
                onClick={() => setShowToast(false)}
                className="mt-1 text-[10px] font-bold text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
              >
                [ DISMISS ]
              </button>
            </div>
          </div>
        )}
        {renderContent()}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex h-[calc(100vh-73px)] w-full flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* Copy Instruction Toast */}
      {showToast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-[#b48470]/50 bg-white/95 dark:bg-[#161616]/95 px-8 py-5 text-center shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3 text-[#b48470] font-black tracking-widest text-sm uppercase">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#b48470] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#b48470]"></span>
              </span>
              IMAGE COPIED TO CLIPBOARD
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-xs font-medium">
              Press <span className="text-gray-900 dark:text-white font-bold bg-gray-100 dark:bg-[#2a2a2a] px-1.5 py-0.5 rounded">Cmd + V</span> in your Twitter draft to attach!
            </p>
            <button 
              onClick={() => setShowToast(false)}
              className="mt-1 text-[10px] font-bold text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
            >
              [ DISMISS ]
            </button>
          </div>
        </div>
      )}
      {renderContent()}
    </div>
  );
}