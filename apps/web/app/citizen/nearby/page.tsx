"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { 
  AlertTriangle, 
  ArrowUp, 
  ChevronDown, 
  X, 
  MapPin, 
  Share2, 
  Tag, 
  Clock 
} from "lucide-react";

import { useNearbyTickets } from "./_components/useNearbyTickets";
import { getSeverityConfig } from "./_components/useNearbyTickets";
import type { MappedComplaint, SeverityLevel } from "./_components/useNearbyTickets";
import { useGeolocation } from "./_components/useGeolocation";
import { formatDistance } from "./_components/distance";
import { calculateDistanceMeters } from "./_components/distance";

const NearbyTicketsMap = dynamic(
  () => import("./_components/NearbyTicketsMap"),
  { ssr: false }
);

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
  if (normalized === "resolved") return "bg-green-100 text-green-700";
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

function uniqueSorted(items: Array<string | null | undefined>): string[] {
  return Array.from(new Set(items.filter((v): v is string => Boolean(v && v.trim())))).sort();
}

export default function NearbyTicketsPage() {
  const {
    visibleComplaints,
    hasUpvoted,
    loading,
    error,
    updateRadius,
    handleUpvote,
  } = useNearbyTickets();
  const {
    location,
    accuracyMeters,
    lastUpdatedAt,
    state: geolocationState,
    error: geolocationError,
    requestLocation,
  } = useGeolocation();

  const [selectedComplaint, setSelectedComplaint] = useState<MappedComplaint | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);

  const [activeHighlight, setActiveHighlight] = useState<string | null>(null);
  const highlightedRef = useRef<HTMLLIElement>(null);
  const modalOverlayRef = useRef<HTMLDivElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedComplaint) {
      gsap.to(modalOverlayRef.current, { 
        autoAlpha: 1, 
        duration: 0.3, 
        ease: "power2.out" 
      });
      gsap.fromTo(modalContentRef.current, 
        { scale: 0.95, y: 10, opacity: 0 },
        { scale: 1, y: 0, opacity: 1, duration: 0.4, ease: "back.out(1.4)", delay: 0.05 }
      );
    }
  }, [selectedComplaint?.id]);

  useEffect(() => {
    if (selectedComplaint?.id) {
      setActiveHighlight(selectedComplaint.id);
      const timer = setTimeout(() => {
        setActiveHighlight(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [selectedComplaint?.id]);

  useEffect(() => {
    if (activeHighlight && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeHighlight, visibleComplaints.length]);

  const [radiusMeters, setRadiusMeters] = useState(1000);
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityLevel | null>(null);

  const [departmentDropdownOpen, setDepartmentDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [severityDropdownOpen, setSeverityDropdownOpen] = useState(false);
  const [nowTs, setNowTs] = useState<number>(Date.now());

  const lastFilterCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastFilterRadiusRef = useRef<number>(radiusMeters);

  useEffect(() => {
    if (!location) return;

    const lastCenter = lastFilterCenterRef.current;
    const lastRadius = lastFilterRadiusRef.current;
    const radiusChanged = lastRadius !== radiusMeters;

    const movedMeters = lastCenter
      ? calculateDistanceMeters(lastCenter, location)
      : Number.POSITIVE_INFINITY;

    if (!radiusChanged && movedMeters < 10) return;

    updateRadius(location, radiusMeters);
    lastFilterCenterRef.current = location;
    lastFilterRadiusRef.current = radiusMeters;
  }, [location, radiusMeters, updateRadius]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const availableDepartments = useMemo(
    () => uniqueSorted(visibleComplaints.map((c) => c.assigned_department).filter((d) => d !== "Unassigned")),
    [visibleComplaints]
  );

  const availableStatuses = useMemo(
    () => uniqueSorted(visibleComplaints.map((c) => c.status)),
    [visibleComplaints]
  );

  const availableSeverities = useMemo(() => {
    return Array.from(new Set(visibleComplaints.map((c) => (c.effective_severity || c.severity) as SeverityLevel)))
      .sort((a, b) => getSeverityConfig(a).level - getSeverityConfig(b).level);
  }, [visibleComplaints]);

  const filteredComplaints = useMemo(() => {
    const filtered = visibleComplaints.filter((complaint) => {
      if (departmentFilter && complaint.assigned_department !== departmentFilter) return false;
      if (statusFilter && complaint.status !== statusFilter) return false;
      if (severityFilter && (complaint.effective_severity || complaint.severity) !== severityFilter) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      const upvoteDiff = (b.upvote_count ?? 0) - (a.upvote_count ?? 0);
      if (upvoteDiff !== 0) return upvoteDiff;

      const severityDiff =
        getSeverityConfig(b.effective_severity || b.severity).level -
        getSeverityConfig(a.effective_severity || a.severity).level;
      if (severityDiff !== 0) return severityDiff;

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [visibleComplaints, departmentFilter, statusFilter, severityFilter]);

  const hasActiveFilters = Boolean(departmentFilter || statusFilter || severityFilter);

  useEffect(() => {
    if (departmentFilter && !availableDepartments.includes(departmentFilter)) {
      setDepartmentFilter(null);
    }
  }, [departmentFilter, availableDepartments]);

  useEffect(() => {
    if (statusFilter && !availableStatuses.includes(statusFilter)) {
      setStatusFilter(null);
    }
  }, [statusFilter, availableStatuses]);

  useEffect(() => {
    if (severityFilter && !availableSeverities.includes(severityFilter)) {
      setSeverityFilter(null);
    }
  }, [severityFilter, availableSeverities]);

  function handleSelectComplaint(complaint: MappedComplaint) {
    setSelectedComplaint(complaint);
    setFlyTarget({ lat: complaint.lat, lng: complaint.lng });
  }

  function handleCloseModal() {
    gsap.to(modalContentRef.current, { scale: 0.95, y: 10, opacity: 0, duration: 0.2, ease: "power2.in" });
    gsap.to(modalOverlayRef.current, { autoAlpha: 0, duration: 0.2, onComplete: () => {
      setSelectedComplaint(null);
    }});
  }

  function handleShareToX(complaint: MappedComplaint) {
    const text = `🚨 URGENT: Civic issue at ${complaint.address_text || "unspecified location"}
Ref: ${complaint.ticket_id || complaint.id.slice(0,8)}
Category: ${complaint.assigned_department}
Current Status: ${formatStatus(complaint.status)}

Authorities need to prioritize this! #JanSamadhan #CivicAction`;
    
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  function closeAllDropdowns() {
    setDepartmentDropdownOpen(false);
    setStatusDropdownOpen(false);
    setSeverityDropdownOpen(false);
  }

  function clearFilters() {
    setDepartmentFilter(null);
    setStatusFilter(null);
    setSeverityFilter(null);
  }

  const locationReady = Boolean(location);
  const secondsSinceLastLocation = lastUpdatedAt
    ? Math.max(0, Math.floor((nowTs - lastUpdatedAt) / 1000))
    : null;
  const locationFreshnessText = lastUpdatedAt
    ? `${secondsSinceLastLocation ?? 0}s ago`
    : "-";
  const gpsSignalStale = locationReady && secondsSinceLastLocation !== null && secondsSinceLastLocation > 15;
  const lowAccuracy = typeof accuracyMeters === "number" && accuracyMeters > 50;

  return (
    <div className="flex min-w-0 max-w-full flex-col bg-gray-50 dark:bg-gray-950 min-h-full">
      <div className="shrink-0 border-b border-gray-200 bg-white dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
        <NearbyTicketsMap
          complaints={filteredComplaints}
          selectedId={selectedComplaint?.id || null}
          flyTarget={flyTarget}
          userLocation={location}
          radiusMeters={radiusMeters}
          onRadiusChange={setRadiusMeters}
          onMarkerClick={handleSelectComplaint}
        />
      </div>

      <div className="min-w-0 max-w-full p-3">
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm flex flex-col dark:border-[#2a2a2a] dark:bg-[#161616]">
          {(gpsSignalStale || lowAccuracy) && (
            <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-200">
              {gpsSignalStale ? "Searching for GPS signal... live updates are temporarily delayed." : ""}
              {gpsSignalStale && lowAccuracy ? " " : ""}
              {lowAccuracy ? `Low GPS accuracy detected (±${Math.round(accuracyMeters ?? 0)}m).` : ""}
            </div>
          )}
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
            <div className="relative">
              <button
                onClick={() => {
                  setDepartmentDropdownOpen((v) => !v);
                  setStatusDropdownOpen(false);
                  setSeverityDropdownOpen(false);
                }}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-300 dark:hover:bg-[#2a2a2a]"
              >
                Department: {departmentFilter ?? "All"}
                <ChevronDown size={16} className={`transition-transform ${departmentDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {departmentDropdownOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-lg border border-gray-300 bg-white shadow-lg dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
                  <button
                    onClick={() => {
                      setDepartmentFilter(null);
                      closeAllDropdowns();
                    }}
                    className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#2a2a2a] ${
                      departmentFilter === null ? "bg-purple-50 font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" : ""
                    }`}
                  >
                    All Departments
                  </button>
                  {availableDepartments.map((department) => (
                    <button
                      key={department}
                      onClick={() => {
                        setDepartmentFilter(department);
                        closeAllDropdowns();
                      }}
                      className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#2a2a2a] ${
                        departmentFilter === department ? "bg-purple-50 font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" : ""
                      }`}
                    >
                      {department}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => {
                  setStatusDropdownOpen((v) => !v);
                  setDepartmentDropdownOpen(false);
                  setSeverityDropdownOpen(false);
                }}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-300 dark:hover:bg-[#2a2a2a]"
              >
                Status: {statusFilter ? formatStatus(statusFilter) : "All"}
                <ChevronDown size={16} className={`transition-transform ${statusDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {statusDropdownOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-300 bg-white shadow-lg dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
                  <button
                    onClick={() => {
                      setStatusFilter(null);
                      closeAllDropdowns();
                    }}
                    className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#2a2a2a] ${
                      statusFilter === null ? "bg-purple-50 font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" : ""
                    }`}
                  >
                    All Statuses
                  </button>
                  {availableStatuses.map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        setStatusFilter(status);
                        closeAllDropdowns();
                      }}
                      className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#2a2a2a] ${
                        statusFilter === status ? "bg-purple-50 font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" : ""
                      }`}
                    >
                      {formatStatus(status)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => {
                  setSeverityDropdownOpen((v) => !v);
                  setDepartmentDropdownOpen(false);
                  setStatusDropdownOpen(false);
                }}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-300 dark:hover:bg-[#2a2a2a]"
              >
                Severity: {severityFilter ? getSeverityConfig(severityFilter).label : "All"}
                <ChevronDown size={16} className={`transition-transform ${severityDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {severityDropdownOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-lg border border-gray-300 bg-white shadow-lg dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
                  <button
                    onClick={() => {
                      setSeverityFilter(null);
                      closeAllDropdowns();
                    }}
                    className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#2a2a2a] ${
                      severityFilter === null ? "bg-purple-50 font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" : ""
                    }`}
                  >
                    All Levels
                  </button>
                  {availableSeverities.map((severity) => (
                    <button
                      key={severity}
                      onClick={() => {
                        setSeverityFilter(severity);
                        closeAllDropdowns();
                      }}
                      className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#2a2a2a] ${
                        severityFilter === severity ? "bg-purple-50 font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" : ""
                      }`}
                    >
                      {getSeverityConfig(severity).label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-[#2a2a2a] dark:hover:text-gray-100"
              >
                <X size={16} />
                Clear Filters
              </button>
            )}

            <div className="ml-auto text-xs text-gray-500 dark:text-gray-400">
              {filteredComplaints.length} ticket{filteredComplaints.length !== 1 ? "s" : ""} in view
              {" · "}{formatDistance(radiusMeters)} radius
              {accuracyMeters ? ` · ±${Math.round(accuracyMeters)}m GPS` : ""}
              {` · update ${locationFreshnessText}`}
            </div>
          </div>

          <div className="overflow-x-auto flex flex-col">
            <div className="min-w-[940px] flex flex-col">
              <div className="sticky top-0 z-10 grid grid-cols-[150px_2.2fr_1.2fr_1fr_1fr_100px_120px] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-400">
                <span>Ticket ID</span>
                <span>Issue Title</span>
                <span>Department</span>
                <span>Status</span>
                <span>Reported Time</span>
                <span className="text-right">Upvotes</span>
                <span>Severity</span>
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                {loading && (
                  <div className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400">Loading nearby tickets...</div>
                )}

                {!loading && error && (
                  <div className="flex items-center gap-2 px-4 py-8 text-sm text-red-600 dark:text-red-400">
                    <AlertTriangle size={16} />
                    {error}
                  </div>
                )}

                {!loading && !error && visibleComplaints.length === 0 && (
                  <div className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400">
                    No tickets found within {formatDistance(radiusMeters)} of your current location.
                  </div>
                )}

                {!loading && !error && visibleComplaints.length > 0 && filteredComplaints.length === 0 && (
                  <div className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400">No tickets match your selected filters.</div>
                )}

                {!loading && !error && filteredComplaints.length > 0 && (
                  <ul className="divide-y divide-gray-100 dark:divide-[#2a2a2a]">
                    {filteredComplaints.map((complaint) => {
                      const severity = getSeverityConfig(complaint.effective_severity || complaint.severity);
                      const isSelected = selectedComplaint?.id === complaint.id;
                      const isUpvoted = hasUpvoted.has(complaint.id);

                      return (
                        <li
                        key={complaint.id}
                        ref={complaint.id === activeHighlight ? highlightedRef : null}
                        onClick={() => handleSelectComplaint(complaint)}
                        className={`grid cursor-pointer grid-cols-[150px_2.2fr_1.2fr_1fr_1fr_100px_120px] gap-3 px-4 py-4 text-sm transition-all duration-300 ${
                          complaint.id === activeHighlight
                            ? "bg-purple-100/50 shadow-[0_0_20px_rgba(168,85,247,0.4)] z-10 relative dark:bg-purple-900/40"
                            : isSelected
                              ? "bg-blue-50 dark:bg-blue-900/20"
                              : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-[#1e1e1e]"
                        }`}
                      >
                          <span className="truncate font-mono text-xs font-medium text-gray-900 sm:text-sm dark:text-gray-200">
                            {complaint.ticket_id || complaint.id.slice(0, 8).toUpperCase()}
                          </span>

                          <span className="line-clamp-2 font-medium leading-snug text-gray-900 dark:text-gray-200">
                            {complaint.title || "Untitled issue"}
                          </span>

                          <span className="line-clamp-2 leading-snug text-gray-700 dark:text-gray-300">
                            {complaint.assigned_department || "Unassigned"}
                          </span>

                          <span>
                            <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${statusClasses(complaint.status || "")}`}>
                              {formatStatus(complaint.status || "submitted")}
                            </span>
                          </span>

                          <span className="text-xs text-gray-500 sm:text-sm dark:text-gray-400">
                            {formatReportedTime(complaint.created_at)}
                          </span>

                          <span className="inline-flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpvote(complaint.id);
                              }}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors ${
                                isUpvoted
                                  ? "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#2a2a2a]"
                              }`}
                            >
                              <ArrowUp size={14} className={isUpvoted ? "text-purple-600 dark:text-purple-300" : "text-gray-400 dark:text-gray-500"} />
                              {complaint.upvote_count ?? 0}
                            </button>
                          </span>

                          <span>
                            <span
                              className="inline-flex rounded-md px-2 py-1 text-xs font-semibold uppercase"
                              style={{ background: `${severity.color}22`, color: severity.color }}
                            >
                              {severity.label}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Ticket Detail Modal */}
      <div 
        ref={modalOverlayRef}
        style={{ visibility: 'hidden', opacity: 0 }}
        className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        onClick={handleCloseModal}
      >
        <div 
          ref={modalContentRef}
          className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col md:flex-row dark:bg-[#1a1a1a] dark:border dark:border-[#2a2a2a]"
          onClick={e => e.stopPropagation()}
        >
          {/* Photos Section */}
          <div className="w-full md:w-2/5 bg-gray-100 dark:bg-[#222]">
            <img 
              src={selectedComplaint?.photo_urls?.[0] || "/mocks/media__1775984828664.png"} 
              className="h-64 md:h-full w-full object-cover"
              alt="Issue evidence"
            />
          </div>

          {/* Details Section */}
          <div className="flex-1 p-6 md:p-8 flex flex-col overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight mb-1">
                  {selectedComplaint?.title}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                  Ticket ID: {selectedComplaint?.ticket_id}
                </p>
              </div>
              <button 
                onClick={handleCloseModal}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#2a2a2a] transition-colors"
                aria-label="Close modal"
              >
                <X size={24} className="text-gray-500" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="space-y-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <Tag size={14} /> Department
                </span>
                <p className="text-gray-800 dark:text-gray-200 font-medium">
                  {selectedComplaint?.assigned_department}
                </p>
              </div>
              <div className="space-y-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <Clock size={14} /> Reported
                </span>
                <p className="text-gray-800 dark:text-gray-200 font-medium">
                  {selectedComplaint && formatReportedTime(selectedComplaint.created_at)}
                </p>
              </div>
              <div className="col-span-2 space-y-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <MapPin size={14} /> Location Details
                </span>
                <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                  {selectedComplaint?.address_text || "Geographic coordinates available on map."}
                </p>
              </div>
              <div className="col-span-2 space-y-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <AlertTriangle size={14} /> Description
                </span>
                <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed italic border-l-4 border-blue-500 pl-4 py-1 bg-blue-50/50 dark:bg-blue-900/10">
                  {selectedComplaint?.description}
                </p>
              </div>
            </div>

            <div className="mt-auto space-y-4 pt-6 border-t border-gray-100 dark:border-[#2a2a2a]">
              <div className="flex gap-4">
                <button 
                  onClick={() => selectedComplaint && handleUpvote(selectedComplaint.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-bold transition-all transform active:scale-[0.98] ${
                    hasUpvoted.has(selectedComplaint?.id || "")
                      ? "bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300"
                      : "bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-600/20"
                  }`}
                >
                  <ArrowUp size={20} className={hasUpvoted.has(selectedComplaint?.id || "") ? "text-purple-600" : ""} />
                  {hasUpvoted.has(selectedComplaint?.id || "") ? "Voted" : "Upvote"} ({selectedComplaint?.upvote_count})
                </button>
                <button 
                  onClick={() => selectedComplaint && handleShareToX(selectedComplaint)}
                  className="p-4 rounded-xl border border-gray-200 hover:bg-gray-50 dark:border-[#2a2a2a] dark:hover:bg-[#222] transition-colors"
                  aria-label="Share escalation to X"
                >
                  <Share2 size={24} className="text-gray-600 dark:text-gray-400" />
                </button>
              </div>
              <p className="text-[11px] text-center text-gray-400 bg-gray-50 py-2 rounded-lg dark:bg-[#222]">
                Your support helps fast-track critical urban issues for authority resolution.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
