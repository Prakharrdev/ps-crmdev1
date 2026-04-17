// apps/web/app/authority/_components/AuthorityStatusBreakdown.tsx
"use client"

import type { AuthorityComplaintRow } from "./dashboard-types"
import { getStatusBreakdown, STATUS_META } from "./dashboard-types"

const STATUS_STYLES: Record<string, { bg: string; text: string; bar: string }> = {
  Submitted:    { bg: "bg-slate-100 dark:bg-slate-800/60",   text: "text-slate-600 dark:text-slate-300",   bar: "bg-slate-400" },
  "Under Review":{ bg: "bg-amber-50 dark:bg-amber-900/20",  text: "text-amber-700 dark:text-amber-300",   bar: "bg-amber-400" },
  Assigned:     { bg: "bg-blue-50 dark:bg-blue-900/20",      text: "text-blue-700 dark:text-blue-300",     bar: "bg-blue-500"  },
  "In Progress":{ bg: "bg-indigo-50 dark:bg-indigo-900/20", text: "text-indigo-700 dark:text-indigo-300", bar: "bg-indigo-500"},
  Resolved:     { bg: "bg-emerald-50 dark:bg-emerald-900/20",text: "text-emerald-700 dark:text-emerald-300",bar: "bg-emerald-500"},
  Escalated:    { bg: "bg-purple-50 dark:bg-purple-900/20",  text: "text-purple-700 dark:text-purple-300", bar: "bg-purple-500"},
  Reopened:     { bg: "bg-red-50 dark:bg-red-900/20",     text: "text-red-700 dark:text-red-300",     bar: "bg-red-500"},
}

function SkeletonBreakdown() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gray-100 dark:bg-[#2a2a2a]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-20 rounded bg-gray-100 dark:bg-[#2a2a2a]" />
            <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-[#2a2a2a]" />
          </div>
          <div className="h-5 w-7 rounded bg-gray-100 dark:bg-[#2a2a2a]" />
        </div>
      ))}
    </div>
  )
}

type Props = { complaints: AuthorityComplaintRow[]; loading: boolean }

export default function AuthorityStatusBreakdown({ complaints, loading }: Props) {
  const breakdown = getStatusBreakdown(complaints)
  const total     = breakdown.reduce((s, b) => s + b.count, 0)

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-[#2a2a2a] dark:bg-[#161616]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Status Breakdown</h2>
        {total > 0 && (
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-[#1e1e1e] dark:text-gray-400">
            {total} total
          </span>
        )}
      </div>

      {loading ? (
        <SkeletonBreakdown />
      ) : total === 0 ? (
        <div className="flex h-24 items-center justify-center text-sm text-gray-400">No data</div>
      ) : (
        <div className="space-y-2.5">
          {breakdown.map(({ label, count }) => {
            const pct    = total > 0 ? Math.round((count / total) * 100) : 0
            const styles = STATUS_STYLES[label] ?? STATUS_STYLES["Submitted"]
            return (
              <div key={label} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${styles.bg}`}>
                {/* Count bubble */}
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/70 dark:bg-white/10`}>
                  <span className={`text-sm font-bold ${styles.text}`}>{count}</span>
                </div>
                {/* Label + bar */}
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className={`text-xs font-semibold ${styles.text}`}>{label}</span>
                    <span className={`text-[10px] font-medium ${styles.text} opacity-70`}>{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/50 dark:bg-black/20">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${styles.bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
