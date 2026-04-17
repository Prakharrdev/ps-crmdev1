// apps/web/app/authority/reports/page.tsx
"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "@/src/lib/supabase"
import {
  CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import {
  AlertTriangle, ArrowDown, ArrowUp, CheckCircle2,
  ChevronDown, Clock, Download, FileText, Minus,
  ShieldAlert, TrendingUp,
} from "lucide-react"
import { getSeverityConfig } from "../_components/dashboard-types"

// ── Types ─────────────────────────────────────────────────────────────────────
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
  | "reopened" 
  | "spam"

type Sev = string

type Complaint = {
  id: string; 
  status: LocalStatus; 
  effective_severity: Sev
  sla_deadline: string | null
  created_at: string; resolved_at: string | null
  categories: { name: string } | null; escalation_level: number
}

const STATUS_COLOR: Record<string, string> = {
  submitted: "#94a3b8", under_review: "#f59e0b", assigned: "#3b82f6",
  in_progress: "#6366f1", 
  resolved: "#10b981", 
  escalated: "#a855f7",
  reopened: "#ef4444", 
  spam: "#64748b", 
  pending_closure: "#a855f7", 
  closed: "#6b7280",
}
const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted", 
  under_review: "Under Review", 
  assigned: "Assigned",
  in_progress: "In Progress", 
  resolved: "Resolved", 
  escalated: "Escalated",
  reopened: "Reopened", 
  spam: "Spam", 
  pending_closure: "Pending Verification", 
  closed: "Closed",
}
const CAT_PALETTE = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#ec4899"]
const COMPLAINT_SELECT =
  "id,status,effective_severity,sla_deadline,created_at,resolved_at,escalation_level,categories(name)"

function isBreached(deadline: string | null, status: LocalStatus): boolean {
  if (!deadline) return false
  if (status === "resolved" || status === "rejected" || status === "spam" || status === "closed") return false
  return new Date(deadline) < new Date()
}

type Granularity = "day" | "week" | "month" | "6month"

const GRAN_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "day",    label: "Today (hourly)" },
  { value: "week",   label: "Last 7 days"    },
  { value: "month",  label: "Last 30 days"   },
  { value: "6month", label: "Last 6 months"  },
]

function bucketKey(d: Date, gran: Granularity): string {
  if (gran === "day")    return `${String(d.getHours()).padStart(2, "0")}:00`
  if (gran === "week")   return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })
  if (gran === "month")  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
}

function buildBuckets(gran: Granularity): string[] {
  const keys: string[] = []
  if (gran === "day") {
    for (let h = 0; h < 24; h++) keys.push(`${String(h).padStart(2, "0")}:00`)
  } else if (gran === "week") {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      keys.push(d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" }))
    }
  } else if (gran === "month") {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      keys.push(d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }))
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i)
      keys.push(d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }))
    }
  }
  return keys
}

function cutoffFor(gran: Granularity): Date {
  const d = new Date()
  if (gran === "day")    { d.setHours(0, 0, 0, 0) }
  if (gran === "week")   { d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0) }
  if (gran === "month")  { d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0) }
  if (gran === "6month") { d.setMonth(d.getMonth() - 5); d.setDate(1); d.setHours(0, 0, 0, 0) }
  return d
}

function pct(a: number, b: number) { return b === 0 ? 0 : Math.round((a / b) * 100) }

function avgDays(complaints: Complaint[]): string {
  const done = complaints.filter(c => c.status === "resolved" && c.resolved_at)
  if (!done.length) return "—"
  const avg = done.reduce((s, c) =>
    s + (new Date(c.resolved_at!).getTime() - new Date(c.created_at).getTime()), 0
  ) / done.length
  const d = Math.round(avg / 86_400_000)
  return d === 0 ? "<1 day" : `${d}d avg`
}

// ── Compact card wrapper ───────────────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-100 bg-white dark:border-[#2a2a2a] dark:bg-[#161616] ${className}`}>
      {children}
    </div>
  )
}
function CardHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-50 px-4 py-3 dark:border-[#2a2a2a]">
      <div>
        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{title}</p>
        {sub && <p className="mt-0.5 text-[10px] text-gray-400">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-100 bg-white px-3 py-2 shadow-xl dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1 text-[11px] text-gray-500">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />{p.name}
          </span>
          <span className="text-[11px] font-bold text-gray-800 dark:text-gray-200">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function Skel() {
  return <div className="h-36 animate-pulse rounded-lg bg-gray-50 dark:bg-[#1e1e1e]" />
}

function Delta({ now, prev, invert = false }: { now: number; prev: number; invert?: boolean }) {
  if (prev === 0) {
    if (now === 0) {
      return <span className="flex items-center gap-0.5 text-[10px] text-gray-400"><Minus size={8} />same</span>
    }
    return (
      <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${invert ? "text-red-500" : "text-emerald-600"}`}>
        <ArrowUp size={8} />new vs prev
      </span>
    )
  }
  const d = now - prev
  const p = Math.abs(Math.round((d / prev) * 100))
  const good = invert ? d < 0 : d > 0
  if (d === 0) return <span className="flex items-center gap-0.5 text-[10px] text-gray-400"><Minus size={8} />same</span>
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${good ? "text-emerald-600" : "text-red-500"}`}>
      {d > 0 ? <ArrowUp size={8} /> : <ArrowDown size={8} />}{p}% vs prev
    </span>
  )
}

function GranDropdown({ value, onChange }: { value: Granularity; onChange: (v: Granularity) => void }) {
  const [open, setOpen] = useState(false)
  const active = GRAN_OPTIONS.find(o => o.value === value)!
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-300"
      >
        {active.label}
        <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-[#2a2a2a] dark:bg-[#1e1e1e] transition-all duration-150 ${open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-1 pointer-events-none"}`}>
        {GRAN_OPTIONS.map(o => (
          <button
            key={o.value}
            onClick={() => { onChange(o.value); setOpen(false) }}
            className={`block w-full px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-gray-50 dark:hover:bg-[#2a2a2a] ${value === o.value ? "font-bold text-[#b4725a]" : "text-gray-700 dark:text-gray-300"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [complaints,     setComplaints] = useState<Complaint[]>([])
  const [prevComplaints, setPrev]       = useState<Complaint[]>([])
  const [loading,        setLoading]    = useState(true)
  const [dept,           setDept]       = useState("")
  const [gran,           setGran]       = useState<Granularity>("week")

  const load = useCallback(async () => {
    setLoading(true)
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth?.user?.id
    if (!uid) return

    const { data: profile } = await supabase
      .from("profiles").select("department").eq("id", uid).maybeSingle()
    const department = profile?.department ?? ""
    setDept(department)

    const cutoff     = cutoffFor(gran)
    const prevCutoff = new Date(cutoff)
    if (gran === "day")    prevCutoff.setDate(prevCutoff.getDate() - 1)
    if (gran === "week")   prevCutoff.setDate(prevCutoff.getDate() - 7)
    if (gran === "month")  prevCutoff.setDate(prevCutoff.getDate() - 30)
    if (gran === "6month") prevCutoff.setMonth(prevCutoff.getMonth() - 6)

    async function fetchPeriod(from: Date, to: Date) {
      let d: any[] = []
      const { data: d1 } = await supabase.from("complaints").select(COMPLAINT_SELECT)
        .eq("assigned_officer_id", uid!).gte("created_at", from.toISOString()).lt("created_at", to.toISOString())
      d = d1 ?? []
      if (!d.length && department) {
        const { data: d2 } = await supabase.from("complaints").select(COMPLAINT_SELECT)
          .eq("assigned_department", department).gte("created_at", from.toISOString()).lt("created_at", to.toISOString())
        d = d2 ?? []
      }
      return d as Complaint[]
    }

    const [cur, prev] = await Promise.all([
      fetchPeriod(cutoff, new Date()),
      fetchPeriod(prevCutoff, cutoff),
    ])
    setComplaints(cur)
    setPrev(prev)
    setLoading(false)
  }, [gran])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!dept) return
    const ch = supabase.channel("reports-rt")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "complaints",
        filter: `assigned_department=eq.${dept}`
      }, () => void load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load, dept])

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const total     = complaints.length
  const resolved  = complaints.filter(c => c.status === "resolved").length
  const breached  = complaints.filter(c => isBreached(c.sla_deadline, c.status)).length
  const escalated = complaints.filter(c => c.escalation_level > 0).length
  const slaRate   = pct(total - breached, total)
  const resRate   = pct(resolved, total)
  const prevBreached = prevComplaints.filter(c => isBreached(c.sla_deadline, c.status)).length

  // ── Trend data ─────────────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    const keys = buildBuckets(gran)
    const map: Record<string, { submitted: number; resolved: number; in_progress: number; assigned: number }> = {}
    keys.forEach(k => { map[k] = { submitted: 0, resolved: 0, in_progress: 0, assigned: 0 } })
    complaints.forEach(c => {
      const k = bucketKey(new Date(c.created_at), gran)
      if (map[k]) {
        map[k].submitted++
        if (c.status === "assigned")    map[k].assigned++
        if (c.status === "in_progress") map[k].in_progress++
      }
      if (c.status === "resolved" && c.resolved_at) {
        const rk = bucketKey(new Date(c.resolved_at), gran)
        if (map[rk]) map[rk].resolved++
      }
    })
    return keys.map(label => ({ label, ...map[label] }))
  }, [complaints, gran])

  // ── Severity ───────────────────────────────────────────────────────────────
  const sevCounts = useMemo(() => {
    const normMap: Record<string, string> = {
      l1: "L1", l2: "L2", l3: "L3", l4: "L4",
      low: "L1", medium: "L2", med: "L2", high: "L3", critical: "L4", crit: "L4",
    }
    const counts: Record<string, number> = { L1: 0, L2: 0, L3: 0, L4: 0 }
    complaints.forEach(c => {
      const norm = normMap[(c.effective_severity ?? "").toLowerCase().trim()] ?? c.effective_severity
      if (norm in counts) counts[norm]++
    })
    return (["L4","L3","L2","L1"] as const).map(s => ({
      sev: s,
      label: getSeverityConfig(s).label,
      color: getSeverityConfig(s).color,
      count: counts[s],
    })).filter(d => d.count > 0)
  }, [complaints])

  // ── Status donut ───────────────────────────────────────────────────────────
  const statusData = useMemo(() =>
    Object.entries(STATUS_COLOR).map(([s, color]) => ({
      name: STATUS_LABEL[s] ?? s,
      value: complaints.filter(c => c.status === s).length,
      color,
    })).filter(d => d.value > 0).sort((a, b) => b.value - a.value),
  [complaints])

  // ── Category ───────────────────────────────────────────────────────────────
  const catData = useMemo(() => {
    const map: Record<string, { filed: number; resolved: number }> = {}
    complaints.forEach(c => {
      const k = c.categories?.name ?? "Uncategorised"
      if (!map[k]) map[k] = { filed: 0, resolved: 0 }
      map[k].filed++
      if (c.status === "resolved") map[k].resolved++
    })
    return Object.entries(map)
      .sort((a, b) => b[1].filed - a[1].filed).slice(0, 8)
      .map(([name, v], i) => ({
        name: name.length > 20 ? name.slice(0, 18) + "…" : name,
        filed: v.filed, resolved: v.resolved,
        rate: pct(v.resolved, v.filed),
        color: CAT_PALETTE[i % CAT_PALETTE.length],
      }))
  }, [complaints])

  // ── SLA by severity ────────────────────────────────────────────────────────
  const slaBySev = useMemo(() => {
    const normMap: Record<string, string> = {
      l1: "L1", l2: "L2", l3: "L3", l4: "L4",
      low: "L1", medium: "L2", med: "L2", high: "L3", critical: "L4", crit: "L4",
    }
    return (["L4","L3","L2","L1"] as const).map(s => {
      const g  = complaints.filter(c => (normMap[(c.effective_severity ?? "").toLowerCase().trim()] ?? c.effective_severity) === s)
      const br = g.filter(c => isBreached(c.sla_deadline, c.status)).length
      const sc = getSeverityConfig(s)
      return {
        name: sc.label, color: sc.color,
        compliant: g.length - br, breached: br, total: g.length,
        rate: pct(g.length - br, g.length),
      }
    }).filter(d => d.total > 0)
  }, [complaints])

  // ── Resolution time buckets ────────────────────────────────────────────────
  const resBuckets = useMemo(() => {
    const b = { "<1d": 0, "1–3d": 0, "4–7d": 0, "8–14d": 0, "15d+": 0 }
    complaints.filter(c => c.status === "resolved" && c.resolved_at).forEach(c => {
      const days = (new Date(c.resolved_at!).getTime() - new Date(c.created_at).getTime()) / 86_400_000
      if (days < 1)        b["<1d"]++
      else if (days <= 3)  b["1–3d"]++
      else if (days <= 7)  b["4–7d"]++
      else if (days <= 14) b["8–14d"]++
      else                 b["15d+"]++
    })
    return Object.entries(b).map(([label, value]) => ({ label, value }))
  }, [complaints])

  function exportCSV() {
    const rows = [
      ["ID", "Status", "Severity", "SLA Breached", "Created", "Resolved", "Category"],
      ...complaints.map(c => [
        c.id, c.status, getSeverityConfig(c.effective_severity).label,
        isBreached(c.sla_deadline, c.status) ? "Yes" : "No",
        new Date(c.created_at).toLocaleDateString("en-IN"),
        c.resolved_at ? new Date(c.resolved_at).toLocaleDateString("en-IN") : "—",
        c.categories?.name ?? "Uncategorised",
      ])
    ]
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(",")).join("\n")], { type: "text/csv" }))
    a.download = `reports-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const TREND_LINES = [
    { key: "submitted",   label: "Submitted",   color: "#b4725a" },
    { key: "assigned",    label: "Assigned",    color: "#3b82f6" },
    { key: "in_progress", label: "In Progress", color: "#6366f1" },
    { key: "resolved",    label: "Resolved",    color: "#10b981" },
  ]

  const xInterval =
    gran === "day"   ? 3 :
    gran === "week"  ? 0 :
    gran === "month" ? 5 :
    "preserveStartEnd"

  const granLabel = { day: "Today", week: "7 days", month: "30 days", "6month": "6 months" }[gran]

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-8">

      {/* ── KPI Strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { icon: FileText,      label: "Total Filed",     value: total,               color: "text-gray-900 dark:text-white",                        extra: <Delta now={total}    prev={prevComplaints.length} /> },
          { icon: CheckCircle2,  label: "Resolved",        value: resolved,            color: "text-emerald-600",                                     extra: <Delta now={resolved} prev={prevComplaints.filter(c => c.status === "resolved").length} /> },
          { icon: TrendingUp,    label: "Resolution Rate", value: `${resRate}%`,       color: resRate >= 60 ? "text-emerald-600" : "text-amber-500",  extra: <span className="text-[10px] text-gray-400">{resolved}/{total}</span> },
          { icon: Clock,         label: "Avg Resolution",  value: avgDays(complaints), color: "text-blue-600",                                        extra: null },
          { icon: ShieldAlert,   label: "SLA Compliance",  value: `${slaRate}%`,       color: slaRate >= 80 ? "text-emerald-600" : "text-red-500",    extra: <span className="text-[10px] text-gray-400">{total - breached} on-time</span> },
          { icon: AlertTriangle, label: "SLA Breached",    value: breached,            color: breached > 0 ? "text-red-500" : "text-gray-400",        extra: <Delta now={breached} prev={prevBreached} invert /> },
        ].map(({ icon: Icon, label, value, color, extra }) => (
          <Card key={label} className="p-3.5">
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 leading-tight">{label}</p>
                {loading
                  ? <div className="mt-1 h-6 w-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
                  : <p className={`mt-0.5 text-xl font-bold leading-none ${color}`}>{value}</p>}
                {!loading && <div className="mt-1">{extra}</div>}
              </div>
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800">
                <Icon size={12} className="text-gray-400" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Trend chart ──────────────────────────────────────────────────── */}
      <Card>
        <CardHead
          title="Complaint Volume Trend"
          sub={`${dept || "All Departments"} · ${granLabel}`}
          action={<GranDropdown value={gran} onChange={setGran} />}
        />
        <div className="p-4">
          {loading ? <Skel /> : trendData.length === 0 ? (
            <div className="flex h-36 items-center justify-center text-xs text-gray-400">No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={trendData} margin={{ top: 2, right: 4, left: -26, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.15)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} interval={xInterval as any} />
                <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={24} />
                <Tooltip content={<ChartTip />} cursor={{ stroke: "rgba(156,163,175,0.2)", strokeWidth: 1 }} />
                <Legend
                  wrapperStyle={{ fontSize: 10, paddingTop: 10 }} iconType="circle" iconSize={6}
                  formatter={(v) => <span style={{ color: "#6b7280", fontSize: 10 }}>{v}</span>}
                />
                {TREND_LINES.map(({ key, label, color }) => (
                  <Line key={key} type="monotone" dataKey={key} name={label} stroke={color} strokeWidth={1.5}
                    dot={{ r: gran === "month" ? 1.5 : 2, fill: color, strokeWidth: 0 }}
                    activeDot={{ r: 4, strokeWidth: 0 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* ── 4 Graphs (Scrollable) ────────────────────────────────────────── */}
      <div className="flex flex-nowrap overflow-x-auto gap-4 pb-4 snap-x hide-scrollbar">

        {/* Severity */}
        <Card className="min-w-[300px] flex-1 snap-start shrink-0">
          <CardHead title="Severity Distribution" sub={granLabel} />
          <div className="p-4">
            {loading ? <Skel /> : sevCounts.length === 0 ? (
              <div className="flex h-36 items-center justify-center text-xs text-gray-400">No data</div>
            ) : (
              <div className="space-y-3">
                <div className="flex h-4 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  {sevCounts.map(s => {
                    const p = pct(s.count, total); if (!p) return null
                    return <div key={s.sev} style={{ width: `${p}%`, background: s.color }} className="transition-all" title={`${s.label}: ${s.count}`} />
                  })}
                </div>
                <div className="space-y-2">
                  {sevCounts.map(s => {
                    const p = pct(s.count, total)
                    return (
                      <div key={s.sev}>
                        <div className="mb-0.5 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{s.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-900 dark:text-white">{s.count}</span>
                            <span className="w-7 text-right text-[10px] text-gray-400">{p}%</span>
                          </div>
                        </div>
                        <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                          <div className="h-full rounded-full transition-all" style={{ width: `${p}%`, background: s.color }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Status donut */}
        <Card className="min-w-[320px] flex-1 snap-start shrink-0">
          <CardHead title="Status Breakdown" sub={granLabel} />
          <div className="p-4">
            {loading ? <Skel /> : statusData.length === 0 ? (
              <div className="flex h-36 items-center justify-center text-xs text-gray-400">No data</div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="shrink-0">
                  <ResponsiveContainer width={150} height={150}>
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                        dataKey="value" paddingAngle={2} startAngle={90} endAngle={450}>
                        {statusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip content={<ChartTip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 min-w-0 space-y-1.5 overflow-y-auto max-h-[130px]">
                  {statusData.map(d => (
                    <div key={d.name} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: d.color }} />
                        <span className="truncate text-[11px] text-gray-600 dark:text-gray-400">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-bold text-gray-900 dark:text-white">{d.value}</span>
                        <span className="w-6 text-right text-[10px] text-gray-400">{pct(d.value, total)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* SLA compliance */}
        <Card className="min-w-[300px] flex-1 snap-start shrink-0">
          <CardHead title="SLA Compliance by Severity" sub="Computed from deadline" />
          <div className="p-4">
            {loading ? <Skel /> : slaBySev.length === 0 ? (
              <div className="flex h-36 items-center justify-center text-xs text-gray-400">No data</div>
            ) : (
              <div className="space-y-3 overflow-y-auto max-h-[200px] pr-1">
                {slaBySev.map(s => (
                  <div key={s.name}>
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{s.name}</span>
                        <span className="text-[10px] text-gray-400">({s.total})</span>
                      </div>
                      <span className={`text-xs font-bold ${s.rate >= 80 ? "text-emerald-600" : s.rate >= 50 ? "text-amber-500" : "text-red-500"}`}>
                        {s.rate}%
                      </span>
                    </div>
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div className="h-full bg-emerald-400 transition-all" style={{ width: `${pct(s.compliant, s.total)}%` }} />
                      {s.breached > 0 && (
                        <div className="h-full bg-red-400 transition-all" style={{ width: `${pct(s.breached, s.total)}%` }} />
                      )}
                    </div>
                    <div className="mt-0.5 flex gap-2 text-[10px]">
                      <span className="text-emerald-600">✓ {s.compliant} on-time</span>
                      {s.breached > 0 && <span className="text-red-500">✗ {s.breached} breached</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Resolution time */}
        <Card className="min-w-[300px] flex-1 snap-start shrink-0">
          <CardHead title="Resolution Time Distribution" sub="How quickly complaints close" />
          <div className="p-4">
            {loading ? <Skel /> : resolved === 0 ? (
              <div className="flex h-36 items-center justify-center text-xs text-gray-400">No resolved complaints yet</div>
            ) : (
              <div className="space-y-2.5 overflow-y-auto max-h-[200px] pr-1">
                {resBuckets.map(b => {
                  const p    = pct(b.value, resolved)
                  const fast = b.label === "<1d" || b.label === "1–3d"
                  const slow = b.label === "15d+"
                  return (
                    <div key={b.label}>
                      <div className="mb-0.5 flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{b.label}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-gray-900 dark:text-white">{b.value}</span>
                          <span className="w-6 text-right text-[10px] text-gray-400">{p}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                        <div
                          className={`h-full rounded-full transition-all ${fast ? "bg-emerald-400" : slow ? "bg-red-400" : "bg-amber-400"}`}
                          style={{ width: `${p}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
                <div className="mt-1 rounded-lg bg-gray-50 px-3 py-1.5 dark:bg-gray-800">
                  <p className="text-[10px] text-gray-500">
                    Average: <span className="font-semibold text-gray-700 dark:text-gray-300">{avgDays(complaints)}</span> · {resolved} resolved
                  </p>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── Category bars ─────────────────────────────────────────────────── */}
      <Card>
        <CardHead title="Complaints by Category" sub="Solid = resolved · faint = total filed" />
        <div className="p-4">
          {loading ? <Skel /> : catData.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-xs text-gray-400">No data</div>
          ) : (
            <div className="space-y-2 overflow-y-auto max-h-[220px] pr-1">
              {catData.map(c => (
                <div key={c.name} className="flex items-center gap-2">
                  <div className="flex w-32 shrink-0 items-center justify-end gap-1">
                    <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: c.color }} />
                    <span className="truncate text-[11px] text-gray-600 dark:text-gray-400">{c.name}</span>
                  </div>
                  <div className="relative flex-1 h-4">
                    <div className="absolute inset-0 overflow-hidden rounded-full" style={{ background: `${c.color}20` }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct(c.filed, catData[0].filed)}%`, background: `${c.color}50` }} />
                    </div>
                    <div className="absolute inset-0 overflow-hidden rounded-full">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct(c.resolved, catData[0].filed)}%`, background: c.color }} />
                    </div>
                  </div>
                  <span className="w-6 shrink-0 text-center text-[11px] font-bold text-gray-800 dark:text-gray-200">{c.filed}</span>
                  <span className={`w-8 shrink-0 text-right text-[10px] font-semibold ${c.rate >= 60 ? "text-emerald-600" : c.rate >= 30 ? "text-amber-500" : "text-red-500"}`}>
                    {c.rate}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* ── Insights ──────────────────────────────────────────────────────── */}
      {!loading && total > 0 && (
        <Card className="border-[#b4725a]/15 bg-gradient-to-br from-[#fdf8f6] to-white dark:from-[#2a1f1a]/60 dark:to-gray-900">
          <div className="p-4">
            <p className="mb-2.5 text-xs font-semibold text-[#4f392e] dark:text-[#b4725a]">Period Insights</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
              {breached > 0 && (
                <div className="flex gap-2 rounded-lg bg-red-50 p-2.5 dark:bg-red-900/20">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0 text-red-500" />
                  <span className="text-red-700 dark:text-red-400 leading-snug">
                    <strong>SLA breached ({breached} tickets)</strong> — deadlines passed without resolution.
                  </span>
                </div>
              )}
              {resRate < 30 && (
                <div className="flex gap-2 rounded-lg bg-amber-50 p-2.5 dark:bg-amber-900/20">
                  <Clock size={12} className="mt-0.5 shrink-0 text-amber-500" />
                  <span className="text-amber-700 dark:text-amber-400 leading-snug">
                    <strong>Low resolution rate ({resRate}%)</strong> — {total - resolved} complaints still open.
                  </span>
                </div>
              )}
              {escalated > 0 && (
                <div className="flex gap-2 rounded-lg bg-purple-50 p-2.5 dark:bg-purple-900/20">
                  <TrendingUp size={12} className="mt-0.5 shrink-0 text-purple-500" />
                  <span className="text-purple-700 dark:text-purple-400 leading-snug">
                    <strong>{escalated} escalated</strong> — requires senior review.
                  </span>
                </div>
              )}
              {resRate >= 70 && (
                <div className="flex gap-2 rounded-lg bg-emerald-50 p-2.5 dark:bg-emerald-900/20">
                  <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-500" />
                  <span className="text-emerald-700 dark:text-emerald-400 leading-snug">
                    <strong>Strong performance ({resRate}%)</strong> — {resolved} of {total} resolved.
                  </span>
                </div>
              )}
              {catData[0] && (
                <div className="flex gap-2 rounded-lg bg-blue-50 p-2.5 dark:bg-blue-900/20">
                  <FileText size={12} className="mt-0.5 shrink-0 text-blue-500" />
                  <span className="text-blue-700 dark:text-blue-400 leading-snug">
                    Top category: <strong>{catData[0].name}</strong> — {catData[0].filed} complaints, {catData[0].rate}% resolved.
                  </span>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
