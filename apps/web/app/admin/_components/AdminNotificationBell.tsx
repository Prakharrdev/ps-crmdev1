'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

type NotifKind = 'sla_breach' | 'escalation' | 'new_complaint' | 'resolved' | 'status_change';

type Notif = {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  created_at: string;
};

const KIND_CONFIG: Record<NotifKind, { icon: React.ReactNode; pill: string; label: string }> = {
  sla_breach: { icon: <XCircle size={14} className="text-red-500" />, pill: 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-400 dark:ring-red-900/50', label: 'SLA Breach' },
  escalation: { icon: <AlertTriangle size={14} className="text-orange-500" />, pill: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-400 dark:ring-orange-900/50', label: 'Escalated' },
  new_complaint: { icon: <Bell size={14} className="text-blue-500" />, pill: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:ring-blue-900/50', label: 'New' },
  resolved: { icon: <CheckCircle2 size={14} className="text-emerald-500" />, pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:ring-emerald-900/50', label: 'Resolved' },
  status_change: { icon: <Clock size={14} className="text-amber-500" />, pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:ring-amber-900/50', label: 'Updated' },
};

function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const LS_KEY = 'jansamadhan_admin_notif_read_v1';
function loadReadSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
function saveReadSet(s: Set<string>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...s]));
  } catch {}
}

export default function AdminNotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [readSet, setReadSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | NotifKind>('all');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (open) {
      gsap.fromTo(
        panelRef.current,
        { opacity: 0, scale: 0.95, y: -10 },
        { opacity: 1, scale: 1, y: 0, duration: 0.3, ease: 'power2.out' }
      );

      gsap.fromTo(
        '.notif-item',
        { opacity: 0, x: 15 },
        { opacity: 1, x: 0, duration: 0.4, stagger: 0.04, ease: 'power2.out', delay: 0.1 }
      );
    }
  }, { dependencies: [open], scope: wrapperRef });

  useEffect(() => {
    function onDocumentClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  const buildFeed = useCallback(async () => {
    setLoading(true);

    const { data: complaintsData } = await supabase
      .from('complaints')
      .select('id,ticket_id,title,status,sla_breached,escalation_level,created_at,resolved_at')
      .order('created_at', { ascending: false })
      .limit(300);

    const complaints = complaintsData ?? [];
    const complaintIds = complaints.map((c: any) => c.id);

    let history: any[] = [];
    if (complaintIds.length > 0) {
      const { data } = await supabase
        .from('ticket_history')
        .select('id,complaint_id,old_status,new_status,created_at')
        .in('complaint_id', complaintIds)
        .order('created_at', { ascending: false })
        .limit(500);
      history = data ?? [];
    }

    const events: Notif[] = [];
    const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;

    complaints.forEach((c: any) => {
      if (new Date(c.created_at).getTime() > cutoff30) {
        events.push({
          id: `new-${c.id}`,
          kind: 'new_complaint',
          title: `New: ${c.title}`,
          body: `Ticket ${c.ticket_id} was created.`,
          created_at: c.created_at,
        });
      }
      if (c.sla_breached) {
        events.push({
          id: `sla-${c.id}`,
          kind: 'sla_breach',
          title: `SLA breached: ${c.title}`,
          body: `Ticket ${c.ticket_id} exceeded its SLA deadline.`,
          created_at: c.created_at,
        });
      }
      if (c.escalation_level && c.escalation_level > 0) {
        events.push({
          id: `esc-${c.id}`,
          kind: 'escalation',
          title: `Escalated: ${c.title}`,
          body: `Ticket ${c.ticket_id} escalated (level ${c.escalation_level}).`,
          created_at: c.created_at,
        });
      }
      if (c.status === 'resolved' && c.resolved_at) {
        events.push({
          id: `res-${c.id}`,
          kind: 'resolved',
          title: `Resolved: ${c.title}`,
          body: `Ticket ${c.ticket_id} was resolved.`,
          created_at: c.resolved_at,
        });
      }
    });

    history.forEach((h: any) => {
      const complaint = complaints.find((c: any) => c.id === h.complaint_id);
      if (!complaint || h.new_status === 'resolved') return;
      events.push({
        id: `hist-${h.id}`,
        kind: 'status_change',
        title: `Status updated: ${complaint.title}`,
        body: `${complaint.ticket_id}: "${(h.old_status ?? '').replace(/_/g, ' ')}" → "${(h.new_status ?? '').replace(/_/g, ' ')}"`,
        created_at: h.created_at,
      });
    });

    const seen = new Set<string>();
    const deduped = events
      .filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      })
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, 80);

    setReadSet(loadReadSet());
    setNotifs(deduped);
    setLoading(false);
  }, []);

  useEffect(() => {
    void buildFeed();
  }, [buildFeed]);

  useEffect(() => {
    if (open) void buildFeed();
  }, [open, buildFeed]);

  useEffect(() => {
    const ch = supabase
      .channel('admin-notif-bell')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, () => void buildFeed())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_history' }, () => void buildFeed())
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [buildFeed]);

  function markRead(id: string) {
    setReadSet((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveReadSet(next);
      return next;
    });
  }

  function markAllRead() {
    setReadSet((prev) => {
      const next = new Set([...prev, ...notifs.map((n) => n.id)]);
      saveReadSet(next);
      return next;
    });
  }

  const unreadCount = notifs.filter((n) => !readSet.has(n.id)).length;

  const displayed = useMemo(() => notifs.filter((n) => filter === 'all' || n.kind === filter), [notifs, filter]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Notifications"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-300 dark:hover:bg-[#2a2a2a]"
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 z-[60] mt-2 w-[400px] origin-top-right overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-[#2a2a2a] dark:bg-[#1e1e1e]"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-[#2a2a2a]">
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">Notifications</p>
              <p className="text-[11px] text-gray-400">{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</p>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="rounded-lg bg-[#C9A84C] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#B39340]"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="flex gap-1.5 overflow-x-auto border-b border-gray-100 px-3 py-2 dark:border-[#2a2a2a]">
            {(['all', 'sla_breach', 'escalation', 'new_complaint', 'resolved', 'status_change'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize transition-colors
                  ${filter === k
                    ? 'bg-[#C9A84C] text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-[#2a2a2a] dark:text-gray-300 dark:hover:bg-[#333333]'}`}
              >
                {k === 'all' ? 'All' : KIND_CONFIG[k].label}
              </button>
            ))}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <div>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex animate-pulse gap-3 border-b border-gray-50 p-3 last:border-0 dark:border-[#2a2a2a]">
                    <div className="h-8 w-8 shrink-0 rounded-full bg-gray-100 dark:bg-[#2a2a2a]" />
                    <div className="flex-1 space-y-1.5 py-1">
                      <div className="h-2.5 w-1/2 rounded-md bg-gray-100 dark:bg-[#2a2a2a]" />
                      <div className="h-2 w-3/4 rounded-md bg-gray-100 dark:bg-[#2a2a2a]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayed.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                {notifs.length === 0 ? 'No activity yet' : 'No notifications to show'}
              </div>
            ) : (
              displayed.map((n, idx) => {
                const cfg = KIND_CONFIG[n.kind];
                const isRead = readSet.has(n.id);
                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!isRead) markRead(n.id);
                    }}
                    className={`notif-item flex cursor-pointer gap-3 p-3 transition-colors hover:bg-gray-50/60 dark:hover:bg-[#2a2a2a]/70
                      ${idx > 0 ? 'border-t border-gray-50 dark:border-[#2a2a2a]' : ''}
                      ${!isRead
                        ? n.kind === 'sla_breach'
                          ? 'bg-red-50/40 dark:bg-red-950/20'
                          : n.kind === 'escalation'
                            ? 'bg-orange-50/30 dark:bg-orange-950/20'
                            : 'bg-[#f9f6ec] dark:bg-[#2a2a2a]/60'
                        : ''}`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform duration-300 hover:scale-110 ${cfg.pill.split(' ')[0]}`}>
                      {cfg.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${cfg.pill}`}>{cfg.label}</span>
                        {!isRead && <span className="h-1.5 w-1.5 rounded-full bg-[#C9A84C]" />}
                      </div>
                      <p className={`text-xs leading-snug ${isRead ? 'font-medium text-gray-600 dark:text-gray-300' : 'font-semibold text-gray-900 dark:text-white'}`}>
                        {n.title}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-[10px] text-gray-400 dark:text-gray-500">{n.body}</p>
                    </div>
                    <span className="shrink-0 pt-0.5 text-[10px] tabular-nums text-gray-400 dark:text-gray-500">{timeAgo(n.created_at)}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
