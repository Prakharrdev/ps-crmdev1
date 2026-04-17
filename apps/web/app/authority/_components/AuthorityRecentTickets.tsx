"use client"

import { useState } from "react"
import { Eye } from "lucide-react"
import {
  getSeverityConfig,
  isBreached,
  STATUS_META,
  timeAgo,
  type AuthorityComplaintRow,
  type WorkerOption,
} from "./dashboard-types"
import { AssignDropdown, ComplaintDetailPanel } from "./ComplaintDetailPanel"

function stageInfo(c: AuthorityComplaintRow, workers: WorkerOption[]): { label: string; color: string } {
  const workerName = c.assigned_worker_id
    ? workers.find(w => w.id === c.assigned_worker_id)?.full_name ?? null
    : null
  const workerExistsInDb = !!workers.find(w => w.id === c.assigned_worker_id)

  switch (c.status) {
    case "submitted":
      return { label: "Awaiting Review", color: "text-slate-500 bg-slate-50 dark:bg-slate-800/50" }
    case "under_review":
      return { label: "Admin Reviewing", color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20" }
    case "assigned":
      return {
        label: workerExistsInDb ? (workerName ? `→ ${workerName}` : "Worker Assigned") : "Needs Assignment",
        color: workerExistsInDb ? "text-blue-600 bg-blue-50 dark:bg-blue-900/20" : "text-orange-500 bg-orange-50 dark:bg-orange-900/20",
      }
    case "in_progress":
      return {
        label: workerExistsInDb ? (workerName ? `${workerName} working` : "Work Underway") : "Work Underway",
        color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20",
      }
    case "resolved":
      return { label: "Resolved ✓", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" }
    case "escalated":
      return { label: "Escalated ⚠", color: "text-purple-600 bg-purple-50 dark:bg-purple-900/20" }
    case "pending_closure":
      return { label: "Pending Verification", color: "text-purple-600 bg-purple-50 dark:bg-purple-900/20" }
    case "closed":
      return { label: "Closed", color: "text-gray-900 bg-gray-100 dark:bg-gray-800" }
    case "spam":
      return { label: "Spam", color: "text-gray-400 bg-gray-50 dark:bg-gray-800/30" }
    default:
      return { label: c.status, color: "text-gray-500 bg-gray-50" }
  }
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50 dark:border-gray-800/60 animate-pulse">
      {[200, 60, 80, 50, 120, 90].map((w, i) => (
        <td key={i} className="px-3 py-2">
          <div className="h-3 rounded bg-gray-100 dark:bg-[#2a2a2a]" style={{ width: w }} />
        </td>
      ))}
    </tr>
  )
}

type Props = {
  complaints: AuthorityComplaintRow[]
  workers: WorkerOption[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}

export default function AuthorityRecentTickets({ complaints, workers, loading, error, onRefresh }: Props) {
  const [selected, setSelected] = useState<AuthorityComplaintRow | null>(null)

  // ── Show 6 most recent active tickets to better fill the aligned panel ─────
  const rows = complaints
    .filter(c => c.status !== "resolved" && c.status !== "rejected")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6)

  const hasWorkers = workers.length > 0

  return (
    <>
      <div className="flex h-[420px] flex-col rounded-2xl border border-gray-100 bg-white dark:border-[#2a2a2a] dark:bg-[#161616]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-[#2a2a2a]">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Recent Tickets</h2>
            {!loading && !hasWorkers && (
              <p className="mt-0.5 text-[10px] text-amber-500">No workers in DB for this department</p>
            )}
          </div>
          <a href="/authority/track" className="text-xs font-semibold text-[#b4725a] hover:underline">
            View all →
          </a>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 dark:border-[#2a2a2a]">
                {["Title / Location", "Severity", "Status", "Age", "Stage", "Actions"].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              ) : error ? (
                <tr><td colSpan={6} className="px-3 py-5 text-center text-sm text-red-500">{error}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-400">No active tickets</td></tr>
              ) : rows.map(c => {
                const sev         = getSeverityConfig(c.effective_severity)
                const st          = STATUS_META[c.status] || {
                  label: c.status,
                  badge: "bg-gray-100 text-gray-500 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-400",
                }
                const stage       = stageInfo(c, workers)
                const slaBreached = isBreached(c.sla_deadline, c.status)

                const assignedWorkerProfile = c.assigned_worker_id
                  ? workers.find(w => w.id === c.assigned_worker_id) ?? null
                  : null
                const workerIsValid = !!assignedWorkerProfile

                const canAssign =
                  hasWorkers &&
                  !workerIsValid &&
                  (c.status === "submitted" || c.status === "under_review")

                return (
                  <tr key={c.id} className="border-b border-gray-50 dark:border-[#2a2a2a] hover:bg-gray-50/60 dark:hover:bg-[#1e1e1e] transition-colors">
                    {/* Title + category */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${slaBreached ? "animate-pulse" : ""}`}
                          style={{ background: slaBreached ? "#ef4444" : sev.color }}
                        />
                        <div>
                          <p className="max-w-[180px] truncate text-xs font-medium text-gray-800 dark:text-gray-200">{c.title}</p>
                          <p className="max-w-[180px] truncate text-[10px] text-gray-400">
                            {c.categories?.name ?? "—"}{c.address_text ? ` · ${c.address_text}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Severity */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                        style={{ background: sev.color + "22", color: sev.color }}
                      >
                        {sev.shortLabel}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.badge}`}>
                        {st.label}
                      </span>
                    </td>

                    {/* Age */}
                    <td className="px-3 py-2 whitespace-nowrap text-[10px] text-gray-400">
                      {timeAgo(c.created_at)}
                    </td>

                    {/* Stage */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-flex max-w-[130px] truncate rounded-lg px-2 py-0.5 text-[10px] font-semibold ${stage.color}`}>
                        {stage.label}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setSelected(c)}
                          className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-medium text-gray-600 hover:border-gray-400 hover:text-gray-800 dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-400 transition-colors"
                        >
                          <Eye size={10} /> View
                        </button>

                        {canAssign && (
                          <AssignDropdown complaintId={c.id} workers={workers} onAssigned={onRefresh} />
                        )}

                        {workerIsValid && (
                          <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400">
                            ✓ {assignedWorkerProfile!.full_name ?? "Assigned"}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <ComplaintDetailPanel
          complaint={selected}
          workers={workers}
          onClose={() => setSelected(null)}
          onAssigned={() => { onRefresh(); setSelected(null) }}
        />
      )}
    </>
  )
}
