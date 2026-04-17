import type { Database } from "@/src/types/database.types"

export type SeverityLevel = Database["public"]["Enums"]["severity_level"]
export type ComplaintStatus = Database["public"]["Enums"]["complaint_status"]

export type DashboardTask = {
  id: string
  ticketId: string
  assignedWorkerId: string | null
  description: string
  category: string
  location: string
  severity: SeverityLevel
  status: ComplaintStatus
  createdAt: string
  resolvedAt: string | null
  latitude: number | null
  longitude: number | null
  distanceKm: number | null
  cameraId: string | null   // set on CCTV-generated tickets — used to trigger Pending Verification
  isSpam: boolean
}

export type DashboardStats = {
  tasksToday: number
  pending: number
  completedToday: number
  urgent: number
}

export type ActivityItem = {
  id: string
  text: string
  createdAt: string
}

export const severityWeight: Record<SeverityLevel, number> = {
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4,
}

export const severityLabel: Record<SeverityLevel, string> = {
  L1: "Low",
  L2: "Medium",
  L3: "High",
  L4: "Critical",
}

export function severityClass(level: SeverityLevel): string {
  if (level === "L4") return "bg-red-100 text-red-700 border-red-200"
  if (level === "L3") return "bg-orange-100 text-orange-700 border-orange-200"
  if (level === "L2") return "bg-yellow-100 text-yellow-700 border-yellow-200"
  return "bg-emerald-100 text-emerald-700 border-emerald-200"
}

export function formatSeverity(level: SeverityLevel): string {
  return `${level} (${severityLabel[level]})`
}

export function markerColor(level: SeverityLevel): string {
  if (level === "L4") return "#dc2626"
  if (level === "L3") return "#f97316"
  if (level === "L2") return "#facc15"
  return "#16a34a"
}

/**
 * Parse a hex-encoded WKB or EWKB POINT into {lat, lng}.
 * Handles both little-endian (01) and big-endian (00) byte order.
 * WKB  POINT: byteOrder(1) + type(4) + X(8) + Y(8)  = 42 hex chars
 * EWKB POINT with SRID: byteOrder(1) + type(4) + SRID(4) + X(8) + Y(8) = 50 hex chars
 */
function parseHexWkbPoint(hex: string): { lat: number; lng: number } | null {
  // Only valid hex strings of expected lengths
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null

  const buf = new Uint8Array(hex.length / 2)
  for (let i = 0; i < buf.length; i++) {
    buf[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }

  const view = new DataView(buf.buffer)
  const littleEndian = buf[0] === 1

  const typeWord = view.getUint32(1, littleEndian)
  // WKB type 1 = Point; EWKB sets bit 0x20000000 for SRID presence
  const hasZ = (typeWord & 0x80000000) !== 0
  const hasM = (typeWord & 0x40000000) !== 0
  const hasSrid = (typeWord & 0x20000000) !== 0
  const geomType = typeWord & 0x000000ff

  if (geomType !== 1) return null // not a Point
  if (hasZ || hasM) return null  // skip Z/M variants for now

  const coordOffset = hasSrid ? 9 : 5 // skip SRID (4 bytes) if present
  if (buf.length < coordOffset + 16) return null

  const lng = view.getFloat64(coordOffset, littleEndian)
  const lat = view.getFloat64(coordOffset + 8, littleEndian)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null

  return { lat, lng }
}

export function parseLatLng(value: unknown): { lat: number; lng: number } | null {
  const toFiniteNumber = (input: unknown): number | null => {
    if (typeof input === "number") return Number.isFinite(input) ? input : null
    if (typeof input === "string") {
      const parsed = Number(input.trim())
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }

  if (typeof value === "string") {
    const raw = value.trim()

    // WKT / EWKT: SRID=4326;POINT(lng lat) or POINT (lng lat)
    const wktMatch = /(?:SRID=\d+;\s*)?POINT\s*\(\s*([-0-9.]+)\s+([-0-9.]+)\s*\)/i.exec(raw)
    if (wktMatch) {
      return {
        lng: Number(wktMatch[1]),
        lat: Number(wktMatch[2]),
      }
    }

    // Coordinates tuple: "lat,lng" or "(lat,lng)"
    const tupleMatch = /^\s*\(?\s*([-0-9.]+)\s*,\s*([-0-9.]+)\s*\)?\s*$/.exec(raw)
    if (tupleMatch) {
      const first = Number(tupleMatch[1])
      const second = Number(tupleMatch[2])
      if (Number.isFinite(first) && Number.isFinite(second)) {
        const looksLikeLatLng = Math.abs(first) <= 90 && Math.abs(second) <= 180
        return {
          lat: looksLikeLatLng ? first : second,
          lng: looksLikeLatLng ? second : first,
        }
      }
    }

    // Hex-encoded WKB / EWKB (PostGIS default output via Supabase)
    const hexCoords = parseHexWkbPoint(raw)
    if (hexCoords) return hexCoords

    // JSON object string support
    try {
      const parsed = JSON.parse(raw)
      return parseLatLng(parsed)
    } catch {
      // Ignore parse errors and continue to object branch fallback.
    }
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>

    if (Array.isArray(record.coordinates) && record.coordinates.length >= 2) {
      const [lngRaw, latRaw] = record.coordinates
      const lat = toFiniteNumber(latRaw)
      const lng = toFiniteNumber(lngRaw)
      if (lat != null && lng != null) return { lat, lng }
    }

    const lat = toFiniteNumber(record.lat)
    const lng = toFiniteNumber(record.lng ?? record.lon)
    if (lat != null && lng != null) return { lat, lng }

    const latitude = toFiniteNumber(record.latitude ?? record.y)
    const longitude = toFiniteNumber(record.longitude ?? record.x)
    if (latitude != null && longitude != null) {
      return { lat: latitude, lng: longitude }
    }
  }

  return null
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (num: number) => (num * Math.PI) / 180
  const earthRadiusKm = 6371

  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const q1 = Math.sin(dLat / 2) ** 2
  const q2 = Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(q1 + q2), Math.sqrt(1 - q1 - q2))
  return earthRadiusKm * c
}

export function formatDistance(distanceKm: number | null): string {
  if (distanceKm == null) return "Distance unavailable"
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`
  return `${distanceKm.toFixed(1)} km`
}

export function relativeTime(isoTimestamp: string): string {
  const ts = new Date(isoTimestamp).getTime()
  if (!Number.isFinite(ts)) return "just now"

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (deltaSeconds < 60) return "just now"

  const minutes = Math.floor(deltaSeconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`

  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}
