"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import L from "leaflet";

type Props = {
  lat: number;
  lng: number;
  onPinMove: (lat: number, lng: number) => void;
};

function RecenterMap({ center }: { center: LatLngExpression }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center);
  }, [map, center]);

  return null;
}

export default function LocationPinPicker({ lat, lng, onPinMove }: Props) {
  useEffect(() => {
    // Ensure marker icons work correctly in Next.js runtime.
    delete (L.Icon.Default.prototype as { _getIconUrl?: () => string })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  const center = useMemo<LatLngExpression>(() => [lat, lng], [lat, lng]);

  return (
    <div className="h-40 w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <MapContainer center={center} zoom={15} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <RecenterMap center={center} />
        <Marker
          position={center}
          draggable
          eventHandlers={{
            dragend: (event) => {
              const marker = event.target as L.Marker;
              const pos = marker.getLatLng();
              onPinMove(pos.lat, pos.lng);
            },
          }}
        />
      </MapContainer>
    </div>
  );
}
