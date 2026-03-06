// app/api/complaints/route.ts — Insert a complaint into Supabase

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const mapplsApiKey = process.env.MAPPLS_API_KEY ?? process.env.NEXT_PUBLIC_MAPPLS_API_KEY ?? "";
const reverseGeocodeCache = new Map<string, ReverseGeo>();
const issueTypeAuthorityKeywords: Array<{ keywords: string[]; authority: string }> = [
  { keywords: ["street light", "light", "electricity", "power", "wire", "transformer"], authority: "DISCOM" },
  { keywords: ["garbage", "waste", "sanitation", "sweeping", "toilet", "drain", "sewage"], authority: "MCD" },
  { keywords: ["pothole", "road", "flyover", "bridge", "infrastructure", "lane"], authority: "PWD" },
  { keywords: ["water", "pipe", "sewer"], authority: "DJB" },
  { keywords: ["traffic", "signal", "parking", "accident"], authority: "TRAFFIC_POLICE" },
  { keywords: ["crime", "safety", "theft", "harassment"], authority: "DELHI_POLICE" },
  { keywords: ["metro", "station", "escalator", "lift"], authority: "DMRC" },
  { keywords: ["pollution", "burning", "noise", "industrial"], authority: "DPCC" },
  { keywords: ["tree", "forest"], authority: "FOREST_DEPT" },
];
const ndmcLocalityHints = ["connaught", "cp", "lutyens", "chanakyapuri", "janpath"];

// Use a server-side Supabase client
const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

interface ComplaintPayload {
  citizen_id: string;
  category_id: number;
  issue_type?: string;
  title: string;
  description: string;
  severity: "L1" | "L2" | "L3" | "L4";
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  ward_name?: string;
  pincode?: string;
  digipin?: string;
  address_text?: string;
  assigned_department?: string;
  city?: string;
}

interface CanonicalComplaintRecord {
  id: string;
  user_id: string;
  issue_type: string;
  severity: string;
  description: string;
  image_url: string;
  lat: number;
  lng: number;
  address: string;
  pincode: string;
  city: string;
  district: string;
  authority: string;
  status: string;
  created_at: string;
  digipin: string;
}

interface ReverseGeo {
  pincode: string;
  locality: string;
  city: string;
  district: string;
  state: string;
  formattedAddress: string;
  digipin: string;
}

function cacheKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

function fallbackDigipin(latitude: number, longitude: number): string {
  const lat = Math.abs(latitude).toFixed(6).replace(".", "").slice(0, 8);
  const lng = Math.abs(longitude).toFixed(6).replace(".", "").slice(0, 8);
  return `DG-${lat}-${lng}`;
}

function fromRecord(record: unknown, keys: string[]): string {
  if (!record || typeof record !== "object") return "";
  const r = record as Record<string, unknown>;
  for (const key of keys) {
    const value = r[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeo> {
  const key = cacheKey(latitude, longitude);
  const cached = reverseGeocodeCache.get(key);
  if (cached) return cached;

  const location: ReverseGeo = {
    pincode: "",
    locality: "",
    city: "",
    district: "",
    state: "",
    formattedAddress: "",
    digipin: "",
  };

  if (mapplsApiKey) {
    try {
      const url = new URL(`https://apis.mappls.com/advancedmaps/v1/${mapplsApiKey}/rev_geocode`);
      url.searchParams.set("lat", String(latitude));
      url.searchParams.set("lng", String(longitude));
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (res.ok) {
        const payload = (await res.json()) as { results?: unknown[] };
        const first = Array.isArray(payload.results) ? payload.results[0] : null;
        location.pincode = fromRecord(first, ["pincode", "pin", "postalCode"]);
        location.locality = fromRecord(first, ["locality", "subLocality", "subDistrict"]);
        location.city = fromRecord(first, ["city", "district", "county"]);
        location.district = fromRecord(first, ["district", "city_district", "county"]);
        location.state = fromRecord(first, ["state", "stateName"]);
        location.formattedAddress = fromRecord(first, ["formatted_address", "formattedAddress", "placeAddress", "address"]);
        location.digipin = fromRecord(first, ["digipin", "DIGIPIN", "digitalPin", "digital_pin"]);
      }
    } catch {
      // Fallback provider below handles failures.
    }
  }

  if (!location.pincode || !location.formattedAddress) {
    try {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("lat", String(latitude));
      url.searchParams.set("lon", String(longitude));
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      const res = await fetch(url.toString(), {
        headers: { "User-Agent": "JanSamadhan/1.0" },
        cache: "no-store",
      });

      if (res.ok) {
        const payload = (await res.json()) as { display_name?: string; address?: Record<string, unknown> };
        const address = payload.address ?? {};
        if (!location.pincode) location.pincode = fromRecord(address, ["postcode"]);
        if (!location.locality) location.locality = fromRecord(address, ["suburb", "neighbourhood", "city_district", "village", "town"]);
        if (!location.city) location.city = fromRecord(address, ["city", "town", "village"]);
        if (!location.district) location.district = fromRecord(address, ["state_district", "county"]);
        if (!location.state) location.state = fromRecord(address, ["state"]);
        if (!location.formattedAddress && typeof payload.display_name === "string") {
          location.formattedAddress = payload.display_name.trim();
        }
      }
    } catch {
      // Keep graceful fallback values below.
    }
  }

  if (!location.city) location.city = "Delhi";
  if (!location.state) location.state = "Delhi";
  if (!location.pincode) location.pincode = "000000";
  if (!location.formattedAddress) location.formattedAddress = `Lat ${latitude.toFixed(6)}, Lng ${longitude.toFixed(6)}`;
  if (!location.digipin) location.digipin = fallbackDigipin(latitude, longitude);

  if (reverseGeocodeCache.size >= 500) {
    const oldestKey = reverseGeocodeCache.keys().next().value as string | undefined;
    if (oldestKey) reverseGeocodeCache.delete(oldestKey);
  }
  reverseGeocodeCache.set(key, location);
  return location;
}

function buildCanonicalComplaintRecord(input: {
  userId: string;
  issueType: string;
  severity: string;
  description: string;
  imageUrl: string;
  lat: number;
  lng: number;
  address: string;
  pincode: string;
  city: string;
  district: string;
  authority: string;
  status: string;
  digipin: string;
}): CanonicalComplaintRecord {
  return {
    id: "",
    user_id: input.userId,
    issue_type: input.issueType,
    severity: input.severity,
    description: input.description,
    image_url: input.imageUrl,
    lat: input.lat,
    lng: input.lng,
    address: input.address,
    pincode: input.pincode,
    city: input.city,
    district: input.district,
    authority: input.authority,
    status: input.status,
    created_at: "",
    digipin: input.digipin,
  };
}

function inferAuthorityFromIssueType(issueType: string): string | null {
  const value = issueType.toLowerCase();
  for (const row of issueTypeAuthorityKeywords) {
    if (row.keywords.some((keyword) => value.includes(keyword))) return row.authority;
  }
  return null;
}

function inNdmcZone(lat: number, lng: number): boolean {
  return lat >= 28.62 && lat <= 28.64 && lng >= 77.19 && lng <= 77.23;
}

function routeAuthority(input: {
  issueType: string;
  latitude: number;
  longitude: number;
  locality: string;
  pincode: string;
  defaultAuthority: string;
}): string {
  const inferred = inferAuthorityFromIssueType(input.issueType);
  const routed = inferred ?? input.defaultAuthority;

  const locality = input.locality.toLowerCase();
  const ndmc =
    inNdmcZone(input.latitude, input.longitude) ||
    ndmcLocalityHints.some((hint) => locality.includes(hint)) ||
    ["110001", "110011", "110003"].includes(input.pincode);

  if (ndmc && ["MCD", "PWD", "DISCOM"].includes(routed)) return "NDMC";
  return routed;
}

/**
 * POST /api/complaints
 * Creates a new complaint in Supabase.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as ComplaintPayload | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    citizen_id,
    category_id,
    issue_type,
    title,
    description,
    severity,
    latitude,
    longitude,
    accuracy,
    timestamp,
    ward_name,
    pincode,
    digipin,
    address_text,
    assigned_department,
    city,
  } = body;

  // Validate required fields
  if (
    !citizen_id ||
    !category_id ||
    !title ||
    !description ||
    latitude == null ||
    longitude == null ||
    accuracy == null ||
    !timestamp
  ) {
    return NextResponse.json(
      { error: "Missing required fields: citizen_id, category_id, title, description, latitude, longitude, accuracy, timestamp" },
      { status: 400 },
    );
  }

  const resolved = await reverseGeocode(latitude, longitude);
  const resolvedPincode = (pincode?.trim() || resolved.pincode).trim();
  const resolvedDigipin = (digipin?.trim() || resolved.digipin).trim();
  const resolvedAddress = (address_text?.trim() || resolved.formattedAddress).trim();
  const resolvedWard = (ward_name?.trim() || resolved.locality || "Unknown locality").trim();
  const resolvedCity = (city?.trim() || resolved.city || "Delhi").trim();
  const addressWithMeta = `${resolvedAddress} | gps_accuracy_m=${accuracy.toFixed(1)} | gps_timestamp=${timestamp}`;
  const canonicalComplaint = buildCanonicalComplaintRecord({
    userId: citizen_id,
    issueType: (issue_type?.trim() || title.trim()),
    severity: severity,
    description,
    imageUrl: "",
    lat: latitude,
    lng: longitude,
    address: resolvedAddress,
    pincode: resolvedPincode,
    city: resolvedCity,
    district: resolved.district,
    authority: assigned_department?.trim() || "UNASSIGNED",
    status: "submitted",
    digipin: resolvedDigipin,
  });
  canonicalComplaint.authority = routeAuthority({
    issueType: canonicalComplaint.issue_type,
    latitude,
    longitude,
    locality: resolved.locality,
    pincode: canonicalComplaint.pincode,
    defaultAuthority: canonicalComplaint.authority,
  });

  // Build PostGIS WKT POINT string
  const locationWKT = `SRID=4326;POINT(${longitude} ${latitude})`;

  const { data, error } = await supabase
    .from("complaints")
    .insert({
      citizen_id: canonicalComplaint.user_id,
      category_id,
      title,
      description: canonicalComplaint.description,
      severity: canonicalComplaint.severity as "L1" | "L2" | "L3" | "L4",
      status: "submitted",
      location: locationWKT,
      ward_name: resolvedWard,
      pincode: canonicalComplaint.pincode,
      digipin: canonicalComplaint.digipin,
      address_text: addressWithMeta,
      assigned_department: canonicalComplaint.authority,
      city: canonicalComplaint.city,
    })
    .select("id, ticket_id, title, status, created_at")
    .single();

  if (error) {
    console.error("Supabase insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, complaint: data }, { status: 201 });
}
