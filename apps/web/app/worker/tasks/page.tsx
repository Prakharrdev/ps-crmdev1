"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import type { Database } from "@/src/types/database.types";
import MaterialRequestModal from "@/components/worker/MaterialRequestModal";
import { Package } from "lucide-react";

type ComplaintRow = Database["public"]["Tables"]["complaints"]["Row"];

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function statusClasses(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "submitted") return "bg-amber-100 text-amber-700";
  if (normalized === "assigned") return "bg-blue-100 text-blue-700";
  if (normalized === "in_progress" || normalized === "under_review") return "bg-purple-100 text-purple-700";
  if (normalized === "reopened") return "bg-red-100 text-red-700 font-bold animate-pulse";
  if (normalized === "pending_closure") return "bg-orange-100 text-orange-700";
  if (normalized === "resolved" || normalized === "closed") return "bg-green-100 text-green-700";
  if (normalized === "rejected") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-600";
}

function formatReportedTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function extractRelevantAddress(fullAddress: string | null | undefined): string {
  if (!fullAddress) return "Address unavailable";
  const beforeGPS = fullAddress.split("|")[0].trim();
  const lines = beforeGPS
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length < 100);
  return lines.slice(0, 3).join(", ") || beforeGPS;
}

const WORKER_TASKS_CACHE_KEY = "worker_tasks_cache";

function getInitialTasks(): ComplaintRow[] {
  if (typeof window === "undefined") return [];
  try {
    const cached = localStorage.getItem(WORKER_TASKS_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}
  return [];
}

export default function WorkerTasksPage() {
  const [tasks,   setTasks]   = useState<ComplaintRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<{ id: string; ticket_id: string; title: string } | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const taskId = urlParams.get("taskId");
      if (taskId) {
        setHighlightedTaskId(taskId);
        
        const attemptScroll = () => {
          const element = document.getElementById(`task-${taskId}`);
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        };

        // Try scroll immediately, and also after fetch to ensure it is rendered
        setTimeout(attemptScroll, 100);
        setTimeout(attemptScroll, 1000);

        setTimeout(() => {
          setHighlightedTaskId(null);
        }, 3000);
      }
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    async function fetchTasks() {
      if (!isActive) return;
      setLoading(true);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      const currentWorkerId = session?.user?.id;

      if (sessionError || !session?.access_token || !currentWorkerId) {
        if (isActive) {
          setError("User not authenticated");
          setLoading(false);
        }
        return;
      }

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const response = await fetch(`${apiUrl}/api/worker/dashboard`, {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload) {
          if (isActive) {
            setError(payload?.detail || "Failed to load tasks.");
            setLoading(false);
          }
          return;
        }

        if (isActive) {
          const complaintRows = (payload.complaints || []) as ComplaintRow[];
          const filtered = complaintRows.filter(
            (task) => task.assigned_worker_id === currentWorkerId
          );
          setTasks(filtered);
          setLoading(false);

          // Persist for instant load
          try {
            localStorage.setItem(WORKER_TASKS_CACHE_KEY, JSON.stringify(filtered));
          } catch {}
        }
      } catch (err) {
        if (isActive) {
          console.error("Worker tasks fetch error:", err);
          setError("Failed to load tasks.");
          setLoading(false);
        }
      }
    }

    // 1. Instant UI: Load from cache (client-side only to avoid hydration mismatch)
    try {
      const cached = localStorage.getItem(WORKER_TASKS_CACHE_KEY);
      if (cached) {
        setTasks(JSON.parse(cached));
        setLoading(false);
      }
    } catch {}

    const upsertTask = (prev: ComplaintRow[], incoming: ComplaintRow, currentWorkerId: string): ComplaintRow[] => {
      // Only keep assigned, in_progress, or resolved tickets in this view
      const isValidStatus = !!incoming.status;
      const isAssignedToCurrentWorker = incoming.assigned_worker_id === currentWorkerId;
      
      const existingIndex = prev.findIndex((item) => item.id === incoming.id);
      
      if (existingIndex === -1) {
        if (!isValidStatus || !isAssignedToCurrentWorker) return prev;
        return [incoming, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      }

      if (!isValidStatus || !isAssignedToCurrentWorker) {
        // Ticket changed to a status not visible on this board (e.g. escalated), remove it
        return prev.filter(item => item.id !== incoming.id);
      }

      const next = [...prev];
      next[existingIndex] = incoming;
      return next.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    };

    fetchTasks();

    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(({ data: authData }) => {
      const currentWorkerId = authData.user?.id;
      if (!currentWorkerId) return;

      channel = supabase
        .channel(`worker-tasks-sync-${currentWorkerId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "complaints",
            filter: `assigned_worker_id=eq.${currentWorkerId}`,
          },
          (payload) => {
            const incoming = payload.new as ComplaintRow;
            setTasks((prev) => upsertTask(prev, incoming, currentWorkerId));
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "complaints",
            filter: `assigned_worker_id=eq.${currentWorkerId}`,
          },
          (payload) => {
            const incoming = payload.new as ComplaintRow;
            setTasks((prev) => upsertTask(prev, incoming, currentWorkerId));
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "complaints",
            filter: `assigned_worker_id=eq.${currentWorkerId}`,
          },
          (payload) => {
            const deletedId = (payload.old as { id?: string }).id;
            if (!deletedId) return;
            setTasks((prev) => prev.filter((item) => item.id !== deletedId));
          }
        )
        .subscribe((status) => {
          if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && isActive) {
            void fetchTasks();
          }
        });
    });

    // PERFORMANCE OPTIMIZATION: Removed 15s polling.
    // Realtime sync via supabase.channel handles updates efficiently.

    return () => {
      isActive = false;
      if (channel) {
        void channel.unsubscribe();
      }
    };
  }, []);

  return (
    <div className="flex min-h-full flex-col gap-4 overflow-visible lg:gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">Tasks</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">View and manage all your assigned tasks.</p>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="rounded-full border border-gray-200 bg-white px-3 py-1 dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">{tasks.length} Total</span>
          <span className="rounded-full border border-gray-200 bg-white px-3 py-1 dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">{tasks.filter((task) => task.status === 'assigned' || task.status === 'in_progress' || task.status === 'reopened').length} Active</span>
        </div>
      </header>

      <div className="w-full px-0 py-0 sm:px-0">
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[#2a2a2a] dark:bg-[#161616]">
        <div className="overflow-x-auto">
          <div className="min-w-[1100px]">
            <div className="sticky top-0 z-10 grid grid-cols-[150px_2fr_2fr_1.5fr_1fr_1fr_140px] gap-3 border-b border-gray-200 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-400">
              <span>Ticket ID</span>
              <span>Issue Title</span>
              <span>Locality / Address</span>
              <span>Severity</span>
              <span>Status</span>
              <span>Reported Time</span>
              <span>Action</span>
            </div>

            <div className="relative">
              {/* Table Body */}
              <ul className="divide-y divide-gray-100 dark:divide-[#2a2a2a]">
                {tasks.map((task) => (
                  <li
                    key={task.id}
                    id={`task-${task.id}`}
                    className={`grid grid-cols-[150px_2fr_2fr_1.5fr_1fr_1fr_140px] gap-3 px-5 py-4 text-sm text-gray-700 dark:text-gray-300 transition-all duration-500 ease-out ${
                      highlightedTaskId === task.id 
                        ? 'bg-amber-100 dark:bg-[#f59e0b]/20 shadow-[inset_0_0_15px_rgba(245,158,11,0.3)] z-10 relative border-l-4 border-amber-500 dark:border-[#f59e0b]' 
                        : 'hover:bg-gray-50 dark:hover:bg-[#1e1e1e] border-l-4 border-transparent'
                    }`}
                  >
                      <span className="font-medium text-gray-900 font-mono text-xs sm:text-sm truncate dark:text-gray-200">
                        {task.ticket_id || "N/A"}
                      </span>

                      <span className="text-gray-900 font-medium line-clamp-2 leading-snug dark:text-gray-200">
                        {task.title || "Untitled issue"}
                      </span>

                      <span
                        className="text-gray-600 line-clamp-1 leading-snug cursor-pointer dark:text-gray-400"
                        title={task.address_text || "Address unavailable"}
                      >
                        {extractRelevantAddress(task.address_text) || "Address unavailable"}
                      </span>

                      <span className="text-gray-700 line-clamp-2 leading-snug dark:text-gray-300">
                        {task.severity || "Unknown"}
                      </span>

                      <span>
                        <span
                          className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${statusClasses(
                            task.status || ""
                          )}`}
                        >
                          {formatStatus(task.status || "assigned")}
                        </span>
                      </span>

                      <span className="text-gray-500 text-xs sm:text-sm dark:text-gray-400">
                        {formatReportedTime(task.created_at)}
                      </span>

                      <button
                        onClick={() => {
                          setSelectedTask({
                            id: task.id,
                            ticket_id: task.ticket_id || "N/A",
                            title: task.title || "Untitled issue"
                          });
                          setIsModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-lg text-xs font-semibold transition-all w-fit h-fit"
                      >
                        <Package className="w-3.5 h-3.5" />
                        Materials
                      </button>
                    </li>
                  ))}
              </ul>

              {/* Status Indicators */}
              <div className="absolute right-4 top-[-34px] z-20">
                {loading && (
                  <div className="flex items-center gap-2 rounded-full border border-gray-100 bg-white/80 px-2 py-1 text-[10px] font-medium text-gray-400 shadow-sm backdrop-blur-sm dark:border-[#2a2a2a] dark:bg-[#1a1a1a]/80">
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                    Syncing...
                  </div>
                )}
                {!loading && error && (
                  <div className="rounded-full border border-red-100 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-600 dark:border-red-900/40 dark:bg-red-900/20">
                    Sync error
                  </div>
                )}
              </div>

              {/* Empty State */}
              {!loading && !error && tasks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No tasks assigned yet.</p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Your current tasks will appear here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {selectedTask && (
        <MaterialRequestModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          ticketId={selectedTask.id}
          ticketDisplayId={selectedTask.ticket_id}
          ticketTitle={selectedTask.title}
        />
      )}
      </div>
    </div>
  );
}
