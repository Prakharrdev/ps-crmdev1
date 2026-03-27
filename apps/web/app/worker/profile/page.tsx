"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Gauge,
  RefreshCcw,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { supabase } from "@/src/lib/supabase";
import type { Database } from "@/src/types/database.types";

type ComplaintRow = Database["public"]["Tables"]["complaints"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type WorkerProfileRow = Database["public"]["Tables"]["worker_profiles"]["Row"];
type TicketHistoryRow = Database["public"]["Tables"]["ticket_history"]["Row"];
type WorkerAvailability = "available" | "busy" | "inactive";

type WorkerProfileViewModel = {
  fullName: string;
  email: string;
  city: string;
  department: string;
  joinedAt: string;
  availability: WorkerAvailability;
  totalResolved: number;
  currentComplaintId: string | null;
};

type MetricState = {
  totalAssigned: number;
  resolvedCount: number;
  escalatedCount: number;
  completionRate: number;
  avgResolutionHours: number;
  avgResolutionLabel: string;
  onTimeResolved: number;
  onTimeRate: number;
  qualityScore: number;
  weeklyResolved: number;
  overdueOpenCount: number;
  progressNotesCount: number;
};

type TrendPoint = {
  key: string;
  label: string;
  resolved: number;
  assigned: number;
  escalated: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) return "N/A";
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "N/A";
  if (hours < 24) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

function computeMetrics(complaints: ComplaintRow[], historyRows: TicketHistoryRow[]): MetricState {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const resolved = complaints.filter((row) => row.status === "resolved" && !!row.resolved_at);
  const escalated = complaints.filter((row) => row.status === "escalated");
  const completionRate = complaints.length > 0 ? (resolved.length / complaints.length) * 100 : 0;

  const resolutionDurationsInHours = resolved
    .map((row) => {
      const createdAt = new Date(row.created_at).getTime();
      const resolvedAt = row.resolved_at ? new Date(row.resolved_at).getTime() : NaN;
      if (!Number.isFinite(createdAt) || !Number.isFinite(resolvedAt) || resolvedAt <= createdAt) return null;
      return (resolvedAt - createdAt) / (1000 * 60 * 60);
    })
    .filter((value): value is number => value != null);

  const avgResolutionHours =
    resolutionDurationsInHours.length > 0
      ? resolutionDurationsInHours.reduce((sum, value) => sum + value, 0) / resolutionDurationsInHours.length
      : 0;

  const onTimeResolved = resolved.filter((row) => {
    if (!row.sla_deadline || !row.resolved_at) return false;
    const deadline = new Date(row.sla_deadline).getTime();
    const resolvedAt = new Date(row.resolved_at).getTime();
    return Number.isFinite(deadline) && Number.isFinite(resolvedAt) && resolvedAt <= deadline;
  }).length;

  const onTimeRate = resolved.length > 0 ? (onTimeResolved / resolved.length) * 100 : 0;
  const escalationRate = complaints.length > 0 ? escalated.length / complaints.length : 0;
  const qualityScore = Math.round(
    clamp((completionRate / 100) * 0.5 + (onTimeRate / 100) * 0.35 + (1 - escalationRate) * 0.15, 0, 1) * 100,
  );

  const weeklyResolved = resolved.filter((row) => {
    if (!row.resolved_at) return false;
    const resolvedAt = new Date(row.resolved_at).getTime();
    return Number.isFinite(resolvedAt) && resolvedAt >= weekAgo;
  }).length;

  const overdueOpenCount = complaints.filter((row) => {
    if (row.status === "resolved" || row.status === "rejected") return false;
    const createdAt = new Date(row.created_at).getTime();
    return Number.isFinite(createdAt) && now - createdAt >= 48 * 60 * 60 * 1000;
  }).length;

  const progressNotesCount = historyRows.filter((row) => {
    const note = (row.note ?? "").trim();
    return note.length > 0;
  }).length;

  return {
    totalAssigned: complaints.length,
    resolvedCount: resolved.length,
    escalatedCount: escalated.length,
    completionRate,
    avgResolutionHours,
    avgResolutionLabel: formatHours(avgResolutionHours),
    onTimeResolved,
    onTimeRate,
    qualityScore,
    weeklyResolved,
    overdueOpenCount,
    progressNotesCount,
  };
}

function buildTrend(complaints: ComplaintRow[], days: number): TrendPoint[] {
  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buckets = new Map<string, TrendPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * dayMs);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-IN", { day: "numeric", month: days <= 7 ? undefined : "short" });
    buckets.set(key, { key, label, resolved: 0, assigned: 0, escalated: 0 });
  }

  for (const complaint of complaints) {
    const createdKey = complaint.created_at ? new Date(complaint.created_at).toISOString().slice(0, 10) : null;
    if (createdKey && buckets.has(createdKey)) {
      const bucket = buckets.get(createdKey)!;
      bucket.assigned += 1;
    }

    if (complaint.resolved_at) {
      const resolvedKey = new Date(complaint.resolved_at).toISOString().slice(0, 10);
      if (buckets.has(resolvedKey)) {
        const bucket = buckets.get(resolvedKey)!;
        bucket.resolved += 1;
      }
    }

    if (complaint.status === "escalated") {
      const escalatedKey = complaint.updated_at ? new Date(complaint.updated_at).toISOString().slice(0, 10) : null;
      if (escalatedKey && buckets.has(escalatedKey)) {
        const bucket = buckets.get(escalatedKey)!;
        bucket.escalated += 1;
      }
    }
  }

  return [...buckets.values()];
}

function buildMonthlyTrend(complaints: ComplaintRow[], months: number): TrendPoint[] {
  const now = new Date();
  const buckets = new Map<string, TrendPoint>();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-IN", { month: "short" });
    buckets.set(key, { key, label, resolved: 0, assigned: 0, escalated: 0 });
  }

  const monthKey = (iso: string | null): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  for (const complaint of complaints) {
    const createdKey = monthKey(complaint.created_at);
    if (createdKey && buckets.has(createdKey)) {
      buckets.get(createdKey)!.assigned += 1;
    }

    const resolvedKey = monthKey(complaint.resolved_at);
    if (resolvedKey && buckets.has(resolvedKey)) {
      buckets.get(resolvedKey)!.resolved += 1;
    }

    if (complaint.status === "escalated") {
      const escalatedKey = monthKey(complaint.updated_at);
      if (escalatedKey && buckets.has(escalatedKey)) {
        buckets.get(escalatedKey)!.escalated += 1;
      }
    }
  }

  return [...buckets.values()];
}

function computeResolvedStreak(points: TrendPoint[]): number {
  let streak = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].resolved > 0) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

function formatAxisTick(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 10) return String(Math.round(value));
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
const WORKER_PROFILE_CACHE_KEY = "worker_profile_cache_v2";

type ProfilePayload = {
  profile: Pick<ProfileRow, "full_name" | "email" | "city">;
  workerProfile: Pick<WorkerProfileRow, "department" | "joined_at" | "availability" | "total_resolved" | "current_complaint_id">;
  complaints: ComplaintRow[];
  ticketHistory: TicketHistoryRow[];
};
export default function WorkerProfilePage() {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weeklyGoal, setWeeklyGoal] = useState(12);
  const [trendRange, setTrendRange] = useState<"7" | "30" | "180">("7");
  const [profile, setProfile] = useState<WorkerProfileViewModel | null>(null);
  const [metrics, setMetrics] = useState<MetricState | null>(null);
  const [trend7, setTrend7] = useState<TrendPoint[]>([]);
  const [trend30, setTrend30] = useState<TrendPoint[]>([]);
  const [trend6m, setTrend6m] = useState<TrendPoint[]>([]);
  const [chartWidth, setChartWidth] = useState(0);

  const applyPayload = useCallback((payload: ProfilePayload) => {
    const safeProfile = payload.profile;
    const safeWorker = payload.workerProfile;

    setProfile({
      fullName: safeProfile.full_name ?? "Worker",
      email: safeProfile.email,
      city: safeProfile.city ?? "N/A",
      department: safeWorker.department ?? "N/A",
      joinedAt: safeWorker.joined_at,
      availability: (safeWorker.availability as WorkerAvailability) ?? "inactive",
      totalResolved: safeWorker.total_resolved ?? 0,
      currentComplaintId: safeWorker.current_complaint_id ?? null,
    });

    const typedComplaints = (payload.complaints || []) as ComplaintRow[];
    const typedHistory = (payload.ticketHistory || []) as TicketHistoryRow[];
    setMetrics(computeMetrics(typedComplaints, typedHistory));
    setTrend7(buildTrend(typedComplaints, 7));
    setTrend30(buildTrend(typedComplaints, 30));
    setTrend6m(buildMonthlyTrend(typedComplaints, 6));
  }, []);
  const loadProfile = useCallback(async (isInitial = true) => {
    if (isInitial) setLoading(true);
    setError(null);

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const uid = authData.user?.id ?? null;
    const { data: { session } } = await supabase.auth.getSession();
    
    if (authError || !uid || !session?.access_token) {
      setError("Unable to load worker profile session.");
      if (isInitial) setLoading(false);
      return;
    }

    setWorkerId(uid);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/worker/profile`, {
        headers: { "Authorization": `Bearer ${session.access_token}` },
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const payload = await response.json();

      applyPayload(payload);

      // Persist for instant load
      try {
        localStorage.setItem(WORKER_PROFILE_CACHE_KEY, JSON.stringify(payload));
      } catch {}
    } catch (err) {
      console.error("Worker profile fetch error:", err);
      // Only show error if we have no cached data to show at all
      if (isInitial) setError("Failed to sync latest profile data.");
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    // 1. Instant UI: show cached data immediately
    let hasCache = false;
    try {
      const cached = localStorage.getItem(WORKER_PROFILE_CACHE_KEY);
      if (cached) {
        applyPayload(JSON.parse(cached));
        setLoading(false);
        hasCache = true;
      }
    } catch {}

    // 2. Then fetch fresh data (pass isInitial=false if we have cache to avoid flash)
    void loadProfile(!hasCache);
  }, [loadProfile, applyPayload]);

  useEffect(() => {
    const node = chartContainerRef.current;
    if (!node) return;

    const updateWidth = () => {
      setChartWidth(Math.max(320, Math.floor(node.clientWidth)));
    };

    updateWidth();

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("worker_weekly_goal_v1");
      if (!stored) return;
      const parsed = Number(stored);
      if (Number.isFinite(parsed) && parsed > 0) {
        setWeeklyGoal(Math.min(100, Math.max(1, Math.round(parsed))));
      }
    } catch {
      // Ignore storage access errors.
    }
  }, []);

  const updateAvailability = useCallback(
    async (availability: WorkerAvailability) => {
      if (!workerId || !profile) return;
      setSavingAvailability(true);
      const { error: updateError } = await supabase
        .from("worker_profiles")
        .update({ availability })
        .eq("worker_id", workerId);

      if (updateError) {
        setError("Could not update availability.");
      } else {
        setProfile({ ...profile, availability });
      }
      setSavingAvailability(false);
    },
    [profile, workerId],
  );

  const handleGoalChange = useCallback((nextGoal: number) => {
    const safe = Math.min(100, Math.max(1, Math.round(nextGoal)));
    setWeeklyGoal(safe);
    try {
      window.localStorage.setItem("worker_weekly_goal_v1", String(safe));
    } catch {
      // Ignore storage access errors.
    }
  }, []);

  const weeklyGoalProgress = useMemo(() => {
    if (!metrics) return 0;
    return clamp((metrics.weeklyResolved / Math.max(weeklyGoal, 1)) * 100, 0, 100);
  }, [metrics, weeklyGoal]);

  const activeTrend = useMemo(() => {
    if (trendRange === "7") return trend7;
    if (trendRange === "30") return trend30;
    return trend6m;
  }, [trend6m, trend7, trend30, trendRange]);

  const trendMax = useMemo(() => {
    const maxValue = activeTrend.reduce(
      (max, point) => Math.max(max, point.resolved, point.assigned, point.escalated),
      0,
    );
    return Math.max(1, maxValue);
  }, [activeTrend]);

  const resolvedStreak = useMemo(() => computeResolvedStreak(activeTrend), [activeTrend]);

  const labelInterval = useMemo(() => {
    if (trendRange === "7") return 1;
    if (trendRange === "180") return 1;
    if (activeTrend.length <= 10) return 1;
    return 3;
  }, [activeTrend.length, trendRange]);

  const chartConfig = useMemo(() => {
    const pointCount = Math.max(activeTrend.length, 2);
    const width = Math.max(320, chartWidth || 0);
    const height = 220;
    const padding = { top: 16, right: 14, bottom: 30, left: 34 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;

    const xForIndex = (index: number) =>
      padding.left + (pointCount <= 1 ? innerWidth / 2 : (index / (pointCount - 1)) * innerWidth);

    const yForValue = (value: number) =>
      padding.top + innerHeight - (value / Math.max(trendMax, 1)) * innerHeight;

    const toLinePath = (values: number[]) =>
      values
        .map((value, index) => `${index === 0 ? "M" : "L"}${xForIndex(index)} ${yForValue(value)}`)
        .join(" ");

    const toAreaPath = (values: number[]) => {
      const linePath = toLinePath(values);
      const lastX = xForIndex(values.length - 1);
      const firstX = xForIndex(0);
      const baselineY = yForValue(0);
      return `${linePath} L${lastX} ${baselineY} L${firstX} ${baselineY} Z`;
    };

    const resolved = activeTrend.map((point) => point.resolved);
    const assigned = activeTrend.map((point) => point.assigned);
    const escalated = activeTrend.map((point) => point.escalated);

    return {
      width,
      height,
      padding,
      innerHeight,
      xForIndex,
      yForValue,
      linePaths: {
        resolved: toLinePath(resolved),
        assigned: toLinePath(assigned),
        escalated: toLinePath(escalated),
      },
      areaPathResolved: toAreaPath(resolved),
    };
  }, [activeTrend, chartWidth, trendMax]);

  const statusTone = (availability: WorkerAvailability): string => {
    if (availability === "available") return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    if (availability === "busy") return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
    return "bg-gray-100 text-gray-600 ring-1 ring-gray-200";
  };

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      ) : null}

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e] sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {profile?.fullName ?? "Worker"}
              </h2>
              {loading && (
                <div className="flex items-center gap-1.5 rounded-full border border-gray-100 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-gray-400 shadow-sm backdrop-blur-sm dark:border-[#2a2a2a] dark:bg-[#1a1a1a]/80">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                  Syncing...
                </div>
              )}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {profile ? `${profile.email} | ${profile.department}` : "Loading worker context..."}
            </p>
          </div>
        </div>

        {profile ? (
          <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-700 dark:text-gray-300 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 p-3 dark:border-[#2a2a2a]">
              <p className="text-xs text-gray-500 dark:text-gray-400">Joined</p>
              <p className="font-medium">{formatDate(profile.joinedAt)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-[#2a2a2a]">
              <p className="text-xs text-gray-500 dark:text-gray-400">City</p>
              <p className="font-medium">{profile.city}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-[#2a2a2a]">
              <p className="text-xs text-gray-500 dark:text-gray-400">Lifetime resolved</p>
              <p className="font-medium">{profile.totalResolved}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-[#2a2a2a]">
              <p className="text-xs text-gray-500 dark:text-gray-400">Current ticket</p>
              <p className="font-medium">{profile.currentComplaintId ? profile.currentComplaintId.slice(0, 8) : "None"}</p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Timer size={16} />
            <span>Avg Resolution Time</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {loading || !metrics ? "--" : metrics.avgResolutionLabel}
          </p>
        </article>

        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <ClipboardCheck size={16} />
            <span>Completion Rate</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {loading || !metrics ? "--" : `${metrics.completionRate.toFixed(1)}%`}
          </p>
        </article>

        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Gauge size={16} />
            <span>Quality Score</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {loading || !metrics ? "--" : `${metrics.qualityScore}/100`}
          </p>
        </article>

        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Clock3 size={16} />
            <span>On-time Resolution</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {loading || !metrics ? "--" : `${metrics.onTimeRate.toFixed(1)}%`}
          </p>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e] xl:col-span-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Performance Trend</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Daily assigned, resolved, and escalated tickets over time.
              </p>
            </div>

            <div className="inline-flex rounded-lg border border-gray-300 p-1 dark:border-[#3a3a3a]">
              {([
                { key: "7", label: "7D" },
                { key: "30", label: "30D" },
                { key: "180", label: "6M" },
              ] as const).map((range) => (
                <button
                  key={range.key}
                  type="button"
                  onClick={() => setTrendRange(range.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    trendRange === range.key
                      ? "bg-[#b4725a] text-white"
                      : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-[#2a2a2a]"
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50/60 p-3 dark:border-[#2a2a2a] dark:bg-[#141414]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300">
              <div className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Resolved</div>
              <div className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-500" /> Assigned</div>
              <div className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-500" /> Escalated</div>
              <div className="inline-flex items-center gap-2 rounded-md bg-white px-2 py-1 text-[11px] text-gray-700 ring-1 ring-gray-200 dark:bg-[#1a1a1a] dark:text-gray-200 dark:ring-[#2f2f2f]">
                <Activity size={12} /> Streak: {resolvedStreak} day{resolvedStreak === 1 ? "" : "s"}
              </div>
            </div>

            <div ref={chartContainerRef} className="pb-1">
              <div className="w-full">
                <div className="mb-1 flex justify-between text-[11px] text-gray-500 dark:text-gray-400">
                  <span>0</span>
                  <span>Max: {trendMax}</span>
                </div>
                <svg
                  viewBox={`0 0 ${chartConfig.width} ${chartConfig.height}`}
                  className="h-[230px] w-full rounded-md border border-gray-200 bg-white dark:border-[#2a2a2a] dark:bg-[#101010]"
                  role="img"
                  aria-label="Worker performance trend chart"
                >
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                    const y = chartConfig.padding.top + chartConfig.innerHeight - ratio * chartConfig.innerHeight;
                    const value = Math.round(ratio * trendMax);
                    return (
                      <g key={ratio}>
                        <line
                          x1={chartConfig.padding.left}
                          x2={chartConfig.width - chartConfig.padding.right}
                          y1={y}
                          y2={y}
                          stroke="currentColor"
                          className="text-gray-200 dark:text-[#2a2a2a]"
                          strokeWidth={1}
                        />
                        <text
                          x={chartConfig.padding.left - 6}
                          y={y + 4}
                          textAnchor="end"
                          className="fill-gray-400 text-[10px]"
                        >
                          {formatAxisTick(value)}
                        </text>
                      </g>
                    );
                  })}

                  <path d={chartConfig.areaPathResolved} fill="rgba(16,185,129,0.12)" />
                  <path d={chartConfig.linePaths.resolved} fill="none" stroke="#10b981" strokeWidth={2.5} />
                  <path d={chartConfig.linePaths.assigned} fill="none" stroke="#3b82f6" strokeWidth={2} />
                  <path d={chartConfig.linePaths.escalated} fill="none" stroke="#ef4444" strokeWidth={2} />

                  {activeTrend.map((point, index) => (
                    <circle
                      key={`resolved-dot-${point.key}`}
                      cx={chartConfig.xForIndex(index)}
                      cy={chartConfig.yForValue(point.resolved)}
                      r={2.5}
                      fill="#10b981"
                    />
                  ))}

                  {activeTrend.map((point, index) => (
                    <text
                      key={`x-label-${point.key}`}
                      x={chartConfig.xForIndex(index)}
                      y={chartConfig.height - 8}
                      textAnchor="middle"
                      className="fill-gray-400 text-[10px]"
                    >
                      {index % labelInterval === 0 || index === activeTrend.length - 1 ? point.label : ""}
                    </text>
                  ))}
                </svg>
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e] xl:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Availability + Weekly Goal</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Keep your status updated and track weekly resolved target progress.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadProfile()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:border-[#3a3a3a] dark:text-gray-200 dark:hover:bg-[#2a2a2a]"
            >
              <RefreshCcw size={14} /> Refresh
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-3 dark:border-[#2a2a2a]">
              <p className="text-xs text-gray-500 dark:text-gray-400">Current availability</p>
              <p
                className={`mt-1 inline-flex rounded-md px-2 py-1 text-sm font-medium capitalize ${
                  profile ? statusTone(profile.availability) : ""
                }`}
              >
                {loading || !profile ? "--" : profile.availability}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["available", "busy", "inactive"] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    disabled={savingAvailability || loading || !profile || profile.availability === level}
                    onClick={() => void updateAvailability(level)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium capitalize text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#3a3a3a] dark:text-gray-200 dark:hover:bg-[#2a2a2a]"
                  >
                    Set {level}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-3 dark:border-[#2a2a2a]">
              <p className="text-xs text-gray-500 dark:text-gray-400">Weekly resolved goal</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={weeklyGoal}
                  onChange={(event) => handleGoalChange(Number(event.target.value))}
                  className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 dark:border-[#3a3a3a] dark:bg-[#1a1a1a] dark:text-gray-200"
                />
                <span className="text-sm text-gray-600 dark:text-gray-300">tickets/week</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-[#2a2a2a]">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${weeklyGoalProgress}%` }} />
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {loading || !metrics ? "--" : `${metrics.weeklyResolved} resolved this week (${weeklyGoalProgress.toFixed(0)}%)`}
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Operational Health</h3>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-2 dark:border-[#2a2a2a]">
              <span className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-300"><CheckCircle2 size={14} /> Resolved</span>
              <strong className="text-gray-900 dark:text-gray-100">{loading || !metrics ? "--" : metrics.resolvedCount}</strong>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-2 dark:border-[#2a2a2a]">
              <span className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-300"><TriangleAlert size={14} /> Escalated</span>
              <strong className="text-gray-900 dark:text-gray-100">{loading || !metrics ? "--" : metrics.escalatedCount}</strong>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-2 dark:border-[#2a2a2a]">
              <span className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-300"><Activity size={14} /> Overdue open</span>
              <strong className="text-gray-900 dark:text-gray-100">{loading || !metrics ? "--" : metrics.overdueOpenCount}</strong>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-2 dark:border-[#2a2a2a]">
              <span className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-300"><ClipboardCheck size={14} /> Progress notes</span>
              <strong className="text-gray-900 dark:text-gray-100">{loading || !metrics ? "--" : metrics.progressNotesCount}</strong>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2">
            <Link
              href="/worker"
              className="inline-flex items-center justify-center rounded-lg bg-[#b4725a] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#9a5e48]"
            >
              Go To Dashboard Map
            </Link>
            <Link
              href="/worker/tasks"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-[#3a3a3a] dark:text-gray-200 dark:hover:bg-[#2a2a2a]"
            >
              Review Assigned Tasks
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}
