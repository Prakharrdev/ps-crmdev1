"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Pagination from "@/components/admin-tickets/Pagination"
import TicketFilters from "@/components/admin-tickets/TicketFilters"
import TicketSearch from "@/components/admin-tickets/TicketSearch"
import TicketsHeader from "@/components/admin-tickets/TicketsHeader"
import TicketsTable from "@/components/admin-tickets/TicketsTable"
import { PAGE_SIZE, initialFilters, type TicketFiltersState, type TicketRecord } from "@/components/admin-tickets/types"
import { supabase } from "@/src/lib/supabase"
import type { Enums } from "@/src/types/database.types"

type CategoryRelation = {
  name: string | null
}

type ProfileRelation = {
  id: string
  full_name: string | null
  department: string | null
}

type ComplaintRow = {
  id: string
  ticket_id: string
  title: string
  category_id: number
  address_text: string | null
  ward_name: string | null
  city: string
  status: Enums<"complaint_status">
  severity: Enums<"severity_level">
  escalation_level: number
  created_at: string
  assigned_department: string | null
  assigned_worker_id: string | null
  assigned_officer_id: string | null
  citizen_id: string
  is_spam: boolean
  categories: CategoryRelation | CategoryRelation[] | null
}

type WorkerOption = {
  id: string
  name: string
  department: string | null
  availability: string
}

type WorkerRow = {
  worker_id: string
  department: string
  availability: string
  worker: ProfileRelation | ProfileRelation[] | null
}

type Option = {
  label: string
  value: string
}

type CategoryOption = {
  id: number
  name: string
}

type AdminComplaintsPayload = {
  source?: string
  items: ComplaintRow[]
  profiles: ProfileRelation[]
  workers: WorkerRow[]
  categories: { id?: number; name: string; department?: string }[]
  totalCount: number
  error?: string
}

function firstRelation<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function normalizeTicket(row: ComplaintRow, profilesById: Record<string, ProfileRelation>): TicketRecord {
  const category = firstRelation(row.categories)
  const authorityProfile = row.assigned_officer_id ? profilesById[row.assigned_officer_id] : undefined
  const workerProfile = row.assigned_worker_id ? profilesById[row.assigned_worker_id] : undefined

  const location = [row.ward_name, row.address_text, row.city].filter(Boolean).join(", ") || "Location unavailable"

  const authority = row.assigned_department ?? authorityProfile?.department ?? authorityProfile?.full_name ?? "Unassigned"

  return {
    id: row.id,
    ticketId: row.ticket_id,
    title: row.title,
    category: category?.name ?? "Uncategorized",
    location,
    status: row.status,
    severity: row.severity,
    escalationLevel: row.escalation_level,
    assignedWorkerId: row.assigned_worker_id,
    createdAt: row.created_at,
    authority,
    worker: workerProfile?.full_name ?? "Unassigned",
    citizenId: row.citizen_id,
    isSpam: row.is_spam,
  }
}

const categoryExamples = [
  "Road Damage",
  "Garbage Collection",
  "Water Leakage",
  "Streetlight Failure",
  "Public Safety",
]

const authorityExamples = [
  "Municipal Corporation",
  "Electricity Board",
  "Water Supply Department",
  "Road Maintenance Authority",
  "Police Department",
  "DMRC",
  "NHAI",
]

const CACHE_KEY = "admin_complaints_cache"

/** Transforms raw API payload into UI state (tickets, workers, filter options) */
function transformPayload(payload: AdminComplaintsPayload) {
  const complaintRows = payload.items ?? []
  const profilesData = payload.profiles ?? []

  // Build profile map for O(1) lookups
  const profileMap: Record<string, ProfileRelation> = {}
  for (const profile of profilesData) {
    profileMap[profile.id] = profile
  }

  const tickets = complaintRows.map((row) => normalizeTicket(row, profileMap))

  // Normalize workers
  const workerRows = payload.workers ?? []
  const workers: WorkerOption[] = workerRows.map((entry) => {
    const workerProfile = firstRelation(entry.worker)
    return {
      id: entry.worker_id,
      name: workerProfile?.full_name ?? "Unnamed worker",
      department: entry.department ?? workerProfile?.department ?? null,
      availability: entry.availability,
    }
  })

  // Build filter options from categories
  const categoryNames = new Set<string>(categoryExamples)
  const authorities = new Set<string>(authorityExamples)

  const safeCategories: CategoryOption[] = (payload.categories ?? []).map((entry) => ({
    id: entry.id ?? 0,
    name: entry.name,
  }))

  for (const item of safeCategories) {
    if (item.name) categoryNames.add(item.name)
  }

  // Also pull departments from complaints for authority filter
  for (const row of complaintRows) {
    if (row.assigned_department) authorities.add(row.assigned_department)
  }

  const categoryOptions: Option[] = [
    { label: "All", value: "all" },
    ...Array.from(categoryNames)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ label: name, value: name })),
  ]

  const authorityOptions: Option[] = [
    { label: "All", value: "all" },
    ...Array.from(authorities)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ label: name, value: name })),
  ]

  return { tickets, workers, categories: safeCategories, categoryOptions, authorityOptions, totalCount: payload.totalCount ?? 0 }
}

export default function TicketsPage() {
  const [search, setSearch] = useState("")
  const [highlightTicketId, setHighlightTicketId] = useState<string | null>(null)
  const [filters, setFilters] = useState<TicketFiltersState>(initialFilters)
  const [tickets, setTickets] = useState<TicketRecord[]>([])
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [workers, setWorkers] = useState<WorkerOption[]>([])
  const [selectedTicket, setSelectedTicket] = useState<TicketRecord | null>(null)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [isAssignOpen, setIsAssignOpen] = useState(false)
  const [assignWorkerId, setAssignWorkerId] = useState("")
  const [categoryOptions, setCategoryOptions] = useState<Option[]>([
    { label: "All", value: "all" },
    ...categoryExamples.map((name) => ({ label: name, value: name })),
  ])
  const [authorityOptions, setAuthorityOptions] = useState<Option[]>([
    { label: "All", value: "all" },
    ...authorityExamples.map((name) => ({ label: name, value: name })),
  ])

  // ── Consolidated fetch from FastAPI ──
  const fetchTickets = useCallback(async () => {
    setLoading(true)
    setError(null)

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session?.access_token) {
      setError("You must be logged in as admin")
      setTickets([])
      setLoading(false)
      return
    }

    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      search: search.trim(),
      status: filters.status,
      priority: filters.priority,
      authority: filters.authority,
      category: filters.category,
    })

    try {
      const response = await fetch(`/api/admin/complaints?${query.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      const payload = (await response.json().catch(() => null)) as AdminComplaintsPayload | null

      if (!response.ok || !payload) {
        setTickets([])
        setTotalCount(0)
        setError(payload?.error || "Failed to fetch tickets")
        setLoading(false)
        return
      }

      const result = transformPayload(payload)
      setTickets(result.tickets)
      setTotalCount(result.totalCount)
      setWorkers(result.workers)
      setCategories(result.categories)
      setCategoryOptions(result.categoryOptions)
      setAuthorityOptions(result.authorityOptions)

      // Persist to localStorage for instant load next time
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
      } catch {}
    } catch (err) {
      console.error("Complaints fetch error:", err)
      setError("Failed to load complaints data")
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page, search])

  const handleView = useCallback((ticket: TicketRecord) => {
    setSelectedTicket(ticket)
    setIsViewOpen(true)
  }, [])

  const handleOpenAssign = useCallback((ticket: TicketRecord) => {
    setSelectedTicket(ticket)
    setAssignWorkerId(ticket.assignedWorkerId ?? "")
    setIsAssignOpen(true)
  }, [])

  const handleEscalate = useCallback(
    async (ticket: TicketRecord) => {
      const confirmed = window.confirm(`Escalate complaint ${ticket.ticketId}?`)
      if (!confirmed) return

      setActionLoading(true)
      setError(null)

      const { error: updateError } = await supabase
        .from("complaints")
        .update({ status: "escalated", escalation_level: (ticket.escalationLevel ?? 0) + 1 })
        .eq("id", ticket.id)

      if (updateError) {
        setError(updateError.message || "Failed to escalate complaint")
        setActionLoading(false)
        return
      }

      const { data: authData } = await supabase.auth.getUser()
      if (authData.user) {
        await supabase.from("ticket_history").insert({
          changed_by: authData.user.id,
          complaint_id: ticket.id,
          old_status: ticket.status,
          new_status: "escalated",
          note: "Escalated from admin complaints dashboard",
        })
      }

      await fetchTickets()
      setActionLoading(false)
    },
    [fetchTickets],
  )

  const handleMarkSpam = useCallback(
    async (ticket: TicketRecord) => {
      const confirmed = window.confirm(`Mark ticket ${ticket.ticketId} as spam? Points will be deducted from the user.`)
      if (!confirmed) return

      setActionLoading(true)
      setError(null)

      try {
        const { data: { session } } = await supabase.auth.getSession()
        const response = await fetch('/api/admin/complaints/spam', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({ 
            complaint_id: ticket.id,
            citizen_id: ticket.citizenId
          })
        })

        if (!response.ok) {
          const payload = await response.json()
          throw new Error(payload.error || "Failed to mark as spam")
        }

        await fetchTickets()
      } catch (err: any) {
        setError(err.message)
      } finally {
        setActionLoading(false)
      }
    },
    [fetchTickets]
  )

  const handleAssignWorker = useCallback(async () => {
    if (!selectedTicket || !assignWorkerId) return

    setActionLoading(true)
    setError(null)

    const selectedWorker = workers.find((worker) => worker.id === assignWorkerId) ?? null
    const nextStatus =
      selectedTicket.status === "submitted" || selectedTicket.status === "under_review"
        ? "assigned"
        : selectedTicket.status

    const payload: {
      assigned_worker_id: string
      status: Enums<"complaint_status">
      assigned_department?: string
    } = {
      assigned_worker_id: assignWorkerId,
      status: nextStatus,
    }

    if (selectedWorker?.department) {
      payload.assigned_department = selectedWorker.department
    }

    const { error: updateError } = await supabase.from("complaints").update(payload).eq("id", selectedTicket.id)

    if (updateError) {
      setError(updateError.message || "Failed to assign worker")
      setActionLoading(false)
      return
    }

    const { data: authData } = await supabase.auth.getUser()
    if (authData.user) {
      await supabase.from("ticket_history").insert({
        changed_by: authData.user.id,
        complaint_id: selectedTicket.id,
        old_status: selectedTicket.status,
        new_status: nextStatus,
        note: `Assigned worker from admin complaints dashboard (${assignWorkerId})`,
      })
    }

    setIsAssignOpen(false)
    setSelectedTicket(null)
    await fetchTickets()
    setActionLoading(false)
  }, [assignWorkerId, fetchTickets, selectedTicket, workers])

  // ── Instant Load from localStorage, then fresh fetch ──
  useEffect(() => {
    // 1. Instant Load: render cached data immediately
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const result = transformPayload(JSON.parse(cached))
        setTickets(result.tickets)
        setTotalCount(result.totalCount)
        setWorkers(result.workers)
        setCategories(result.categories)
        setCategoryOptions(result.categoryOptions)
        setAuthorityOptions(result.authorityOptions)
        setLoading(false)
      }
    } catch {}

    // 2. Then fetch fresh data from FastAPI
    void fetchTickets()
  }, [fetchTickets])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const hId = params.get("highlight")
      const sText = params.get("search")
      if (sText) setSearch(sText)
      if (hId) {
        setHighlightTicketId(hId)
        setTimeout(() => setHighlightTicketId(null), 3000)
      }
    }
  }, [])

  const totalPages = useMemo(() => {
    if (totalCount <= 0) return 1
    return Math.ceil(totalCount / PAGE_SIZE)
  }, [totalCount])

  return (
    <section className="space-y-4 rounded-2xl border border-[#d8cfbe] bg-[#f4efe5] p-4 text-[#27221d] shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-100 dark:shadow-none">
      <TicketsHeader now={now} />
      <TicketSearch
        value={search}
        onChange={(next) => {
          setSearch(next)
          setPage(1)
        }}
      />
      <TicketFilters
        filters={filters}
        categoryOptions={categoryOptions}
        authorityOptions={authorityOptions}
        onChange={(next) => {
          setFilters(next)
          setPage(1)
        }}
      />

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">{error}</div>
      ) : null}

      <TicketsTable
        tickets={tickets}
        actionLoading={actionLoading}
        onView={handleView}
        onAssign={handleOpenAssign}
        onEscalate={handleEscalate}
        onSpam={handleMarkSpam}
        highlightTicketId={highlightTicketId}
      />

      <Pagination page={page} totalPages={totalPages} totalCount={totalCount} pageSize={PAGE_SIZE} onPageChange={setPage} />

      <div className="flex justify-end pt-2 text-sm text-[#4b433b]">
        <p>Platform Version 3.1 - National Deployment - Government of India</p>
      </div>

      {loading ? (
        <p className="text-sm text-[#5f554c]">Loading tickets...</p>
      ) : (
        <p className="text-sm text-[#5f554c]">Data synced from Supabase.</p>
      )}

      {isViewOpen && selectedTicket ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-[#d6cec3] bg-white p-5 shadow-xl dark:border-[#3a3a3a] dark:bg-[#1f1f1f]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#27211d] dark:text-gray-100">Ticket Details</h2>
              <button
                type="button"
                onClick={() => setIsViewOpen(false)}
                className="rounded-lg border border-[#d8d0c5] px-2 py-1 text-sm text-[#3f3832] dark:border-[#3a3a3a] dark:text-gray-300"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 text-sm text-[#3a342f] dark:text-gray-300 sm:grid-cols-2">
              <p><span className="font-semibold">Ticket ID:</span> {selectedTicket.ticketId}</p>
              <p><span className="font-semibold">Status:</span> {selectedTicket.status}</p>
              <p><span className="font-semibold">Title:</span> {selectedTicket.title}</p>
              <p><span className="font-semibold">Priority:</span> {selectedTicket.severity}</p>
              <p><span className="font-semibold">Category:</span> {selectedTicket.category}</p>
              <p><span className="font-semibold">Authority:</span> {selectedTicket.authority}</p>
              <p><span className="font-semibold">Worker:</span> {selectedTicket.worker}</p>
              <p><span className="font-semibold">Created:</span> {new Date(selectedTicket.createdAt).toLocaleString("en-IN")}</p>
              <p><span className="font-semibold">Is Spam:</span> {selectedTicket.isSpam ? "Yes" : "No"}</p>
              <p className="sm:col-span-2"><span className="font-semibold">Location:</span> {selectedTicket.location}</p>
            </div>
          </div>
        </div>
      ) : null}

      {isAssignOpen && selectedTicket ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#d6cec3] bg-white p-5 shadow-xl dark:border-[#3a3a3a] dark:bg-[#1f1f1f]">
            <h2 className="mb-2 text-lg font-semibold text-[#27211d] dark:text-gray-100">Assign Worker</h2>
            <p className="mb-4 text-sm text-[#4f463f] dark:text-gray-400">Ticket: {selectedTicket.ticketId}</p>

            <label className="mb-4 block">
              <span className="mb-1 block text-sm font-medium text-[#2f2924] dark:text-gray-200">Select worker</span>
              <select
                value={assignWorkerId}
                onChange={(event) => setAssignWorkerId(event.target.value)}
                className="w-full rounded-lg border border-[#d8d0c5] bg-white px-3 py-2 text-sm text-[#312b26] dark:border-[#3a3a3a] dark:bg-[#161616] dark:text-gray-100"
              >
                <option value="">Choose a worker</option>
                {workers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.name} | {worker.department ?? "No department"} | {worker.availability}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAssignOpen(false)}
                className="rounded-lg border border-[#d8d0c5] px-3 py-2 text-sm text-[#3f3832] dark:border-[#3a3a3a] dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleAssignWorker()}
                disabled={!assignWorkerId || actionLoading}
                className="rounded-lg bg-[#5c4438] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#6a5042] disabled:opacity-50 dark:bg-[#C9A84C] dark:text-[#1a1a1a] dark:hover:bg-[#d8b65c]"
              >
                {actionLoading ? "Assigning..." : "Assign Worker"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
