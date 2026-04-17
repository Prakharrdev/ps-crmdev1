"use client"

import { useEffect, useId, useMemo, useState } from "react"
import L from "leaflet"
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet"
import {
  markerColor,
  severityClass,
  type DashboardTask,
} from "@/components/worker-dashboard/dashboard-types"

type WorkerTaskMapPanelProps = {
  tasks: DashboardTask[]
  highlightedTaskId?: string | null
  loading: boolean
  error: string | null
  onSelectTask?: (taskId: string) => void
}

function createMarkerIcon(color: string, highlighted = false): L.DivIcon {
  const size = highlighted ? 22 : 18
  const border = highlighted ? 4 : 3
  const shadow = highlighted ? "0 0 0 3px rgba(180,114,90,0.25), 0 0 8px rgba(0,0,0,0.3)" : "0 0 6px rgba(0,0,0,0.25)"
  return new L.DivIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${border}px solid #fff;box-shadow:${shadow};"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function FitMapToMarkers({ points }: { points: Array<{ lat: number; lng: number }> }) {
  const map = useMap()

  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14, { animate: false })
      return
    }
    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng]))
    map.fitBounds(bounds, { padding: [8, 8], maxZoom: 16 })
  }, [map, points])

  return null
}

function KeepMapSized({ resizeTrigger }: { resizeTrigger: number }) {
  const map = useMap()

  useEffect(() => {
    const container = map.getContainer()
    const invalidate = () => map.invalidateSize({ pan: false })

    const frameId = window.requestAnimationFrame(invalidate)
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(invalidate) : null
    observer?.observe(container)
    window.addEventListener("resize", invalidate)

    return () => {
      window.cancelAnimationFrame(frameId)
      observer?.disconnect()
      window.removeEventListener("resize", invalidate)
    }
  }, [map, resizeTrigger])

  return null
}

function ZoomToHighlightedTask({
  task,
}: {
  task: { lat: number; lng: number } | null
}) {
  const map = useMap()

  useEffect(() => {
    if (!task) return
    map.setView([task.lat, task.lng], 15, { animate: true })
  }, [map, task])

  return null
}

function ResetToTaskBounds({
  points,
  recenterTrigger,
}: {
  points: Array<{ lat: number; lng: number }>
  recenterTrigger: number
}) {
  const map = useMap()

  useEffect(() => {
    if (recenterTrigger === 0 || points.length === 0) return
    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng]))
    map.fitBounds(bounds, { padding: [20, 20], maxZoom: 15 })
  }, [map, points, recenterTrigger])

  return null
}

export default function WorkerTaskMapPanel({
  tasks,
  highlightedTaskId,
  loading,
  error,
  onSelectTask,
}: WorkerTaskMapPanelProps) {
  const [isClientReady, setIsClientReady] = useState(false)
  const [recenterTrigger, setRecenterTrigger] = useState(0)
  // Ensure each component mount gets a fresh Leaflet container identity.
  const mapSessionKey = useId()

  useEffect(() => {
    setIsClientReady(true)
  }, [])

  const mappableTasks = useMemo(
    () => tasks.filter((task) => task.latitude != null && task.longitude != null),
    [tasks],
  )

  const markerIcons = useMemo(() => {
    return new Map(
      mappableTasks.map((task) => [
        task.id,
        createMarkerIcon(markerColor(task.severity), task.id === highlightedTaskId),
      ]),
    )
  }, [highlightedTaskId, mappableTasks])

  const highlightedPoint = useMemo(() => {
    if (!highlightedTaskId) return null
    const task = mappableTasks.find((item) => item.id === highlightedTaskId)
    if (!task || task.latitude == null || task.longitude == null) return null
    return { lat: task.latitude, lng: task.longitude }
  }, [highlightedTaskId, mappableTasks])

  const mapPoints = useMemo(
    () => mappableTasks.map((task) => ({ lat: task.latitude as number, lng: task.longitude as number })),
    [mappableTasks],
  )

  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4 dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 sm:text-base">Task Map</h2>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <span className="text-xs text-gray-500 dark:text-gray-400">Live ticket locations</span>
          <button
            type="button"
            onClick={() => setRecenterTrigger((prev) => prev + 1)}
            className="rounded-md bg-gray-900 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-gray-700"
          >
            Reset View
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      ) : null}

      {loading ? <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">Loading map...</p> : null}

      <div className="relative min-h-[380px] flex-1 overflow-hidden rounded-lg border border-gray-100 dark:border-[#2a2a2a]" style={{ height: "clamp(380px, 60vh, 620px)" }}>
        <style>{`
          .leaflet-container { height: 100% !important; }
        `}</style>
        {isClientReady ? (
          <MapContainer key={mapSessionKey} center={[28.6139, 77.209]} zoom={12} scrollWheelZoom={true} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />

            {mappableTasks.map((task) => (
              <Marker
                key={task.id}
                position={[task.latitude as number, task.longitude as number]}
                icon={markerIcons.get(task.id) ?? createMarkerIcon(markerColor(task.severity))}
                eventHandlers={
                  onSelectTask
                    ? {
                        click: () => onSelectTask(task.id),
                      }
                    : undefined
                }
              >
                <Popup>
                  <div className="space-y-2 text-sm">
                    <p className="font-semibold">{task.ticketId}</p>
                    <p>{task.description.length > 80 ? `${task.description.slice(0, 77)}...` : task.description}</p>
                    <span className={`inline-block rounded-full border px-2 py-1 text-xs ${severityClass(task.severity)}`}>
                      {task.severity}
                    </span>
                  </div>
                </Popup>
              </Marker>
            ))}

            <FitMapToMarkers
              points={mapPoints}
            />
            <KeepMapSized resizeTrigger={recenterTrigger} />
            <ResetToTaskBounds points={mapPoints} recenterTrigger={recenterTrigger} />
            <ZoomToHighlightedTask task={highlightedPoint} />
          </MapContainer>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            Initializing map...
          </div>
        )}

        {highlightedTaskId ? (
          <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-md bg-black/70 px-2 py-1 text-xs text-white">
            Focused: {tasks.find((task) => task.id === highlightedTaskId)?.ticketId ?? "Selected"}
          </div>
        ) : null}

        {!loading && mappableTasks.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-white/80 text-sm font-medium text-gray-600 dark:bg-[#1e1e1e]/85 dark:text-gray-300">
            No tasks to display on map.
          </div>
        ) : null}
      </div>
    </section>
  )
}
