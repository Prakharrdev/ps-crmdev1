"use client";

import React, { useState, useEffect, useMemo } from "react";

import { MapSection } from "../MapSection";
import { AIInsightsPanel } from "../AIInsightsPanel";
import { DepartmentPerformanceTable } from "../DepartmentPerformanceTable";
import { CouncillorInfoCard } from "../CouncillorInfoCard";
import { ActiveInterventionsPanel } from "../ActiveInterventionsPanel";
import { LocalityHealthTable } from "../LocalityHealthTable";
import { PredictiveOutlookCard } from "../PredictiveOutlookCard";
import { QuickActionsFooter } from "../QuickActionsFooter";
import { InterventionReviewModal } from "../InterventionReviewModal";

import { DepartmentPerf, Intervention, InterventionTab } from "../cm-types";
import type { WardFeature } from "../cm-geo";
import {
  zoneInsights,
  zoneCommissioner,
  zonePredictionData,
  zoneQuickActions,
} from "../cm-mock";
import { ComplaintPoint, useLiveDashboardData } from "../cm-geo";

export interface ZoneViewProps {
  zoneName: string;
  onBack: () => void;
  /** Ward polygons belonging to this zone. */
  wardRegions: WardFeature[];
  /** ward_no -> complaint count, for choropleth fill. */
  wardCounts: Record<string, number>;
  /** Click a ward polygon to drill into it. */
  onRegionClick: (wardNo: string) => void;
  triggerToast: (message: string) => void;
  isDark: boolean;
  activeLayer: string;
  onLayerChange: (layerId: string) => void;
  intensity: number;
  onIntensityChange: (intensity: number) => void;
  activeSeverities: string[];
  onToggleSeverity: (severity: string) => void;
  liveWardScores?: Record<number, { score: number; activeComplaints: number }>;
  zoneHealthScore?: number;
  points: ComplaintPoint[];
}

// All / Critical / Escalated tabs (zone + delhi level)
const escalationTabs: InterventionTab[] = [
  { id: "all", label: "All" },
  { id: "critical", label: "Critical", match: (i) => i.severity === "critical" },
  { id: "escalated", label: "Escalated", match: (i) => !!i.escalated },
];

let cachedCommissioners: any[] | null = null;

export const ZoneView: React.FC<ZoneViewProps> = ({
  zoneName,
  onBack,
  wardRegions,
  wardCounts,
  onRegionClick,
  triggerToast,
  isDark,
  activeLayer,
  onLayerChange,
  intensity,
  onIntensityChange,
  activeSeverities,
  onToggleSeverity,
  liveWardScores,
  zoneHealthScore,
  points,
}) => {
  const zoneId = wardRegions[0]?.properties.zoneId || "central";
  const [insights, setInsights] = useState<any[] | null>(null);
  const [predictionData, setPredictionData] = useState<any[] | null>(null);
  const [expectedGrowth, setExpectedGrowth] = useState("+14%");
  const [estimatedSlaMisses, setEstimatedSlaMisses] = useState(11);
  const [highRiskHotspots, setHighRiskHotspots] = useState(["Connaught Place", "Karol Bagh", "Paharganj"]);
  const [commissioner, setCommissioner] = useState<any | null>(null);

  const { interventions, departments } = useLiveDashboardData(points);

  const activeComplaintsCount = useMemo(() => {
    return points.filter(p => !["resolved", "rejected", "spam", "pending_closure"].includes(p.status)).length;
  }, [points]);

  useEffect(() => {
    let active = true;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    
    // Fetch Insights
    fetch(`${apiUrl}/api/cm/insights?scope=zone&scope_id=${zoneId}`)
      .then(res => res.json())
      .then(data => {
        if (active && data.insights) setInsights(data.insights);
      })
      .catch(err => console.error("Error fetching zone insights:", err));

    // Fetch Outlook
    fetch(`${apiUrl}/api/cm/predictive-outlook?scope=zone&scope_id=${zoneId}`)
      .then(res => res.json())
      .then(data => {
        if (active && data.data) {
          setPredictionData(data.data);
          setExpectedGrowth(data.expectedGrowth);
          setEstimatedSlaMisses(data.estimatedSlaMisses);
          setHighRiskHotspots(data.highRiskHotspots);
        }
      })
      .catch(err => console.error("Error fetching zone outlook:", err));

    // Fetch Commissioner Card
    const loadCommissioner = (commissionersList: any[]) => {
      const targetZone = zoneName.replace(" Zone", "").trim().toLowerCase();
      const ac = commissionersList.find((c: any) =>
        c.assigned_zones.some((z: string) => z.toLowerCase().includes(targetZone))
      );
      if (ac) {
        setCommissioner({
          name: ac.name,
          role: ac.designation || "Zone Commissioner",
          body: `MCD — ${zoneName}`,
          electionYear: "Since 2021",
          party: "",
          partyColor: "",
          spouseName: "",
          profession: "",
          age: 0,
          voterCard: "",
          complaints: activeComplaintsCount || 312,
          resolutionTime: "4h 20m",
          satisfactionRate: "72%",
          wardHealth: zoneHealthScore ?? 76,
        });
      }
    };

    if (cachedCommissioners) {
      loadCommissioner(cachedCommissioners);
    } else {
      fetch(`${apiUrl}/api/cm/additional-commissioners`)
        .then(res => res.json())
        .then(data => {
          if (data.data) {
            cachedCommissioners = data.data;
            if (active) loadCommissioner(data.data);
          }
        })
        .catch(err => console.error("Error fetching zone commissioner:", err));
    }

    return () => {
      active = false;
    };
  }, [zoneId, zoneName, activeComplaintsCount, zoneHealthScore]);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<keyof DepartmentPerf>("open");
  const [sortAsc, setSortAsc] = useState(false);
  const [interventionFilter, setInterventionFilter] = useState("all");
  const [selectedIntervention, setSelectedIntervention] = useState<Intervention | null>(null);

  const liveWardHealthRows = useMemo(() => {
    return wardRegions.map((w) => {
      const wardNo = w.properties.ward_no;
      const wardName = w.properties.wardname;
      const stats = liveWardScores?.[wardNo] || { score: 100, activeComplaints: 0 };
      return {
        name: `Ward ${wardNo} - ${wardName}`,
        count: stats.activeComplaints,
        sev: `${stats.score}%`,
        color: stats.score >= 85 ? "bg-[#C9A84C]" : stats.score >= 70 ? "bg-amber-400" : "bg-red-600",
      };
    });
  }, [wardRegions, liveWardScores]);

  // Search filter for map regions
  const filteredWardRegions = useMemo(() => {
    if (!searchQuery) return wardRegions;
    const query = searchQuery.toLowerCase();
    return wardRegions.filter((r) =>
      r.properties.wardname.toLowerCase().includes(query) ||
      String(r.properties.ward_no).includes(query)
    );
  }, [wardRegions, searchQuery]);

  // Search filter for interventions
  const filteredInterventions = useMemo(() => {
    let list = interventions;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(query) ||
          i.description.toLowerCase().includes(query) ||
          (i.zone?.toLowerCase().includes(query) ?? false) ||
          (i.ward?.toLowerCase().includes(query) ?? false)
      );
    }
    return list;
  }, [interventions, searchQuery]);

  const handleSort = (field: keyof DepartmentPerf) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortedDepartments = useMemo(() => {
    return [...departments].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      if (typeof valA === "number" && typeof valB === "number") {
        return sortAsc ? valA - valB : valB - valA;
      }
      return sortAsc
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }, [sortField, sortAsc]);

  return (
    <>
      <main className="flex-1 p-3 flex flex-col gap-3 min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col xl:flex-row gap-3 min-h-0">
          <div className="flex-grow-[3] flex flex-col gap-3 min-h-0">
            <div className="flex flex-col xl:flex-row gap-3 flex-[5] min-h-0">
              <MapSection
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onShowIncidentsClick={() => triggerToast("Incident details refreshed")}
                wardTitle={`${zoneName} Zone`}
                wardSubtitle={`${wardRegions.length} Wards  •  Click a ward to drill in`}
                searchPlaceholder="Search Ward / Location..."
                onBack={onBack}
                regions={filteredWardRegions}
                regionCounts={wardCounts}
                onRegionClick={onRegionClick}
                choropleth
                showComplaints={false}
                className="h-full"
                activeLayer={activeLayer}
                onLayerChange={onLayerChange}
                intensity={intensity}
                onIntensityChange={onIntensityChange}
                activeSeverities={activeSeverities}
                onToggleSeverity={onToggleSeverity}
                complaints={points}
              />
              <div className="w-full xl:w-[18%] shrink-0 flex flex-col gap-3 h-full min-h-0">
                <AIInsightsPanel insights={insights || []} loading={insights === null} />
                <DepartmentPerformanceTable
                  departments={sortedDepartments}
                  sortField={sortField}
                  sortAsc={sortAsc}
                  onSort={handleSort}
                  onViewAllClick={() => triggerToast("Opening comprehensive department log...")}
                />
              </div>
            </div>

            <div className="flex-[3] grid grid-cols-1 md:grid-cols-2 gap-3 min-h-0">
              <LocalityHealthTable
                localities={liveWardHealthRows}
                title="WARD HEALTH SUMMARY"
                rowLabel="Ward"
                actionLabel="View Ward Analytics"
                onViewAnalyticsClick={() => triggerToast("Opening ward analytics breakdown...")}
                className="h-full min-h-0"
                loading={!liveWardScores || Object.keys(liveWardScores).length === 0}
              />
              <PredictiveOutlookCard
                data={predictionData || []}
                expectedGrowth={expectedGrowth}
                estimatedSlaMisses={estimatedSlaMisses}
                highRiskHotspots={highRiskHotspots}
                isDark={isDark}
                className="h-full min-h-0"
                loading={predictionData === null}
              />
            </div>
          </div>

          <div className="w-full xl:w-[22%] shrink-0 flex flex-col gap-3 min-h-0">
            <CouncillorInfoCard
              councillor={commissioner}
              loading={commissioner === null}
              title={`${zoneName.toUpperCase()} ZONE COMMAND CENTER`}
              showAbout={false}
              showParty={false}
              onCall={() => triggerToast("Connecting to Zone Commissioner...")}
              metrics={[
                { label: "Zone Health", value: String(zoneHealthScore ?? 76), suffix: "/100", highlight: true },
                { label: "Budget Used", value: "68%" },
                { label: "Field Staff", value: "428" },
                { label: "Escalations", value: "5" },
              ]}
            />
            <ActiveInterventionsPanel
              interventions={filteredInterventions}
              activeFilter={interventionFilter}
              onFilterChange={setInterventionFilter}
              onReviewClick={setSelectedIntervention}
              tabs={escalationTabs}
              onViewAllClick={() => triggerToast("Opening interventions portal...")}
            />
          </div>
        </div>
      </main>

      <QuickActionsFooter
        actions={zoneQuickActions}
        onAction={(id) => triggerToast(`Action triggered: ${id.replace(/_/g, " ")}`)}
        onFiltersClick={() => triggerToast("Filters panel coming soon")}
      />

      <InterventionReviewModal
        intervention={selectedIntervention}
        onClose={() => setSelectedIntervention(null)}
        onMarkReviewed={(item) => {
          setSelectedIntervention(null);
          triggerToast(`Intervention "${item.title}" marked as Reviewed.`);
        }}
      />
    </>
  );
};
