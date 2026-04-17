"use client";

import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowUp, Search, X, ChevronDown, Star, MessageSquare, MapPin, ExternalLink } from "lucide-react";
import { supabase } from "@/src/lib/supabase";
import type { Database } from "@/src/types/database.types";
import Rating from "@/components/Rating";
import TicketDetailClient from "./details/_components/TicketDetailClient";

type ComplaintRow = Database["public"]["Tables"]["complaints"]["Row"];
type TicketListRow = Pick<
  ComplaintRow,
  "id" | "ticket_id" | "title" | "address_text" | "assigned_department" | "status" | "is_spam" | "created_at" | "upvote_count" | "location"
> & { rating?: number | null; reviews?: { rating: number } | { rating: number }[] | null };

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

function formatStatus(status: string, is_spam: boolean = false): string {
  if (is_spam) return "Spam";
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function statusClasses(status: string, is_spam: boolean = false): string {
  if (is_spam) return "bg-red-100 text-red-700";
  const normalized = status.trim().toLowerCase();
  if (normalized === "submitted") return "bg-amber-100 text-amber-700";
  if (normalized === "assigned") return "bg-blue-100 text-blue-700";
  if (normalized === "in_progress" || normalized === "under_review") return "bg-purple-100 text-purple-700";
  if (normalized === "reopened") return "bg-red-100 text-red-700 font-bold animate-pulse";
  if (normalized === "pending_closure") return "bg-orange-100 text-orange-700";
  if (normalized === "resolved") return "bg-green-100 text-green-700";
  if (normalized === "rejected") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-600";
}
function formatReportedTime(timestamp: string): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

function extractRelevantAddress(fullAddress: string | null | undefined): string {
  if (!fullAddress) return "Address unavailable";
  const beforeGPS = fullAddress.split("|")[0].trim();
  const lines = beforeGPS
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length < 100);
  return lines.slice(0, 3).join(", ") || beforeGPS;
}

function extractUniqueStatuses(tickets: TicketListRow[]): string[] {
  const seen = new Set<string>();
  tickets.forEach((t) => {
    if (t.status) seen.add(t.status);
  });
  return Array.from(seen).sort();
}

function extractUniqueDepartments(tickets: TicketListRow[]): string[] {
  const seen = new Set<string>();
  tickets.forEach((t) => {
    if (t.assigned_department && t.assigned_department !== "Unassigned") seen.add(t.assigned_department);
  });
  return Array.from(seen).sort();
}

function filterAndSortTickets(
  tickets: TicketListRow[],
  searchQuery: string,
  statusFilter: string | null,
  departmentFilter: string | null,
  sortBy: "latest" | "upvotes" | "oldest"
): TicketListRow[] {
  let filtered = [...tickets];

  // Apply search filter
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter((ticket) => {
      const ticketId = (ticket.ticket_id || "").toLowerCase();
      const title = (ticket.title || "").toLowerCase();
      const address = extractRelevantAddress(ticket.address_text).toLowerCase();
      return ticketId.includes(query) || title.includes(query) || address.includes(query);
    });
  }

  // Apply status filter
  if (statusFilter) {
    filtered = filtered.filter((ticket) => ticket.status === statusFilter);
  }

  // Apply department filter
  if (departmentFilter) {
    filtered = filtered.filter((ticket) => ticket.assigned_department === departmentFilter);
  }

  // Apply sorting
  if (sortBy === "upvotes") {
    filtered.sort((a, b) => {
      const diff = (b.upvote_count ?? 0) - (a.upvote_count ?? 0);
      if (diff !== 0) return diff;
      // Tie-breaker: latest first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  } else if (sortBy === "oldest") {
    // Oldest first
    filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  } else {
    // Default: latest
    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  return filtered;
}

function CitizenTicketsPageContent() {
  const searchParams = useSearchParams();
  const highlightedTicketId = searchParams.get("highlight");

  const [activeHighlight, setActiveHighlight] = useState<string | null>(null);
  const highlightedRef = useRef<HTMLLIElement>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const [tickets, setTickets] = useState<TicketListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [citizenId, setCitizenId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"latest" | "upvotes" | "oldest">("latest");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [departmentDropdownOpen, setDepartmentDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [hasUpvoted, setHasUpvoted] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (highlightedTicketId && !loading) {
      setActiveHighlight(highlightedTicketId);
      const timer = setTimeout(() => {
        setActiveHighlight(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightedTicketId, loading]);

  useEffect(() => {
    if (activeHighlight && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeHighlight, tickets.length]);

  useEffect(() => {
    const bootstrapCitizen = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user?.id) {
        setError("Unable to identify citizen account.");
        setLoading(false);
        return;
      }

      setCitizenId(user.id);

      // Fetch user's upvotes
      const { data: upvotes } = await supabase
        .from("upvotes")
        .select("complaint_id")
        .eq("citizen_id", user.id);
      
      if (upvotes) {
        setHasUpvoted(new Set(upvotes.map(u => u.complaint_id)));
      }
    };

    void bootstrapCitizen();
  }, []);

  useEffect(() => {
    if (!citizenId) return;

    let isActive = true;

    const fetchTickets = async () => {
      if (!isActive) return;

      const localCacheKey = `citizen_tickets_${citizenId}`;
      const cachedS = typeof window !== "undefined" ? localStorage.getItem(localCacheKey) : null;
      let localData: TicketListRow[] = [];

      // 1. Instant loading from LocalStorage
      if (cachedS) {
        try {
          localData = JSON.parse(cachedS);
          setTickets(localData);
          setLoading(false); // Immediately stop loading to show local data
        } catch (e) {
          console.error("Local storage parse error", e);
        }
      } else {
        setLoading(true);
      }

      setError(null);

      // 2. Background sync with FastAPI
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("No auth session");

        // Use the latest ticket's created_at as the 'since' threshold for delta sync
        const lastSyncTime = localData.length > 0 ? localData[0].created_at : null;

        const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.jansamadhan.perkkk.dev";
        const url = new URL(`${API_URL}/citizen/tickets`);
        if (lastSyncTime) {
          url.searchParams.set("since", lastSyncTime);
        }

        const res = await fetch(url.toString(), {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });

        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const { source, tickets: incomingRaw } = await res.json();

        // Flatten reviews(rating)
        const incoming = incomingRaw.map((t: any) => {
          const rating = t.reviews
            ? (Array.isArray(t.reviews) ? t.reviews[0]?.rating : (t.reviews as any).rating)
            : t.rating;
          return { ...t, rating };
        });

        if (!isActive) return;

        setTickets((prev) => {
          let updated: TicketListRow[];
          if (source === "delta") {
            // Merge delta updates (newest first)
            const map = new Map(prev.map(t => [t.id, t]));
            incoming.forEach((t: TicketListRow) => map.set(t.id, t));
            updated = Array.from(map.values()).sort((a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
          } else {
            // Full refresh from server/cache
            updated = incoming;
          }

          // Persist the updated list back to device storage
          if (typeof window !== "undefined") {
            localStorage.setItem(localCacheKey, JSON.stringify(updated));
          }
          return updated;
        });
      } catch (err) {
        if (err instanceof TypeError && err.message === "Failed to fetch") {
          console.warn("Backend API unreachable. Using local data only.");
        } else {
          console.error("Fetch sync error:", err);
        }
        // We only show a hard error if we don't even have local data
        if (!localData.length) {
          setError("Failed to sync tickets with server.");
        }
      } finally {
        if (isActive) setLoading(false);
      }
    };

    const toTicketRow = (row: ComplaintRow): TicketListRow => ({
      id: row.id,
      ticket_id: row.ticket_id,
      title: row.title,
      address_text: row.address_text,
      assigned_department: row.assigned_department,
      status: row.status,
      is_spam: row.is_spam,
      created_at: row.created_at,
      upvote_count: row.upvote_count,
      location: row.location,
    });

    const upsertTicket = (prev: TicketListRow[], incoming: TicketListRow): TicketListRow[] => {
      const existingIndex = prev.findIndex((item) => item.id === incoming.id);
      if (existingIndex === -1) {
        return [incoming, ...prev];
      }

      const next = [...prev];
      next[existingIndex] = incoming;
      return next;
    };

    void fetchTickets();

    const channel = supabase
      .channel(`citizen-ticket-list-${citizenId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "complaints",
          filter: `citizen_id=eq.${citizenId}`,
        },
        (payload) => {
          const incoming = toTicketRow(payload.new as ComplaintRow);
          setTickets((prev) => upsertTicket(prev, incoming));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "complaints",
          filter: `citizen_id=eq.${citizenId}`,
        },
        (payload) => {
          const incoming = toTicketRow(payload.new as ComplaintRow);
          setTickets((prev) => upsertTicket(prev, incoming));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "complaints",
          filter: `citizen_id=eq.${citizenId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string }).id;
          if (!deletedId) return;
          setTickets((prev) => prev.filter((item) => item.id !== deletedId));
        }
      )
      .subscribe((status) => {
        // Recover quickly from transient realtime channel issues.
        if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && isActive) {
          void fetchTickets();
        }
      });

    // PERFORMANCE OPTIMIZATION: Removed 12s polling.
    // Realtime sync via supabase.channel handles updates efficiently.
    return () => {
      isActive = false;
      void channel.unsubscribe();
    };
  }, [citizenId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpvote = useCallback(async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!citizenId) return;

    const isUpvoted = hasUpvoted.has(id);
    const target = tickets.find(t => t.id === id);
    if (!target) return;

    try {
      if (isUpvoted) {
        // Toggle OFF locally
        setHasUpvoted((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setTickets((prev) =>
          prev.map((t) => (t.id === id ? { ...t, upvote_count: Math.max(0, (t.upvote_count ?? 1) - 1) } : t))
        );

        // Sync with DB via centralized API
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch('/api/complaints', {
          method: 'PATCH',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({ complaint_id: id, action: 'downvote' })
        });
        
        if (!response.ok) throw new Error("Failed to remove upvote");
          
      } else {
        // Toggle ON locally
        setHasUpvoted((prev) => new Set([...prev, id]));
        setTickets((prev) =>
          prev.map((t) => (t.id === id ? { ...t, upvote_count: (t.upvote_count ?? 0) + 1 } : t))
        );

        // Sync with DB via centralized API
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch('/api/complaints', {
          method: 'PATCH',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({ complaint_id: id, action: 'upvote' })
        });
        
        if (!response.ok) throw new Error("Failed to upvote");
      }
    } catch (err: any) {
      console.error("Upvote toggle failed:", err);
      // Immediate local rollback
      const wasUpvoted = !hasUpvoted.has(id);
      setHasUpvoted((prev) => {
        const next = new Set(prev);
        if (wasUpvoted) next.add(id); else next.delete(id);
        return next;
      });
      setTickets((prev) =>
        prev.map((t) => (t.id === id ? { ...t, upvote_count: wasUpvoted ? t.upvote_count + 1 : Math.max(0, t.upvote_count - 1) } : t))
      );
      
      const msg = err?.message || "Check your internet or permissions.";
      alert(`Upvote failed: ${msg}`);
    }
  }, [citizenId, hasUpvoted, tickets]);

  // Extract available statuses and departments whenever tickets change
  useEffect(() => {
    setAvailableStatuses(extractUniqueStatuses(tickets));
    setAvailableDepartments(extractUniqueDepartments(tickets));
  }, [tickets]);

  // Compute filtered and sorted tickets
  const filteredTickets = filterAndSortTickets(tickets, searchQuery, statusFilter, departmentFilter, sortBy);

  const handleClearFilters = () => {
    setSearchQuery("");
    setSortBy("latest");
    setStatusFilter(null);
    setDepartmentFilter(null);
  };

  const hasActiveFilters = searchQuery || statusFilter || departmentFilter || sortBy !== "latest";

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col px-4 sm:px-6 py-4">
      <section className="flex-1 min-h-0 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col max-h-[calc(100vh-10rem)] lg:max-h-[calc(100vh-8rem)] dark:border-[#2a2a2a] dark:bg-[#161616]">
        {/* Search and Filter Controls */}
        <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4 dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Search by ticket id, title, or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-[#b48470] focus:outline-none focus:ring-2 focus:ring-[#b48470]/20 dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-200 dark:placeholder:text-gray-500"
            />
          </div>

          {/* Sort and Filter Dropdowns */}
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {/* Sort Dropdown */}
            <div className="relative">
              <button
                onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-300 dark:hover:bg-[#2a2a2a]"
              >
                Sort: {sortBy === "latest" ? "Latest" : sortBy === "upvotes" ? "Highest Upvote" : "Oldest"}
                <ChevronDown size={16} className={`transition-transform ${sortDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {sortDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 z-20 w-40 rounded-lg border border-gray-300 bg-white shadow-lg dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
                  <button
                    onClick={() => {
                      setSortBy("latest");
                      setSortDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 transition-colors dark:text-gray-300 dark:hover:bg-[#2a2a2a] ${sortBy === "latest" ? "bg-[#b48470]/10 text-[#b48470] font-medium dark:bg-[#b48470]/20 dark:text-[#c49a88]" : ""
                      }`}
                  >
                    Latest
                  </button>
                  <button
                    onClick={() => {
                      setSortBy("upvotes");
                      setSortDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 transition-colors dark:text-gray-300 dark:hover:bg-[#2a2a2a] ${sortBy === "upvotes" ? "bg-[#b48470]/10 text-[#b48470] font-medium dark:bg-[#b48470]/20 dark:text-[#c49a88]" : ""
                      }`}
                  >
                    Highest Upvote
                  </button>
                  <button
                    onClick={() => {
                      setSortBy("oldest");
                      setSortDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 transition-colors dark:text-gray-300 dark:hover:bg-[#2a2a2a] ${sortBy === "oldest" ? "bg-[#b48470]/10 text-[#b48470] font-medium dark:bg-[#b48470]/20 dark:text-[#c49a88]" : ""
                      }`}
                  >
                    Oldest
                  </button>
                </div>
              )}
            </div>

            {/* Status Filter Dropdown */}
            <div className="relative">
              <button
                onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-300 dark:hover:bg-[#2a2a2a]"
              >
                Status: {statusFilter ? formatStatus(statusFilter) : "All"}
                <ChevronDown size={16} className={`transition-transform ${statusDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {statusDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 z-20 w-48 rounded-lg border border-gray-300 bg-white shadow-lg dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
                  <button
                    onClick={() => {
                      setStatusFilter(null);
                      setStatusDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 transition-colors dark:text-gray-300 dark:hover:bg-[#2a2a2a] ${statusFilter === null ? "bg-[#b48470]/10 text-[#b48470] font-medium dark:bg-[#b48470]/20 dark:text-[#c49a88]" : ""
                      }`}
                  >
                    All
                  </button>
                  {availableStatuses.map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        setStatusFilter(status);
                        setStatusDropdownOpen(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 transition-colors dark:text-gray-300 dark:hover:bg-[#2a2a2a] ${statusFilter === status ? "bg-[#b48470]/10 text-[#b48470] font-medium dark:bg-[#b48470]/20 dark:text-[#c49a88]" : ""
                        }`}
                    >
                      {formatStatus(status)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Department Filter Dropdown */}
            <div className="relative">
              <button
                onClick={() => setDepartmentDropdownOpen(!departmentDropdownOpen)}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-300 dark:hover:bg-[#2a2a2a]"
              >
                Department: {departmentFilter ? departmentFilter : "All"}
                <ChevronDown size={16} className={`transition-transform ${departmentDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {departmentDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 z-20 w-48 rounded-lg border border-gray-300 bg-white shadow-lg dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
                  <button
                    onClick={() => {
                      setDepartmentFilter(null);
                      setDepartmentDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 transition-colors dark:text-gray-300 dark:hover:bg-[#2a2a2a] ${departmentFilter === null ? "bg-[#b48470]/10 text-[#b48470] font-medium dark:bg-[#b48470]/20 dark:text-[#c49a88]" : ""
                      }`}
                  >
                    All Departments
                  </button>
                  {availableDepartments.map((dept) => (
                    <button
                      key={dept}
                      onClick={() => {
                        setDepartmentFilter(dept);
                        setDepartmentDropdownOpen(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 transition-colors dark:text-gray-300 dark:hover:bg-[#2a2a2a] ${departmentFilter === dept ? "bg-[#b48470]/10 text-[#b48470] font-medium dark:bg-[#b48470]/20 dark:text-[#c49a88]" : ""
                        }`}
                    >
                      {dept}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors dark:text-gray-300 dark:hover:bg-[#2a2a2a] dark:hover:text-gray-100"
              >
                <X size={16} />
                Clear Filters
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto flex-1 min-h-0 flex flex-col">
          <div className="min-w-[980px] flex flex-col flex-1 min-h-0">
            <div className="sticky top-0 z-10 grid grid-cols-[130px_2fr_2fr_1.2fr_1fr_1.5fr_100px_120px] gap-3 border-b border-gray-200 bg-gray-50 px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-400">
              <span>Ticket ID</span>
              <span>Issue Title</span>
              <span>Locality / Address</span>
              <span>Department</span>
              <span>Status</span>
              <span>Reported Time</span>
              <span className="text-center">Upvotes</span>
              <span className="text-center">Action</span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {loading && (
                <div className="px-5 py-8 text-sm text-gray-500 dark:text-gray-400">Loading tickets...</div>
              )}

              {!loading && error && (
                <div className="px-5 py-8 text-sm text-red-600 dark:text-red-400">{error}</div>
              )}

              {!loading && !error && tickets.length === 0 && !searchQuery && statusFilter === null && departmentFilter === null && (
                <div className="px-5 py-8 text-sm text-gray-500 dark:text-gray-400">No tickets reported yet.</div>
              )}

              {!loading && !error && tickets.length > 0 && filteredTickets.length === 0 && (
                <div className="px-5 py-8 text-sm text-gray-500 dark:text-gray-400">No tickets match your filters.</div>
              )}

              {!loading && !error && filteredTickets.length > 0 && (
                <ul className="divide-y divide-gray-100 dark:divide-[#2a2a2a]">
                  {filteredTickets.map((ticket) => (
                      <li
                        key={ticket.id}
                        ref={ticket.id === activeHighlight ? highlightedRef : null}
                        className={`grid grid-cols-[130px_2fr_2fr_1.2fr_1fr_1.5fr_100px_120px] gap-3 px-5 py-4 text-sm text-gray-700 transition-all duration-1000 dark:text-gray-300 dark:hover:bg-[#1e1e1e] ${ticket.id === activeHighlight
                          ? "bg-[#b48470]/10 shadow-[0_0_20px_rgba(180,132,112,0.3)] z-10 relative dark:bg-[#b48470]/20"
                          : "hover:bg-gray-50 border-b border-gray-50 dark:border-[#2a2a2a]"
                          }`}
                      >
                        <span className="font-medium text-gray-900 font-mono text-xs sm:text-sm truncate dark:text-gray-200">
                          {ticket.ticket_id || "N/A"}
                        </span>

                        <span className="text-gray-900 font-bold line-clamp-2 leading-snug dark:text-gray-200">
                          {ticket.title || "Untitled issue"}
                        </span>

                        <div className="flex flex-col gap-1">
                          <span className="text-gray-600 line-clamp-1 leading-snug dark:text-gray-400" title={ticket.address_text || "Address unavailable"}>
                            {extractRelevantAddress(ticket.address_text) || "Address unavailable"}
                          </span>
                          {ticket.address_text && (() => {
                            const coords = parseLocation(ticket.location);
                            return (
                              <a 
                                href={coords 
                                  ? `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`
                                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ticket.address_text.split('|')[0])}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 text-[10px] font-bold text-[#b48470] hover:underline whitespace-nowrap"
                              >
                                <ExternalLink size={10} />
                                Open in Maps
                              </a>
                            );
                          })()}
                        </div>

                        <span className="text-gray-900 font-medium line-clamp-2 leading-snug dark:text-gray-300">
                          {ticket.assigned_department || "Unassigned"}
                        </span>

                          <span>
                            <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-tight ${statusClasses(ticket.status || "", ticket.is_spam)}`}>
                              {formatStatus(ticket.status || "submitted", ticket.is_spam)}
                            </span>
                          </span>

                        <span className="text-gray-600 text-xs sm:text-sm dark:text-gray-400">
                          {formatReportedTime(ticket.created_at)}
                        </span>

                        <div className="flex items-center justify-center">
                          <button
                            onClick={(e) => handleUpvote(ticket.id, e)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all ${
                              hasUpvoted.has(ticket.id)
                                ? "bg-[#b48470]/10 border-[#b48470]/30 text-[#b48470] dark:bg-[#b48470]/20 dark:border-[#b48470]/40 dark:text-[#c49a88]"
                                : "bg-white border-gray-200 text-gray-500 hover:border-[#b48470]/30 hover:text-[#b48470] dark:bg-[#1e1e1e] dark:border-[#333] dark:text-gray-400"
                            }`}
                          >
                            <ArrowUp size={14} className={hasUpvoted.has(ticket.id) ? "fill-current" : ""} />
                            <span className="font-bold text-xs">{ticket.upvote_count ?? 0}</span>
                          </button>
                        </div>

                        <div className="flex items-center justify-center">
                          <button
                            onClick={() => setSelectedTicketId(ticket.id)}
                            className="text-[#b48470] hover:text-[#a37562] font-bold italic text-sm transition-colors"
                          >
                            View details
                          </button>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Ticket Details Overlay */}
      {selectedTicketId && (
        <TicketDetailClient 
          ticketIdParam={selectedTicketId} 
          isModal 
          onClose={() => setSelectedTicketId(null)} 
        />
      )}
    </div>
  );
}

export default function CitizenTicketsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading tickets...</div>}>
      <CitizenTicketsPageContent />
    </Suspense>
  );
}
