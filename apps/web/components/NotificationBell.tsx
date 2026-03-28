'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';
import type { Database } from '@/src/types/database.types';

type NotificationBellProps = {
  className?: string;
};

type ComplaintRow = Database['public']['Tables']['complaints']['Row'];

type WorkerNotification = {
  id: string;
  complaintId: string;
  ticketId: string;
  title: string;
  body: string;
  createdAt: string;
};

const READ_KEY = 'jansamadhan_worker_notif_read_v1';

function loadReadSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveReadSet(ids: Set<string>) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore storage failures.
  }
}

function formatTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 'just now';
  const delta = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (delta < 60) return 'just now';
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export default function NotificationBell({ className }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<WorkerNotification[]>([]);
  const [readSet, setReadSet] = useState<Set<string>>(new Set());
  const wrapperRef = useRef<HTMLDivElement>(null);

  const upsertNotification = useCallback((incoming: WorkerNotification) => {
    setNotifications((prev) => {
      const next = [incoming, ...prev.filter((item) => item.id !== incoming.id)];
      return next
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 20);
    });
  }, []);

  const markAllRead = useCallback(() => {
    setReadSet((prev) => {
      const next = new Set([...prev, ...notifications.map((item) => item.id)]);
      saveReadSet(next);
      return next;
    });
  }, [notifications]);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }

    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  useEffect(() => {
    setReadSet(loadReadSet());

    supabase.auth.getUser().then(({ data }) => {
      setWorkerId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!workerId) return;

    const toNotification = (row: ComplaintRow, idPrefix = 'assign'): WorkerNotification => {
      const createdAt = row.updated_at ?? row.created_at ?? new Date().toISOString();
      const ticketId = row.ticket_id || row.id;
      const title = row.title?.trim() || row.description?.trim() || 'Ticket assigned to you';

      return {
        id: `${idPrefix}:${row.id}:${createdAt}`,
        complaintId: row.id,
        ticketId,
        title,
        body: `Ticket ${ticketId} has been assigned to you.`,
        createdAt,
      };
    };

    const fetchInitial = async () => {
      const { data, error } = await supabase
        .from('complaints')
        .select('id, ticket_id, title, description, assigned_worker_id, created_at, updated_at, status')
        .eq('assigned_worker_id', workerId)
        .in('status', ['assigned', 'in_progress'])
        .order('updated_at', { ascending: false })
        .limit(10);

      if (error) return;

      setNotifications((data ?? []).map((row) => toNotification(row as ComplaintRow, 'initial')));
    };

    void fetchInitial();

    const channel = supabase
      .channel(`worker-assignment-notifs-${workerId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'complaints', filter: `assigned_worker_id=eq.${workerId}` },
        (payload) => {
          const row = payload.new as ComplaintRow;
          upsertNotification(toNotification(row, 'insert'));
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'complaints', filter: `assigned_worker_id=eq.${workerId}` },
        (payload) => {
          const next = payload.new as ComplaintRow;
          const prev = payload.old as Partial<ComplaintRow>;
          const becameAssignedToWorker = prev.assigned_worker_id !== workerId && next.assigned_worker_id === workerId;
          if (!becameAssignedToWorker) return;
          upsertNotification(toNotification(next, 'update'));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [upsertNotification, workerId]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !readSet.has(item.id)).length,
    [notifications, readSet],
  );

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        markAllRead();
      }
      return next;
    });
  }, [markAllRead]);

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="Notifications"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-300 dark:hover:bg-[#2a2a2a]"
      >
        <Bell size={18} />
        {unreadCount > 0 ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" /> : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-[60] mt-2 w-80 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-lg dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-300">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold text-gray-900 dark:text-gray-100">Notifications</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </p>
          </div>

          <div className="max-h-80 space-y-2 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No assignment notifications yet.</p>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-[#2a2a2a] dark:bg-[#242424]"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#B48470] dark:text-[#C9A84C]">Assigned</p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{item.title}</p>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{item.body}</p>
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{formatTime(item.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
