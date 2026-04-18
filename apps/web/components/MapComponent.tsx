"use client";

import React from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import type { Tables } from "@/src/types/database.types";
import { useTheme } from "@/components/ThemeProvider";
import { getMapTileLayerConfig } from "@/lib/map-tiles";

type ComplaintRow = Tables<"complaints">;

type MapComplaint = {
  id: string;
  title: string;
  description: string;
  severity: string;
  lat: number;
  lng: number;
};

const DEFAULT_CENTER: [number, number] = [28.6139, 77.209];
const DEFAULT_ZOOM = 12;

const SEVERITY_COLOR: Record<string, string> = {
  L1: "#38bdf8",
  L2: "#f59e0b",
  L3: "#f97316",
  L4: "#ef4444",
};

function normalizeSeverityLevel(severity: string): "L1" | "L2" | "L3" | "L4" {
  const s = (severity ?? "").toLowerCase().trim();
  if (s === "l4" || s === "critical" || s === "crit") return "L4";
  if (s === "l3" || s === "high") return "L3";
  if (s === "l2" || s === "medium" || s === "med") return "L2";
  return "L1";
}

function parseEwkbHexPoint(hex: string): { lat: number; lng: number } | null {
  const normalized = hex.trim();
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length < 42) {
    return null;
  }

  try {
    const bytes = new Uint8Array(normalized.length / 2);
    for (let i = 0; i < normalized.length; i += 2) {
      bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
    }

    const view = new DataView(bytes.buffer);
    const littleEndian = view.getUint8(0) === 1;
    const typeWithFlags = view.getUint32(1, littleEndian);
    const hasSrid = (typeWithFlags & 0x20000000) !== 0;
    const geomType = typeWithFlags & 0x000000ff;

    if (geomType !== 1) {
      return null;
    }

    const coordOffset = hasSrid ? 9 : 5;
    if (bytes.byteLength < coordOffset + 16) {
      return null;
    }

    const lng = view.getFloat64(coordOffset, littleEndian);
    const lat = view.getFloat64(coordOffset + 8, littleEndian);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    return { lat, lng };
  } catch {
    return null;
  }
}

function parseLocationToLatLng(location: unknown): { lat: number; lng: number } | null {
  if (!location) return null;

  if (typeof location === "object") {
    const maybeObj = location as Record<string, unknown>;

    const coordinates = maybeObj.coordinates;
    if (Array.isArray(coordinates) && coordinates.length >= 2) {
      const lng = Number(coordinates[0]);
      const lat = Number(coordinates[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }

    const latVal = maybeObj.lat ?? maybeObj.latitude;
    const lngVal = maybeObj.lng ?? maybeObj.lon ?? maybeObj.longitude;
    if (latVal !== undefined && lngVal !== undefined) {
      const lat = Number(latVal);
      const lng = Number(lngVal);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }

    const xVal = maybeObj.x;
    const yVal = maybeObj.y;
    if (xVal !== undefined && yVal !== undefined) {
      const lng = Number(xVal);
      const lat = Number(yVal);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }
  }

  if (typeof location === "string") {
    const ewkb = parseEwkbHexPoint(location);
    if (ewkb) {
      return ewkb;
    }

    const pointMatch = location.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
    if (pointMatch) {
      const lng = Number(pointMatch[1]);
      const lat = Number(pointMatch[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }

    const sridPointMatch = location.match(/SRID=\d+;\s*POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
    if (sridPointMatch) {
      const lng = Number(sridPointMatch[1]);
      const lat = Number(sridPointMatch[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }

    const tupleMatch = location.match(/^\s*\(?\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)?\s*$/);
    if (tupleMatch) {
      const first = Number(tupleMatch[1]);
      const second = Number(tupleMatch[2]);
      if (Number.isFinite(first) && Number.isFinite(second)) {
        const looksLikeLatLng = Math.abs(first) <= 90 && Math.abs(second) <= 180;
        const lat = looksLikeLatLng ? first : second;
        const lng = looksLikeLatLng ? second : first;
        return { lat, lng };
      }
    }

    try {
      const parsed = JSON.parse(location);
      return parseLocationToLatLng(parsed);
    } catch {
      return null;
    }
  }

  return null;
}

export default function MapComponent({
  selectedComplaintId,
  recenterTrigger,
  highQuality,
}: {
  selectedComplaintId?: string | null;
  recenterTrigger?: number;
  highQuality?: boolean;
}) {
  const [complaints, setComplaints] = useState<MapComplaint[]>([]);
  const [mounted, setMounted] = useState(false);
  const [leaflet, setLeaflet] = useState<any>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rawCount, setRawCount] = useState(0);
  const { theme } = useTheme();
  const tileConfig = getMapTileLayerConfig({ theme, highQuality });

  // Fetch complaints from Supabase
  async function fetchComplaints() {
    try {
      const { data, error } = await supabase
        .from("complaints")
        .select("id, title, description, location, severity, effective_severity");

      if (error) {
        setFetchError(error.message || "Unable to fetch complaints.");
        setComplaints([]);
        return;
      }

      if (!data) {
        setFetchError(null);
        setComplaints([]);
        setRawCount(0);
        return;
      }

      setRawCount(data.length);

      const formatted: MapComplaint[] = data
        .map((c: any) => {
          const parsed = parseLocationToLatLng(c.location);
          if (!parsed) return null;

          return {
            id: c.id,
            title: c.title,
            description: c.description,
            severity: c.effective_severity || c.severity,
            lat: parsed.lat,
            lng: parsed.lng,
          };
        })
        .filter(Boolean) as MapComplaint[];

      setFetchError(null);
      setComplaints(formatted);
    } catch {
      setFetchError("Unable to fetch complaints.");
      setComplaints([]);
      setRawCount(0);
    }
  }

  useEffect(() => {
    setMounted(true);
    import("leaflet").then((L) => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;

      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      setLeaflet(L);
    });

    fetchComplaints();

    // PERFORMANCE OPTIMIZATION: Realtime subscription instead of 5s polling
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'complaints'
        },
        () => {
          console.log('Complaints changed, fetching updates...');
          void fetchComplaints();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  if (!mounted || !leaflet || typeof window === 'undefined') return null;

  const getSeverityIcon = (severity: string, L: any) => {
    const level = normalizeSeverityLevel(severity);
    const color = SEVERITY_COLOR[level];

    return new L.DivIcon({
      html: `
        <div style="
          background-color: ${color};
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 0 6px rgba(0,0,0,0.4);
        "></div>
      `,
      className: "",
    });
  };

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div className="absolute right-4 top-4 z-[1000] flex items-center gap-3 pointer-events-none">
        <button
          onClick={() => setShowHeatmap(!showHeatmap)}
          className="pointer-events-auto rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white shadow-md hover:bg-gray-700 transition-colors"
        >
          {showHeatmap ? "Show Markers" : "Show Heatmap"}
        </button>
      </div>

      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        maxZoom={highQuality ? 20 : 19}
        zoomSnap={highQuality ? 0.25 : 1}
        zoomDelta={highQuality ? 0.25 : 1}
        zoomControl={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution={tileConfig.attribution}
          url={tileConfig.url}
          detectRetina={tileConfig.detectRetina}
          maxNativeZoom={tileConfig.maxNativeZoom}
          subdomains={tileConfig.subdomains}
        />
        <ZoomToComplaint
          complaints={complaints}
          selectedComplaintId={selectedComplaintId}
        />
        <ResetToDefaultView recenterTrigger={recenterTrigger} />
        {!showHeatmap &&
          complaints.map((c) => (
            <Marker
              key={c.id}
              position={[c.lat, c.lng]}
              icon={
                leaflet
                  ? getSeverityIcon(c.severity, leaflet)
                  : undefined
              }
            >
              <Popup>
                <strong>{c.title}</strong>
                <br />
                {c.description}
                <br />
                <b>Severity:</b> {c.severity}
              </Popup>
            </Marker>
          ))}

        {showHeatmap && <HeatmapLayer complaints={complaints} />}
      </MapContainer>

      {fetchError && (
        <div
          style={{
            position: "absolute",
            zIndex: 2100,
            left: 20,
            top: 20,
            background: "#111",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: "6px",
            maxWidth: 380,
            fontSize: "13px",
          }}
        >
          Failed to load complaints: {fetchError}
        </div>
      )}

      {!fetchError && rawCount > 0 && complaints.length === 0 && (
        <div
          style={{
            position: "absolute",
            zIndex: 2100,
            left: 20,
            top: 20,
            background: "#111",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: "6px",
            maxWidth: 420,
            fontSize: "13px",
          }}
        >
          Loaded {rawCount} complaints, but none had valid map coordinates.
        </div>
      )}
    </div>
  );
}

function ResetToDefaultView({ recenterTrigger }: { recenterTrigger?: number }) {
  const map = useMap();

  useEffect(() => {
    if (!recenterTrigger) return;
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: true });
  }, [recenterTrigger, map]);

  return null;
}

function HeatmapLayer({ complaints }: { complaints: any[] }) {
  const map = useMap();

  useEffect(() => {
    const L = require("leaflet");
    if (typeof window !== "undefined" && !(window as any).L) {
      (window as any).L = L;
    }
    require("leaflet.heat");

    const heatLayer = (L as any).heatLayer(
      complaints.map((c: any) => [
        c.lat,
        c.lng,
        getIntensity(c.severity),
      ]),
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

function getIntensity(severity: string) {
  switch (normalizeSeverityLevel(severity)) {
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
function ZoomToComplaint({
  complaints,
  selectedComplaintId,
}: {
  complaints: MapComplaint[];
  selectedComplaintId?: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedComplaintId) return;

    const complaint = complaints.find(
      (c) => c.id === selectedComplaintId
    );

    if (complaint) {
      map.setView([complaint.lat, complaint.lng], 15, {
        animate: true,
      });
    }
  }, [selectedComplaintId, complaints, map]);

  return null;
}
