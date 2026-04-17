import type { ComplaintStatus, PriorityFilter, SeverityLevel } from "@/components/admin-tickets/types"

export function formatStatusLabel(status: ComplaintStatus): string {
  if (status === "in_progress") return "In Progress"
  if (status === "under_review") return "Pending"
  if (status === "submitted") return "Pending"
  if (status === "assigned") return "Pending"
  if (status === "reopened") return "Reopened"
  if (status === "resolved") return "Resolved"
  if (status === "escalated") return "Escalated"
  if (status === "rejected") return "Rejected"
  if (status === "pending_closure") return "Pending Closure"
  if (status === "spam") return "Spam"
  return status
}

export function severityToPriority(severity: SeverityLevel): Exclude<PriorityFilter, "all"> {
  if (severity === "L1") return "low"
  if (severity === "L2") return "medium"
  if (severity === "L3") return "high"
  return "emergency"
}

export function formatPriorityLabel(priority: Exclude<PriorityFilter, "all">): string {
  if (priority === "low") return "Low"
  if (priority === "medium") return "Medium"
  if (priority === "high") return "High"
  return "Emergency"
}

export function formatRelativeCreated(createdAt: string): string {
  const deltaMs = Date.now() - new Date(createdAt).getTime()

  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    return "just now"
  }

  const minuteMs = 60 * 1000
  const hourMs = 60 * minuteMs
  const dayMs = 24 * hourMs

  if (deltaMs < hourMs) {
    const minutes = Math.max(1, Math.floor(deltaMs / minuteMs))
    return `${minutes} min ago`
  }

  if (deltaMs < dayMs) {
    const hours = Math.floor(deltaMs / hourMs)
    return `${hours} hour${hours > 1 ? "s" : ""} ago`
  }

  const days = Math.floor(deltaMs / dayMs)
  return `${days} day${days > 1 ? "s" : ""} ago`
}
