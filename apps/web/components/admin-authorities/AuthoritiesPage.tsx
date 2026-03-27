"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import AuthoritiesGrid from "@/components/admin-authorities/AuthoritiesGrid"
import AuthorityFilters from "@/components/admin-authorities/AuthorityFilters"
import AuthoritiesHeader from "@/components/admin-authorities/AuthoritiesHeader"
import AuthoritySearch from "@/components/admin-authorities/AuthoritySearch"
import type {
  AuthorityRecord,
  AuthorityProfileRow,
  CategoryRow,
  ComplaintAssignmentRow,
  WorkerProfileRow,
  WorkloadLevel,
} from "@/components/admin-authorities/types"
import { supabase } from "@/src/lib/supabase"

const baseDepartments = [
  "Municipal Corporation",
  "Electricity Board",
  "Water Supply Department",
  "Road Maintenance Authority",
  "Police Department",
  "Sanitation Department",
  "DMRC",
  "NHAI",
]

const activeStatuses = ["submitted", "under_review", "assigned", "in_progress", "escalated"] as const
const activeStatusSet = new Set(activeStatuses)

function isActiveStatus(status: ComplaintAssignmentRow["status"]): boolean {
  return activeStatusSet.has(status as (typeof activeStatuses)[number])
}

function determineWorkload(activeTickets: number): WorkloadLevel {
  if (activeTickets >= 30) return "overloaded"
  if (activeTickets >= 12) return "busy"
  return "normal"
}

function calculateAverageResolutionDays(rows: ComplaintAssignmentRow[]): number {
  const durations = rows
    .filter((row) => row.resolved_at)
    .map((row) => {
      const created = new Date(row.created_at).getTime()
      const resolved = new Date(row.resolved_at as string).getTime()
      return (resolved - created) / (1000 * 60 * 60 * 24)
    })
    .filter((days) => Number.isFinite(days) && days >= 0)

  if (durations.length === 0) return 0

  const total = durations.reduce((sum, value) => sum + value, 0)
  return total / durations.length
}

export default function AuthoritiesPage() {
  const [authorities, setAuthorities] = useState<AuthorityRecord[]>([])
  const [search, setSearch] = useState("")
  const [departmentFilter, setDepartmentFilter] = useState("all")
  const [departmentOptions, setDepartmentOptions] = useState<string[]>(baseDepartments)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [viewAuthority, setViewAuthority] = useState<AuthorityRecord | null>(null)
  const [assignAuthority, setAssignAuthority] = useState<AuthorityRecord | null>(null)
  const [departmentDraft, setDepartmentDraft] = useState("")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newAuthorityName, setNewAuthorityName] = useState("")
  const [newAuthorityEmail, setNewAuthorityEmail] = useState("")
  const [newAuthorityPhone, setNewAuthorityPhone] = useState("")
  const [newAuthorityCity, setNewAuthorityCity] = useState("")
  const [newAuthorityDepartment, setNewAuthorityDepartment] = useState("")
  const [newAuthorityPassword, setNewAuthorityPassword] = useState("")

  // Shared transform: raw API payload → AuthorityRecord[] + department options
  const transformPayload = useCallback((payload: {
    profiles?: AuthorityProfileRow[]
    complaints?: ComplaintAssignmentRow[]
    workers?: WorkerProfileRow[]
    categories?: CategoryRow[]
  }) => {
    const profileRows = payload.profiles ?? []
    const complaintRows = payload.complaints ?? []
    const workerRows = payload.workers ?? []
    const categoryRows = payload.categories ?? []

    const departmentsSet = new Set<string>(baseDepartments)
    const workersByDepartment = new Map<string, number>()
    const categoriesByDepartment = new Map<string, string[]>()
    const complaintsByOfficer = new Map<string, ComplaintAssignmentRow[]>()

    for (const worker of workerRows) {
      const department = worker.department?.trim()
      if (!department) continue
      departmentsSet.add(department)
      workersByDepartment.set(department, (workersByDepartment.get(department) ?? 0) + 1)
    }

    for (const category of categoryRows) {
      const department = category.department?.trim()
      if (!department) continue
      departmentsSet.add(department)
      const existing = categoriesByDepartment.get(department) ?? []
      if (!existing.includes(category.name)) {
        existing.push(category.name)
        categoriesByDepartment.set(department, existing)
      }
    }

    for (const complaint of complaintRows) {
      if (!complaint.assigned_officer_id) continue
      const bucket = complaintsByOfficer.get(complaint.assigned_officer_id) ?? []
      bucket.push(complaint)
      complaintsByOfficer.set(complaint.assigned_officer_id, bucket)
    }

    const todayIsoDate = new Date().toISOString().slice(0, 10)

    const nextAuthorities = profileRows
      .map((profile) => {
        const personComplaints = complaintsByOfficer.get(profile.id) ?? []
        const activeTickets = personComplaints.filter((row) => isActiveStatus(row.status)).length

        const resolvedToday = personComplaints.filter(
          (row) => row.status === "resolved" && (row.resolved_at?.slice(0, 10) ?? "") === todayIsoDate,
        ).length

        const avgResolutionDays = calculateAverageResolutionDays(
          personComplaints.filter((row) => row.status === "resolved"),
        )

        const normalizedDepartment = profile.department?.trim() || null
        if (normalizedDepartment) {
          departmentsSet.add(normalizedDepartment)
        }

        return {
          id: profile.id,
          fullName: profile.full_name || "Unnamed authority",
          email: profile.email,
          phone: profile.phone,
          city: profile.city,
          department: normalizedDepartment,
          isBlocked: profile.is_blocked,
          createdAt: profile.created_at,
          activeTickets,
          resolvedToday,
          avgResolutionDays,
          workersCount: normalizedDepartment ? (workersByDepartment.get(normalizedDepartment) ?? 0) : 0,
          categories: normalizedDepartment ? (categoriesByDepartment.get(normalizedDepartment) ?? []) : [],
          workload: determineWorkload(activeTickets),
        } satisfies AuthorityRecord
      })
      .sort((a, b) => {
        if (b.activeTickets !== a.activeTickets) return b.activeTickets - a.activeTickets
        return a.fullName.localeCompare(b.fullName)
      })

    return {
      authorities: nextAuthorities,
      departments: Array.from(departmentsSet).sort((a, b) => a.localeCompare(b)),
    }
  }, [])

  const fetchAuthorities = useCallback(async () => {
    setError(null)

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session?.access_token) {
      setError("You must be logged in as admin")
      setAuthorities([])
      setLoading(false)
      return
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const response = await fetch(`${apiUrl}/api/admin/authorities`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      const payload = (await response.json().catch(() => null)) as {
        error?: string
        source?: string
        profiles?: AuthorityProfileRow[]
        complaints?: ComplaintAssignmentRow[]
        workers?: WorkerProfileRow[]
        categories?: CategoryRow[]
      } | null

      if (!response.ok || !payload) {
        setError(payload?.error || "Unable to load authorities")
        setLoading(false)
        return
      }

      const result = transformPayload(payload)
      setAuthorities(result.authorities)
      setDepartmentOptions(result.departments)

      // Persist raw payload to localStorage for instant load next time
      try { localStorage.setItem("admin_authorities_payload", JSON.stringify(payload)) } catch {}
    } catch (err) {
      console.error("Authorities fetch error:", err)
      setError("Failed to load authorities data")
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // 1. Instant Load from localStorage
    try {
      const cached = localStorage.getItem("admin_authorities_payload")
      if (cached) {
        const result = transformPayload(JSON.parse(cached))
        setAuthorities(result.authorities)
        setDepartmentOptions(result.departments)
        setLoading(false)
      }
    } catch {}

    // 2. Then fetch fresh data
    void fetchAuthorities()
  }, [fetchAuthorities, transformPayload])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const filteredAuthorities = useMemo(() => {
    const query = search.trim().toLowerCase()

    return authorities.filter((item) => {
      const departmentMatch = departmentFilter === "all" || item.department === departmentFilter
      if (!departmentMatch) return false
      if (!query) return true

      const haystack = [item.fullName, item.email, item.phone, item.department, item.city]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [authorities, departmentFilter, search])

  const headerStats = useMemo(() => {
    const totalAuthorities = authorities.length
    const operationalCount = authorities.filter((item) => !item.isBlocked).length
    const attentionCount = authorities.filter((item) => item.workload === "overloaded").length

    const withAverage = authorities.filter((item) => item.avgResolutionDays > 0)
    const averageResolutionDays =
      withAverage.length > 0
        ? withAverage.reduce((sum, item) => sum + item.avgResolutionDays, 0) / withAverage.length
        : 0

    return {
      totalAuthorities,
      operationalCount,
      attentionCount,
      averageResolutionDays,
    }
  }, [authorities])

  const openAssignDepartment = useCallback((authority: AuthorityRecord) => {
    setAssignAuthority(authority)
    setDepartmentDraft(authority.department ?? "")
  }, [])

  const submitDepartmentAssignment = useCallback(async () => {
    if (!assignAuthority || !departmentDraft) return

    setSaving(true)
    setError(null)

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session?.access_token) {
      setError("You must be logged in as admin")
      setSaving(false)
      return
    }

    const response = await fetch("/api/admin/authorities", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ authority_id: assignAuthority.id, department: departmentDraft }),
    })

    const payload = (await response.json().catch(() => null)) as { error?: string } | null

    if (!response.ok) {
      setError(payload?.error || "Failed to assign department")
      setSaving(false)
      return
    }

    setAssignAuthority(null)
    await fetchAuthorities()
    setSaving(false)
  }, [assignAuthority, departmentDraft, fetchAuthorities])

  const openCreateAuthority = useCallback(() => {
    setNewAuthorityName("")
    setNewAuthorityEmail("")
    setNewAuthorityPhone("")
    setNewAuthorityCity("")
    setNewAuthorityDepartment("")
    setNewAuthorityPassword("")
    setIsCreateOpen(true)
  }, [])

  const submitCreateAuthority = useCallback(async () => {
    const name = newAuthorityName.trim()
    const email = newAuthorityEmail.trim().toLowerCase()
    const department = newAuthorityDepartment.trim()
    const phone = newAuthorityPhone.trim()
    const city = newAuthorityCity.trim()
    const password = newAuthorityPassword

    if (!name || !email || !department) {
      setError("Name, email and department are required to create an authority profile")
      return
    }

    if (password.length < 8) {
      setError("Default password must be at least 8 characters")
      return
    }

    setCreating(true)
    setError(null)

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session?.access_token) {
      setError("You must be logged in as admin to create an authority")
      setCreating(false)
      return
    }

    const response = await fetch("/api/admin/authorities", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        full_name: name,
        email,
        password,
        phone: phone || null,
        city: city || null,
        department,
      }),
    })

    const payload = (await response.json().catch(() => null)) as { error?: string } | null

    if (!response.ok) {
      setError(payload?.error || "Failed to create authority account")
      setCreating(false)
      return
    }

    setIsCreateOpen(false)
    await fetchAuthorities()
    setCreating(false)
  }, [
    fetchAuthorities,
    newAuthorityCity,
    newAuthorityDepartment,
    newAuthorityEmail,
    newAuthorityName,
    newAuthorityPassword,
    newAuthorityPhone,
  ])

  return (
    <section className="space-y-4 rounded-2xl border border-[#d8cfbe] bg-[#f4efe5] p-4 text-[#27221d] shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-100 dark:shadow-none">
      <AuthoritiesHeader now={now} {...headerStats} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openCreateAuthority}
          className="rounded-xl bg-[#102d57] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1a3b6a] dark:bg-[#C9A84C] dark:text-[#1a1a1a] dark:hover:bg-[#d8b65c]"
        >
          + Add New Authority
        </button>
        <Link
          href="/admin/reports"
          className="rounded-xl border border-[#d7cebf] bg-white px-4 py-2 text-sm font-medium text-[#2d2722] hover:bg-gray-50 flex items-center justify-center transition-colors dark:border-[#3a3a3a] dark:bg-[#2a2a2a] dark:text-gray-100"
        >
          View Reports
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <AuthoritySearch value={search} onChange={setSearch} />
        <AuthorityFilters value={departmentFilter} options={departmentOptions} onChange={setDepartmentFilter} />
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">{error}</div> : null}

      <AuthoritiesGrid
        authorities={filteredAuthorities}
        onView={(authority) => setViewAuthority(authority)}
        onAssignDepartment={openAssignDepartment}
      />

      <div className="flex justify-end pt-2 text-sm text-[#4b433b] dark:text-gray-400">
        <p>Platform Version 3.1 - National Deployment - Government of India</p>
      </div>

      {loading ? <p className="text-sm text-[#5f554c] dark:text-gray-400">Loading authority profiles from Supabase...</p> : null}

      {viewAuthority ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-[#d6cec3] bg-white p-5 shadow-xl dark:border-[#3a3a3a] dark:bg-[#1f1f1f]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#27211d] dark:text-gray-100">Authority Profile</h2>
              <button
                type="button"
                onClick={() => setViewAuthority(null)}
                className="rounded-lg border border-[#d8d0c5] px-2 py-1 text-sm text-[#3f3832] dark:border-[#3a3a3a] dark:text-gray-300"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 text-sm text-[#3a342f] dark:text-gray-300 sm:grid-cols-2">
              <p><span className="font-semibold">Name:</span> {viewAuthority.fullName}</p>
              <p><span className="font-semibold">Email:</span> {viewAuthority.email}</p>
              <p><span className="font-semibold">Department:</span> {viewAuthority.department ?? "Unassigned"}</p>
              <p><span className="font-semibold">City:</span> {viewAuthority.city ?? "-"}</p>
              <p><span className="font-semibold">Phone:</span> {viewAuthority.phone ?? "-"}</p>
              <p><span className="font-semibold">Status:</span> {viewAuthority.isBlocked ? "Blocked" : "Active"}</p>
              <p><span className="font-semibold">Active Tickets:</span> {viewAuthority.activeTickets}</p>
              <p><span className="font-semibold">Resolved Today:</span> {viewAuthority.resolvedToday}</p>
              <p><span className="font-semibold">Avg. Resolution:</span> {viewAuthority.avgResolutionDays.toFixed(1)} days</p>
              <p><span className="font-semibold">Workers in Dept:</span> {viewAuthority.workersCount}</p>
            </div>
          </div>
        </div>
      ) : null}

      {assignAuthority ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#d6cec3] bg-white p-5 shadow-xl dark:border-[#3a3a3a] dark:bg-[#1f1f1f]">
            <h2 className="mb-2 text-lg font-semibold text-[#27211d] dark:text-gray-100">Assign Department</h2>
            <p className="mb-4 text-sm text-[#4f463f] dark:text-gray-400">
              Authority: {assignAuthority.fullName}
            </p>

            <label className="mb-4 block">
              <span className="mb-1 block text-sm font-medium text-[#2f2924] dark:text-gray-200">Select department</span>
              <select
                value={departmentDraft}
                onChange={(event) => setDepartmentDraft(event.target.value)}
                className="w-full rounded-lg border border-[#d8d0c5] bg-white px-3 py-2 text-sm text-[#312b26] dark:border-[#3a3a3a] dark:bg-[#161616] dark:text-gray-100"
              >
                <option value="">Choose a department</option>
                {departmentOptions.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssignAuthority(null)}
                className="rounded-lg border border-[#d8d0c5] px-3 py-2 text-sm text-[#3f3832] dark:border-[#3a3a3a] dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitDepartmentAssignment()}
                disabled={!departmentDraft || saving}
                className="rounded-lg bg-[#5c4438] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#6a5042] disabled:opacity-50 dark:bg-[#C9A84C] dark:text-[#1a1a1a] dark:hover:bg-[#d8b65c]"
              >
                {saving ? "Saving..." : "Assign Department"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-[#d6cec3] bg-white p-5 shadow-xl dark:border-[#3a3a3a] dark:bg-[#1f1f1f]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#27211d] dark:text-gray-100">Add New Authority</h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-lg border border-[#d8d0c5] px-2 py-1 text-sm text-[#3f3832] dark:border-[#3a3a3a] dark:text-gray-300"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm text-[#2f2924] dark:text-gray-300">
                <span className="mb-1 block font-medium">Full name</span>
                <input
                  value={newAuthorityName}
                  onChange={(event) => setNewAuthorityName(event.target.value)}
                  placeholder="Ramesh Patel"
                  className="w-full rounded-lg border border-[#d8d0c5] bg-white px-3 py-2 text-sm dark:border-[#3a3a3a] dark:bg-[#161616] dark:text-gray-100"
                />
              </label>

              <label className="block text-sm text-[#2f2924] dark:text-gray-300">
                <span className="mb-1 block font-medium">Email</span>
                <input
                  type="email"
                  value={newAuthorityEmail}
                  onChange={(event) => setNewAuthorityEmail(event.target.value)}
                  placeholder="authority@jansamadhan.in"
                  className="w-full rounded-lg border border-[#d8d0c5] bg-white px-3 py-2 text-sm dark:border-[#3a3a3a] dark:bg-[#161616] dark:text-gray-100"
                />
              </label>

              <label className="block text-sm text-[#2f2924] dark:text-gray-300">
                <span className="mb-1 block font-medium">Phone</span>
                <input
                  value={newAuthorityPhone}
                  onChange={(event) => setNewAuthorityPhone(event.target.value)}
                  placeholder="+91 98xxxxxx"
                  className="w-full rounded-lg border border-[#d8d0c5] bg-white px-3 py-2 text-sm dark:border-[#3a3a3a] dark:bg-[#161616] dark:text-gray-100"
                />
              </label>

              <label className="block text-sm text-[#2f2924] dark:text-gray-300">
                <span className="mb-1 block font-medium">City</span>
                <input
                  value={newAuthorityCity}
                  onChange={(event) => setNewAuthorityCity(event.target.value)}
                  placeholder="Jaipur"
                  className="w-full rounded-lg border border-[#d8d0c5] bg-white px-3 py-2 text-sm dark:border-[#3a3a3a] dark:bg-[#161616] dark:text-gray-100"
                />
              </label>

              <label className="block text-sm text-[#2f2924] dark:text-gray-300">
                <span className="mb-1 block font-medium">Default password</span>
                <input
                  type="password"
                  value={newAuthorityPassword}
                  onChange={(event) => setNewAuthorityPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-lg border border-[#d8d0c5] bg-white px-3 py-2 text-sm dark:border-[#3a3a3a] dark:bg-[#161616] dark:text-gray-100"
                />
              </label>

              <label className="block text-sm text-[#2f2924] dark:text-gray-300 sm:col-span-2">
                <span className="mb-1 block font-medium">Department</span>
                <select
                  value={newAuthorityDepartment}
                  onChange={(event) => setNewAuthorityDepartment(event.target.value)}
                  className="w-full rounded-lg border border-[#d8d0c5] bg-white px-3 py-2 text-sm dark:border-[#3a3a3a] dark:bg-[#161616] dark:text-gray-100"
                >
                  <option value="">Choose a department</option>
                  {departmentOptions.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-lg border border-[#d8d0c5] px-3 py-2 text-sm text-[#3f3832] dark:border-[#3a3a3a] dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitCreateAuthority()}
                disabled={creating}
                className="rounded-lg bg-[#5c4438] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#6a5042] disabled:opacity-50 dark:bg-[#C9A84C] dark:text-[#1a1a1a] dark:hover:bg-[#d8b65c]"
              >
                {creating ? "Creating..." : "Create Authority"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
