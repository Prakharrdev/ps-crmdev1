"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts"
import { supabase } from "@/src/lib/supabase"
import {
  CheckCircle,
  AlertCircle,
  Clock,
  TrendingUp,
  ChevronDown,
  BarChart2,
  Download,
  FileJson,
} from "lucide-react"
import type {
  AuthorityProfileRow,
  ComplaintAssignmentRow,
  WorkerProfileRow,
  CategoryRow,
} from "@/components/admin-authorities/types"

/* ─── colour palette ──────────────────────────────────────────────── */
const GOLD = "#C9A84C"
const GOLD_MUTED = "#9b7d34"
const RED = "#EF4444"
const DARK_CARD = "#1a1a1a"
const DARK_BORDER = "#2a2a2a"


const activeStatuses = ["submitted", "under_review", "assigned", "in_progress", "escalated"] as const
const activeStatusSet = new Set(activeStatuses)

function isActiveStatus(status: ComplaintAssignmentRow["status"]): boolean {
  return activeStatusSet.has(status as (typeof activeStatuses)[number])
}

/* ─── helper: ISO week string eg "2025-W03" ──────────────────────── */
function isoWeek(dateStr: string): string {
  const d = new Date(dateStr)
  const jan4 = new Date(d.getFullYear(), 0, 4)
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000)
  const weekNum = Math.ceil((dayOfYear + jan4.getDay()) / 7)
  return `W${weekNum}`
}

/* ─── small stat card ─────────────────────────────────────────────── */
function StatCard({
  label,
  value,
  sub,
  icon,
  delta,
  color = GOLD,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  delta?: string
  color?: string
}) {
  const pos = delta?.startsWith("+")
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl p-5 min-w-0 bg-white border border-[#d8cfbe] shadow-sm dark:bg-[#1a1a1a] dark:border-[#2a2a2a] dark:shadow-none"
    >
      <div className="flex items-start justify-between">
        <div style={{ color }} className="opacity-80">
          {icon}
        </div>
        <span className="text-gray-400 dark:text-gray-600 text-xs">···</span>
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-bold text-[#27221d] dark:text-white">{value}</span>
          {delta && (
            <span className={`text-xs font-semibold ${pos ? "text-emerald-500 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>{delta}</span>
          )}
        </div>
        {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
      </div>
    </div>
  )
}

/* ─── custom tooltip ──────────────────────────────────────────────── */
function DarkTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl p-3 text-xs shadow-xl bg-white border border-[#d8cfbe] dark:bg-[#222] dark:border-[#2a2a2a]">
      <p className="mb-2 font-semibold text-[#27221d] dark:text-gray-300">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-600 dark:text-gray-400">{p.name}:</span>
          <span className="font-bold text-[#27221d] dark:text-white">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function AdminReportsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [complaints, setComplaints] = useState<ComplaintAssignmentRow[]>([])
  const [profiles, setProfiles] = useState<AuthorityProfileRow[]>([])
  const [workers, setWorkers] = useState<WorkerProfileRow[]>([])
  const [selectedDept, setSelectedDept] = useState<string>("All Departments")
  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false)
  const [deptSearch, setDeptSearch] = useState("")

  /* ─── fetch ───────────────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session?.access_token) {
      setError("You must be logged in as admin")
      setLoading(false)
      return
    }
    const response = await fetch("/api/admin/authorities", {
      method: "GET",
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    })
    const payload = (await response.json().catch(() => null)) as {
      error?: string
      profiles?: AuthorityProfileRow[]
      complaints?: ComplaintAssignmentRow[]
      workers?: WorkerProfileRow[]
      categories?: CategoryRow[]
    } | null
    if (!response.ok || !payload) {
      setError(payload?.error || "Unable to load data")
      setLoading(false)
      return
    }
    if (payload.complaints) setComplaints(payload.complaints)
    if (payload.profiles) setProfiles(payload.profiles)
    if (payload.workers) setWorkers(payload.workers)
    setLoading(false)
  }, [])

  useEffect(() => { void fetchData() }, [fetchData])

  /* ─── unique departments ──────────────────────────────────────── */
  const allDepts = useMemo(() => {
    const s = new Set<string>()
    complaints.forEach((c) => { if (c.assigned_department) s.add(c.assigned_department.trim()) })
    profiles.forEach((p) => { if (p.department) s.add(p.department.trim()) })
    return ["All Departments", ...Array.from(s).sort()]
  }, [complaints, profiles])

  /* ─── top stat cards ──────────────────────────────────────────── */
  const statCards = useMemo(() => {
    const totalResolved = complaints.filter((c) => c.status === "resolved").length
    const totalActive = complaints.filter((c) => isActiveStatus(c.status)).length
    const totalComplaints = complaints.length

    // Avg resolution time across all that have resolved_at
    const resolved = complaints.filter((c) => c.resolved_at)
    const avgDays = resolved.length
      ? resolved.reduce((sum, c) => {
        const ms = new Date(c.resolved_at!).getTime() - new Date(c.created_at).getTime()
        return sum + ms / (86400000)
      }, 0) / resolved.length
      : 0

    return { totalResolved, totalActive, totalComplaints, avgDays }
  }, [complaints])

  /* ─── weekly issues SOLVED line chart ────────────────────────── */
  const weeklyData = useMemo(() => {
    const filtered = complaints.filter((c) => {
      if (!c.resolved_at) return false
      if (selectedDept !== "All Departments" && c.assigned_department?.trim() !== selectedDept) return false
      return true
    })

    // Last 8 weeks
    const now = new Date()
    const weeks: { label: string; start: Date; end: Date }[] = []
    for (let i = 7; i >= 0; i--) {
      const end = new Date(now)
      end.setDate(now.getDate() - i * 7)
      const start = new Date(end)
      start.setDate(end.getDate() - 6)
      weeks.push({ label: isoWeek(end.toISOString()), start, end })
    }

    return weeks.map(({ label, start, end }) => {
      const solved = filtered.filter((c) => {
        const t = new Date(c.resolved_at!).getTime()
        return t >= start.getTime() && t <= end.getTime()
      }).length
      return { week: label, solved }
    })
  }, [complaints, selectedDept])

  /* ─── bar chart: closed vs open by dept ──────────────────────── */
  const deptBarData = useMemo(() => {
    const counts: Record<string, { name: string; resolved: number; active: number }> = {}
    complaints.forEach((c) => {
      const dept = c.assigned_department?.trim() || "Unassigned"
      if (!counts[dept]) counts[dept] = { name: dept, resolved: 0, active: 0 }
      if (c.status === "resolved") counts[dept].resolved++
      else if (isActiveStatus(c.status)) counts[dept].active++
    })
    return Object.values(counts).sort((a, b) => (b.resolved + b.active) - (a.resolved + a.active))
  }, [complaints])

  /* ─── resolution speed table ──────────────────────────────────── */
  const resolutionTable = useMemo(() => {
    const workerMap = Object.fromEntries(workers.map((w) => [w.worker_id, w]))
    const authorityMap: Record<string, { name: string; totalDays: number; count: number }> = {}
    complaints.filter((c) => c.resolved_at && (c.assigned_officer_id || c.assigned_worker_id)).forEach((c) => {
      const id = c.assigned_officer_id || c.assigned_worker_id!
      if (!authorityMap[id]) {
        const profile = profiles.find((p) => p.id === id)
        const worker = workerMap[id]
        const workerName = worker?.profiles?.full_name || worker?.profiles?.email
        authorityMap[id] = {
          name: profile?.full_name || profile?.email || workerName || "Unknown",
          totalDays: 0,
          count: 0,
        }
      }
      const days = (new Date(c.resolved_at!).getTime() - new Date(c.created_at).getTime()) / 86400000
      if (days >= 0 && days < 3650) {
        authorityMap[id].totalDays += days
        authorityMap[id].count++
      }
    })
    return Object.values(authorityMap)
      .filter((a) => a.count > 0)
      .map((a) => ({ name: a.name, avgDays: a.totalDays / a.count }))
      .sort((a, b) => a.avgDays - b.avgDays)
      .slice(0, 8)
  }, [complaints, profiles, workers])

  const maxAvgDays = resolutionTable[resolutionTable.length - 1]?.avgDays || 1

  /* ─── export actions ───────────────────────────────────────────── */
  const generateExportPayload = useCallback(() => {
    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        departmentContext: selectedDept,
      },
      overview: {
        totalComplaints: statCards.totalComplaints,
        totalResolved: statCards.totalResolved,
        totalActive: statCards.totalActive,
        averageResolutionDays: statCards.avgDays,
      },
      weeklyTrend: weeklyData,
      departmentLoad: deptBarData,
      resolutionRanking: resolutionTable,
    }
  }, [selectedDept, statCards, weeklyData, deptBarData, resolutionTable])

  const exportJSON = useCallback(() => {
    const payload = generateExportPayload()
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `admin-reports-${selectedDept.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [generateExportPayload, selectedDept])

  const exportCSV = useCallback(() => {
    const payload = generateExportPayload()
    const sections: string[] = []
    
    sections.push("--- Metadata ---")
    sections.push(`Generated At,${payload.metadata.generatedAt}`)
    sections.push(`Department Context,"${payload.metadata.departmentContext}"`)
    sections.push("\n--- Overview ---")
    sections.push("Total Complaints,Total Resolved,Total Active,Avg Resolution Days")
    sections.push(`${payload.overview.totalComplaints},${payload.overview.totalResolved},${payload.overview.totalActive},${payload.overview.averageResolutionDays.toFixed(2)}`)
    sections.push("\n--- Weekly Trend ---")
    sections.push("Week,Issues Solved")
    payload.weeklyTrend.forEach((w) => sections.push(`${w.week},${w.solved}`))
    sections.push("\n--- Department Load ---")
    sections.push("Department,Resolved,Active")
    payload.departmentLoad.forEach((d) => sections.push(`"${d.name}",${d.resolved},${d.active}`))
    sections.push("\n--- Resolution Ranking ---")
    sections.push("Rank,Authority,Avg Days")
    payload.resolutionRanking.forEach((r, i) => sections.push(`${i + 1},"${r.name}",${r.avgDays.toFixed(2)}`))
    
    const blob = new Blob([sections.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `admin-reports-${selectedDept.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [generateExportPayload, selectedDept])

  /* ─── render ──────────────────────────────────────────────────── */
  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 bg-[#f4efe5] dark:bg-[#111111]">

      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: GOLD }}>Admin Analytics</p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#27221d] dark:text-white">Authority Performance Module</h1>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-900/50 bg-red-900/20 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-800" style={{ borderTopColor: GOLD }} />
        </div>
      ) : (
        <div className="space-y-6">

          {/* Stat cards row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Complaints"
              value={statCards.totalComplaints.toLocaleString()}
              sub="Across all departments"
              icon={<BarChart2 size={22} />}
              color={GOLD}
            />
            <StatCard
              label="Resolved Tickets"
              value={statCards.totalResolved.toLocaleString()}
              sub="Successfully closed"
              icon={<CheckCircle size={22} />}
              color="#10b981"
              delta={`+${statCards.totalResolved}`}
            />
            <StatCard
              label="Active / Open Tickets"
              value={statCards.totalActive.toLocaleString()}
              sub="Awaiting resolution"
              icon={<AlertCircle size={22} />}
              color={RED}
            />
            <StatCard
              label="Avg Resolution Time"
              value={`${statCards.avgDays.toFixed(1)} Days`}
              sub="Across resolved tickets"
              icon={<Clock size={22} />}
              color="#3b82f6"
            />
          </div>

          {/* Row 2: Weekly Solved + Dept bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Weekly Issues Solved line chart */}
            <div className="rounded-2xl p-5 bg-white border border-[#d8cfbe] shadow-sm dark:bg-[#1a1a1a] dark:border-[#2a2a2a] dark:shadow-none">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[#27221d] dark:text-white">Weekly Issues Solved</h2>
                  <p className="text-xs text-gray-500">Last 8 weeks resolved tickets</p>
                </div>
                {/* Department dropdown */}
                <div className="relative">
                  <button
                    onClick={() => { setDeptDropdownOpen((o) => !o); setDeptSearch("") }}
                    className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-[#27221d] dark:text-white transition-colors bg-white border border-[#d8cfbe] dark:bg-[#252525] dark:border-[#2a2a2a]"
                  >
                    <span className="max-w-[120px] truncate">{selectedDept}</span>
                    <ChevronDown size={12} className={`transition-transform ${deptDropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {deptDropdownOpen && (
                    <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-xl shadow-2xl overflow-hidden bg-white border border-[#d8cfbe] dark:bg-[#1e1e1e] dark:border-[#2a2a2a]">
                      {/* Search input */}
                      <div className="p-2 border-b border-[#d8cfbe] dark:border-[#2a2a2a]">
                        <input
                          autoFocus
                          type="text"
                          placeholder="Search department…"
                          value={deptSearch}
                          onChange={(e) => setDeptSearch(e.target.value)}
                          className="w-full rounded-lg px-3 py-1.5 text-xs text-[#27221d] dark:text-white placeholder-gray-400 dark:placeholder-gray-600 outline-none bg-gray-50 border border-[#d8cfbe] dark:bg-[#252525] dark:border-[#2a2a2a]"
                        />
                      </div>
                      {/* Filtered list */}
                      <div className="max-h-56 overflow-y-auto py-1">
                        {allDepts
                          .filter((dept) => dept.toLowerCase().includes(deptSearch.toLowerCase()))
                          .map((dept) => (
                            <button
                              key={dept}
                              onClick={() => { setSelectedDept(dept); setDeptDropdownOpen(false); setDeptSearch("") }}
                              className={`w-full px-4 py-2 text-left text-xs transition-colors hover:bg-gray-50 dark:hover:bg-[#2a2a2a] dark:hover:text-white ${dept === selectedDept ? 'text-[#C9A84C] bg-gray-50 dark:bg-[#252525]' : 'text-gray-600 dark:text-gray-400'}`}
                            >
                              {dept}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" strokeOpacity={0.3} />
                    <XAxis dataKey="week" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <RechartsTooltip content={<DarkTooltip />} />
                    <ReferenceLine y={2} stroke={GOLD_MUTED} strokeDasharray="4 4" label={{ value: "Target", fill: GOLD_MUTED, fontSize: 10 }} />
                    <Line
                      type="monotone"
                      dataKey="solved"
                      name="Issues Solved"
                      stroke={GOLD}
                      strokeWidth={2.5}
                      dot={{ fill: GOLD, r: 4 }}
                      activeDot={{ r: 6, fill: GOLD }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Resolved vs Active by Dept bar chart */}
            <div className="rounded-2xl p-5 bg-white border border-[#d8cfbe] shadow-sm dark:bg-[#1a1a1a] dark:border-[#2a2a2a] dark:shadow-none">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-[#27221d] dark:text-white">Ticket Load by Department</h2>
                <p className="text-xs text-gray-500">Resolved vs active tickets per department</p>
              </div>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptBarData} barSize={16} margin={{ top: 5, right: 10, left: -20, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" strokeOpacity={0.3} vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 10 }} angle={-30} textAnchor="end" interval={0} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <RechartsTooltip content={<DarkTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: "11px", color: "#9ca3af", paddingTop: "8px" }}
                      iconType="circle"
                      iconSize={8}
                    />
                    <Bar dataKey="resolved" name="Resolved" fill={GOLD} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="active" name="Active" fill={RED} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Row 3: Average resolution speed table */}
          <div className="rounded-2xl p-5 bg-white border border-[#d8cfbe] shadow-sm dark:bg-[#1a1a1a] dark:border-[#2a2a2a] dark:shadow-none">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#27221d] dark:text-white">Average Resolution Speed</h2>
                <p className="text-xs text-gray-500">Days to resolve — rank sorted (fastest first)</p>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp size={14} style={{ color: GOLD }} />
                <span className="text-xs" style={{ color: GOLD }}>Top Performers</span>
              </div>
            </div>

            {resolutionTable.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No resolved ticket data available yet.</p>
            ) : (
              <div className="space-y-3">
                {/* Table header */}
                <div className="grid grid-cols-[24px_1fr_160px_80px] gap-4 px-1 text-xs font-medium uppercase tracking-wider text-gray-500">
                  <span>#</span>
                  <span>Authority</span>
                  <span>Speed</span>
                  <span className="text-right">Days</span>
                </div>
                {/* Table rows */}
                {resolutionTable.map((row, i) => {
                  const pct = (row.avgDays / maxAvgDays) * 100
                  const isTop3 = i < 3
                  return (
                    <div
                      key={row.name}
                      className={`grid grid-cols-[24px_1fr_160px_80px] items-center gap-4 rounded-xl px-3 py-2.5 text-sm transition-colors border ${
                        isTop3 
                          ? "bg-[#C9A84C]/10 border-[#C9A84C]/20 dark:bg-[#C9A84C]/5 dark:border-[#C9A84C]/15" 
                          : "bg-gray-50 border-[#d8cfbe] dark:bg-[#161616] dark:border-[#2a2a2a]"
                      }`}
                    >
                      <span className="font-semibold" style={{ color: isTop3 ? GOLD : "#6b7280" }}>{i + 1}</span>
                      <span className="font-medium text-[#27221d] dark:text-white truncate">{row.name}</span>
                      <div className="h-2 rounded-full overflow-hidden bg-gray-200 dark:bg-[#252525]">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${pct}%`,
                            background: isTop3
                              ? `linear-gradient(90deg, ${GOLD}, ${GOLD_MUTED})`
                              : `linear-gradient(90deg, #3b82f6, #1d4ed8)`,
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-end">
                        <span className="text-xs font-semibold" style={{ color: isTop3 ? GOLD : "#9ca3af" }}>
                          {row.avgDays.toFixed(1)}d
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          
          {/* Export Section */}
          <div className="rounded-2xl p-5 bg-white border border-[#d8cfbe] shadow-sm dark:bg-[#1a1a1a] dark:border-[#2a2a2a] dark:shadow-none">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-[#27221d] dark:text-white">Export Aggregated Data</h2>
                <p className="text-sm text-gray-500">Download current statistics for {selectedDept === "All Departments" ? "all departments" : selectedDept}.</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all bg-[#b48470] hover:bg-[#8c6757] dark:bg-[#C9A84C] dark:text-black dark:hover:bg-[#b8993f]"
                >
                  <Download size={16} />
                  Export CSV
                </button>
                <button
                  onClick={exportJSON}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-[#b48470] transition-all border border-[#d8cfbe] bg-white hover:bg-gray-50 dark:text-white dark:border-[#2a2a2a] dark:bg-[#252525] dark:hover:bg-[#333]"
                >
                  <FileJson size={16} />
                  Export JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
