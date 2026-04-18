"use client";

import { useState, useRef, useEffect } from "react";
import { MapPin, Building2, Navigation, NotebookPen, CheckCircle2, ChevronDown } from "lucide-react";
import type { DashboardTask } from "./dashboard-types";
import {
  formatTimestamp,
  getSeverityDotColor,
  statusClasses,
  formatStatus,
} from "../../lib/ticket-formatters";

interface CurrentTicketCardProps {
  ticket: DashboardTask;
  onNavigate: (latitude: number, longitude: number) => void;
  onUpdate: (ticketId: string, note: string) => void;
  onStatusChange: (ticketId: string, newStatus: string) => void;
  onMarkAbsent: (ticketId: string) => void;
  onMarkCompleted: (ticketId: string) => void;
}

export default function CurrentTicketCard({
  ticket,
  onNavigate,
  onUpdate,
  onStatusChange,
  onMarkAbsent,
  onMarkCompleted,
}: CurrentTicketCardProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [noteMode, setNoteMode] = useState(false);
  const [progressNote, setProgressNote] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setNoteMode(false);
        setProgressNote("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const canNavigate = ticket.latitude !== null && ticket.longitude !== null;
  const canComplete = ticket.status === "in_progress";

  return (
    <article className="flex flex-col rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ease-out dark:bg-[#1e1e1e] dark:border-[#2a2a2a] dark:hover:border-[#3a3a3a]">
      <div className="p-5 space-y-2">
        {/* Header: Ticket ID with Severity Dot and Status Badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${getSeverityDotColor(
                ticket.severity
              )}`}
            />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {ticket.ticketId}
            </span>
          </div>
          <span className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap ${ticket.isSpam ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" : statusClasses(ticket.status)}`}>
            {ticket.isSpam ? "SPAM" : formatStatus(ticket.status)}
          </span>
        </div>

        {/* Issue Title - Primary Focus */}
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white leading-snug line-clamp-2">
          {ticket.description}
        </h3>

        {/* Location - Secondary with Icon */}
        <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
          <MapPin size={14} className="flex-shrink-0" />
          <span className="line-clamp-1">{ticket.location}</span>
        </div>

        {/* Category/Department - Secondary with Icon */}
        <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
          <Building2 size={14} className="flex-shrink-0" />
          <span className="line-clamp-1">{ticket.category}</span>
        </div>

        {/* Timestamp - Bottom separator */}
        <div className="pt-2 mt-2 border-t border-gray-100 dark:border-[#2a2a2a]">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {formatTimestamp(ticket.createdAt)}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 px-4 pb-4 pt-0 sm:px-5 sm:pb-5">
        <button
          type="button"
          onClick={() => {
            if (canNavigate) {
              onNavigate(ticket.latitude!, ticket.longitude!);
            }
          }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 sm:w-auto dark:disabled:bg-gray-600"
          disabled={!canNavigate}
          title={
            canNavigate
              ? "Open in Google Maps"
              : "Location not available"
          }
        >
          <Navigation size={16} />
          Navigate
        </button>

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => {
              setDropdownOpen((prev) => !prev);
              setNoteMode(false);
              setProgressNote("");
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:w-auto dark:border-[#3a3a3a] dark:text-gray-200 dark:hover:bg-[#2a2a2a]"
            title="Update ticket status"
          >
            <NotebookPen size={16} />
            Update
            <ChevronDown size={14} className={`transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full z-[1000] mt-1 w-[min(18rem,calc(100vw-3rem))] rounded-lg border border-gray-200 bg-white shadow-lg sm:w-64 dark:border-[#3a3a3a] dark:bg-[#1e1e1e]">
              {!noteMode ? (
                <ul className="py-1">
                  {(ticket.status === "assigned" || ticket.status === "reopened") && (
                    <>
                      <li>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                          onClick={() => {
                            onStatusChange(ticket.id, "in_progress");
                            setDropdownOpen(false);
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
                            onMarkAbsent(ticket.id);
                            setDropdownOpen(false);
                          }}
                        >
                          <span className="h-2 w-2 rounded-full bg-orange-500" />
                          Absent
                        </button>
                      </li>
                    </>
                  )}
                  {ticket.status === "in_progress" && (
                    <li>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                        onClick={() => {
                          onMarkCompleted(ticket.id);
                          setDropdownOpen(false);
                        }}
                      >
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Mark Completed
                      </button>
                    </li>
                  )}
                  {ticket.status === "in_progress" && (
                    <li>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                        onClick={() => {
                          onStatusChange(ticket.id, "escalated");
                          setDropdownOpen(false);
                        }}
                      >
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                        Escalate
                      </button>
                    </li>
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
                <div className="p-3 space-y-2">
                  <textarea
                    value={progressNote}
                    onChange={(e) => setProgressNote(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm text-gray-700 placeholder:text-gray-400 dark:border-[#3a3a3a] dark:bg-[#1a1a1a] dark:text-gray-200"
                    placeholder="Enter progress note..."
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-md px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-[#2a2a2a]"
                      onClick={() => {
                        setNoteMode(false);
                        setProgressNote("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      disabled={!progressNote.trim()}
                      onClick={() => {
                        onUpdate(ticket.id, progressNote.trim());
                        setDropdownOpen(false);
                        setNoteMode(false);
                        setProgressNote("");
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
      </div>
    </article>
  );
}
