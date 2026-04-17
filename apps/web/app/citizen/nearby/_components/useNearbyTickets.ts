"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/src/lib/supabase";
import type { Tables } from "@/src/types/database.types";
import { calculateDistanceMeters, type GeoPoint } from "./distance";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SeverityLevel = "L1" | "L2" | "L3" | "L4";

export type MappedComplaint = {
  id: string;
  ticket_id: string | null;
  title: string;
  description: string;
  severity: SeverityLevel;
  effective_severity: SeverityLevel;
  lat: number;
  lng: number;
  photo_urls: string[] | null;
  upvote_count: number;
  status: string;
  created_at: string;
  address_text: string | null;
  ward_name: string | null;
  category_id: number;
  assigned_department: string | null;
};

export const SEVERITY_CONFIG: Record<SeverityLevel, { label: string; color: string; level: number }> = {
  L1: { label: "Low",      color: "#22c55e", level: 1 },
  L2: { label: "Medium",   color: "#eab308", level: 2 },
  L3: { label: "Urgent",   color: "#f97316", level: 3 },
  L4: { label: "Critical", color: "#ef4444", level: 4 },
};

export function getSeverityConfig(sev: string) {
  return SEVERITY_CONFIG[sev as SeverityLevel] ?? SEVERITY_CONFIG.L1;
}

function normalizeSeverity(value: unknown, fallback: SeverityLevel = "L1"): SeverityLevel {
  if (value === "L1" || value === "L2" || value === "L3" || value === "L4") {
    return value;
  }
  return fallback;
}

// ─── Location Parser ──────────────────────────────────────────────────────────

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

// ─── Hook ─────────────────────────────────────────────────────────────────────

function applyFilter(
  complaints: MappedComplaint[],
  center: GeoPoint | null,
  radiusMeters: number
): MappedComplaint[] {
  if (!center || complaints.length === 0) return [];

  return complaints
    .filter((c) => calculateDistanceMeters(center, { lat: c.lat, lng: c.lng }) <= radiusMeters)
    .sort((a, b) => b.upvote_count - a.upvote_count);
}

export function useNearbyTickets() {
  const [allComplaints, setAllComplaints] = useState<MappedComplaint[]>([]);
  const [visibleComplaints, setVisibleComplaints] = useState<MappedComplaint[]>([]);
  const [hasUpvoted, setHasUpvoted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const lastCenterRef = useRef<GeoPoint | null>(null);
  const lastRadiusRef = useRef<number>(1000);
  const userIdRef = useRef<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  async function loadCitizenUpvotes(complaintIds: string[]) {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    const userId = session?.user?.id ?? null;
    if (sessionError || !userId || complaintIds.length === 0) {
      setHasUpvoted(new Set());
      return;
    }

    const { data, error } = await supabase
      .from("upvotes")
      .select("complaint_id")
      .eq("citizen_id", userId)
      .in("complaint_id", complaintIds);

    if (error) return;
    setHasUpvoted(new Set((data ?? []).map((row) => row.complaint_id)));
  }

  async function fetchComplaints() {
    const localCacheKey = "citizen_nearby_tickets";
    const cachedData = typeof window !== "undefined" ? localStorage.getItem(localCacheKey) : null;
    let hasLocalData = false;

    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData) as MappedComplaint[];
        setAllComplaints(parsed);
        setVisibleComplaints(applyFilter(parsed, lastCenterRef.current, lastRadiusRef.current));
        hasLocalData = true;
        setLoading(false);
        void loadCitizenUpvotes(parsed.map((item) => item.id));
      } catch (e) {
        console.error("Failed to parse cached nearby tickets", e);
      }
    } else {
      setLoading(true);
    }

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      const token = session?.access_token ?? null;
      if (sessionError || !token) {
        setError("Please sign in to view nearby tickets");
        setLoading(false);
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/citizen/nearby`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const payload = (await res.json()) as { error?: string; items?: Tables<"complaints">[] };

      if (!res.ok || !Array.isArray(payload.items)) {
        if (!hasLocalData) setError(payload.error ?? "Failed to load complaints");
        setLoading(false);
        return;
      }

      const data = payload.items;

      type Row = Tables<"complaints">;
      const mapped: MappedComplaint[] = (data as Row[])
        .map((c) => {
          const pos = parseLocation(c.location);
          if (!pos) return null;
          const normalizedSeverity = normalizeSeverity(c.severity);
          return {
            id: c.id,
            ticket_id: c.ticket_id,
            title: c.title,
            description: c.description,
            severity: normalizedSeverity,
            effective_severity: normalizedSeverity,
            lat: pos.lat,
            lng: pos.lng,
            photo_urls: c.photo_urls,
            upvote_count: c.upvote_count,
            status: c.status,
            created_at: c.created_at,
            address_text: c.address_text,
            ward_name: c.ward_name,
            category_id: c.category_id,
            assigned_department: c.assigned_department,
          };
        })
        .filter(Boolean) as MappedComplaint[];

      setAllComplaints(mapped);
      setVisibleComplaints(applyFilter(mapped, lastCenterRef.current, lastRadiusRef.current));
      
      if (typeof window !== "undefined") {
        localStorage.setItem(localCacheKey, JSON.stringify(mapped));
      }

      await loadCitizenUpvotes(mapped.map((item) => item.id));
      setError(null);
      setLoading(false);
    } catch (err) {
      if (!hasLocalData) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error occurred";
        setError(errorMsg || "Failed to load complaints");
      }
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchComplaints();
    setupRealtimeSubscription();

    return () => {
      unsubscribeFromRealtime();
    };
  }, []);


  function setupRealtimeSubscription() {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user?.id) return;
      userIdRef.current = session.user.id;

      const channel = supabase
        .channel("public:complaints", {
          config: { broadcast: { self: true } },
        })
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "complaints",
          },
          (payload: RealtimePostgresChangesPayload<Tables<"complaints">>) => {
            handleRealtimeEvent(payload);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "upvotes",
          },
          () => {
            void fetchComplaints();
          }
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR") {
            console.log("Realtime channel error - retrying in 5s");
            setTimeout(setupRealtimeSubscription, 5000);
          }
        });

      channelRef.current = channel;
    });
  }

  function unsubscribeFromRealtime() {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }

  function handleRealtimeEvent(payload: RealtimePostgresChangesPayload<Tables<"complaints">>) {
    const eventType = payload.eventType;

    if (eventType === "INSERT" || eventType === "UPDATE") {
      const newData = payload.new as Tables<"complaints">;

      // Skip own tickets
      if (newData.citizen_id === userIdRef.current) {
        // Remove own ticket if it exists
        if (eventType === "INSERT") {
          setAllComplaints((prev) => prev.filter((c) => c.id !== newData.id));
        }
        return;
      }

      const pos = parseLocation(newData.location);
      if (!pos) return;

      const normalizedSeverity = normalizeSeverity(newData.severity);
      const mapped: MappedComplaint = {
        id: newData.id,
        ticket_id: newData.ticket_id,
        title: newData.title,
        description: newData.description,
        // Keep realtime updates aligned with generated severity by default.
        severity: normalizedSeverity,
        effective_severity: normalizedSeverity,
        lat: pos.lat,
        lng: pos.lng,
        photo_urls: newData.photo_urls,
        upvote_count: newData.upvote_count,
        status: newData.status,
        created_at: newData.created_at,
        address_text: newData.address_text,
        ward_name: newData.ward_name,
        category_id: newData.category_id,
        assigned_department: newData.assigned_department,
      };

      setAllComplaints((prev) => {
        const existingIndex = prev.findIndex((c) => c.id === mapped.id);
        const updated = existingIndex >= 0
          ? [...prev.slice(0, existingIndex), mapped, ...prev.slice(existingIndex + 1)]
          : [...prev, mapped];
        // Re-apply filter after update
        setVisibleComplaints(applyFilter(updated, lastCenterRef.current, lastRadiusRef.current));
        return updated;
      });
    } else if (eventType === "DELETE") {
      const oldData = payload.old as Tables<"complaints">;
      setAllComplaints((prev) => {
        const updated = prev.filter((c) => c.id !== oldData.id);
        // Re-apply filter after delete
        setVisibleComplaints(applyFilter(updated, lastCenterRef.current, lastRadiusRef.current));
        return updated;
      });
    }
  }

  const updateRadius = useCallback(
    (center: GeoPoint, radiusMeters: number) => {
      // Clamp radius to max 2km
      const clampedRadius = Math.min(radiusMeters, 2000);
      lastCenterRef.current = center;
      lastRadiusRef.current = clampedRadius;
      setVisibleComplaints(applyFilter(allComplaints, center, clampedRadius));
    },
    [allComplaints]
  );

  async function handleUpvote(id: string) {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    const userId = session?.user?.id;
    const token = session?.access_token ?? null;
    if (sessionError || !token || !userId) {
      setError("Please sign in to upvote tickets");
      return;
    }

    const isUpvoted = hasUpvoted.has(id);
    const target = allComplaints.find(c => c.id === id);
    if (!target) return;

    try {
      // Optimistic UI updates
      setHasUpvoted((prev) => {
        const next = new Set(prev);
        if (isUpvoted) next.delete(id); else next.add(id);
        return next;
      });

      const updateCount = (c: MappedComplaint) => {
        if (c.id !== id) return c;
        const nextCount = isUpvoted ? Math.max(0, (c.upvote_count ?? 1) - 1) : (c.upvote_count ?? 0) + 1;
        return { ...c, upvote_count: nextCount };
      };

      setAllComplaints((prev) => prev.map(updateCount));
      setVisibleComplaints((prev) => prev.map(updateCount));

      // Sync with DB via centralized API
      const response = await fetch('/api/complaints', {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          complaint_id: id, 
          action: isUpvoted ? 'downvote' : 'upvote' 
        })
      });
      
      if (!response.ok) throw new Error("Failed to sync upvote with API");
      setError(null);
    } catch (err: any) {
      console.error("Upvote persistence failed:", err);
      const msg = err?.message || "Check your internet or permissions.";
      setError(`Upvote failed: ${msg}`);
      
      // Immediate local rollback
      const wasUpvoted = !hasUpvoted.has(id); // Since we already toggled it
      if (wasUpvoted) {
          // Re-add if we tried to delete
          setHasUpvoted((prev) => new Set([...prev, id]));
      } else {
          // Remove if we tried to add
          setHasUpvoted((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
      }
      
      // Final sync with server truth
      await fetchComplaints();
    }
  }

  return {
    allComplaints,
    visibleComplaints,
    hasUpvoted,
    loading,
    error,
    updateRadius,
    handleUpvote,
  };
}
