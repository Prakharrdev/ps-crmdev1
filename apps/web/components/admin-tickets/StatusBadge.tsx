import type { ComplaintStatus } from "@/components/admin-tickets/types"
import { formatStatusLabel } from "@/components/admin-tickets/formatters"

type StatusBadgeProps = {
  status: ComplaintStatus
}

const statusStyles: Record<ComplaintStatus, string> = {
  submitted: "bg-amber-100 text-amber-800 border-amber-200 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300",
  under_review: "bg-amber-100 text-amber-800 border-amber-200 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300",
  assigned: "bg-amber-100 text-amber-800 border-amber-200 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-300",
  resolved: "bg-green-100 text-green-800 border-green-200 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-300",
  rejected: "bg-zinc-200 text-zinc-700 border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300",
  escalated: "bg-red-100 text-red-800 border-red-200 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300",
  pending_closure: "bg-purple-100 text-purple-800 border-purple-200 dark:border-purple-900/50 dark:bg-purple-900/20 dark:text-purple-300",
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`inline-flex rounded-lg border px-2.5 py-1 text-sm font-medium ${statusStyles[status]}`}>
      {formatStatusLabel(status)}
    </span>
  )
}
