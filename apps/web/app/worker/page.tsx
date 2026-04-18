"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { AlertTriangle, CheckCircle2, ClipboardList, MapPinned } from "lucide-react"
import { supabase } from "@/src/lib/supabase"
import {
  formatDistance,
  formatSeverity,
  haversineKm,
  parseLatLng,
  relativeTime,
  severityClass,
  severityWeight,
  type ActivityItem,
  type DashboardStats,
  type DashboardTask,
} from "@/components/worker-dashboard/dashboard-types"
import CurrentTicketCard from "@/components/worker-dashboard/CurrentTicketCard"
import PendingTicketCard from "@/components/worker-dashboard/PendingTicketCard"

const WorkerTaskMapPanel = dynamic(() => import("@/components/worker-dashboard/WorkerTaskMapPanel"), {
  ssr: false,
})

type ComplaintWithCategory = {
  id: string
  ticket_id: string
  assigned_worker_id: string | null
  description: string
  address_text: string | null
  severity: "L1" | "L2" | "L3" | "L4"
  status:
    | "submitted"
    | "under_review"
    | "assigned"
    | "in_progress"
    | "pending_closure"
    | "resolved"
    | "rejected"
    | "escalated"
    | "reopened"
  created_at: string
  resolved_at: string | null
  location: unknown
  sla_breached: boolean
  sla_deadline: string | null
  categories: { name: string } | null
  is_spam: boolean
  camera_id: string | null  // present on CCTV auto-generated tickets
}

type ProfileAccessRow = {
  id: string
  email: string
  role: string
}

const WORKER_DASHBOARD_CACHE_KEY = "worker_dashboard_cache"

type WorkerDashboardPayload = {
  source?: string
  workerId: string
  workerProfile: { last_location: unknown } | null
  complaints: ComplaintWithCategory[]
  activityHistory: {
    id: string
    complaint_id: string
    old_status: string
    new_status: string
    note: string | null
    created_at: string
  }[]
}

const ACTIONABLE_STATUSES: DashboardTask["status"][] = ["assigned", "reopened", "in_progress", "escalated"]

function transformPayload(payload: WorkerDashboardPayload) {
    const workerLocation = parseLatLng(payload.workerProfile?.last_location)
    const normalizedTasks = (payload.complaints ?? []).map((complaint) => {
      const complaintLocation = parseLatLng(complaint.location)
      const distanceKm =
        workerLocation && complaintLocation ? haversineKm(workerLocation, complaintLocation) : null

      return {
        id: complaint.id,
        ticketId: complaint.ticket_id || complaint.id,
        assignedWorkerId: complaint.assigned_worker_id,
        description: complaint.description,
        category: complaint.categories?.name ?? "Uncategorized",
        location: complaint.address_text ?? "Unknown location",
        severity: complaint.severity,
        status: complaint.status,
        createdAt: complaint.created_at,
        resolvedAt: complaint.resolved_at,
        latitude: complaintLocation?.lat ?? null,
        longitude: complaintLocation?.lng ?? null,
        distanceKm,
        cameraId: complaint.camera_id ?? null,
        slaBreached: complaint.sla_breached ?? false,
        slaDeadline: complaint.sla_deadline ?? null,
        isSpam: complaint.is_spam || false,
      } satisfies DashboardTask
    })

    const activityItems = (payload.activityHistory ?? []).map((row) => {
      let text = `Updated Complaint #${row.complaint_id}`
      if (row.new_status === "in_progress") text = `Started work on Complaint #${row.complaint_id}`
      if (row.new_status === "resolved") text = `Completed Complaint #${row.complaint_id}`
      if (row.note && row.new_status !== "in_progress" && row.new_status !== "resolved") {
        text = `Updated progress on Complaint #${row.complaint_id}`
      }
      return { id: row.id, text, createdAt: row.created_at } satisfies ActivityItem
    })

    return {
      workerId: payload.workerId,
      tasks: normalizedTasks.filter((task) => task.assignedWorkerId === payload.workerId),
      activity: activityItems,
    }
  }

function getInitialDashboardCache(): { tasks: DashboardTask[]; activity: ActivityItem[]; workerId: string | null } {
  if (typeof window === "undefined") return { tasks: [], activity: [], workerId: null }
  try {
    const cached = localStorage.getItem(WORKER_DASHBOARD_CACHE_KEY)
    if (cached) {
      const result = transformPayload(JSON.parse(cached))
      return result
    }
  } catch {}
  return { tasks: [], activity: [], workerId: null }
}

export default function WorkerDashboardPage() {
  const [workerId, setWorkerId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<DashboardTask[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false)
  const [completionNote, setCompletionNote] = useState("")
  const [proofPhoto, setProofPhoto] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const applyPayload = useCallback((payload: WorkerDashboardPayload) => {
    const result = transformPayload(payload)
    setWorkerId(result.workerId)
    setTasks(result.tasks)
    setActivity(result.activity)
  }, [])

  // 1. Instant UI: Load from cache (client-side only to avoid hydration mismatch)
  useEffect(() => {
    try {
      const cached = localStorage.getItem(WORKER_DASHBOARD_CACHE_KEY)
      if (cached) {
        const payload = JSON.parse(cached)
        applyPayload(payload)
        setLoading(false)
      }
    } catch {}
  }, [applyPayload])

  const fetchDashboardData = useCallback(async () => {
    setLoading(true)
    setError(null)

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session?.access_token) {
      setLoading(false)
      setError("Unable to load worker context.")
      return
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const response = await fetch(`${apiUrl}/api/worker/dashboard`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      const payload = (await response.json().catch(() => null)) as WorkerDashboardPayload | null

      if (!response.ok || !payload) {
        const errorDetail = (payload as any)?.detail
        setLoading(false)
        setError(
          typeof errorDetail === "string"
            ? errorDetail
            : "Failed to load worker dashboard data."
        )
        return
      }

      applyPayload(payload)

      // Persist to localStorage for instant load
      try { localStorage.setItem(WORKER_DASHBOARD_CACHE_KEY, JSON.stringify(payload)) } catch {}
    } catch (err) {
      console.error("Worker dashboard fetch error:", err)
      setError("Failed to load worker dashboard data.")
    } finally {
      setLoading(false)
    }
  }, [applyPayload])

  // localStorage already read in useState initializer — just fetch fresh data
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchDashboardData()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [fetchDashboardData])

  // PERFORMANCE OPTIMIZATION: Removed 15s polling. 
  // We now rely entirely on the Realtime channels below for updates.

  // Invalidate Redis cache then fetch fresh data — used by realtime handlers
  // so the re-fetch doesn't just return stale cached data.
  const invalidateAndFetch = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
        await fetch(`${apiUrl}/api/worker/dashboard/invalidate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
        })
      }
    } catch (err) {
      console.error("Cache invalidation failed:", err)
    }
    await fetchDashboardData()
  }, [fetchDashboardData])

  // ── Realtime sync: listen for external changes ──────────────────────────────
  useEffect(() => {
    if (!workerId) return

    const channel = supabase
      .channel(`worker-dashboard-rt-${workerId}`)
      // Authority assigns/reassigns/updates a ticket assigned to this worker
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaints", filter: `assigned_worker_id=eq.${workerId}` },
        () => void invalidateAndFetch(),
      )
      // Catch tickets being reassigned AWAY from this worker (old row had our id, new row doesn't)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "complaints" },
        (payload) => {
          const old = payload.old as { assigned_worker_id?: string }
          if (old.assigned_worker_id === workerId) {
            void invalidateAndFetch()
          }
        },
      )
      // Admin changes worker profile (department, availability, block)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "worker_profiles", filter: `worker_id=eq.${workerId}` },
        () => void invalidateAndFetch(),
      )
      // Activity feed: new ticket_history entry by this worker
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_history", filter: `changed_by=eq.${workerId}` },
        () => void invalidateAndFetch(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workerId, invalidateAndFetch])

  const sortedAssignedTasks = useMemo(() => {
    return tasks
      .filter((task) => task.status === "assigned" || task.status === "reopened")
      .sort((a, b) => {
        if (severityWeight[b.severity] !== severityWeight[a.severity]) {
          return severityWeight[b.severity] - severityWeight[a.severity]
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })
  }, [tasks])

  const stats = useMemo(() => {
    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()

    return {
      tasksToday: tasks.filter((task) => new Date(task.createdAt).getTime() >= startOfDay).length,
      pending: tasks.filter((task) => task.status === "assigned" || task.status === "reopened").length,
      completedToday: tasks.filter(
        (task) => task.status === "resolved" && !task.isSpam && task.resolvedAt && new Date(task.resolvedAt).getTime() >= startOfDay,
      ).length,
      urgent: tasks.filter((task) => ACTIONABLE_STATUSES.includes(task.status) && task.slaBreached).length,
    } satisfies DashboardStats
  }, [tasks])

  const actionableTasks = useMemo(
    () => tasks.filter((task) => ACTIONABLE_STATUSES.includes(task.status)),
    [tasks],
  )

  const currentTask = useMemo(() => tasks.find((task) => task.status === "in_progress") ?? null, [tasks])
  const urgentTask = useMemo(
    () =>
      actionableTasks.find(
        (task) => task.slaBreached && (task.status === "in_progress" || task.status === "escalated"),
      ) ??
      actionableTasks.find((task) => task.slaBreached) ??
      null,
    [actionableTasks],
  )

  const pendingTask = useMemo(() => sortedAssignedTasks[0] ?? null, [sortedAssignedTasks])

  const emitSupervisedSampleEvent = useCallback(
    async (params: {
      complaintId: string
      eventType: "present" | "absent" | "repair_complete"
      cameraId?: string | null
      proofPhotoUrl?: string | null
    }) => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.access_token) return

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
        const response = await fetch(`${apiUrl}/api/worker/supervised-samples`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            complaint_id: params.complaintId,
            event_type: params.eventType,
            camera_id: params.cameraId ?? null,
            proof_photo_url: params.proofPhotoUrl ?? null,
            source: "worker_dashboard",
          }),
        })

        if (!response.ok) {
          const bodyText = await response.text().catch(() => "")
          console.warn("[WORKER][SAMPLE_EVENT] API returned non-200", {
            complaintId: params.complaintId,
            eventType: params.eventType,
            status: response.status,
            bodyText,
          })
          return
        }

        const result = await response.json().catch(() => null)
        console.info("[WORKER][SAMPLE_EVENT] emitted", {
          complaintId: params.complaintId,
          eventType: params.eventType,
          result,
        })
      } catch (err) {
        console.warn("[WORKER][SAMPLE_EVENT] emission failed", {
          complaintId: params.complaintId,
          eventType: params.eventType,
          err,
        })
      }
    },
    [],
  )

  const notifyComplaintEmail = useCallback(
    async (params: { complaintId: string; status: string; workerIdOverride?: string | null }) => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.access_token) return

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
        const response = await fetch(`${apiUrl}/api/notifications/complaint-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            complaint_id: params.complaintId,
            event_type: "status_changed",
            status: params.status,
            worker_id_override: params.workerIdOverride ?? undefined,
          }),
        })

        if (!response.ok) {
          const bodyText = await response.text().catch(() => "")
          console.error("[WORKER] complaint email notification failed", {
            complaintId: params.complaintId,
            status: params.status,
            responseStatus: response.status,
            bodyText,
          })
        }
      } catch (err) {
        console.error("[WORKER] complaint email notification error", {
          complaintId: params.complaintId,
          status: params.status,
          err,
        })
      }
    },
    [],
  )

  const handleMarkAbsent = useCallback(
    async (complaintId: string) => {
      if (!workerId) return

      const task = tasks.find((item) => item.id === complaintId)
      if (!task) return

      const updates: Record<string, unknown> = {
        status: "rejected",
        assigned_worker_id: null,
        rejection_reason: "worker_absent_confirmed",
      }

      const { error: complaintError } = await supabase.from("complaints").update(updates).eq("id", complaintId)

      if (complaintError) {
        setError(`Failed to mark complaint ${task.ticketId} absent.`)
        return
      }

      if (task.cameraId) {
        await supabase.from("cctv_cameras").update({ last_status: "No Issue Detected" }).eq("id", task.cameraId)
      }

      await supabase.from("ticket_history").insert({
        changed_by: workerId,
        complaint_id: complaintId,
        old_status: task.status,
        new_status: "rejected",
        note: "Worker marked ticket absent/no issue detected on site.",
        is_internal: false,
      })

      await notifyComplaintEmail({
        complaintId,
        status: "rejected",
        workerIdOverride: workerId,
      })

      if (task.cameraId) {
        await emitSupervisedSampleEvent({
          complaintId,
          eventType: "absent",
          cameraId: task.cameraId,
        })
      }

      if (task.assignedWorkerId === workerId) {
        await supabase
          .from("worker_profiles")
          .update({ current_complaint_id: null, availability: "available" })
          .eq("worker_id", workerId)
      }

      await invalidateAndFetch()
    },
    [emitSupervisedSampleEvent, invalidateAndFetch, notifyComplaintEmail, tasks, workerId],
  )

  const updateTaskStatus = useCallback(
    async (complaintId: string, nextStatus: "in_progress" | "pending_closure" | "resolved" | "escalated", note?: string) => {
      if (!workerId) return

      const task = tasks.find((item) => item.id === complaintId)
      if (!task) return

      const { error: updateError } = await supabase
        .from("complaints")
        .update({
          status: nextStatus as any,
          resolved_at: nextStatus === "resolved" ? new Date().toISOString() : null,
        })
        .eq("id", complaintId)

      if (updateError) {
        setError(`Failed to update status for complaint ${task.ticketId}.`)
        return
      }

      const { error: historyError } = await supabase.from("ticket_history").insert({
        changed_by: workerId,
        complaint_id: complaintId,
        old_status: task.status,
        new_status: nextStatus,
        note: note ?? null,
        is_internal: false,
      })

      if (historyError) {
        setError("Task updated, but activity log write failed.")
      }

      await notifyComplaintEmail({
        complaintId,
        status: nextStatus,
        workerIdOverride: workerId,
      })

      if (nextStatus === "in_progress") {
        await supabase
          .from("worker_profiles")
          .update({ current_complaint_id: complaintId, availability: "busy" })
          .eq("worker_id", workerId)

        if (task.cameraId) {
          await emitSupervisedSampleEvent({
            complaintId,
            eventType: "present",
            cameraId: task.cameraId,
          })
        }
      }

      // pending_closure: worker stays busy, ticket is awaiting citizen confirmation
      // Don't clear current_complaint_id or set availability to available

      if (nextStatus === "resolved") {
        await supabase
          .from("worker_profiles")
          .update({ current_complaint_id: null, availability: "available" })
          .eq("worker_id", workerId)
      }

      if (nextStatus === "escalated") {
        await supabase
          .from("worker_profiles")
          .update({ current_complaint_id: null, availability: "available" })
          .eq("worker_id", workerId)
      }

      await invalidateAndFetch()
    },
    [emitSupervisedSampleEvent, invalidateAndFetch, notifyComplaintEmail, tasks, workerId],
  )

  const handleCompleteTask = useCallback(
    async (complaintId: string) => {
      await updateTaskStatus(complaintId, "pending_closure", completionNote.trim() || "Completed from worker dashboard")

      // Trigger WhatsApp notification to the citizen
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
          await fetch(`${apiUrl}/api/notify/closure-confirmation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ complaint_id: complaintId }),
          })
        }
      } catch (err) {
        console.error("WhatsApp notification failed (non-blocking):", err)
      }
    },
    [updateTaskStatus, completionNote],
  )

  const handleUpdateProgress = useCallback(
    async (complaintId: string, note: string) => {
      if (!workerId) return
      const task = tasks.find((item) => item.id === complaintId)
      if (!task) return

      const { error: historyError } = await supabase.from("ticket_history").insert({
        changed_by: workerId,
        complaint_id: complaintId,
        old_status: task.status,
        new_status: task.status,
        note,
        is_internal: false,
      })

      if (historyError) {
        setError(`Failed to add progress note for complaint ${task.ticketId}.`)
        return
      }

      await invalidateAndFetch()
    },
    [invalidateAndFetch, tasks, workerId],
  )

  const mapTasks = useMemo(
    () => tasks.filter((task) => !workerId || task.assignedWorkerId === workerId),
    [tasks, workerId],
  )

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null
    const task = tasks.find((item) => item.id === selectedTaskId) ?? null
    if (!task) return null
    if (!ACTIONABLE_STATUSES.includes(task.status)) return null
    return task
  }, [selectedTaskId, tasks])

  const handleSelectTask = useCallback((taskId: string) => {
    setSelectedTaskId(taskId)
  }, [])

  const escalatedTask = useMemo(
    () => actionableTasks.find((task) => task.status === "escalated") ?? null,
    [actionableTasks],
  )

  const displayTask = useMemo(() => {
    return selectedTask ?? currentTask ?? urgentTask ?? escalatedTask ?? null
  }, [currentTask, escalatedTask, selectedTask, urgentTask])

  useEffect(() => {
    if (!selectedTaskId) return
    const selected = tasks.find((task) => task.id === selectedTaskId)
    if (!selected || !ACTIONABLE_STATUSES.includes(selected.status)) {
      setSelectedTaskId(null)
    }
  }, [selectedTaskId, tasks])

  const statsCards = useMemo(
    () => [
      {
        title: "Tasks Today",
        value: stats.tasksToday,
        icon: ClipboardList,
        tone: "bg-white border-gray-200 dark:bg-[#1e1e1e] dark:border-[#2a2a2a]",
      },
      {
        title: "Pending",
        value: stats.pending,
        icon: MapPinned,
        tone: "bg-white border-gray-200 dark:bg-[#1e1e1e] dark:border-[#2a2a2a]",
      },
      {
        title: "Completed Today",
        value: stats.completedToday,
        icon: CheckCircle2,
        tone: "bg-white border-gray-200 dark:bg-[#1e1e1e] dark:border-[#2a2a2a]",
      },
      {
        title: "Urgent",
        value: stats.urgent,
        icon: AlertTriangle,
        tone: "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20",
      },
    ],
    [stats.completedToday, stats.pending, stats.tasksToday, stats.urgent],
  )

  async function handleConfirmComplete() {
    if (!displayTask) return
    setIsSubmitting(true)

    try {
      let proofPhotoUrl: string | null = null

      // 1. Upload proof photo if provided
      if (proofPhoto) {
        const ext = proofPhoto.name.split('.').pop()
        const path = `worker-proofs/${displayTask.id}_${Date.now()}.${ext}`
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('worker-proofs')
          .upload(path, proofPhoto, { upsert: true })
        if (uploadErr) {
          console.error('[WORKER] proof upload error:', uploadErr)
        } else {
          const { data: urlData } = supabase.storage.from('worker-proofs').getPublicUrl(uploadData.path)
          proofPhotoUrl = urlData.publicUrl
        }
      }

      // 2. Complaint moves to pending_closure; linked CCTV camera badge moves to Pending Verification.
      const nextStatus = 'pending_closure'

      // Resolve camera link from DB so existing tickets with missing local camera_id
      // can still transition the surveillance card to Pending Verification.
      let resolvedCameraId: string | null = displayTask.cameraId
      if (!resolvedCameraId) {
        const { data: complaintRow } = await supabase
          .from('complaints')
          .select('camera_id')
          .eq('id', displayTask.id)
          .maybeSingle()
        resolvedCameraId = (complaintRow as { camera_id?: string | null } | null)?.camera_id ?? null
      }

      if (!resolvedCameraId && displayTask.ticketId) {
        const { data: cameraRow } = await supabase
          .from('cctv_cameras')
          .select('id')
          .eq('generated_ticket_id', displayTask.ticketId)
          .maybeSingle()

        resolvedCameraId = (cameraRow as { id?: string } | null)?.id ?? null

        if (resolvedCameraId) {
          await supabase
            .from('complaints')
            .update({ camera_id: resolvedCameraId })
            .eq('id', displayTask.id)
        }
      }

      console.info('[WORKER][COMPLETE] CCTV linkage resolution', {
        complaintId: displayTask.id,
        ticketId: displayTask.ticketId,
        resolvedCameraId,
        sourceCameraId: displayTask.cameraId,
      })

      // 3. Update complaint status + store proof URL
      const updatePayload: Record<string, unknown> = {
        status: nextStatus,
      }
      if (proofPhotoUrl) updatePayload['proof_photo_url'] = proofPhotoUrl

      const { error: updateErr } = await supabase
        .from('complaints')
        .update(updatePayload)
        .eq('id', displayTask.id)

      if (updateErr) {
        console.error('[WORKER] complaint update error:', updateErr)
        setError('Failed to update ticket. Please try again.')
        return
      }

      // 4. Trigger Notifications if normal ticket
      if (!resolvedCameraId) {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.access_token) {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
            await fetch(`${apiUrl}/api/notify/closure-confirmation`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ complaint_id: displayTask.id }),
            })
          }
        } catch (err) {
          console.error("WhatsApp notification failed (non-blocking):", err)
        }
      }

      // 5. If this is a CCTV ticket, trigger Pending Verification on the camera card
      if (resolvedCameraId) {
        const sbAny = supabase as any
        const { error: camErr } = await sbAny
          .from('cctv_cameras')
          .update({ last_status: 'Pending Verification', verification_status: 'pending' })
          .eq('id', resolvedCameraId)
        if (camErr) {
          console.error('[WORKER] camera status update error:', camErr)
        } else {
          console.info('[WORKER][COMPLETE] Camera moved to Pending Verification', {
            complaintId: displayTask.id,
            ticketId: displayTask.ticketId,
            cameraId: resolvedCameraId,
          })
        }
      }

      // 6. Log to ticket_history
      if (workerId) {
        await supabase.from('ticket_history').insert({
          changed_by: workerId,
          complaint_id: displayTask.id,
          old_status: displayTask.status,
          new_status: nextStatus,
          note: completionNote || (resolvedCameraId ? 'Worker marked repair complete. Awaiting CCTV verification.' : 'Worker marked complete. Awaiting citizen confirmation.'),
          is_internal: false,
        })
      }

      await notifyComplaintEmail({
        complaintId: displayTask.id,
        status: nextStatus,
        workerIdOverride: workerId,
      })

      if (proofPhotoUrl && resolvedCameraId) {
        await emitSupervisedSampleEvent({
          complaintId: displayTask.id,
          eventType: "repair_complete",
          cameraId: resolvedCameraId,
          proofPhotoUrl,
        })
      }

      setIsCompletionModalOpen(false)
      setCompletionNote('')
      setProofPhoto(null)
      await invalidateAndFetch()
    } catch (err) {
      console.error('[WORKER] handleConfirmComplete error:', err)
      setError('Unexpected error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex h-full min-h-full flex-col gap-4 overflow-visible lg:gap-5">
      <section className="shrink-0 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {statsCards.map((card) => {
          const Icon = card.icon
          return (
            <article key={card.title} className={`rounded-xl border p-3 shadow-sm sm:p-5 ${card.tone}`}>
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-700 dark:bg-[#2a2a2a] dark:text-gray-200 sm:h-11 sm:w-11">
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 sm:text-sm">{card.title}</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-2xl">{card.value}</p>
                </div>
              </div>
            </article>
          )
        })}
      </section>

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-4">
        <div className="min-h-0 h-full space-y-4 overflow-visible xl:col-span-3 xl:pr-1">
          <WorkerTaskMapPanel
            tasks={mapTasks}
            loading={loading}
            error={error}
            highlightedTaskId={selectedTask?.id ?? null}
            onSelectTask={handleSelectTask}
          />
        </div>

        <aside className="min-h-0 h-full overflow-visible xl:col-span-1 xl:pr-1">
          <div className="flex h-full flex-col gap-4">
            {displayTask ? (
              <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Urgent Ticket</h2>
                </div>

                <CurrentTicketCard
                  ticket={displayTask}
                  onNavigate={(latitude, longitude) => {
                    window.open(
                      `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }}
                  onUpdate={async (ticketId, note) => {
                    await handleUpdateProgress(ticketId, note)
                  }}
                  onStatusChange={async (ticketId, newStatus) => {
                    await updateTaskStatus(ticketId, newStatus as "in_progress" | "pending_closure" | "resolved" | "escalated")
                  }}
                  onMarkAbsent={handleMarkAbsent}
                  onMarkCompleted={(_ticketId) => setIsCompletionModalOpen(true)}
                />
              </section>
            ) : null}

            {pendingTask ? (
              <section className="flex flex-1 flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pending Ticket</h2>
                  <span className="text-xs text-gray-400 dark:text-gray-500">Live status</span>
                </div>
                <PendingTicketCard
                  ticket={pendingTask}
                  onNavigate={(latitude, longitude) => {
                    window.open(
                      `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }}
                  onUpdate={async (ticketId, note) => {
                    await handleUpdateProgress(ticketId, note)
                  }}
                  onStatusChange={async (ticketId, newStatus) => {
                    await updateTaskStatus(ticketId, newStatus as "in_progress" | "pending_closure" | "resolved" | "escalated")
                  }}
                  onMarkAbsent={handleMarkAbsent}
                  onMarkCompleted={(_ticketId) => setIsCompletionModalOpen(true)}
                />
              </section>
            ) : null}
          </div>
        </aside>
      </section>

      {isCompletionModalOpen && displayTask ? (
        <div className="fixed inset-0 z-[2200] flex items-center justify-center p-3 sm:p-4">
          <button
            type="button"
            aria-label="Close completion window"
            className="absolute inset-0 bg-gray-950/40 backdrop-blur-[1px]"
            onClick={() => setIsCompletionModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white p-4 shadow-lg sm:p-5 dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Mark Repair as Complete</h3>
            {displayTask.cameraId ? (
              <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                ⚠️ This is a CCTV ticket. After submission, the Admin Surveillance card will activate for verification.
              </p>
            ) : (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Ticket {displayTask.ticketId} will be sent to the citizen for confirmation before final closure.
              </p>
            )}

            <label className="mt-4 block text-xs font-medium text-gray-600 dark:text-gray-300">
              Proof photo <span className="text-gray-400">(recommended)</span>
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setProofPhoto(e.target.files?.[0] ?? null)}
              className="mt-2 block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-700 dark:border-[#3a3a3a] dark:bg-[#1a1a1a] dark:text-gray-200"
            />
            {proofPhoto && (
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">✓ {proofPhoto.name} selected</p>
            )}

            <label className="mt-3 block text-xs font-medium text-gray-600 dark:text-gray-300">Completion note (optional)</label>
            <textarea
              value={completionNote}
              onChange={(event) => setCompletionNote(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-700 dark:border-[#3a3a3a] dark:bg-[#1a1a1a] dark:text-gray-200"
              placeholder="Add a short note for closure"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsCompletionModalOpen(false)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-[#3a3a3a] dark:text-gray-200 dark:hover:bg-[#2a2a2a]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmComplete}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Completion'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
