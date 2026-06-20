"use client";

import React, { useState, useMemo } from "react";

import { MapSection } from "../MapSection";
import { ActiveInterventionsPanel } from "../ActiveInterventionsPanel";
import { DelhiHealthScoreBar } from "../DelhiHealthScoreBar";
import { QuickActionsFooter } from "../QuickActionsFooter";
import { InterventionReviewModal } from "../InterventionReviewModal";

import { Intervention, InterventionTab, ZoneScore } from "../cm-types";
import { delhiZoneScores } from "../cm-mock";
import { ZoneFeature, ComplaintPoint, useLiveDashboardData } from "../cm-geo";

export interface DelhiOverviewViewProps {
  /** 12 MCD zone polygons (unioned ward geometries). */
  zoneRegions: ZoneFeature[];
  /** zoneId -> complaint count, for choropleth fill. */
  zoneCounts: Record<string, number>;
  /** Click a zone polygon to drill into it. */
  onRegionClick: (zoneId: string) => void;
  triggerToast: (message: string) => void;
  activeLayer: string;
  onLayerChange: (layerId: string) => void;
  intensity: number;
  onIntensityChange: (intensity: number) => void;
  activeSeverities: string[];
  onToggleSeverity: (severity: string) => void;
  overallScore?: number;
  trendStr?: string;
  liveZoneScores?: ZoneScore[];
  isLoading?: boolean;
  points: ComplaintPoint[];
}

// All / Critical / Escalated tabs
const escalationTabs: InterventionTab[] = [
  { id: "all", label: "All" },
  { id: "critical", label: "Critical", match: (i) => i.severity === "critical" },
  { id: "escalated", label: "Escalated", match: (i) => !!i.escalated },
];

export const DelhiOverviewView: React.FC<DelhiOverviewViewProps> = ({
  zoneRegions,
  zoneCounts,
  onRegionClick,
  triggerToast,
  activeLayer,
  onLayerChange,
  intensity,
  onIntensityChange,
  activeSeverities,
  onToggleSeverity,
  overallScore = 84,
  trendStr = "+3 pts",
  liveZoneScores,
  isLoading = false,
  points,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [interventionFilter, setInterventionFilter] = useState("all");
  const [selectedIntervention, setSelectedIntervention] = useState<Intervention | null>(null);

  // Search filter for map regions
  const filteredZoneRegions = useMemo(() => {
    if (!searchQuery) return zoneRegions;
    return zoneRegions.filter((r) =>
      r.properties.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [zoneRegions, searchQuery]);

  const { interventions } = useLiveDashboardData(points);

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

  return (
    <>
      <main className="flex-1 p-3 flex flex-col gap-3 min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col xl:flex-row gap-3 min-h-0">
          <div className="flex-grow-[3] flex flex-col min-h-0">
            <MapSection
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onShowIncidentsClick={() => triggerToast("Zone incident details refreshed")}
              wardTitle="Delhi Overview"
              wardSubtitle="12 Zones  •  250 Wards  •  Population: 2.1 Cr"
              searchPlaceholder="Search Zone / Ward..."
              regions={filteredZoneRegions}
              regionCounts={zoneCounts}
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
          </div>

          <div className="w-full xl:w-[22%] shrink-0 flex flex-col gap-3 min-h-0">
            <ActiveInterventionsPanel
              interventions={filteredInterventions}
              activeFilter={interventionFilter}
              onFilterChange={setInterventionFilter}
              onReviewClick={setSelectedIntervention}
              title="CM INTERVENTION REQUIRED"
              tabs={escalationTabs}
              showThumbnails
              onViewAllClick={() => triggerToast("Opening full interventions queue...")}
            />
          </div>
        </div>

        <DelhiHealthScoreBar
          overall={overallScore}
          trend={trendStr}
          zones={liveZoneScores && liveZoneScores.length > 0 ? liveZoneScores : delhiZoneScores}
          isLoading={isLoading}
        />
      </main>

      <QuickActionsFooter onFiltersClick={() => triggerToast("Filters panel coming soon")} />

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
