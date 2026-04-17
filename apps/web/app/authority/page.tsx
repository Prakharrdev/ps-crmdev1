// apps/web/app/authority/page.tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/src/lib/supabase"
import {
  buildDayBuckets,
  buildSixMonthBuckets,
  computeStats,
  dayLabel,
  getUrgentTickets,
  monthLabel,
  type AuthorityComplaintRow,
  type DashboardStats,
  type TrendPoint,
  type WorkerOption,
} from "./_components/dashboard-types"

import AuthorityStatsCards      from "./_components/AuthorityStatsCards"
import AuthorityTrendChart      from "./_components/AuthorityTrendChart"
import AuthorityStatusBreakdown from "./_components/AuthorityStatusBreakdown"
import AuthorityRecentTickets   from "./_components/AuthorityRecentTickets"
import AuthorityUrgentTickets   from "./_components/AuthorityUrgentTickets"

const CACHE_KEY = "authority_dashboard_cache"

type DashboardPayload = {
  source?: string
  department: string
  complaints: AuthorityComplaintRow[]
  trendRows: { status: string; created_at: string; resolved_at: string | null }[]
  workers: {
    worker_id: string
    availability: string
    department: string
    profiles: { full_name: string } | { full_name: string }[] | null
  }[]
}

/**
 * Build all four trend granularities from raw complaint + trend data.
 * Keeps locale-dependent bucketing (en-IN) on the frontend.
 */
function buildAllTrends(
  complaints: AuthorityComplaintRow[],
  trendRows: { status: string; created_at: string; resolved_at: string | null }[],
) {
  const now = new Date()
  const dayCutoff = new Date(); dayCutoff.setHours(0, 0, 0, 0)
  const weekCutoff = new Date(); weekCutoff.setDate(weekCutoff.getDate() - 6); weekCutoff.setHours(0, 0, 0, 0)
  const last30Cutoff = new Date(); last30Cutoff.setDate(last30Cutoff.getDate() - 29); last30Cutoff.setHours(0, 0, 0, 0)

  // Day trend (today, hour-by-hour)
  const hourBuckets: Record<string, Omit<TrendPoint, "label">> = {}
  for (let h = 0; h < 24; h++) {
    const lbl = `${String(h).padStart(2, "0")}:00`
    hourBuckets[lbl] = { submitted: 0, resolved: 0, in_progress: 0, assigned: 0 }
  }
  for (const c of complaints) {
    const d = new Date(c.created_at)
    if (d >= dayCutoff) {
      const lbl = `${String(d.getHours()).padStart(2, "0")}:00`
      if (hourBuckets[lbl]) {
        hourBuckets[lbl].submitted++
        if (c.status === "assigned")    hourBuckets[lbl].assigned++
        if (c.status === "in_progress") hourBuckets[lbl].in_progress++
        if (c.status === "resolved" && !c.is_spam) hourBuckets[lbl].resolved++
      }
    }
  }
  const dayPoints: TrendPoint[] = Object.entries(hourBuckets).map(([label, v]) => ({ label, ...v }))

  // Week trend (last 7 days)
  const dBuckets = buildDayBuckets(7)
  for (const c of complaints) {
    const d = new Date(c.created_at)
    if (d >= weekCutoff) {
      const dk = dayLabel(d)
      if (dBuckets[dk]) {
        dBuckets[dk].submitted++
        if (c.status === "assigned")    dBuckets[dk].assigned++
        if (c.status === "in_progress") dBuckets[dk].in_progress++
        if (c.status === "resolved" && !c.is_spam) dBuckets[dk].resolved++
      }
    }
  }
  const weekPoints: TrendPoint[] = Object.entries(dBuckets).map(([label, v]) => ({ label, ...v }))

  // Last 30 days trend
  const last30Buckets: Record<string, Omit<TrendPoint, "label">> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const lbl = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    last30Buckets[lbl] = { submitted: 0, resolved: 0, in_progress: 0, assigned: 0 }
  }
  for (const c of complaints) {
    const d = new Date(c.created_at)
    if (d >= last30Cutoff) {
      const lbl = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
      if (last30Buckets[lbl]) {
        last30Buckets[lbl].submitted++
        if (c.status === "assigned")    last30Buckets[lbl].assigned++
        if (c.status === "in_progress") last30Buckets[lbl].in_progress++
        if (c.status === "resolved" && !c.is_spam) last30Buckets[lbl].resolved++
      }
    }
  }
  const last30Points: TrendPoint[] = Object.entries(last30Buckets).map(([label, v]) => ({ label, ...v }))

  // Month trend (6 months)
  const mBuckets = buildSixMonthBuckets()
  for (const r of trendRows as any[]) {
    const mk = monthLabel(new Date(r.created_at))
    if (mBuckets[mk]) {
      mBuckets[mk].submitted++
      if (r.status === "assigned")    mBuckets[mk].assigned++
      if (r.status === "in_progress") mBuckets[mk].in_progress++
      // For trendRows from backend, we need is_spam there too if we want to filter it correctly.
      // Assuming trendRows now includes is_spam via the updated TREND_SELECT.
      if (r.status === "resolved" && r.resolved_at && !r.is_spam) {
        const rk = monthLabel(new Date(r.resolved_at))
        if (mBuckets[rk]) mBuckets[rk].resolved++
      }
    }
  }
  const monthPoints: TrendPoint[] = Object.entries(mBuckets).map(([label, v]) => ({ label, ...v }))

  return { day: dayPoints, week: weekPoints, last30: last30Points, month: monthPoints }
}

/** Transform raw API payload into UI state */
function transformPayload(payload: DashboardPayload) {
  const complaints = (payload.complaints ?? []) as AuthorityComplaintRow[]
  const trendRows = payload.trendRows ?? []
  const department = payload.department ?? ""

  const mappedWorkers: WorkerOption[] = (payload.workers ?? []).map((w) => ({
    id:           w.worker_id,
    full_name:    (Array.isArray(w.profiles) ? w.profiles[0] : w.profiles)?.full_name ?? "Unknown",
    availability: w.availability ?? "inactive",
    department:   w.department ?? department,
  }))

  const allTrend = buildAllTrends(complaints, trendRows)
  const stats = computeStats(complaints)

  return { complaints, workers: mappedWorkers, stats, allTrend, department }
}

// Cache initialization moved to useEffect to avoid hydration mismatches

export default function AuthorityDashboardPage() {
  const [complaints,  setComplaints]  = useState<AuthorityComplaintRow[]>([])
  const [workers,     setWorkers]     = useState<WorkerOption[]>([])
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([])
  const [allTrend,    setAllTrend]    = useState<{
    day:   TrendPoint[]
    week:  TrendPoint[]
    last30: TrendPoint[]
    month: TrendPoint[]
  }>({ day: [], week: [], last30: [], month: [] })
  const [stats,       setStats]       = useState<DashboardStats>({
    total: 0, pendingAction: 0, inProgress: 0, resolvedThisMonth: 0, slaBreached: 0,
  })
  const [department,  setDepartment]  = useState("")
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)

  const applyPayload = useCallback((payload: DashboardPayload) => {
    const result = transformPayload(payload)
    setComplaints(result.complaints)
    setWorkers(result.workers)
    setStats(result.stats)
    setAllTrend(result.allTrend)
    setTrendPoints(result.allTrend.week)
    setDepartment(result.department)
  }, [])

  const load = useCallback(async () => {
    setError(null)

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session?.access_token) {
      setError("Not authenticated.")
      setLoading(false)
      return
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const response = await fetch(`${apiUrl}/api/authority/dashboard`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      const payload = (await response.json().catch(() => null)) as DashboardPayload | null

      if (!response.ok || !payload) {
        setError("Failed to load dashboard data")
        setLoading(false)
        return
      }

      applyPayload(payload)

      // Persist to localStorage for instant load next time
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)) } catch {}
    } catch (err) {
      console.error("Authority dashboard fetch error:", err)
      setError("Failed to load dashboard data")
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 1. Instant UI: Load from cache (client-side only to avoid hydration mismatch)
  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached)
        applyPayload(parsed)
        setLoading(false)
      }
    } catch (err) {
      console.warn("Outdated or malformed dashboard cache detected, clearing:", err)
      try { localStorage.removeItem(CACHE_KEY) } catch {}
    }
  }, [applyPayload])

  // 2. Fresh fetch
  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!department) return
    const ch = supabase
      .channel("authority-dashboard-rt")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "complaints",
        filter: `assigned_department=eq.${department}`
      }, () => void load())
      .on("postgres_changes", {
        event: "*", schema: "public", table: "worker_profiles",
        filter: `department=eq.${department}`
      }, () => void load())
      .on("postgres_changes", {
        event: "*", schema: "public", table: "upvotes"
      }, () => void load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load, department])

  const urgentTickets = getUrgentTickets(complaints)

  return (
    <div className="space-y-4">
      <AuthorityStatsCards stats={stats} loading={loading} error={error} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <AuthorityTrendChart
            allTrend={allTrend}
            department={department}
            loading={loading}
          />
        </div>
        <AuthorityStatusBreakdown complaints={complaints} loading={loading} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <AuthorityRecentTickets
            complaints={complaints}
            workers={workers}
            loading={loading}
            error={error}
            onRefresh={load}
          />
        </div>
        <AuthorityUrgentTickets tickets={urgentTickets} loading={loading} error={error} />
      </div>
    </div>
  )
}
