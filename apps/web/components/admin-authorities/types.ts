import type { Enums } from "@/src/types/database.types"

export type WorkloadLevel = "normal" | "busy" | "overloaded"

export type AuthorityRecord = {
  id: string
  fullName: string
  email: string
  phone: string | null
  city: string | null
  department: string | null
  isBlocked: boolean
  createdAt: string
  activeTickets: number
  resolvedToday: number
  avgResolutionDays: number
  workersCount: number
  categories: string[]
  workload: WorkloadLevel
  averageRating?: number
  totalReviews?: number
}

export type ComplaintAssignmentRow = {
  id: string
  assigned_officer_id: string | null
  assigned_department: string | null
  status: Enums<"complaint_status">
  created_at: string
  resolved_at: string | null
}

export type AuthorityProfileRow = {
  id: string
  full_name: string | null
  email: string
  phone: string | null
  city: string | null
  department: string | null
  is_blocked: boolean
  created_at: string
}

export type WorkerProfileRow = {
  worker_id: string
  department: string
  average_rating?: number | null
  total_reviews?: number | null
}

export type CategoryRow = {
  name: string
  department: string
}
