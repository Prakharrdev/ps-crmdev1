"use client"

import { useEffect, useRef, useState } from "react"
import { Navigation, NotebookPen, CheckCircle2, ChevronDown } from "lucide-react"
import type { DashboardTask } from "./dashboard-types"
import { getSeverityDotColor, statusClasses, formatStatus } from "@/lib/ticket-formatters"

interface PendingTicketCardProps {
  ticket: DashboardTask
  onNavigate: (latitude: number, longitude: number) => void
  onUpdate: (ticketId: string, note: string) => void
  onStatusChange: (ticketId: string, newStatus: string) => void
  onMarkAbsent: (ticketId: string) => void
  onMarkCompleted: (ticketId: string) => void
}

export default function PendingTicketCard({
  ticket,
  onNavigate,
  onUpdate,
  onStatusChange,
  onMarkAbsent,
  onMarkCompleted,
}: PendingTicketCardProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [noteMode, setNoteMode] = useState(false)
  const [progressNote, setProgressNote] = useState("")
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
        setNoteMode(false)
        setProgressNote("")
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [dropdownOpen])

  const canNavigate = ticket.latitude !== null && ticket.longitude !== null
  const canComplete = ticket.status === "in_progress"

  return (
    <article className="flex h-full flex-col justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition-all duration-200 dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${getSeverityDotColor(ticket.severity)}`} />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{ticket.ticketId}</span>
        </div>
        <span className="flex items-center gap-1.5">
          <span className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium ${ticket.isSpam ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" : statusClasses(ticket.status)}`}>
            {ticket.isSpam ? "SPAM" : formatStatus(ticket.status)}
          </span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (canNavigate) {
              onNavigate(ticket.latitude!, ticket.longitude!)
            }
          }}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400 dark:disabled:bg-gray-600"
          disabled={!canNavigate}
          title={canNavigate ? "Open in Google Maps" : "Location not available"}
        >
          <Navigation size={14} />
          Navigate
        </button>

        <div className="relative flex-[1.2]" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => {
              setDropdownOpen((prev) => !prev)
              setNoteMode(false)
              setProgressNote("")
            }}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-[#3a3a3a] dark:text-gray-200 dark:hover:bg-[#2a2a2a]"
            title="Update ticket status"
          >
            <NotebookPen size={14} />
            Update
            <ChevronDown size={14} className={`transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute bottom-[calc(100%+4px)] right-0 z-[1000] w-[min(18rem,calc(100vw-3rem))] rounded-lg border border-gray-200 bg-white shadow-lg dark:border-[#3a3a3a] dark:bg-[#1e1e1e]">
              {!noteMode ? (
                <ul className="py-1">
                  {(ticket.status === "assigned" || ticket.status === "reopened") && (
                    <>
                      <li>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                          onClick={() => {
                            onStatusChange(ticket.id, "in_progress")
                            setDropdownOpen(false)
                          }}
                        >
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          Present
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-orange-700 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-900/20"
                          onClick={() => {
                            onMarkAbsent(ticket.id)
                            setDropdownOpen(false)
                          }}
                        >
                          <span className="h-2 w-2 rounded-full bg-orange-500" />
                          Absent
                        </button>
                      </li>
                    </>
                  )}
                  {ticket.status === "in_progress" && (
                    <>
                      <li>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                          onClick={() => {
                            onMarkCompleted(ticket.id)
                            setDropdownOpen(false)
                          }}
                        >
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          Mark Completed
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                          onClick={() => {
                            onStatusChange(ticket.id, "escalated")
                            setDropdownOpen(false)
                          }}
                        >
                          <span className="h-2 w-2 rounded-full bg-red-500" />
                          Escalate
                        </button>
                      </li>
                    </>
                  )}
                  <li>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-[#2a2a2a]"
                      onClick={() => setNoteMode(true)}
                    >
                      <NotebookPen size={14} />
                      Add Progress Note
                    </button>
                  </li>
                </ul>
              ) : (
                <div className="space-y-2 p-3">
                  <textarea
                    value={progressNote}
                    onChange={(e) => setProgressNote(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-gray-300 bg-white p-2 text-xs text-gray-700 placeholder:text-gray-400 dark:border-[#3a3a3a] dark:bg-[#1a1a1a] dark:text-gray-200"
                    placeholder="Enter progress note..."
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-md px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-[#2a2a2a]"
                      onClick={() => {
                        setNoteMode(false)
                        setProgressNote("")
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      disabled={!progressNote.trim()}
                      onClick={() => {
                        onUpdate(ticket.id, progressNote.trim())
                        setDropdownOpen(false)
                        setNoteMode(false)
                        setProgressNote("")
                      }}
                    >
                      Submit
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onMarkCompleted(ticket.id)}
          className="inline-flex flex-[1.1] items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-400 dark:disabled:bg-gray-600"
          disabled={!canComplete}
          title={canComplete ? "Mark ticket completed" : "Ticket must be in progress to complete"}
        >
          <CheckCircle2 size={14} />
          Complete
        </button>
      </div>
    </article>
  )
}