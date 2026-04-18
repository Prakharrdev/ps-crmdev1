"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleMarker, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { ChevronDown, ChevronUp, Flame, LocateFixed } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { getMapTileLayerConfig } from "@/lib/map-tiles";

import type { MappedComplaint } from "./useNearbyTickets";
import { getSeverityConfig } from "./useNearbyTickets";
import { calculateDistanceMeters, formatDistance, type GeoPoint } from "./distance";

function FlyToTarget({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();

  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lng], 18, { duration: 0.8 });
    }
  }, [map, target]);

  return null;
}

function LiveFollow({
  userLocation,
  recenterSignal,
}: {
  userLocation: GeoPoint | null;
  recenterSignal: number;
}) {
  const map = useMap();
  const prevLocationRef = useRef<GeoPoint | null>(null);
  const prevRecenterRef = useRef<number>(0);

  useEffect(() => {
    if (!userLocation) return;

    const forceRecenter = recenterSignal !== prevRecenterRef.current;
    const prev = prevLocationRef.current;
    const movedMeters = prev ? calculateDistanceMeters(prev, userLocation) : Number.POSITIVE_INFINITY;

    if (!forceRecenter && movedMeters < 10) {
      return;
    }

    if (forceRecenter || !prev) {
      map.flyTo([userLocation.lat, userLocation.lng], 18, { duration: 0.8 });
    } else {
      map.panTo([userLocation.lat, userLocation.lng], { animate: true, duration: 0.8 });
    }

    prevLocationRef.current = userLocation;
    prevRecenterRef.current = recenterSignal;
  }, [map, recenterSignal, userLocation]);

  return null;
}

function HeatmapLayer({ complaints }: { complaints: MappedComplaint[] }) {
  const map = useMap();

  useEffect(() => {
    if (complaints.length === 0) return;

    const L = require("leaflet");
    if (typeof window !== "undefined" && !(window as any).L) {
      (window as any).L = L;
    }
    require("leaflet.heat");

    function getIntensity(sev: string) {
      switch (sev) {
        case "L4":
          return 1.0;
        case "L3":
          return 0.75;
        case "L2":
          return 0.5;
        case "L1":
          return 0.25;
        default:
          return 0.3;
      }
    }

    const heatLayer = (L as any).heatLayer(
      complaints.map((c) => [c.lat, c.lng, getIntensity(c.effective_severity || c.severity)]),
      {
        radius: 25,
        blur: 20,
        minOpacity: 0.35,
        gradient: {
          0.2: "#22c55e",
          0.45: "#eab308",
          0.7: "#f97316",
          1.0: "#ef4444",
        },
      }
    );

    heatLayer.addTo(map);
    return () => {
      map.removeLayer(heatLayer);
    };
  }, [complaints, map]);

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeMarkerIcon(complaint: MappedComplaint, L: any, isSelected: boolean, distanceLabel: string) {
  const sev = getSeverityConfig(complaint.effective_severity || complaint.severity);
  const photo = complaint.photo_urls?.[0];
  const size = isSelected ? 52 : 42;

  const photoHtml = photo
    ? `<img src="${photo}"
         style="width:100%;height:100%;object-fit:cover;border-radius:50%;"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
       <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;
         font-size:${size * 0.38}px;background:${sev.color}22;border-radius:50%;">📍</div>`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;
         font-size:${size * 0.38}px;background:${sev.color}22;border-radius:50%;">📍</div>`;

  return new L.DivIcon({
    html: `
      <div class="complaint-pin-wrapper" style="position:relative;display:inline-block;">
        <div style="
          width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;
          transition:all 0.2s;cursor:pointer;
        ">${photoHtml}</div>
        <div class="pin-tooltip" style="
          position:absolute;
          left:${size + 6}px;
          top:50%;
          transform:translateY(-50%);
          background:rgba(0,0,0,0.82);
          color:#fff;
          font-size:11px;
          font-weight:700;
          line-height:1;
          padding:6px 8px;
          border-radius:6px;
          white-space:nowrap;
          pointer-events:none;
          opacity:0;
          transition:opacity 0.15s;
          z-index:9999;
          border-left:3px solid ${sev.color};
        ">${distanceLabel}</div>
      </div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

interface NearbyTicketsMapProps {
  complaints: MappedComplaint[];
  selectedId: string | null;
  flyTarget: { lat: number; lng: number } | null;
  userLocation: GeoPoint | null;
  radiusMeters: number;
  onRadiusChange: (radiusMeters: number) => void;
  onMarkerClick: (complaint: MappedComplaint) => void;
  reportLocation?: { lat: number; lng: number };
  onReportLocationMove?: (lat: number, lng: number) => void;
  customHeight?: string;
  hideCollapse?: boolean;
  onRecenterClick?: () => void;
  highQuality?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeExpandedMapHeight(viewportHeight: number): number {
  if (viewportHeight <= 800) {
    return clamp(Math.round(viewportHeight * 0.36), 240, 360);
  }
  return clamp(Math.round(viewportHeight * 0.42), 280, 460);
}

export default function NearbyTicketsMap({
  complaints,
  selectedId,
  flyTarget,
  userLocation,
  radiusMeters,
  onRadiusChange,
  onMarkerClick,
  reportLocation,
  onReportLocationMove,
  customHeight,
  hideCollapse,
  onRecenterClick,
  highQuality = true,
}: NearbyTicketsMapProps) {
  const { theme } = useTheme();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [L, setL] = useState<any>(null);
  const [expandedMapHeight, setExpandedMapHeight] = useState(360);
  const [collapsed, setCollapsed] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [mapSessionKey, setMapSessionKey] = useState(0);
  const tileConfig = useMemo(
    () => getMapTileLayerConfig({ theme, highQuality }),
    [highQuality, theme]
  );

  useEffect(() => {
    import("leaflet").then((leaflet) => {
      delete (leaflet.Icon.Default.prototype as any)._getIconUrl;
      leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      setL(leaflet);
    });

    const style = document.createElement("style");
    style.innerHTML = ".complaint-pin-wrapper:hover .pin-tooltip { opacity: 1 !important; }";
    document.head.appendChild(style);

    const applyExpandedHeight = () => {
      setExpandedMapHeight(computeExpandedMapHeight(window.innerHeight));
    };

    applyExpandedHeight();
    window.addEventListener("resize", applyExpandedHeight);

    return () => {
      document.head.removeChild(style);
      window.removeEventListener("resize", applyExpandedHeight);
    };
  }, []);

  function handleRecenter() {
    if (onRecenterClick) {
      onRecenterClick();
    } else {
      setRecenterSignal((prev) => prev + 1);
    }
  }

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      // Force a fresh Leaflet instance after re-opening to avoid container reuse issues.
      if (!next) {
        setMapSessionKey((k) => k + 1);
      }
      return next;
    });
  }

  return (
    <>
      <div className="relative overflow-hidden transition-all duration-300" style={{ height: collapsed ? 0 : customHeight || expandedMapHeight }}>
        {!collapsed && L && (
          <MapContainer
            key={`map-${mapSessionKey}-${userLocation?.lat}-${userLocation?.lng}`}
            center={[28.6139, 77.209]}
            zoom={12}
            style={{ height: "100%", width: "100%" }}
            zoomControl={false}
          >
            <TileLayer
              attribution={tileConfig.attribution}
              url={tileConfig.url}
              detectRetina={tileConfig.detectRetina}
              maxNativeZoom={tileConfig.maxNativeZoom}
              subdomains={tileConfig.subdomains}
            />
            <FlyToTarget target={flyTarget} />
            <LiveFollow userLocation={userLocation} recenterSignal={recenterSignal} />

            {/* If used in report form, show the draggable pin */}
            {reportLocation && (
              <Marker
                position={[reportLocation.lat, reportLocation.lng]}
                draggable
                eventHandlers={{
                  dragend: (event) => {
                    const marker = event.target as any;
                    const pos = marker.getLatLng();
                    onReportLocationMove?.(pos.lat, pos.lng);
                  },
                }}
              />
            )}

            {userLocation && (
              <>
                <Circle
                  center={[userLocation.lat, userLocation.lng]}
                  radius={radiusMeters}
                  pathOptions={{ color: "#7c3aed", fillColor: "#7c3aed", fillOpacity: 0.12, weight: 2 }}
                />
                {/* User location marker - blue target with white center, distinct from complaint markers */}
                <CircleMarker
                  center={[userLocation.lat, userLocation.lng]}
                  radius={12}
                  pathOptions={{
                    color: "#3b82f6",
                    fillColor: "#3b82f6",
                    fillOpacity: 0.25,
                    weight: 3,
                  }}
                />
                <CircleMarker
                  center={[userLocation.lat, userLocation.lng]}
                  radius={5}
                  pathOptions={{
                    color: "#ffffff",
                    fillColor: "#3b82f6",
                    fillOpacity: 1,
                    weight: 2,
                  }}
                />
              </>
            )}

            {showHeatmap && <HeatmapLayer complaints={complaints} />}

            {complaints.map((complaint) => {
              const distanceLabel = userLocation
                ? formatDistance(calculateDistanceMeters(userLocation, { lat: complaint.lat, lng: complaint.lng }))
                : "-";

              return (
                <Marker
                  key={complaint.id}
                  position={[complaint.lat, complaint.lng]}
                  icon={makeMarkerIcon(complaint, L, selectedId === complaint.id, distanceLabel)}
                  eventHandlers={{ click: () => onMarkerClick(complaint) }}
                />
              );
            })}
          </MapContainer>
        )}

        {!collapsed && (
          <>
            {/* Top left: Heatmap button */}
            <button
              onClick={() => setShowHeatmap((v) => !v)}
              className={`absolute left-3 top-3 z-[1000] flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-lg transition-all ${
                showHeatmap
                  ? "border-orange-600 bg-orange-500 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-200 dark:hover:bg-[#2a2a2a]"
              }`}
              title="Toggle heatmap overlay"
            >
              <Flame size={12} />
              {showHeatmap ? "Heatmap On" : "Heatmap"}
            </button>

            {/* Bottom left: Radius slider */}
            <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-3 py-1.5 shadow-md backdrop-blur dark:border-[#2a2a2a] dark:bg-[#1e1e1e]/95">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Radius</span>
              <input
                type="range"
                min={500}
                max={2000}
                step={500}
                value={radiusMeters}
                onChange={(e) => onRadiusChange(Number(e.target.value))}
                className="h-1 w-20 cursor-pointer accent-violet-600"
                aria-label="Nearby ticket radius"
              />
              <span className="w-10 text-right text-[11px] font-bold text-violet-700 dark:text-violet-300">
                {formatDistance(radiusMeters)}
              </span>
            </div>

            {/* Bottom right: Recenter button */}
            <button
              onClick={handleRecenter}
              className="absolute bottom-3 right-3 z-[1000] inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-lg transition-colors hover:bg-gray-50 dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-200 dark:hover:bg-[#2a2a2a]"
              title="Center on my current location"
              aria-label="Center on my current location"
            >
              <LocateFixed size={16} />
            </button>
          </>
        )}
      </div>



      {!hideCollapse && (
        <div className="group relative flex h-7 shrink-0 select-none items-center justify-center border-y border-gray-200 bg-gray-100 dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
          <button
            onClick={toggleCollapsed}
            className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[10px] font-semibold text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200"
          >
            {collapsed ? (
              <>
                <ChevronDown size={13} /> Map
              </>
            ) : (
              <>
                <ChevronUp size={13} /> Hide
              </>
            )}
          </button>
        </div>
      )}
    </>
  );
}
