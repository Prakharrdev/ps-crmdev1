// apps/web/app/authority/_components/dashboard-types.ts

export type ComplaintStatus =
  | "submitted"
  | "under_review"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "rejected"
  | "escalated"
  | "pending_closure"
  | "closed"

export type SeverityLevel = "L1" | "L2" | "L3" | "L4"

export type AuthorityComplaintRow = {
  id: string
  ticket_id: string
  title: string
  status: ComplaintStatus
  effective_severity: SeverityLevel
  sla_deadline: string | null
  escalation_level: number
  created_at: string
  resolved_at: string | null
  address_text: string | null
  assigned_worker_id: string | null
  upvote_count: number
  categories: { name: string } | null
}

export type TrendPoint = {
  label: string
  submitted: number
  resolved: number
  in_progress: number
  assigned: number
}

export type WorkerOption = {
  id: string
  full_name: string
  availability: string
  department: string
}

export type DashboardStats = {
  total: number
  pendingAction: number
  inProgress: number
  resolvedThisMonth: number
  slaBreached: number
}

export const PENDING_STATUSES:   ComplaintStatus[] = ["submitted", "under_review"]
export const ACTIVE_STATUSES:    ComplaintStatus[] = ["assigned", "in_progress"]
export const ESCALATED_STATUSES: ComplaintStatus[] = ["escalated"]
export const URGENT_SEVERITIES:  SeverityLevel[]   = ["L3", "L4"]

export const SEVERITY_RANK: Record<string, number> = {
  // L-code format
  L4: 4, L3: 3, L2: 2, L1: 1,
  // String format (what DB may actually store)
  critical: 4, high: 3, medium: 2, low: 1,
}

// ── getSeverityConfig ─────────────────────────────────────────────────────────
// Handles EVERY format the DB might store:
//   "L1"/"L2"/"L3"/"L4"          ← typed enum format
//   "low"/"medium"/"high"/"critical"  ← lowercase string format
//   "Low"/"Medium"/"High"/"Critical"  ← title-case string format
//   null / undefined / anything else  ← shown as gray "Unknown" (NOT silently Medium)
// Uses hex colors so Tailwind purge never strips them.

export type SeverityConfig = {
  label: string
  shortLabel: string
  color: string   // hex — use as style={{ background: color+"22", color }}
  dot: string     // tailwind dot class (for legacy use only)
  level: number
}

const BY_LCODE: Record<string, SeverityConfig> = {
  L1: { label: "Low",      shortLabel: "Low",  color: "#38bdf8", dot: "bg-sky-400",    level: 1 },
  L2: { label: "Medium",   shortLabel: "Med",  color: "#f59e0b", dot: "bg-amber-400",  level: 2 },
  L3: { label: "High",     shortLabel: "High", color: "#f97316", dot: "bg-orange-500", level: 3 },
  L4: { label: "Critical", shortLabel: "Crit", color: "#ef4444", dot: "bg-red-500",    level: 4 },
}

// Map every possible string the DB might store → canonical config
const BY_STRING: Record<string, SeverityConfig> = {
  low:      BY_LCODE.L1,
  medium:   BY_LCODE.L2,
  med:      BY_LCODE.L2,
  high:     BY_LCODE.L3,
  critical: BY_LCODE.L4,
  crit:     BY_LCODE.L4,
}

const UNKNOWN_CONFIG: SeverityConfig = {
  label: "Unknown", shortLabel: "?", color: "#6b7280", dot: "bg-gray-400", level: 0,
}

export function getSeverityConfig(level: string | null | undefined): SeverityConfig {
  if (!level) return UNKNOWN_CONFIG
  // Try exact L-code match first ("L1", "L2", "L3", "L4")
  if (level in BY_LCODE) return BY_LCODE[level]
  // Try lowercase string match ("low", "medium", "high", "critical")
  const lower = level.toLowerCase().trim()
  if (lower in BY_STRING) return BY_STRING[lower]
  return UNKNOWN_CONFIG
}

// Legacy alias — kept so existing imports don't break
export const SEVERITY_META = BY_LCODE

// ── Status ────────────────────────────────────────────────────────────────────

export const STATUS_META: Record<ComplaintStatus, { label: string; badge: string; step: number }> = {
  submitted:    { label: "Submitted",    badge: "bg-gray-100 text-gray-600 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300",              step: 1 },
  under_review: { label: "Under Review", badge: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300",  step: 2 },
  assigned:     { label: "Assigned",     badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-300",             step: 3 },
  in_progress:  { label: "In Progress",  badge: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300",  step: 4 },
  resolved:     { label: "Resolved",     badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300", step: 5 },
  pending_closure: { label: "Pending Verification", badge: "bg-purple-50 text-purple-700 ring-1 ring-purple-200 dark:bg-purple-900/30 dark:text-purple-300",  step: 4.5 },
  closed:       { label: "Closed",       badge: "bg-gray-900 text-white ring-1 ring-black dark:bg-black dark:text-gray-300",                   step: 6 },
  rejected:     { label: "Rejected",     badge: "bg-red-50 text-red-600 ring-1 ring-red-200 dark:bg-red-900/30 dark:text-red-400",                  step: 0 },
  escalated:    { label: "Escalated",    badge: "bg-orange-50 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-900/30 dark:text-orange-300",  step: 7 },
}

export const STATUS_CHART_COLOR: Record<ComplaintStatus, string> = {
  submitted:    "#94a3b8",
  under_review: "#f59e0b",
  assigned:     "#3b82f6",
  in_progress:  "#6366f1",
  resolved:     "#10b981",
  pending_closure: "#a855f7",
  closed:       "#111827",
  rejected:     "#ef4444",
  escalated:    "#f97316",
}

// ── SLA helper ────────────────────────────────────────────────────────────────

export function isBreached(deadline: string | null, status: ComplaintStatus): boolean {
  if (!deadline) return false
  if (status === "resolved" || status === "rejected") return false
  return new Date(deadline) < new Date()
}

// ── Time helpers ──────────────────────────────────────────────────────────────

export function dayLabel(date: Date): string {
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })
}

export function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
}

export function buildDayBuckets(n = 7): Record<string, Omit<TrendPoint, "label">> {
  const buckets: Record<string, Omit<TrendPoint, "label">> = {}
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    buckets[dayLabel(d)] = { submitted: 0, resolved: 0, in_progress: 0, assigned: 0 }
  }
  return buckets
}

export function buildSixMonthBuckets(): Record<string, Omit<TrendPoint, "label">> {
  const buckets: Record<string, Omit<TrendPoint, "label">> = {}
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    buckets[monthLabel(d)] = { submitted: 0, resolved: 0, in_progress: 0, assigned: 0 }
  }
  return buckets
}

export function computeStats(complaints: AuthorityComplaintRow[]): DashboardStats {
  const now        = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  return {
    total:             complaints.length,
    pendingAction:     complaints.filter(c => PENDING_STATUSES.includes(c.status)).length,
    inProgress:        complaints.filter(c => ACTIVE_STATUSES.includes(c.status)).length,
    resolvedThisMonth: complaints.filter(
      c => c.status === "resolved" && new Date(c.created_at).getTime() >= monthStart
    ).length,
    slaBreached: complaints.filter(c => isBreached(c.sla_deadline, c.status)).length,
  }
}

export function getUrgentTickets(
  complaints: AuthorityComplaintRow[],
  limit = 8
): AuthorityComplaintRow[] {
  return complaints
    .filter(c =>
      c.status !== "resolved" &&
      c.status !== "rejected" &&
      (ESCALATED_STATUSES.includes(c.status) ||
        URGENT_SEVERITIES.includes(c.effective_severity) ||
        // also catch string-format high/critical from DB
        ["high","critical","l3","l4"].includes((c.effective_severity ?? "").toLowerCase()))
    )
    .sort((a, b) => {
      const ra = SEVERITY_RANK[a.effective_severity] ?? SEVERITY_RANK[(a.effective_severity ?? "").toLowerCase()] ?? 0
      const rb = SEVERITY_RANK[b.effective_severity] ?? SEVERITY_RANK[(b.effective_severity ?? "").toLowerCase()] ?? 0
      const diff = rb - ra
      return diff !== 0 ? diff : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
    .slice(0, limit)
}

export function getStatusBreakdown(
  complaints: AuthorityComplaintRow[]
): { status: ComplaintStatus; label: string; count: number; color: string }[] {
  const map: Partial<Record<ComplaintStatus, number>> = {}
  for (const c of complaints) {
    if (c.status === "rejected") continue
    map[c.status] = (map[c.status] ?? 0) + 1
  }
  return (Object.entries(map) as [ComplaintStatus, number][])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({
      status,
      label: STATUS_META[status]?.label || "Other",
      count,
      color: STATUS_CHART_COLOR[status] || "#6b7280",
    }))
}

export function timeAgo(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins < 1)   return "just now"
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export const WORKFLOW_STEPS: { key: ComplaintStatus | "_worker"; label: string; actor: string }[] = [
  { key: "submitted",    label: "Filed",        actor: "Citizen"   },
  { key: "under_review", label: "Under Review", actor: "Admin"     },
  { key: "assigned",     label: "Assigned",     actor: "Authority" },
  { key: "in_progress",  label: "In Progress",  actor: "Worker"    },
  { key: "resolved",     label: "Resolved",     actor: "Worker"    },
]
