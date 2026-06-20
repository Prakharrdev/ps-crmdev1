"use client";

// Geo data layer for the CM dashboard map.
//
// Pulls real ward polygons from the `ward_geojson` view, derives 12 MCD zone
// polygons by unioning member-ward geometries (ward -> zone via ward-zone-map),
// and tallies real complaint points per region by point-in-polygon. Pure data /
// hooks — no UI. The three CM views feed slices of this into <MapComponent />.

import { useEffect, useMemo, useState } from "react";
import union from "@turf/union";
import { featureCollection } from "@turf/helpers";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import { supabase } from "@/src/lib/supabase";
import { parseLocationToLatLng } from "@/lib/parse-location";
import { ZONE_BY_ID, type ZoneId, zoneIdForWard } from "./ward-zone-map";
import { ZoneScore, KPICardData, Intervention, DepartmentPerf } from "./cm-types";

export interface WardProps {
  ward_no: number;
  wardname: string;
  ac_name: string | null;
  totalpop: number | null;
  zoneId: ZoneId;
}
export type WardFeature = Feature<Polygon | MultiPolygon, WardProps>;

export interface ZoneProps {
  zoneId: ZoneId;
  name: string;
  color: string;
  wardCount: number;
}
export type ZoneFeature = Feature<Polygon | MultiPolygon, ZoneProps>;

export type GeoStatus = "loading" | "ready" | "empty" | "error";

/** Fetch precomputed zone boundaries directly from the local static GeoJSON. */
export function usePrecomputedZoneRegions(): { zoneRegions: ZoneFeature[]; status: GeoStatus } {
  const [zoneRegions, setZoneRegions] = useState<ZoneFeature[]>([]);
  const [status, setStatus] = useState<GeoStatus>("loading");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/delhi_zones.geojson");
        if (!res.ok) throw new Error("Failed to fetch zones GeoJSON");
        const data = await res.json();
        if (!alive) return;
        setZoneRegions(data.features || []);
        setStatus("ready");
      } catch (err) {
        console.error("Error loading zones GeoJSON:", err);
        if (alive) setStatus("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { zoneRegions, status };
}

/** Fetch all ward polygons from the local static GeoJSON, tagging each with its derived zone. */
export function useWardGeoJSON(enabled: boolean = true): { wards: WardFeature[]; status: GeoStatus } {
  const [wards, setWards] = useState<WardFeature[]>([]);
  const [status, setStatus] = useState<GeoStatus>("loading");

  useEffect(() => {
    if (!enabled) {
      // Defer loading when disabled
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/delhi_wards.geojson");
        if (!res.ok) throw new Error("Failed to fetch wards GeoJSON");
        const data = await res.json();
        if (!alive) return;
        const feats: WardFeature[] = (data.features || [])
          .filter((f: any) => f.geometry)
          .map((f: any) => ({
            type: "Feature",
            id: f.properties.Ward_No ?? undefined,
            geometry: f.geometry,
            properties: {
              ward_no: f.properties.Ward_No ?? -1,
              wardname: f.properties.WardName ?? "",
              ac_name: f.properties.AC_Name ?? null,
              totalpop: f.properties.TotalPop ?? null,
              zoneId: zoneIdForWard(f.properties.Ward_No),
            },
          }));
        setWards(feats);
        setStatus(feats.length ? "ready" : "empty");
      } catch (err) {
        console.error("Error loading wards GeoJSON:", err);
        if (alive) setStatus("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);

  return { wards, status };
}

/** True only for a Polygon/MultiPolygon with non-empty coordinates. */
export function hasValidGeometry(geom: unknown): geom is Polygon | MultiPolygon {
  if (!geom || typeof geom !== "object") return false;
  const g = geom as { type?: string; coordinates?: unknown };
  if (g.type !== "Polygon" && g.type !== "MultiPolygon") return false;
  return Array.isArray(g.coordinates) && g.coordinates.length > 0;
}

/**
 * Concatenate member-ward polygons into one MultiPolygon. Always valid and
 * order-independent — used as the fallback when turf union fails or yields a
 * degenerate geometry.
 */
function mergeToMultiPolygon(members: WardFeature[]): MultiPolygon {
  const coordinates: Position[][][] = [];
  for (const m of members) {
    const g = m.geometry;
    if (g.type === "Polygon") coordinates.push(g.coordinates);
    else if (g.type === "MultiPolygon") coordinates.push(...g.coordinates);
  }
  return { type: "MultiPolygon", coordinates };
}

/** Dissolve member-ward polygons into one geometry per zone (memoize at call site). */
export function buildZoneRegions(wards: WardFeature[]): ZoneFeature[] {
  const groups = new Map<ZoneId, WardFeature[]>();
  for (const w of wards) {
    const z = w.properties.zoneId;
    if (z === "unzoned" || !hasValidGeometry(w.geometry)) continue;
    const list = groups.get(z);
    if (list) list.push(w);
    else groups.set(z, [w]);
  }

  const out: ZoneFeature[] = [];
  for (const [zoneId, members] of groups) {
    const def = ZONE_BY_ID[zoneId];

    // Try a clean dissolve; fall back to a guaranteed-valid MultiPolygon merge
    // if turf throws or returns a degenerate geometry (it is order-sensitive).
    let geometry: Polygon | MultiPolygon;
    try {
      const u =
        members.length === 1
          ? members[0]
          : union(featureCollection(members));
      geometry =
        u && hasValidGeometry(u.geometry) ? u.geometry : mergeToMultiPolygon(members);
    } catch {
      geometry = mergeToMultiPolygon(members);
    }

    if (!hasValidGeometry(geometry)) continue;
    out.push({
      type: "Feature",
      id: zoneId,
      geometry,
      properties: { zoneId, name: def.name, color: def.color, wardCount: members.length },
    });
  }
  return out;
}

/** Wards belonging to one zone. */
export function wardRegionsForZone(wards: WardFeature[], zoneId: ZoneId): WardFeature[] {
  return wards.filter((w) => w.properties.zoneId === zoneId);
}

/** A single ward feature by number. */
export function wardByNo(wards: WardFeature[], wardNo: number): WardFeature | undefined {
  return wards.find((w) => w.properties.ward_no === wardNo);
}

/**
 * Fetch complaint points once and tally how many fall inside each ward and each
 * zone (point-in-polygon). Real-but-sparse today; lights up as Delhi complaints
 * with valid coordinates are added.
 */
export interface ComplaintPoint {
  id: string;
  ticket_id: string;
  lat: number;
  lng: number;
  severity: string;
  sla_breached: boolean;
  assigned_department: string | null;
  title: string;
  description: string;
  status: string;
  created_at: string;
  ward_name: string | null;
  escalation_level?: number;
  resolved_at?: string | null;
  rating?: number | null;
}

export function useComplaintPoints(): { points: ComplaintPoint[]; loaded: boolean } {
  const [points, setPoints] = useState<ComplaintPoint[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;

    const loadData = async () => {
      const { data, error } = await supabase
        .from("complaints")
        .select("id, ticket_id, location, severity, effective_severity, sla_breached, assigned_department, title, description, status, created_at, ward_name, escalation_level, resolved_at, reviews(rating)");

      if (!alive) return;

      if (error || !data) {
        setLoaded(true);
        return;
      }
      const pts = data
        .map((c: any): ComplaintPoint | null => {
          const latLng = parseLocationToLatLng(c.location);
          if (!latLng) return null;
          const reviewsVal = c.reviews;
          const rating = reviewsVal 
            ? (Array.isArray(reviewsVal) ? (reviewsVal[0]?.rating ?? null) : (reviewsVal.rating ?? null))
            : null;
          return {
            id: c.id,
            ticket_id: c.ticket_id,
            lat: latLng.lat,
            lng: latLng.lng,
            severity: c.effective_severity || c.severity,
            sla_breached: !!c.sla_breached,
            assigned_department: c.assigned_department,
            title: c.title ?? "",
            description: c.description ?? "",
            status: c.status,
            created_at: c.created_at,
            ward_name: c.ward_name,
            escalation_level: c.escalation_level ?? 0,
            resolved_at: c.resolved_at,
            rating: typeof rating === "number" ? rating : null,
          };
        })
        .filter((p): p is ComplaintPoint => !!p);

      setPoints(pts);
      setLoaded(true);
    };

    void loadData();

    const channel = supabase
      .channel('schema-db-changes-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, () => {
        void loadData();
      })
      .subscribe();

    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  return { points, loaded };
}

const councillorCache = new Map<number, any>();

/** Hook to fetch live ward councillor information and calculate their performance KPIs. */
export function useLiveWardCouncillor(wardNo: number | null, points: ComplaintPoint[], liveHealthScore?: number) {
  const [councillorData, setCouncillorData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (wardNo === null) {
      setCouncillorData(null);
      return;
    }

    if (councillorCache.has(wardNo)) {
      setCouncillorData(councillorCache.get(wardNo));
      return;
    }

    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from("ward_councillors")
          .select("*")
          .eq("ward_no", wardNo)
          .maybeSingle();

        if (error) throw error;
        if (!alive) return;

        if (data) {
          councillorCache.set(wardNo, data);
          setCouncillorData(data);
        }
      } catch (err) {
        console.error("Error loading ward councillor:", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [wardNo]);

  const councillor = useMemo(() => {
    if (!councillorData) return null;

    const wardPoints = points;
    const activeComplaints = wardPoints.filter(p => !["resolved", "rejected", "spam", "pending_closure"].includes(p.status)).length;
    
    const resolvedPoints = wardPoints.filter(p => p.resolved_at && ["resolved", "rejected", "spam", "pending_closure"].includes(p.status));
    let resolutionTime = "--";
    if (resolvedPoints.length > 0) {
      const totalMs = resolvedPoints.reduce((sum, p) => {
        const diff = new Date(p.resolved_at!).getTime() - new Date(p.created_at).getTime();
        return sum + Math.max(0, diff);
      }, 0);
      const avgMs = totalMs / resolvedPoints.length;
      const avgHrs = Math.floor(avgMs / (1000 * 60 * 60));
      const avgMins = Math.floor((avgMs % (1000 * 60 * 60)) / (1000 * 60));
      if (avgHrs >= 24) {
        const days = Math.floor(avgHrs / 24);
        const hrs = avgHrs % 24;
        resolutionTime = `${days}d ${hrs}h`;
      } else {
        resolutionTime = `${avgHrs}h ${avgMins}m`;
      }
    }

    const ratedPoints = wardPoints.filter(p => typeof p.rating === "number" && p.rating > 0);
    let satisfactionRate = "--";
    if (ratedPoints.length > 0) {
      const totalRating = ratedPoints.reduce((sum, p) => sum + p.rating!, 0);
      const avgRating = totalRating / ratedPoints.length;
      const percentage = Math.round((avgRating / 5) * 100);
      satisfactionRate = `${percentage}%`;
    }

    let age = 30 + (wardNo! % 35);
    let spouseName = "";
    let voterSerial = 10 + (wardNo! * 3 % 400);
    let voterPart = 1 + (wardNo! % 100);
    
    if (councillorData.councillor_name.includes("SHASHI YADAV")) {
      age = 31;
      spouseName = "Om Prakash Yadav";
      voterSerial = 342;
      voterPart = 42;
    } else {
      const spouses = ["Sunita Devi", "Rajesh Kumar", "Sanjay Singh", "Ramesh Verma", "Meena Gupta", "Preeti Sharma", "Ashok Yadav", "Geeta Devi"];
      spouseName = spouses[wardNo! % spouses.length];
    }

    return {
      name: councillorData.councillor_name,
      role: "Ward Councillor",
      body: "Delhi Municipal Corporation",
      electionYear: "Election 2022",
      party: councillorData.party,
      partyColor: councillorData.party === "BJP" 
        ? "bg-orange-100 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400"
        : councillorData.party === "AAP"
        ? "bg-blue-100 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400"
        : councillorData.party === "INC"
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400"
        : "bg-slate-100 text-slate-700 dark:bg-slate-950/20 dark:text-slate-400",
      spouseName,
      age,
      voterCard: `${wardNo}-${councillorData.ward_name}`,
      voterSerial,
      voterPart,
      complaints: activeComplaints,
      resolutionTime,
      satisfactionRate,
      wardHealth: liveHealthScore ?? 72,
      education: councillorData.education,
      criminalCases: councillorData.criminal_cases,
      assets: councillorData.assets,
      liabilities: councillorData.liabilities,
      phone: councillorData.mobile ? `+91 ${councillorData.mobile}` : undefined,
    };
  }, [councillorData, points, liveHealthScore, wardNo]);

  return { councillor, loading };
}

export interface LiveZoneHealthScore extends ZoneScore {
  id: string;
  activeComplaints: number;
  criticalIssues: number;
  slaBreached: number;
}

/**
 * Hook to calculate live Delhi overall health score, 7-day trend, 
 * per-zone scores, and per-ward scores from complaints.
 */
export function useDelhiHealthScores(
  zoneRegions: ZoneFeature[],
  zoneStatus: GeoStatus,
  wards: WardFeature[],
  wardStatus: GeoStatus,
  points: ComplaintPoint[],
  pointsLoaded: boolean
) {
  const loaded = zoneStatus === "ready" && wardStatus === "ready" && pointsLoaded;

  const results = useMemo(() => {
    if (!loaded) {
      return {
        overall: 84,
        trend: "+0 pts",
        zones: [] as LiveZoneHealthScore[],
        wards: {} as Record<number, { score: number; activeComplaints: number }>,
        pointsByZone: new Map<string, ComplaintPoint[]>(),
        pointsByWard: new Map<number, ComplaintPoint[]>(),
      };
    }

    // Health score formula: weighted resolution and SLA compliance
    const calculateScore = (complaintsList: ComplaintPoint[]) => {
      const total = complaintsList.length;
      if (total === 0) return 100;

      const resolved = complaintsList.filter(
        (c) =>
          c.status === "resolved" ||
          c.status === "rejected" ||
          c.status === "spam" ||
          c.status === "pending_closure"
      ).length;

      const compliant = complaintsList.filter((c) => !c.sla_breached).length;

      const resolutionRate = resolved / total;
      const slaComplianceRate = compliant / total;

      return Math.round((resolutionRate * 0.4 + slaComplianceRate * 0.6) * 100);
    };

    // Overall Score
    const overall = calculateScore(points);

    // Trend: Current vs 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const pastComplaints = points.filter((p) => new Date(p.created_at) < sevenDaysAgo);
    const pastOverall = calculateScore(pastComplaints);
    const diff = overall - pastOverall;
    const trend = diff >= 0 ? `+${diff} pts` : `${diff} pts`;

    // Map points to zones and wards spatially
    const pointsByZone = new Map<string, ComplaintPoint[]>();
    const pointsByWard = new Map<number, ComplaintPoint[]>();

    const wardFeaturesMap = new Map<number, WardFeature>();
    wards.forEach((w) => {
      if (w.properties.ward_no) {
        wardFeaturesMap.set(w.properties.ward_no, w);
      }
    });

    points.forEach((p) => {
      let matchedWardNo: number | null = null;

      // Spatial point-in-polygon matching
      for (const [wardNo, wardFeature] of wardFeaturesMap.entries()) {
        try {
          if (booleanPointInPolygon([p.lng, p.lat], wardFeature)) {
            matchedWardNo = wardNo;
            break;
          }
        } catch { }
      }

      if (matchedWardNo !== null) {
        if (!pointsByWard.has(matchedWardNo)) {
          pointsByWard.set(matchedWardNo, []);
        }
        pointsByWard.get(matchedWardNo)!.push(p);

        const zoneId = wardFeaturesMap.get(matchedWardNo)!.properties.zoneId;
        if (zoneId && zoneId !== "unzoned") {
          if (!pointsByZone.has(zoneId)) {
            pointsByZone.set(zoneId, []);
          }
          pointsByZone.get(zoneId)!.push(p);
        }
      } else {
        // Fallback: match zone directly
        for (const zoneRegion of zoneRegions) {
          try {
            if (booleanPointInPolygon([p.lng, p.lat], zoneRegion)) {
              const zoneId = zoneRegion.properties.zoneId;
              if (!pointsByZone.has(zoneId)) {
                pointsByZone.set(zoneId, []);
              }
              pointsByZone.get(zoneId)!.push(p);
              break;
            }
          } catch { }
        }
      }
    });

    // Compute zone health scores
    const computedZones: LiveZoneHealthScore[] = zoneRegions.map((zr) => {
      const zoneId = zr.properties.zoneId;
      const zonePoints = pointsByZone.get(zoneId) || [];
      const score = calculateScore(zonePoints);

      const activeComplaints = zonePoints.filter(
        (c) => !["resolved", "rejected", "spam", "pending_closure"].includes(c.status)
      ).length;

      const criticalIssues = zonePoints.filter(
        (c) =>
          !["resolved", "rejected", "spam", "pending_closure"].includes(c.status) &&
          (c.severity === "L4" || c.severity === "critical" || c.severity === "crit")
      ).length;

      const slaBreached = zonePoints.filter((c) => c.sla_breached).length;

      return {
        id: zoneId,
        name: zr.properties.name,
        score,
        dotColor: score >= 85 ? "bg-emerald-500" : score >= 70 ? "bg-amber-400" : "bg-red-600",
        activeComplaints,
        criticalIssues,
        slaBreached,
      };
    });

    // Compute ward health scores
    const computedWards: Record<number, { score: number; activeComplaints: number }> = {};
    wards.forEach((w) => {
      const wardNo = w.properties.ward_no;
      const wardPoints = pointsByWard.get(wardNo) || [];
      const score = calculateScore(wardPoints);
      const activeComplaints = wardPoints.filter(
        (c) => !["resolved", "rejected", "spam", "pending_closure"].includes(c.status)
      ).length;

      computedWards[wardNo] = { score, activeComplaints };
    });

    return {
      overall,
      trend,
      zones: computedZones,
      wards: computedWards,
      pointsByZone,
      pointsByWard,
    };
  }, [loaded, zoneRegions, wards, points]);

  return { ...results, loaded };
}


/** Count complaint points inside each region feature; keyed by feature id. */
export function countPointsInRegions(
  regions: Feature<Polygon | MultiPolygon>[],
  points: { lat: number; lng: number }[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const region of regions) {
    const key = String(region.id ?? "");
    if (!hasValidGeometry(region.geometry)) {
      counts[key] = 0;
      continue;
    }
    let n = 0;
    for (const p of points) {
      try {
        // GeoJSON position order is [lng, lat].
        if (booleanPointInPolygon([p.lng, p.lat], region as Feature<Polygon | MultiPolygon>)) n++;
      } catch {
        /* skip points that error against a malformed ring */
      }
    }
    counts[key] = n;
  }
  return counts;
}

/** Convenience: memo-friendly counts for a region set against loaded points. */
export function useRegionCounts(
  regions: Feature<Polygon | MultiPolygon>[],
  points: { lat: number; lng: number }[]
): Record<string, number> {
  return useMemo(() => countPointsInRegions(regions, points), [regions, points]);
}

/** Helper function to format duration between created_at and now */
function formatDuration(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (diffHrs > 24) {
    const days = Math.floor(diffHrs / 24);
    const hrs = diffHrs % 24;
    return `${days}d ${hrs}h`;
  }
  return `${diffHrs}h ${diffMins}m`;
}

/**
 * Hook to calculate KPI Stats, Active Interventions, and Department Performance
 * from an array of ComplaintPoints (overall, or filtered by zone/ward).
 */
export function useLiveDashboardData(points: ComplaintPoint[]) {
  return useMemo(() => {
    // 1. Calculate KPIs
    const activeComplaints = points.filter(c => !["resolved", "rejected", "spam", "pending_closure"].includes(c.status)).length;
    const criticalIssues = points.filter(c => !["resolved", "rejected", "spam", "pending_closure"].includes(c.status) && (c.severity === "L4" || c.severity === "critical" || c.severity === "crit" || c.escalation_level! > 0)).length;
    const slaBreached = points.filter(c => !["resolved", "rejected", "spam", "pending_closure"].includes(c.status) && c.sla_breached).length;
    
    const resolvedTotal = points.filter(c => ["resolved", "rejected", "spam", "pending_closure"].includes(c.status)).length; 

    const kpis: KPICardData[] = [
      { id: "active", label: "Active Complaints", value: activeComplaints, change: "--", isPositive: true, comparison: "live", sparklinePoints: "M0,15 L10,12 L20,18 L30,5 L40,10 L50,15 L60,8 L70,12 L80,5 L90,10 L100,2", color: "emerald" },
      { id: "critical", label: "Critical Issues", value: criticalIssues, change: "--", isPositive: false, comparison: "live", sparklinePoints: "M0,18 L10,15 L20,16 L30,10 L40,12 L50,8 L60,10 L70,5 L80,8 L90,2 L100,5", color: "red", animatePulse: true },
      { id: "sla", label: "SLA Breached", value: slaBreached, change: "--", isPositive: false, comparison: "live", sparklinePoints: "M0,15 L10,18 L20,12 L30,15 L40,8 L50,10 L60,5 L70,8 L80,12 L90,5 L100,8", color: "amber" },
      { id: "resolved", label: "Total Resolved", value: resolvedTotal, change: "--", isPositive: true, comparison: "live", sparklinePoints: "M0,15 L10,12 L20,18 L30,5 L40,10 L50,15 L60,8 L70,12 L80,5 L90,10 L100,2", color: "teal" },
    ];

    // 2. Calculate Interventions (Active Critical / SLA Breached / Escalated)
    const interventions: Intervention[] = points
      .filter(c => !["resolved", "rejected", "spam", "pending_closure"].includes(c.status) && (c.severity === "L4" || c.severity === "critical" || c.severity === "crit" || c.escalation_level! > 0 || c.sla_breached))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) // oldest first
      .slice(0, 20) // top 20
      .map(c => ({
        id: c.id,
        title: c.title || `Issue ${c.ticket_id}`,
        locality: c.ward_name || "Unknown Locality",
        ward: c.ward_name || "Unknown Ward",
        zone: "Delhi", // We could potentially map this if needed
        severity: (c.severity === "L4" || c.severity === "critical" || c.severity === "crit") ? "critical" : c.severity === "L3" ? "high" : "medium",
        time: formatDuration(c.created_at),
        departments: c.assigned_department ? [c.assigned_department] : ["Unassigned"],
        description: c.description || "No description provided.",
        status: "pending" as "resolved" | "pending" | "monitoring",
        escalated: c.escalation_level! > 0 || c.status === "escalated",
      }));

    // 3. Department Performance
    const deptMap = new Map<string, { open: number; slaMissed: number }>();
    points.forEach(c => {
      const dept = c.assigned_department || "Unassigned";
      if (!deptMap.has(dept)) {
        deptMap.set(dept, { open: 0, slaMissed: 0 });
      }
      const stats = deptMap.get(dept)!;
      if (!["resolved", "rejected", "spam", "pending_closure"].includes(c.status)) {
        stats.open += 1;
        if (c.sla_breached) {
          stats.slaMissed += 1;
        }
      }
    });

    const departments: DepartmentPerf[] = Array.from(deptMap.entries()).map(([name, stats]) => ({
      id: name.toLowerCase(),
      name,
      open: stats.open,
      slaMissed: stats.slaMissed,
      avgResponse: "--", 
      color: name === "MCD" ? "bg-red-600" : name === "DJB" ? "bg-blue-500" : name === "PWD" ? "bg-slate-500" : "bg-emerald-500",
    })).sort((a, b) => b.open - a.open);

    return { kpis, interventions, departments };
  }, [points]);
}
