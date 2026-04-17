import type { Enums } from "@/src/types/database.types"

export type TicketStatusFilter = "all" | "pending" | "in_progress" | "resolved" | "escalated"
export type PriorityFilter = "all" | "low" | "medium" | "high" | "emergency"

export type TicketFiltersState = {
  status: TicketStatusFilter
  category: string
  authority: string
  priority: PriorityFilter
}

export type ComplaintStatus = Enums<"complaint_status">
export type SeverityLevel = Enums<"severity_level">

export type TicketRecord = {
  id: string
  ticketId: string
  title: string
  category: string
  location: string
  status: ComplaintStatus
  severity: SeverityLevel
  escalationLevel: number
  assignedWorkerId: string | null
  createdAt: string
  authority: string
  worker: string
  citizenId: string
  isSpam: boolean
}

export const PAGE_SIZE = 20

export const initialFilters: TicketFiltersState = {
  status: "all",
  category: "all",
  authority: "all",
  priority: "all",
}
