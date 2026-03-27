"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Bell,
  CheckCircle2,
  Clock3,
  Flag,
  ShieldCheck,
  Timer,
  TriangleAlert,
} from "lucide-react"
import AdminStatCard from "@/components/admin-dashboard/AdminStatCard"
import { supabase } from "@/src/lib/supabase"

type DashboardStats = {
  totalComplaints: number
  activeComplaints: number
  resolvedComplaints: number
  urgentEscalations: number
  avgResolutionDays: number
  authoritiesActive: number
}

const initialStats: DashboardStats = {
  totalComplaints: 0,
  activeComplaints: 0,
  resolvedComplaints: 0,
  urgentEscalations: 0,
  avgResolutionDays: 0,
  authoritiesActive: 0,
}

const numberFormatter = new Intl.NumberFormat("en-IN")

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

function formatAverageDays(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0.0 Days"
  return `${value.toFixed(1)} Days`
}

function calculateAverageResolutionDays(
  rows: Array<{ created_at: string; resolved_at: string | null }>,
): number {
  const resolvedDurations = rows
    .filter((row) => row.resolved_at)
    .map((row) => {
      const startedAt = new Date(row.created_at).getTime()
      const resolvedAt = new Date(row.resolved_at as string).getTime()
      return (resolvedAt - startedAt) / (1000 * 60 * 60 * 24)
    })
    .filter((days) => Number.isFinite(days) && days >= 0)

  if (resolvedDurations.length === 0) return 0
  const total = resolvedDurations.reduce((sum, days) => sum + days, 0)
  return total / resolvedDurations.length
}

export default function AdminStatsOverview() {
  const [stats, setStats] = useState<DashboardStats>(initialStats)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateTime, setDateTime] = useState<string>("")

  // Stable fetch function — no reactive dependencies, runs only when called
  const fetchStats = useCallback(async () => {
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("No session")

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const res = await fetch(`${apiUrl}/api/admin/dashboard/stats`, {
        headers: { "Authorization": `Bearer ${token}` },
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json()

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { source, ...kpis } = data
      setStats(kpis as DashboardStats)

      // Persist to LocalStorage for instant load next time
      try { localStorage.setItem("admin_dashboard_stats", JSON.stringify(kpis)) } catch {}
    } catch (err) {
      console.error("Fetch stats error:", err)
      setError("Unable to sync latest statistics.")
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // 1. Instant UI: show cached stats immediately
    try {
      const cached = localStorage.getItem("admin_dashboard_stats")
      if (cached) {
        setStats(JSON.parse(cached))
        setLoading(false)
      }
    } catch {}

    // 2. Then fetch fresh data from the API (one single call)
    void fetchStats()

    // 3. Refresh every 60 seconds
    const interval = setInterval(() => void fetchStats(), 60_000)
    return () => clearInterval(interval)
  }, [fetchStats])

  useEffect(() => {
    const updateClock = () => {
      const now = new Date()
      const formatter = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
      setDateTime(formatter.format(now))
    }

    updateClock()
    const clockInterval = setInterval(updateClock, 1000)

    return () => clearInterval(clockInterval)
  }, [])

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:shadow-none">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 dark:border-[#3a3a3a] dark:bg-[#161616] dark:text-gray-300">
              <Clock3 size={16} className="text-gray-600 dark:text-gray-400" />
              <span>{dateTime || "Loading..."}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
              <Bell size={16} />
              <span>waiting for notification</span>
            </div>
          </div>

          <h1 className="text-base font-semibold text-gray-900 md:text-lg dark:text-gray-100">
            National Admin Dashboard | Operational Overview
          </h1>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <AdminStatCard
          label="Total Complaints"
          value={formatNumber(stats.totalComplaints)}
          icon={<Flag size={18} />}
          accentClass="text-rose-700 dark:text-rose-300"
        />
        <AdminStatCard
          label="Active"
          value={formatNumber(stats.activeComplaints)}
          icon={<Timer size={18} />}
          accentClass="text-amber-700 dark:text-amber-300"
        />
        <AdminStatCard
          label="Resolved"
          value={formatNumber(stats.resolvedComplaints)}
          icon={<CheckCircle2 size={18} />}
          accentClass="text-emerald-700 dark:text-emerald-300"
        />
        <AdminStatCard
          label="Urgent Escalations"
          value={formatNumber(stats.urgentEscalations)}
          icon={<TriangleAlert size={18} />}
          accentClass="text-red-700 dark:text-red-300"
        />
        <AdminStatCard
          label="Avg. Res. Time"
          value={formatAverageDays(stats.avgResolutionDays)}
          icon={<Clock3 size={18} />}
          accentClass="text-indigo-700 dark:text-indigo-300"
        />
        <AdminStatCard
          label="Authorities Active"
          value={formatNumber(stats.authoritiesActive)}
          icon={<ShieldCheck size={18} />}
          accentClass="text-green-700 dark:text-green-300"
        />
      </div>

      {loading ? <p className="text-sm text-gray-500 dark:text-gray-400">Loading latest dashboard numbers...</p> : null}
    </section>
  )
}
