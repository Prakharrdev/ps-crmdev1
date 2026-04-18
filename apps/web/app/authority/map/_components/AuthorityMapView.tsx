// apps/web/app/authority/map/_components/AuthorityMapView.tsx

"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
} from "react-leaflet"
import dynamic from "next/dynamic"
import {
  ChevronDown,
  CheckCheck,
  Flame,
  Layers,
  Loader2,
  MapPin,
  X,
  UserCheck,
} from "lucide-react"
import { supabase } from "@/src/lib/supabase"
import { useTheme } from "@/components/ThemeProvider"
import { getMapTileLayerConfig } from "@/lib/map-tiles"

// Dynamically import MarkerClusterGroup with no SSR
const MarkerClusterGroup = dynamic(
  () =>
    import("react-leaflet-markercluster").then(mod => {
      // Handle both default and named exports
      return mod.default ?? (mod as any).MarkerClusterGroup ?? mod
    }),
  { ssr: false }
) as React.ComponentType<{ children: React.ReactNode }>

// ─── Types ────────────────────────────────────────────────────────────────────

type ComplaintStatus =
  | "submitted"
  | "under_review"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "rejected"
  | "escalated"
  | "reopened"
  | "pending_closure"
  | "spam"

type SeverityLevel = "L1" | "L2" | "L3" | "L4"

type MapTicket = {
  id: string
  ticket_id: string
  title: string
  description: string
  status: ComplaintStatus
  effective_severity: SeverityLevel
  sla_breached: boolean
  address_text: string | null
  created_at: string
  upvote_count: number
  assigned_worker_id: string | null
  lat: number
  lng: number
  category: string
}

type WorkerOption = {
  id: string
  full_name: string
  availability: string
}

// ─── Location parser ──────────────────────────────────────────────────────────

function parseEwkbHexPoint(hex: string): { lat: number; lng: number } | null {
  const normalized = hex.trim()
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length < 42) return null
  try {
    const bytes = new Uint8Array(normalized.length / 2)
    for (let i = 0; i < normalized.length; i += 2)
      bytes[i / 2] = parseInt(normalized.slice(i, i + 2), 16)
    const view         = new DataView(bytes.buffer)
    const littleEndian = view.getUint8(0) === 1
    const typeFlags    = view.getUint32(1, littleEndian)
    const hasSrid      = (typeFlags & 0x20000000) !== 0
    if ((typeFlags & 0xff) !== 1) return null
    const offset = hasSrid ? 9 : 5
    if (bytes.byteLength < offset + 16) return null
    const lng = view.getFloat64(offset, littleEndian)
    const lat = view.getFloat64(offset + 8, littleEndian)
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  } catch {
    return null
  }
}

function parseLocation(location: unknown): { lat: number; lng: number } | null {
  if (!location) return null
  if (typeof location === "object") {
    const o = location as Record<string, unknown>
    if (Array.isArray(o.coordinates) && o.coordinates.length >= 2) {
      const lng = Number(o.coordinates[0])
      const lat = Number(o.coordinates[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
    }
    const lat = Number((o.lat ?? o.latitude) as unknown)
    const lng = Number((o.lng ?? o.lon ?? o.longitude) as unknown)
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }
  if (typeof location === "string") {
    const ewkb = parseEwkbHexPoint(location)
    if (ewkb) return ewkb
    const pm = location.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i)
    if (pm) {
      const lng = Number(pm[1])
      const lat = Number(pm[2])
      if (Number.isFinite(lat)) return { lat, lng }
    }
    try {
      return parseLocation(JSON.parse(location))
    } catch {
      return null
    }
  }
  return null
}

// ─── Severity config ──────────────────────────────────────────────────────────

const SEV_COLOR: Record<SeverityLevel, string> = {
  L1: "#60a5fa",
  L2: "#fbbf24",
  L3: "#f97316",
  L4: "#ef4444",
}

const SEV_LABEL: Record<SeverityLevel, string> = {
  L1: "L1 Low",
  L2: "L2 Medium",
  L3: "L3 High",
  L4: "L4 Critical",
}

const SEV_BADGE: Record<SeverityLevel, string> = {
  L1: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  L2: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  L3: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  L4: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
}

const SEV_INTENSITY: Record<SeverityLevel, number> = {
  L1: 0.25,
  L2: 0.5,
  L3: 0.75,
  L4: 1.0,
}

const STATUS_BADGE: Record<ComplaintStatus, string> = {
  submitted:    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  under_review: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  assigned:     "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  in_progress:  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  resolved:     "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  rejected:     "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  escalated:    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  reopened:     "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  pending_closure: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  spam:         "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
}

const STATUS_LABEL: Record<ComplaintStatus, string> = {
  submitted:    "Submitted",
  under_review: "Under Review",
  assigned:     "Assigned",
  in_progress:  "In Progress",
  resolved:     "Resolved",
  rejected:     "Rejected",
  escalated:    "Escalated",
  reopened:     "Reopened",
  pending_closure: "Pending Verification",
  spam:         "Spam",
}

// ─── Heatmap layer ────────────────────────────────────────────────────────────

function HeatmapLayer({ tickets }: { tickets: MapTicket[] }) {
  const map = useMap()

  useEffect(() => {
    if (typeof window === "undefined") return

    let layer: any = null

    // Dynamically import leaflet and leaflet.heat to avoid SSR issues
    const loadHeatmap = async () => {
      try {
        const L = await import("leaflet")
        await import("leaflet.heat")

        layer = (L as any).heatLayer(
          tickets.map(t => [t.lat, t.lng, SEV_INTENSITY[t.effective_severity]]),
          {
            radius: 28,
            blur: 20,
            minOpacity: 0.35,
            gradient: {
              0.25: "#60a5fa",
              0.5:  "#fbbf24",
              0.75: "#f97316",
              1.0:  "#ef4444",
            },
          }
        )
        layer.addTo(map)
      } catch (err) {
        console.warn("Heatmap load failed:", err)
      }
    }

    void loadHeatmap()

    return () => {
      if (layer) {
        try {
          map.removeLayer(layer)
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }, [tickets, map])

  return null
}

// ─── Assign worker dropdown ───────────────────────────────────────────────────

function AssignDropdown({
  ticket,
  workers,
  onAssigned,
}: {
  ticket: MapTicket
  workers: WorkerOption[]
  onAssigned: (ticketId: string, workerId: string) => void
}) {
  const [open,   setOpen]   = useState(false)
  const [chosen, setChosen] = useState("")
  const [saving, setSaving] = useState(false)

  const available = workers.filter(w => w.availability === "available")

  async function confirm() {
    if (!chosen) return
    setSaving(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error("Not authenticated")
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const response = await fetch(`${apiUrl}/api/authority/assign`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          complaint_id: ticket.id,
          worker_id: chosen,
          status: "assigned",
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData?.detail || "Failed to assign worker")
      }

      setOpen(false)
      onAssigned(ticket.id, chosen)
    } catch (err) {
      console.error("[AuthorityMap] Assignment failed:", err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-lg bg-[#4f392e] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#b4725a] transition-colors"
      >
        <UserCheck size={12} />
        Assign Worker
        <ChevronDown
          size={10}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 right-0 z-[9999] w-56 rounded-xl border border-gray-100 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
          <div className="max-h-44 overflow-y-auto p-2 space-y-1">
            {available.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-gray-400">
                No workers available
              </p>
            ) : (
              available.map(w => (
                <label
                  key={w.id}
                  className={`flex items-center gap-2 rounded-lg px-2 py-2 cursor-pointer transition-colors ${
                    chosen === w.id
                      ? "bg-[#b4725a]/10"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <input
                    type="radio"
                    name={`assign-${ticket.id}`}
                    value={w.id}
                    checked={chosen === w.id}
                    onChange={() => setChosen(w.id)}
                    className="accent-[#b4725a]"
                  />
                  <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                    {w.full_name}
                  </span>
                </label>
              ))
            )}
          </div>

          {available.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-700 p-2">
              <button
                onClick={confirm}
                disabled={!chosen || saving}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#4f392e] py-1.5 text-xs font-semibold text-white hover:bg-[#b4725a] disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <CheckCheck size={11} />
                )}
                {saving ? "Assigning…" : "Confirm"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Detail sidebar ───────────────────────────────────────────────────────────

function TicketDetailPanel({
  ticket,
  workers,
  onClose,
  onAssigned,
}: {
  ticket: MapTicket
  workers: WorkerOption[]
  onClose: () => void
  onAssigned: (id: string, workerId: string) => void
}) {
  const canAssign =
    !ticket.assigned_worker_id &&
    (ticket.status === "submitted" || ticket.status === "under_review")

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <div className="flex-1 pr-2">
          <div className="flex flex-wrap gap-1.5 mb-2">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SEV_BADGE[ticket.effective_severity]}`}
            >
              {SEV_LABEL[ticket.effective_severity]}
            </span>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[ticket.status]}`}
            >
              {STATUS_LABEL[ticket.status]}
            </span>
            {ticket.sla_breached && (
              <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600 dark:bg-red-900/30 dark:text-red-400">
                SLA Breached
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-snug">
            {ticket.title}
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
            Ticket ID
          </p>
          <p className="font-mono text-xs text-gray-600 dark:text-gray-400">
            {ticket.ticket_id}
          </p>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
            Category
          </p>
          <p className="text-sm text-gray-800 dark:text-gray-200">{ticket.category}</p>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
            Description
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-4">
            {ticket.description}
          </p>
        </div>

        {ticket.address_text && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
              Location
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1">
              <MapPin size={11} className="mt-0.5 flex-shrink-0 text-[#b4725a]" />
              {ticket.address_text}
            </p>
          </div>
        )}

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
            Coordinates
          </p>
          <p className="font-mono text-xs text-gray-500">
            {ticket.lat.toFixed(5)}, {ticket.lng.toFixed(5)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
              Upvotes
            </p>
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
              {ticket.upvote_count}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
              Reported
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {new Date(ticket.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "2-digit",
              })}
            </p>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
            Assigned Worker
          </p>
          <p className="text-sm text-gray-800 dark:text-gray-200">
            {ticket.assigned_worker_id ? (
              <span className="text-green-600 dark:text-green-400 font-medium">
                Assigned
              </span>
            ) : (
              <span className="text-orange-500">Unassigned</span>
            )}
          </p>
        </div>
      </div>

      {/* Footer — assign action */}
      {canAssign && (
        <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <AssignDropdown
            ticket={ticket}
            workers={workers}
            onAssigned={onAssigned}
          />
        </div>
      )}
    </div>
  )
}

// ─── Filter options ───────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: ComplaintStatus | "all"; label: string }[] = [
  { value: "all",          label: "All Status" },
  { value: "submitted",    label: "Submitted" },
  { value: "under_review", label: "Under Review" },
  { value: "assigned",     label: "Assigned" },
  { value: "in_progress",  label: "In Progress" },
  { value: "escalated",    label: "Escalated" },
  { value: "reopened",     label: "Reopened" },
  { value: "spam",         label: "Spam" },
]

const SEV_OPTIONS: { value: SeverityLevel | "all"; label: string }[] = [
  { value: "all", label: "All Severity" },
  { value: "L1",  label: "L1 Low" },
  { value: "L2",  label: "L2 Medium" },
  { value: "L3",  label: "L3 High" },
  { value: "L4",  label: "L4 Critical" },
]

// ─── Main component ───────────────────────────────────────────────────────────

export default function AuthorityMapView({ highQuality = true }: { highQuality?: boolean }) {
  const { theme } = useTheme()
  const [leafletLib,     setLeafletLib]     = useState<any>(null)
  const [tickets,        setTickets]        = useState<MapTicket[]>([])
  const [workers,        setWorkers]        = useState<WorkerOption[]>([])
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState<string | null>(null)
  const [showHeatmap,    setShowHeatmap]    = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<MapTicket | null>(null)
  const [statusFilter,   setStatusFilter]   = useState<ComplaintStatus | "all">("all")
  const [sevFilter,      setSevFilter]      = useState<SeverityLevel | "all">("all")
  const [department,     setDepartment]     = useState("")
  const tileConfig = useMemo(
    () => getMapTileLayerConfig({ theme, highQuality }),
    [highQuality, theme]
  )

  // ── Init Leaflet ─────────────────────────────────────────────────────────

  useEffect(() => {
    import("leaflet").then(L => {
      // Fix default marker icon paths broken by webpack
      const iconDefault = L.Icon.Default.prototype as any
      delete iconDefault._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      })
      setLeafletLib(L)
    })

    // Load markercluster CSS safely
    import("leaflet/dist/leaflet.css").catch(() => {})
  }, [])

  // ── Fetch data ───────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser()
    const uid = authData?.user?.id
    if (!uid) {
      setError("Not authenticated.")
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("department")
      .eq("id", uid)
      .maybeSingle()

    const dept = profile?.department ?? ""
    setDepartment(dept)

    const [{ data: raw, error: cErr }, { data: workerRows }] = await Promise.all([
      supabase
        .from("complaints")
        .select(
          "id, ticket_id, title, description, status, effective_severity, sla_breached, " +
          "address_text, created_at, upvote_count, assigned_worker_id, location, categories(name)"
        )
        .eq("assigned_officer_id", uid)
        .neq("status", "rejected"),

      supabase
        .from("worker_profiles")
        .select("worker_id, availability, profiles(full_name)")
        .eq("department", dept),
    ])

    if (cErr) {
      setError("Failed to load complaints.")
      setLoading(false)
      return
    }

    const mapped: MapTicket[] = (raw ?? [])
      .map((c: any) => {
        const coords = parseLocation(c.location)
        if (!coords) return null
        return {
          id:                 c.id,
          ticket_id:          c.ticket_id,
          title:              c.title,
          description:        c.description ?? "",
          status:             c.status as ComplaintStatus,
          effective_severity: c.effective_severity as SeverityLevel,
          sla_breached:       c.sla_breached ?? false,
          address_text:       c.address_text,
          created_at:         c.created_at,
          upvote_count:       c.upvote_count ?? 0,
          assigned_worker_id: c.assigned_worker_id,
          lat:                coords.lat,
          lng:                coords.lng,
          category:           c.categories?.name ?? "—",
        } satisfies MapTicket
      })
      .filter((t): t is MapTicket => t !== null)

    setTickets(mapped)
    setWorkers(
      (workerRows ?? []).map((w: any) => ({
        id:           w.worker_id,
        full_name:    w.profiles?.full_name ?? "Unknown",
        availability: w.availability,
      }))
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    void fetchData()
    const id = window.setInterval(fetchData, 30_000)
    return () => window.clearInterval(id)
  }, [fetchData])

  // ── Filtered tickets ─────────────────────────────────────────────────────

  const visible = tickets.filter(t => {
    if (statusFilter !== "all" && t.status             !== statusFilter) return false
    if (sevFilter    !== "all" && t.effective_severity !== sevFilter)    return false
    return true
  })

  // ── Severity icon ────────────────────────────────────────────────────────

  function getSevIcon(sev: SeverityLevel, L: any, isSelected: boolean) {
    const color = SEV_COLOR[sev]
    const size  = isSelected ? 22 : 16
    return new L.DivIcon({
      html: `<div style="
        background:${color};
        width:${size}px;height:${size}px;
        border-radius:50%;
        border:2.5px solid white;
        box-shadow:0 0 ${isSelected ? 10 : 5}px ${color}99;
        transition:all .15s;
      "></div>`,
      className:  "",
      iconSize:   [size, size],
      iconAnchor: [size / 2, size / 2],
    })
  }

  function handleAssigned(ticketId: string, workerId: string) {
    setTickets(prev =>
      prev.map(t =>
        t.id === ticketId
          ? { ...t, assigned_worker_id: workerId, status: "assigned" as ComplaintStatus }
          : t
      )
    )
    setSelectedTicket(prev =>
      prev?.id === ticketId
        ? { ...prev, assigned_worker_id: workerId, status: "assigned" as ComplaintStatus }
        : prev
    )
  }

  // ── Loading / error states ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-120px)] items-center justify-center rounded-2xl border border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="text-center">
          <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-[#b4725a] border-t-transparent" />
          <p className="text-sm text-gray-400">Loading map data…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        {error}
      </div>
    )
  }

  const mapCenter: [number, number] =
    visible.length > 0
      ? [visible[0].lat, visible[0].lng]
      : [28.6139, 77.209] // default: New Delhi

  return (
    <div className="flex h-[calc(100vh-88px)] flex-col gap-0 overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-950">

      {/* ── Filter / control bar ── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3 dark:border-gray-800">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Map View</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {visible.length} of {tickets.length} tickets · {department || "All Dept."}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Status filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as ComplaintStatus | "all")}
              className="appearance-none rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-3 pr-7 text-xs font-medium text-gray-700 focus:outline-none focus:border-[#b4725a] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={10}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </div>

          {/* Severity filter */}
          <div className="relative">
            <select
              value={sevFilter}
              onChange={e => setSevFilter(e.target.value as SeverityLevel | "all")}
              className="appearance-none rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-3 pr-7 text-xs font-medium text-gray-700 focus:outline-none focus:border-[#b4725a] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              {SEV_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={10}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </div>

          {/* Heatmap toggle */}
          <button
            onClick={() => setShowHeatmap(true)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              showHeatmap
                ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-900/20 dark:text-orange-400"
                : "border-gray-200 bg-gray-50 text-gray-600 hover:border-orange-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
            }`}
          >
            <Flame size={12} />
            Heatmap
          </button>

          {/* Markers toggle */}
          <button
            onClick={() => setShowHeatmap(false)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              !showHeatmap
                ? "border-[#b4725a] bg-[#b4725a]/10 text-[#b4725a]"
                : "border-gray-200 bg-gray-50 text-gray-600 hover:border-[#b4725a] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
            }`}
          >
            <Layers size={12} />
            Markers
          </button>
        </div>
      </div>

      {/* ── Map + side panel ── */}
      <div className="relative flex flex-1 overflow-hidden">
        <div
          className={`relative flex-1 transition-all duration-300 ${
            selectedTicket ? "mr-[320px]" : ""
          }`}
        >
          {/* Only render MapContainer once Leaflet is loaded */}
          {leafletLib && (
            <MapContainer
              key={mapCenter.join(",")}
              center={mapCenter}
              zoom={12}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                attribution={tileConfig.attribution}
                url={tileConfig.url}
                detectRetina={tileConfig.detectRetina}
                maxNativeZoom={tileConfig.maxNativeZoom}
                subdomains={tileConfig.subdomains}
              />

              {showHeatmap && <HeatmapLayer tickets={visible} />}

              {!showHeatmap && (
                <MarkerClusterGroup>
                  {visible.map(t => (
                    <Marker
                      key={t.id}
                      position={[t.lat, t.lng]}
                      icon={getSevIcon(
                        t.effective_severity,
                        leafletLib,
                        selectedTicket?.id === t.id
                      )}
                      eventHandlers={{ click: () => setSelectedTicket(t) }}
                    />
                  ))}
                </MarkerClusterGroup>
              )}
            </MapContainer>
          )}

          {/* Legend */}
          <div className="absolute bottom-4 left-4 z-[1000] rounded-xl border border-gray-100 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Severity
            </p>
            {(["L1", "L2", "L3", "L4"] as SeverityLevel[]).map(s => (
              <div key={s} className="flex items-center gap-1.5 mb-1">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: SEV_COLOR[s] }}
                />
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {SEV_LABEL[s]}
                </span>
              </div>
            ))}
          </div>

          {/* No-results notice */}
          {tickets.length > 0 && visible.length === 0 && (
            <div className="absolute left-1/2 top-6 z-[1000] -translate-x-1/2 rounded-xl bg-gray-900/90 px-4 py-2 text-xs text-white">
              No tickets match current filters
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedTicket && (
          <div className="absolute right-0 top-0 z-10 h-full w-[320px] overflow-hidden border-l border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-950">
            <TicketDetailPanel
              ticket={selectedTicket}
              workers={workers}
              onClose={() => setSelectedTicket(null)}
              onAssigned={handleAssigned}
            />
          </div>
        )}
      </div>
    </div>
  )
}
