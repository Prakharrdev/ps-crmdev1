// apps/web/app/authority/_components/AuthorityUrgentTickets.tsx

"use client"

import React, { useState } from "react"
import { AlertTriangle } from "lucide-react"
import {
  STATUS_META,
  getSeverityConfig,
  isBreached,
  timeAgo,
  type AuthorityComplaintRow,
} from "./dashboard-types"
import { ComplaintDetailPanel } from "./ComplaintDetailPanel"

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="px-5 py-3 animate-pulse space-y-2">
      <div className="flex gap-2">
        <div className="h-4 w-14 rounded-full bg-gray-100 dark:bg-[#2a2a2a]" />
        <div className="h-4 w-10 rounded-full bg-gray-100 dark:bg-[#2a2a2a]" />
      </div>
      <div className="h-3.5 w-4/5 rounded bg-gray-100 dark:bg-[#2a2a2a]" />
      <div className="h-2.5 w-3/5 rounded bg-gray-50 dark:bg-[#1e1e1e]" />
    </div>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function UrgentRow({
  c,
  onSelect,
}: {
  c: AuthorityComplaintRow
  onSelect: (c: AuthorityComplaintRow) => void
}) {
  const sev = getSeverityConfig(c.effective_severity)
  const st  = STATUS_META[c.status] || {
    label: c.status,
    badge: "bg-gray-100 text-gray-500 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-400",
  }

  return (
    <button
      onClick={() => onSelect(c)}
      className="w-full px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-[#1e1e1e] transition-colors"
    >
      <div className="flex flex-wrap items-center gap-1.5 mb-1">
        <span 
          className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{ backgroundColor: `${sev.color}22`, color: sev.color }}
        >
          {sev.label}
        </span>
        {c.status === "escalated" && (
          <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
            Escalated
          </span>
        )}
        {isBreached(c.sla_deadline, c.status) && (
          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600 dark:bg-red-900/30 dark:text-red-400">
            SLA
          </span>
        )}
      </div>

      <p className="text-sm font-medium leading-snug text-gray-800 dark:text-gray-200 line-clamp-1">
        {c.title}
      </p>

      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-gray-400 dark:text-gray-500">
          {c.categories?.name ?? "—"}
          {c.address_text ? ` · ${c.address_text}` : ""}
        </p>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <span className="text-[10px] text-gray-300 dark:text-gray-600">
            {timeAgo(c.created_at)}
          </span>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.badge}`}>
            {st.label}
          </span>
        </div>
      </div>
    </button>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Props = {
  tickets: AuthorityComplaintRow[]
  loading: boolean
  error: string | null
}

export default function AuthorityUrgentTickets({ tickets, loading, error }: Props) {
  const [selected, setSelected] = useState<AuthorityComplaintRow | null>(null)

  return (
    <>
      <div className="flex h-[420px] flex-col rounded-2xl border border-gray-100 bg-white dark:border-[#2a2a2a] dark:bg-[#161616]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-[#2a2a2a]">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-orange-500" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              Urgent / Escalated
            </h2>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tickets.length > 0
              ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
              : "bg-gray-100 text-gray-400 dark:bg-[#1e1e1e] dark:text-gray-400"
            }`}>
            {tickets.length}
          </span>
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 divide-y divide-gray-50 overflow-y-auto dark:divide-[#2a2a2a]">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
          ) : error ? (
            <div className="px-5 py-6 text-sm text-red-500">{error}</div>
          ) : tickets.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">
              No urgent tickets 🎉
            </div>
          ) : (
            tickets.map(c => (
              <UrgentRow key={c.id} c={c} onSelect={setSelected} />
            ))
          )}
        </div>

        {/* Footer */}
        {!loading && tickets.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-3 dark:border-[#2a2a2a]">
            <a
              href="/authority/track"
              className="text-xs font-semibold text-[#b4725a] hover:underline"
            >
              View all urgent tickets →
            </a>
          </div>
        )}
      </div>

      {/* Detail panel — no workers passed, shows "Open in Track" CTA instead */}
      {selected && (
        <ComplaintDetailPanel
          complaint={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
