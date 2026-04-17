// apps/web/app/authority/_components/ComplaintDetailPanel.tsx
"use client"

import React, { useState, useRef } from "react"
import { CheckCheck, ChevronDown, Loader2, MapPin, UserCheck, X } from "lucide-react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { supabase } from "@/src/lib/supabase"
import {
  getSeverityConfig,
  isBreached,
  STATUS_META,
  timeAgo,
  WORKFLOW_STEPS,
  type AuthorityComplaintRow,
  type WorkerOption,
} from "./dashboard-types"

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"


// ─── Assign / Reassign dropdown ───────────────────────────────────────────────
// Props:
//   currentWorkerId — the complaint's current assigned_worker_id (or null)
//   workers         — all worker_profiles for this department loaded from DB
//   compact         — smaller trigger button for use inside table cells

export function AssignDropdown({
  complaintId,
  workers,
  currentWorkerId = null,
  compact = false,
  onAssigned,
}: {
  complaintId: string
  workers: WorkerOption[]
  currentWorkerId?: string | null
  compact?: boolean
  onAssigned: () => void
}) {
  const [open,   setOpen]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  // Pre-select current worker so reassign is one click
  const [chosen, setChosen] = useState(currentWorkerId ?? "")

  const dropdownRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (open && dropdownRef.current) {
      gsap.from(dropdownRef.current, {
        y: -10,
        opacity: 0,
        duration: 0.2,
        ease: "power2.out"
      })
    }
  }, [open])

  // Reset chosen when dropdown opens so it reflects fresh state
  function handleOpen() {
    setChosen(currentWorkerId ?? "")
    setError(null)
    setOpen(o => !o)
  }


  // Show ALL workers (available + busy), grouped — authority should be able to
  // assign anyone; availability is advisory.
  const available   = workers.filter(w => w.availability === "available")
  const unavailable = workers.filter(w => w.availability !== "available")

  const currentWorker = currentWorkerId
    ? workers.find(w => w.id === currentWorkerId)
    : null

  const isReassign = !!currentWorkerId
  // Only enable confirm if selection changed or it's a fresh assign
  const canConfirm = !!chosen && chosen !== currentWorkerId

  async function handleAssign() {
    if (!chosen) return
    setSaving(true)
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error("Not authenticated")

      const response = await fetch(`${apiUrl}/api/authority/assign`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          complaint_id: complaintId,
          worker_id: chosen,
          status: "assigned"
        })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        console.error("Assignment backend error:", errData)
        throw new Error(errData?.detail || "Failed to assign worker")
      }
      
      setOpen(false)
      onAssigned()
    } catch (err: any) {
      console.error("Assignment error:", err)
      setError(err.message || "Failed to assign worker")
    } finally {
      setSaving(false)
    }
  }


  async function handleUnassign() {
    setSaving(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error("Not authenticated")

      const response = await fetch(`${apiUrl}/api/authority/assign`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          complaint_id: complaintId,
          worker_id: null,
          status: "submitted"
        })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        console.error("Unassignment backend error:", errData)
        throw new Error(errData?.detail || "Failed to unassign worker")
      }

      setOpen(false)
      setChosen("")
      onAssigned()
    } catch (err: any) {
      console.error("Unassignment error:", err)
      setError(err.message || "Failed to unassign worker")
    } finally {
      setSaving(false)
    }
  }



  const triggerLabel = isReassign
    ? (currentWorker?.full_name ?? "Assigned")
    : "Assign worker"

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={handleOpen}
        className={`flex items-center gap-1.5 rounded-lg border transition-colors
          ${isReassign
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
            : "border-gray-200 bg-white text-gray-600 hover:border-[#b4725a] hover:text-[#b4725a] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
          }
          ${compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs font-medium"}`}
      >
        <UserCheck size={compact ? 11 : 12} />
        <span className={`max-w-[100px] truncate ${compact ? "text-[11px] font-semibold" : "text-xs font-medium"}`}>
          {isReassign ? `✓ ${triggerLabel}` : triggerLabel}
        </span>
        <ChevronDown size={9} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <>
          {/* Click-away backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />

          <div ref={dropdownRef} className={`${compact ? "absolute right-0 top-full mt-1 w-60" : "relative mt-3 w-full"} z-40 rounded-xl border border-gray-100 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900`}>

            {/* Header */}
            <div className="border-b border-gray-50 px-3 py-2.5 dark:border-gray-800">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                {isReassign ? "Reassign Worker" : "Assign Worker"}
              </p>
              {isReassign && currentWorker && (
                <p className="mt-0.5 text-[11px] text-gray-500">
                  Currently: <span className="font-semibold text-gray-700 dark:text-gray-300">{currentWorker.full_name}</span>
                </p>
              )}
            </div>

            {/* Worker list */}
            <div className={`${compact ? "max-h-52 overflow-y-auto" : "max-h-[60vh] overflow-y-auto"} p-1.5 space-y-0.5`}>
              {error && (
                <div className="mx-2 mb-2 rounded-lg bg-red-50 p-2 text-[10px] font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
                  ⚠️ {error}
                </div>
              )}
              {workers.length === 0 ? (

                <p className="px-3 py-3 text-center text-xs text-gray-400">No workers in department</p>
              ) : (
                <>
                  {/* Available workers first */}
                  {available.length > 0 && (
                    <>
                      <p className="px-2 pt-1 pb-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-500">
                        Available
                      </p>
                      {available.map(w => (
                        <WorkerOption
                          key={w.id}
                          worker={w}
                          chosen={chosen}
                          currentId={currentWorkerId}
                          onChoose={setChosen}
                          complaintId={complaintId}
                        />
                      ))}
                    </>
                  )}

                  {/* Unavailable workers */}
                  {unavailable.length > 0 && (
                    <>
                      <p className="px-2 pt-2 pb-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-400">
                        Busy / Offline
                      </p>
                      {unavailable.map(w => (
                        <WorkerOption
                          key={w.id}
                          worker={w}
                          chosen={chosen}
                          currentId={currentWorkerId}
                          onChoose={setChosen}
                          complaintId={complaintId}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </div>

            {/* Footer actions */}
            {workers.length > 0 && (
              <div className="border-t border-gray-100 dark:border-gray-800 p-2 space-y-1.5">
                <button
                  onClick={handleAssign}
                  disabled={!canConfirm || saving}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#4f392e] py-2 text-xs font-semibold text-white hover:bg-[#b4725a] disabled:opacity-40 transition-colors"
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCheck size={11} />}
                  {saving ? "Saving…" : isReassign ? "Confirm Reassign" : "Confirm Assign"}
                </button>

                {/* Unassign option for already-assigned tickets */}
                {isReassign && (
                  <button
                    onClick={handleUnassign}
                    disabled={saving}
                    className="flex w-full items-center justify-center gap-1 rounded-lg border border-gray-200 py-1.5 text-[11px] font-medium text-gray-500 hover:border-red-300 hover:text-red-500 disabled:opacity-40 transition-colors dark:border-gray-700"
                  >
                    Remove assignment
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Worker option row inside the dropdown ─────────────────────────────────────
function WorkerOption({
  worker,
  chosen,
  currentId,
  onChoose,
  complaintId,
}: {
  worker: WorkerOption
  chosen: string
  currentId: string | null
  onChoose: (id: string) => void
  complaintId: string
}) {
  const isChosen  = chosen === worker.id
  const isCurrent = currentId === worker.id
  const isAvail   = worker.availability === "available"

  return (
    <label
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer transition-colors
        ${isChosen
          ? "bg-[#b4725a]/10 dark:bg-[#b4725a]/20"
          : "hover:bg-gray-50 dark:hover:bg-gray-800"
        }`}
    >
      <input
        type="radio"
        name={`worker-${complaintId}`}
        value={worker.id}
        checked={isChosen}
        onChange={() => onChoose(worker.id)}
        className="accent-[#b4725a] shrink-0"
      />
      {/* Avatar initial */}
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
        style={{
          background: isAvail ? "#10b98122" : "#6b728022",
          color:      isAvail ? "#059669"   : "#6b7280",
        }}
      >
        {worker.full_name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-xs font-medium text-gray-800 dark:text-gray-200">
            {worker.full_name}
          </p>
          {isCurrent && (
            <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-600">
              current
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ background: isAvail ? "#10b981" : "#9ca3af" }}
          />
          <p className="text-[10px] capitalize"
            style={{ color: isAvail ? "#059669" : "#9ca3af" }}>
            {worker.availability}
          </p>
        </div>
      </div>
    </label>
  )
}

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      {children}
    </div>
  )
}

// ─── Workflow stepper ─────────────────────────────────────────────────────────

function WorkflowStepper({ status, escalationLevel }: { status: string; escalationLevel: number }) {
  const steps      = WORKFLOW_STEPS.filter(s => s.key !== "_worker")
  const currentIdx = steps.findIndex(s => s.key === status)
  const activeIdx  = status === "escalated" ? 2 : currentIdx === -1 ? 0 : currentIdx

  return (
    <div>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Workflow Progress</p>
      <div className="flex items-start">
        {steps.map((step, idx) => {
          const done            = idx < activeIdx
          const active          = idx === activeIdx
          const isEscalatedHere = status === "escalated" && idx === 2

          return (
            <div key={step.key} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                {idx > 0 && (
                  <div className={`h-0.5 flex-1 transition-colors ${done || (active && !isEscalatedHere) ? "bg-[#b4725a]" : "bg-gray-200 dark:bg-gray-700"}`} />
                )}
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors
                  ${isEscalatedHere
                    ? "bg-purple-100 text-purple-700 ring-2 ring-purple-300 dark:bg-purple-900/30 dark:text-purple-300"
                    : active
                    ? "bg-[#b4725a] text-white shadow-sm"
                    : done
                    ? "bg-[#b4725a]/20 text-[#b4725a]"
                    : "bg-gray-100 text-gray-400 dark:bg-gray-800"}`}
                >
                  {isEscalatedHere ? "!" : done ? "✓" : idx + 1}
                </div>
                {idx < steps.length - 1 && (
                  <div className={`h-0.5 flex-1 transition-colors ${done ? "bg-[#b4725a]" : "bg-gray-200 dark:bg-gray-700"}`} />
                )}
              </div>
              <p className={`mt-1.5 text-center text-[9px] font-semibold leading-tight ${active || done ? "text-gray-700 dark:text-gray-300" : "text-gray-400"}`}>
                {isEscalatedHere ? "Escalated" : step.label}
              </p>
              <p className="text-[8px] text-gray-400">{step.actor}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── SLA display ──────────────────────────────────────────────────────────────

function SlaDisplay({ deadline, status }: { deadline: string | null; status: string }) {
  if (!deadline) return <span className="text-sm text-gray-400">Not set</span>

  const breached = isBreached(deadline, status as any)
  const diff     = new Date(deadline).getTime() - Date.now()
  const days     = Math.ceil(diff / 86_400_000)
  const hours    = Math.ceil(diff / 3_600_000)

  const dateStr = new Date(deadline).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  })

  const tag = breached
    ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-900/30 dark:text-red-400">Breached</span>
    : diff < 4 * 3_600_000
    ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-600">{hours}h left</span>
    : days <= 2
    ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">{days}d left</span>
    : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">On track</span>

  return (
    <div className="flex items-center gap-2">
      <span className={`text-sm ${breached ? "font-semibold text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}`}>
        {dateStr}
      </span>
      {tag}
    </div>
  )
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

export function ComplaintDetailPanel({
  complaint,
  workers,
  onClose,
  onAssigned,
  inline = false,
}: {
  complaint: AuthorityComplaintRow
  workers?: WorkerOption[]
  onClose: () => void
  onAssigned?: () => void
  inline?: boolean
}) {
  // getSeverityConfig — reads effective_severity directly, no silent Medium fallback
  const sev = getSeverityConfig(complaint.effective_severity)
  const st  = STATUS_META[complaint.status] || { label: complaint.status, badge: "bg-gray-100 text-gray-500" }

  // Can assign/reassign: workers exist + ticket is not terminal
  const canAssign =
    !!workers?.length &&
    complaint.status !== "resolved" &&
    complaint.status !== "rejected"

  const isEscalated    = complaint.status === "escalated" || complaint.escalation_level > 0
  const assignedWorker = complaint.assigned_worker_id
    ? workers?.find(w => w.id === complaint.assigned_worker_id)
    : null
  const slaBreached = isBreached(complaint.sla_deadline, complaint.status)

  // ── Header ──────────────────────────────────────────────────────────────────
  const header = (
    <div className="flex items-start justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
      <div className="flex-1 pr-4">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {/* Severity — inline style matching citizen page */}
          <span
            className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
            style={{ background: sev.color + "22", color: sev.color }}
          >
            {sev.label}
          </span>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.badge}`}>
            {st.label}
          </span>
          {slaBreached && (
            <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600 dark:bg-red-900/30 dark:text-red-400">
              SLA Breached
            </span>
          )}
        </div>
        <h2 className="text-base font-semibold leading-snug text-gray-900 dark:text-white">
          {complaint.title}
        </h2>
        <p className="mt-0.5 font-mono text-xs text-gray-400">{complaint.ticket_id}</p>
      </div>
      <button
        onClick={onClose}
        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 transition-colors"
      >
        <X size={18} />
      </button>
    </div>
  )

  // ── Body ────────────────────────────────────────────────────────────────────
  const body = (
    <div className={`${inline ? "" : "flex-1 overflow-y-auto"} px-4 py-3 space-y-3`}>
      <WorkflowStepper status={complaint.status} escalationLevel={complaint.escalation_level} />

      <div className="h-px bg-gray-100 dark:bg-gray-800" />

      <Field label="Category">
        <span className="text-sm text-gray-800 dark:text-gray-200">
          {complaint.categories?.name ?? "—"}
        </span>
      </Field>

      {complaint.address_text && (
        <Field label="Location">
          <span className="flex items-start gap-1.5 text-sm text-gray-700 dark:text-gray-300">
            <MapPin size={13} className="mt-0.5 shrink-0 text-[#b4725a]" />
            {complaint.address_text}
          </span>
        </Field>
      )}

      <Field label="Reported">
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {new Date(complaint.created_at).toLocaleDateString("en-IN", {
            day: "numeric", month: "long", year: "numeric",
          })}
          <span className="ml-1.5 text-xs text-gray-400">({timeAgo(complaint.created_at)})</span>
        </span>
      </Field>

      {/* Severity detail with the full color swatch */}
      <Field label="Severity">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full" style={{ background: sev.color }} />
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-bold uppercase"
            style={{ background: sev.color + "22", color: sev.color }}
          >
            {sev.label}
          </span>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Upvotes">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {complaint.upvote_count ?? 0}
          </span>
        </Field>
        <Field label="Escalation">
          {isEscalated ? (
            <span className="inline-flex rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
              Level {complaint.escalation_level || 1}
            </span>
          ) : (
            <span className="text-sm text-gray-400">None</span>
          )}
        </Field>
      </div>

      <Field label="Assigned Worker">
        {complaint.assigned_worker_id ? (
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              {(assignedWorker?.full_name ?? "W").charAt(0).toUpperCase()}
            </span>
            <div>
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                {assignedWorker?.full_name ?? "Worker assigned"}
              </p>
              {assignedWorker?.department && (
                <p className="text-[10px] text-gray-400">{assignedWorker.department}</p>
              )}
            </div>
          </div>
        ) : (
          <span className="text-sm text-orange-500">Unassigned</span>
        )}
      </Field>

      <Field label="SLA Deadline">
        <SlaDisplay deadline={complaint.sla_deadline} status={complaint.status} />
      </Field>
    </div>
  )

  // ── Footer ──────────────────────────────────────────────────────────────────
  const footer = (
    <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-800 space-y-3">
      {canAssign && workers && onAssigned && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            {complaint.assigned_worker_id ? "Reassign Worker" : "Assign a Worker"}
          </p>
          <AssignDropdown
            complaintId={complaint.id}
            workers={workers}
            currentWorkerId={complaint.assigned_worker_id}
            onAssigned={() => { onAssigned(); onClose() }}
          />
        </>
      )}
      {!inline && (
        <a
          href="/authority/track"
          className="flex w-full items-center justify-center rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-900"
        >
          Open in Track Complaints →
        </a>
      )}
    </div>
  )

  if (inline) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
        {header}
        {body}
        {footer}
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 z-[2150] bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 z-[2200] flex h-full w-full max-w-md flex-col border-l border-gray-100 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950">
        {header}
        {body}
        {footer}
      </div>
    </>
  )
}
