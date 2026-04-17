// apps/web/app/authority/track/page.tsx
"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { supabase } from "@/src/lib/supabase"
import { AssignDropdown, ComplaintDetailPanel } from "../_components/ComplaintDetailPanel"
import { getSeverityConfig, getStatusMeta } from "../_components/dashboard-types"

const MapComponent = dynamic(() => import("@/app/MapComponent"), { ssr: false })

type LocalStatus = 
  | "submitted" 
  | "under_review" 
  | "assigned" 
  | "in_progress" 
  | "resolved" 
  | "rejected" 
  | "escalated" 
  | "pending_closure" 
  | "closed" 
  | "spam" 
  | "reopened"

type Sev = string

type Complaint = {
  id: string; 
  ticket_id: string; 
  title: string; 
  status: LocalStatus; 
  is_spam: boolean
  effective_severity: Sev; sla_deadline: string | null
  escalation_level: number; created_at: string; resolved_at: string | null
  address_text: string | null; assigned_worker_id: string | null; upvote_count: number
  categories: { name: string } | null
}
type Worker = { id: string; full_name: string; availability: string; department: string }

const SEV_RANK: Record<string, number> = {
  L4: 4, L3: 3, L2: 2, L1: 1,
  critical: 4, high: 3, medium: 2, low: 1,
}

const TERMINAL_STATUSES: LocalStatus[] = ["resolved", "rejected", "spam", "closed"]
const ALL_STATUSES: LocalStatus[] = [
  "submitted", 
  "under_review", 
  "assigned", 
  "in_progress", 
  "resolved", 
  "escalated", 
  "pending_closure", 
  "reopened", 
  "spam"
]
const SEV_FILTER_OPTIONS = [
  { key: "L4", label: "Critical" },
  { key: "L3", label: "High" },
  { key: "L2", label: "Medium" },
  { key: "L1", label: "Low" },
]

const COMPLAINT_SELECT =
  "id,ticket_id,title,status,is_spam,effective_severity,sla_deadline," +
  "escalation_level,created_at,resolved_at,address_text,assigned_worker_id,upvote_count,categories(name)"

function slaStatus(deadline: string | null, status: LocalStatus): { breached: boolean; text: string; pill: string } {
  if (!deadline) return { breached: false, text: "—", pill: "text-gray-300" }
  if (status === "resolved" || status === "rejected" || status === "spam" || status === "closed") {
    return { breached: false, text: "Met", pill: "bg-emerald-50 text-emerald-600" }
  }
  const diff  = new Date(deadline).getTime() - Date.now()
  const hours = diff / 3_600_000
  const days  = Math.ceil(diff / 86_400_000)
  if (diff < 0) {
    const overH = Math.round(Math.abs(hours))
    return { breached: true, text: overH < 24 ? `${overH}h over` : `${Math.ceil(Math.abs(hours) / 24)}d over`, pill: "bg-red-100 text-red-600 font-bold" }
  }
  if (hours < 4)  return { breached: false, text: `${Math.ceil(hours)}h left`, pill: "bg-orange-100 text-orange-600 font-bold" }
  if (days === 0) return { breached: false, text: "Due today", pill: "bg-orange-100 text-orange-600 font-bold" }
  if (days <= 2)  return { breached: false, text: `${days}d left`, pill: "bg-amber-50 text-amber-600" }
  return              { breached: false, text: `${days}d left`, pill: "bg-gray-100 text-gray-500" }
}

function normaliseSev(v: string): string {
  if (!v) return ""
  const map: Record<string, string> = {
    low: "L1", medium: "L2", med: "L2", high: "L3", critical: "L4", crit: "L4",
    l1: "L1", l2: "L2", l3: "L3", l4: "L4",
  }
  return map[v.toLowerCase().trim()] ?? v
}

const TRACK_CACHE_KEY = "authority_track_cache"

type TrackPayload = {
  source?: string
  department: string
  complaints: Complaint[]
  trendRows?: unknown[]
  workers: {
    worker_id: string
    availability: string
    department: string
    profiles: { full_name: string } | { full_name: string }[] | null
  }[]
}

function transformTrackPayload(payload: TrackPayload) {
  const department = payload.department ?? ""
  const rows = (payload.complaints ?? []) as Complaint[]
  const workerRows: Worker[] = (payload.workers ?? []).map((w) => ({
    id:           w.worker_id,
    full_name:    (Array.isArray(w.profiles) ? w.profiles[0] : w.profiles)?.full_name ?? "Unknown",
    availability: w.availability ?? "inactive",
    department:   w.department ?? department,
  }))
  return { complaints: rows, workers: workerRows, department }
}

function getInitialTrackCache() {
  if (typeof window === "undefined") return null
  try {
    const cached = localStorage.getItem(TRACK_CACHE_KEY)
    if (cached) return transformTrackPayload(JSON.parse(cached))
  } catch {}
  return null
}

export default function TrackPage() {
  const [complaints,   setComplaints]   = useState<Complaint[]>([])
  const [workers,      setWorkers]      = useState<Worker[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [search,       setSearch]       = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sevFilter,    setSevFilter]    = useState("all")
  const [sortBy,       setSortBy]       = useState("latest")
  const [isSortOpen,   setIsSortOpen]   = useState(false)
  const [isStatOpen,   setIsStatOpen]   = useState(false)
  const [isSevOpen,    setIsSevOpen]    = useState(false)
  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [dept,         setDept]         = useState("")
  const [recenterTrigger, setRecenterTrigger] = useState(0)
  const detailRef = useRef<HTMLDivElement>(null)

  async function applyLiveUpvoteCounts(rows: Complaint[]): Promise<Complaint[]> {
    if (rows.length === 0) return rows

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    const token = session?.access_token ?? null
    if (sessionError || !token) {
      return rows.map((row) => ({ ...row, upvote_count: row.upvote_count ?? 0 }))
    }

    const complaintIds = rows.map((row) => row.id)
    const res = await fetch("/api/authority/upvote-counts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ complaintIds }),
      cache: "no-store",
    })

    const payload = (await res.json().catch(() => ({}))) as {
      counts?: Record<string, number>
    }

    if (!res.ok || !payload.counts) {
      return rows.map((row) => ({ ...row, upvote_count: row.upvote_count ?? 0 }))
    }

    return rows.map((row) => ({
      ...row,
      upvote_count: payload.counts?.[row.id] ?? 0,
    }))
  }

  async function fetchData() {
    setError(null)

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session?.access_token) {
      setError("Not logged in")
      setLoading(false)
      return
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const response = await fetch(`${apiUrl}/api/authority/dashboard`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      const payload = (await response.json().catch(() => null)) as TrackPayload | null

      if (!response.ok || !payload) {
        setError("Failed to load complaints")
        setLoading(false)
        return
      }

      const result = transformTrackPayload(payload)

      // Apply live upvote counts (separate enrichment step)
      const enrichedComplaints = await applyLiveUpvoteCounts(result.complaints)

      setComplaints(enrichedComplaints)
      setWorkers(result.workers)
      setDept(result.department)
      setError(null)

      // Persist to localStorage for instant load next time
      try { localStorage.setItem(TRACK_CACHE_KEY, JSON.stringify(payload)) } catch {}
    } catch (err) {
      console.error("Track page fetch error:", err)
      setError("Failed to load complaints data")
    } finally {
      setLoading(false)
    }
  }

  // 1. Instant UI: Load from cache (client-side only to avoid hydration mismatch)
  useEffect(() => {
    try {
      const cached = localStorage.getItem(TRACK_CACHE_KEY)
      if (cached) {
        const result = transformTrackPayload(JSON.parse(cached))
        setComplaints(result.complaints)
        setWorkers(result.workers)
        setDept(result.department)
        setLoading(false)
      }
    } catch {}
  }, [])

  // 2. Fresh fetch
  useEffect(() => {
    void fetchData()
  }, [])

  useEffect(() => {
    if (!dept) return
    const ch = supabase.channel("track-realtime")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "complaints",
        filter: `assigned_department=eq.${dept}`
      }, () => void fetchData())
      .on("postgres_changes", {
        event: "*", schema: "public", table: "upvotes"
      }, () => void fetchData())
      .on("postgres_changes", {
        event: "*", schema: "public", table: "worker_profiles",
        filter: `department=eq.${dept}`
      }, () => void fetchData())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [dept])

  useEffect(() => {
    if (expandedId && detailRef.current) {
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50)
    }
  }, [expandedId])

  const hasWorkers = workers.length > 0

  const filtered = complaints
    .filter(c => {
      const q = search.toLowerCase()
      const matchSearch =
        c.title.toLowerCase().includes(q) ||
        c.ticket_id.toLowerCase().includes(q) ||
        (c.address_text ?? "").toLowerCase().includes(q) ||
        (c.categories?.name ?? "").toLowerCase().includes(q)
      const matchStatus = statusFilter === "all" || c.status === statusFilter
      const matchSev = sevFilter === "all" || normaliseSev(c.effective_severity) === sevFilter
      return matchSearch && matchStatus && matchSev
    })
    .sort((a, b) => {
      if (sortBy === "latest")   return +new Date(b.created_at) - +new Date(a.created_at)
      if (sortBy === "oldest")   return +new Date(a.created_at) - +new Date(b.created_at)
      if (sortBy === "severity") {
        const ra = SEV_RANK[a.effective_severity] ?? SEV_RANK[(a.effective_severity ?? "").toLowerCase()] ?? 0
        const rb = SEV_RANK[b.effective_severity] ?? SEV_RANK[(b.effective_severity ?? "").toLowerCase()] ?? 0
        return rb - ra
      }
      if (sortBy === "upvotes")  return (b.upvote_count ?? 0) - (a.upvote_count ?? 0)
      if (sortBy === "sla") {
        const aLeft = a.sla_deadline ? new Date(a.sla_deadline).getTime() - Date.now() : Infinity
        const bLeft = b.sla_deadline ? new Date(b.sla_deadline).getTime() - Date.now() : Infinity
        return aLeft - bLeft
      }
      return 0
    })

  const expandedComplaint = expandedId ? complaints.find(c => c.id === expandedId) ?? null : null
  const breachedCount = complaints.filter(c =>
    c.sla_deadline && new Date(c.sla_deadline) < new Date() &&
    c.status !== "resolved" && c.status !== "rejected"
  ).length
  const openCount = complaints.filter(c => !TERMINAL_STATUSES.includes(c.status)).length

  function exportCSV() {
    const rows = [
      ["Ticket","Title","Category","Severity","Status","Upvotes","SLA","Created"],
      ...filtered.map(c => {
        const sev = getSeverityConfig(c.effective_severity)
        const sla = slaStatus(c.sla_deadline, c.status)
        return [
          c.ticket_id, c.title, c.categories?.name ?? "",
          sev.label,
          getStatusMeta(c.status).label,
          c.upvote_count ?? 0,
          sla.breached ? `BREACHED (${sla.text})` : sla.text,
          new Date(c.created_at).toLocaleDateString("en-IN"),
        ]
      })
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    a.download = "complaints.csv"; a.click()
  }

  return (
    <div className="space-y-5">

      {/* ── MAP HEADER ──────────────────────────────────────────────────────── */}
      <div className="relative z-30 rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[#2a2a2a] dark:bg-[#161616]">
        <div className="flex flex-col gap-3 bg-gray-50/80 px-3 py-3 sm:px-5 sm:py-3 lg:flex-row lg:items-center lg:justify-between dark:bg-[#1e1e1e]">
          <div className="grid grid-cols-2 gap-2 text-xs font-medium text-gray-600 sm:flex sm:flex-wrap sm:items-center sm:gap-4 sm:text-sm lg:gap-5">
            {(["L1","L2","L3","L4"] as const).map(key => {
              const s = getSeverityConfig(key)
              return (
                <span key={key} className="flex items-center gap-1.5 rounded-md bg-white/70 px-2 py-1 dark:bg-[#2a2a2a] sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end sm:gap-3 lg:flex-nowrap">
            {!loading && (
              <>
                <span className="text-xs text-gray-400">{openCount} open</span>
                {breachedCount > 0 && (
                  <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-600">
                    {breachedCount} SLA breached
                  </span>
                )}
              </>
            )}
            <button
              onClick={() => setRecenterTrigger(v => v + 1)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors sm:w-auto sm:px-4"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10 2a6 6 0 0 0-6 6c0 4.12 4.5 8.96 5.44 9.92a.8.8 0 0 0 1.12 0C11.5 16.96 16 12.12 16 8a6 6 0 0 0-6-6Zm0 8.5A2.5 2.5 0 1 1 10 5a2.5 2.5 0 0 1 0 5.5Z" clipRule="evenodd" />
              </svg>
              Reset View
            </button>
          </div>
        </div>
      </div>

      {/* ── MAP ─────────────────────────────────────────────────────────────── */}
      <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[#2a2a2a] dark:bg-[#161616]">
        <div className="relative z-0 h-[380px] w-full isolate">
          <MapComponent selectedComplaintId={selectedId} recenterTrigger={recenterTrigger} />
        </div>
      </div>

      {/* ── TABLE ───────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-[#eef3f4] p-4 dark:bg-[#1a1a1a]">
        <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Track Complaints</h1>
            {loading && (
              <div className="flex items-center gap-2 rounded-full border border-gray-100 bg-white/80 px-2 py-1 text-[10px] font-medium text-gray-400 shadow-sm backdrop-blur-sm dark:border-[#2a2a2a] dark:bg-[#1a1a1a]/80">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                Syncing...
              </div>
            )}
            {error && (
              <div className="rounded-full border border-red-100 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-600 dark:border-red-900/40 dark:bg-red-900/20">
                Sync error
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {dept ? <span className="font-medium text-gray-600 dark:text-gray-300">{dept}</span> : null}
            {dept && " · "}{complaints.length} tickets total
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-gray-500">
            {loading ? "Loading…" : error ? error : `Showing ${filtered.length} of ${complaints.length}`}
            {!loading && !hasWorkers && (
              <span className="ml-2 text-amber-500">· No workers in this department</span>
            )}
          </p>
          <button onClick={exportCSV}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-300">
            Export CSV
          </button>
        </div>

        {/* Filters row */}
        <div className="mb-3 flex flex-wrap gap-2">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search ticket, title, address…"
            className="flex-1 min-w-44 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#b4725a] dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-200"
          />

          {/* Sort */}
          <div className="relative">
            <button onClick={() => { setIsSortOpen(o => !o); setIsStatOpen(false); setIsSevOpen(false) }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-300">
              {{ latest:"Latest", oldest:"Oldest", severity:"Severity", upvotes:"Upvoted", sla:"SLA" }[sortBy] ?? "Sort"}
              <span className="text-[10px] opacity-60">▼</span>
            </button>
            <div className={`absolute left-0 top-full z-50 mt-1 w-38 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-[#2a2a2a] dark:bg-[#1e1e1e] transition-all duration-200 ${isSortOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"}`}>
              {[["latest","Latest first"],["oldest","Oldest first"],["severity","By severity"],["upvotes","Most upvoted"],["sla","Urgent SLA first"]].map(([v,l]) => (
                <button key={v} onClick={() => { setSortBy(v); setIsSortOpen(false) }}
                  className={`block w-full px-3 py-2 text-left text-xs hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors ${sortBy===v?"font-semibold text-[#b4725a]":"text-gray-700 dark:text-gray-300"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Severity filter */}
          <div className="relative">
            <button onClick={() => { setIsSevOpen(o => !o); setIsStatOpen(false); setIsSortOpen(false) }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {sevFilter === "all" ? "All severity" : getSeverityConfig(sevFilter).label}
              <span className="text-[10px] opacity-60">▼</span>
            </button>
            <div className={`absolute left-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800 transition-all duration-200 ${isSevOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"}`}>
              <button onClick={() => { setSevFilter("all"); setIsSevOpen(false) }}
                className={`block w-full px-3 py-2 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-700 ${sevFilter==="all"?"font-semibold text-[#b4725a]":"text-gray-700 dark:text-gray-300"}`}>
                All severity
              </button>
              {SEV_FILTER_OPTIONS.map(({ key }) => {
                const sc = getSeverityConfig(key)
                return (
                  <button key={key} onClick={() => { setSevFilter(key); setIsSevOpen(false) }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-700">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: sc.color }} />
                    <span style={{ color: sevFilter === key ? sc.color : undefined, fontWeight: sevFilter === key ? 600 : undefined }}>
                      {sc.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Status */}
          <div className="relative">
            <button onClick={() => { setIsStatOpen(o => !o); setIsSortOpen(false); setIsSevOpen(false) }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {statusFilter === "all" ? "All statuses" : getStatusMeta(statusFilter as LocalStatus).label}
              <span className="text-[10px] opacity-60">▼</span>
            </button>
            <div className={`absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800 transition-all duration-200 ${isStatOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"}`}>
              {[["all","All statuses"], ...ALL_STATUSES.map(s => [s, getStatusMeta(s).label])].map(([v,l]) => (
                <button key={v} onClick={() => { setStatusFilter(v); setIsStatOpen(false) }}
                  className={`block w-full px-3 py-2 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${statusFilter===v?"font-semibold text-[#b4725a]":"text-gray-700 dark:text-gray-300"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Compact table */}
        <div className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-900">
          <div className="max-h-[460px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-gradient-to-r from-[#5b3a2e] to-[#8b5e49] text-white">
                <tr>
                  {["Ticket","Title","Severity","Status","↑","SLA","Worker",""] .map(h => (
                    <th key={h} className="px-2.5 py-2 text-left text-[10px] font-semibold tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {loading && complaints.length === 0 ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {[70,160,60,80,35,75,90,55].map((w,j) => (
                        <td key={j} className="px-2.5 py-2"><div className="h-2.5 rounded-md bg-gray-100 dark:bg-gray-800" style={{width:w}}/></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-xs text-gray-400">
                    {loading ? "Syncing tickets..." : (complaints.length === 0 ? "No complaints assigned to your department yet." : "No complaints match your filters.")}
                  </td></tr>
                ) : filtered.map(c => {
                  const sev        = getSeverityConfig(c.effective_severity)
                  const st         = getStatusMeta(c.status)
                  const sla        = slaStatus(c.sla_deadline, c.status)
                  const isExpanded = expandedId === c.id
                  const isSelected = selectedId === c.id

                  const assignedWorkerProfile = c.assigned_worker_id
                    ? workers.find(w => w.id === c.assigned_worker_id) ?? null
                    : null
                  const workerIsValid = !!assignedWorkerProfile
                  const isTerminal   = TERMINAL_STATUSES.includes(c.status)

                  return (
                    <tr key={c.id}
                      onClick={() => setSelectedId(prev => prev === c.id ? null : c.id)}
                      className={`cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60 ${isSelected ? "bg-amber-50/70 dark:bg-amber-900/10" : ""}`}>

                      {/* Ticket ID */}
                      <td className="px-2.5 py-2 font-mono text-[10px] text-gray-400 whitespace-nowrap">{c.ticket_id}</td>

                      {/* Title */}
                      <td className="px-2.5 py-2 max-w-[180px]">
                        <p className="truncate font-medium text-gray-800 dark:text-gray-200">{c.title}</p>
                        {c.categories?.name && <p className="text-[9px] text-gray-400">{c.categories.name}</p>}
                      </td>

                      {/* Severity */}
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                          style={{ background: sev.color + "22", color: sev.color }}
                        >
                          {sev.label}
                        </span>
                        {c.escalation_level > 0 && c.status !== "escalated" && (
                          <span className="ml-1 inline-flex rounded-full bg-purple-50 px-1.5 py-0.5 text-[9px] font-bold text-purple-600">
                            Esc
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.is_spam ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" : st.badge}`}>
                          {c.is_spam ? "SPAM" : st.label}
                        </span>
                      </td>

                      {/* Upvotes */}
                      <td className="px-2.5 py-2 whitespace-nowrap text-[10px]">
                        <span className="font-semibold text-[#b4725a]">▲{c.upvote_count ?? 0}</span>
                      </td>

                      {/* SLA */}
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        {!c.sla_deadline
                          ? <span className="text-[10px] text-gray-300">—</span>
                          : <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] ${sla.pill}`}>{sla.text}</span>}
                      </td>

                      {/* Worker */}
                      <td className="px-2.5 py-2" onClick={e => e.stopPropagation()}>
                        {isTerminal ? (
                          workerIsValid
                            ? <span className="text-[10px] text-gray-500">{assignedWorkerProfile!.full_name}</span>
                            : <span className="text-[10px] text-gray-300">—</span>
                        ) : (
                          <AssignDropdown
                            complaintId={c.id}
                            workers={workers}
                            currentWorkerId={workerIsValid ? c.assigned_worker_id : null}
                            compact
                            onAssigned={fetchData}
                          />
                        )}
                      </td>

                      {/* View button */}
                      <td className="px-2.5 py-2" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setExpandedId(prev => prev === c.id ? null : c.id)}
                          className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors ${isExpanded ? "bg-[#b4725a] text-white" : "border border-gray-200 bg-white text-gray-600 hover:border-[#b4725a] hover:text-[#b4725a] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"}`}>
                          {isExpanded ? "Close" : "View"}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {expandedComplaint && (
          <div ref={detailRef} className="mt-4">
            <ComplaintDetailPanel
              complaint={expandedComplaint as any}
              workers={workers}
              onClose={() => setExpandedId(null)}
              onAssigned={() => { void fetchData(); setExpandedId(null) }}
              inline
            />
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
