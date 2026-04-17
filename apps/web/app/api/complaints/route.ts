// app/api/complaints/route.ts — Insert a complaint into Supabase
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/database.types";
import { Resend } from "resend";
import { gamificationService, GAMIFICATION_CONFIG } from "@/src/lib/gamification";

// const resend = new Resend(process.env.RESEND_API_KEY);



const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? supabaseAnonKey;
const mapplsApiKey = process.env.MAPPLS_API_KEY ?? process.env.NEXT_PUBLIC_MAPPLS_API_KEY ?? "";
const reverseGeocodeCache = new Map<string, ReverseGeo>();
const ALLOWED_STATUSES = ["submitted", "verified", "assigned", "in_progress", "reopened", "pending_closure", "resolved", "closed"] as const;
type LifecycleStatus = (typeof ALLOWED_STATUSES)[number];
type DbStatus = Database["public"]["Enums"]["complaint_status"] | "pending_closure" | "reopened";
const DB_STATUS_BY_LIFECYCLE: Record<LifecycleStatus, DbStatus> = {
  submitted: "submitted",
  verified: "under_review",
  assigned: "assigned",
  in_progress: "in_progress",
  reopened: "reopened",
  pending_closure: "pending_closure",
  resolved: "resolved",
  closed: "resolved",
};
const DUPLICATE_LOOKBACK_HOURS = 24;
const DUPLICATE_RADIUS_METERS = 50;
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

function getAuthClient() {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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
  force_submit?: boolean;
}

interface UpvotePayload {
  complaint_id: string;
}

interface StatusUpdatePayload {
  complaint_id: string;
  status: LifecycleStatus;
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

interface DuplicateMatch {
  id: string;
  ticket_id: string;
  title: string;
  status: string;
  created_at: string;
  distance_m: number;
}

function canTransitionStatus(current: string, next: string): boolean {
  // Allow citizen to reject pending_closure back to in_progress
  if (current === "pending_closure" && next === "in_progress") return true;
  if (current === "pending_closure" && next === "reopened") return true;
  if (current === "resolved" && next === "reopened") return true;
  const order = ALLOWED_STATUSES;
  const from = order.indexOf(current as (typeof ALLOWED_STATUSES)[number]);
  const to = order.indexOf(next as (typeof ALLOWED_STATUSES)[number]);
  if (from === -1 || to === -1) return false;
  return to >= from;
}

function toLifecycleStatus(status: unknown): LifecycleStatus {
  if (status === "submitted") return "submitted";
  if (status === "under_review") return "verified";
  if (status === "assigned") return "assigned";
  if (status === "in_progress") return "in_progress";
  if (status === "reopened") return "reopened";
  if (status === "pending_closure") return "pending_closure";
  if (status === "resolved") return "resolved";
  if (status === "closed") return "closed";
  return "submitted";
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

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
}

function parsePointLocation(locationValue: unknown): { lat: number; lng: number } | null {
  if (typeof locationValue === "string") {
    const match = /POINT\(([-0-9.]+)\s+([-0-9.]+)\)/.exec(locationValue);
    if (match) return { lng: Number(match[1]), lat: Number(match[2]) };
  }
  return null;
}

async function findRecentDuplicate(input: {
  categoryId: number;
  latitude: number;
  longitude: number;
}): Promise<DuplicateMatch | null> {
  const since = new Date(Date.now() - DUPLICATE_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("complaints")
    .select("id, ticket_id, title, status, created_at, location")
    .eq("category_id", input.categoryId)
    .gte("created_at", since)
    .limit(100);

  if (error || !data) return null;

  for (const row of data) {
    const coords = parsePointLocation(row.location);
    if (!coords) continue;
    const distance = haversineMeters(input.latitude, input.longitude, coords.lat, coords.lng);
    if (distance <= DUPLICATE_RADIUS_METERS) {
      const safeStatus = typeof row.status === "string" && ALLOWED_STATUSES.includes(row.status as (typeof ALLOWED_STATUSES)[number])
        ? (row.status as LifecycleStatus)
        : toLifecycleStatus(row.status);
      return {
        id: row.id,
        ticket_id: row.ticket_id ?? row.id,
        title: row.title,
        status: safeStatus,
        created_at: row.created_at,
        distance_m: Number(distance.toFixed(1)),
      };
    }
  }
  return null;
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
    force_submit,
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
  const addressWithMeta = `${resolvedAddress} | gps_lat=${latitude.toFixed(6)} | gps_lng=${longitude.toFixed(6)} | gps_accuracy_m=${accuracy.toFixed(1)} | gps_timestamp=${timestamp}`;
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
  const ticketId = `CMP-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;

  const duplicate = await findRecentDuplicate({
    categoryId: category_id,
    latitude,
    longitude,
  });
  if (duplicate && !force_submit) {
    return NextResponse.json(
      {
        error: "A similar complaint exists within 50 meters in the last 24 hours.",
        code: "DUPLICATE_DETECTED",
        duplicate,
        options: ["upload_anyway", "upvote_existing"],
      },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("complaints")
    .insert({
      ticket_id: ticketId,
      citizen_id: canonicalComplaint.user_id,
      category_id,
      title,
      description: canonicalComplaint.description,
      severity: canonicalComplaint.severity as "L1" | "L2" | "L3" | "L4",
      effective_severity: canonicalComplaint.severity as "L1" | "L2" | "L3" | "L4",
      status: "submitted",
      location: locationWKT,
      ward_name: resolvedWard,
      pincode: canonicalComplaint.pincode,
      digipin: canonicalComplaint.digipin,
      address_text: addressWithMeta,
      assigned_department: canonicalComplaint.authority,
      city: canonicalComplaint.city,
      possible_duplicate: Boolean(duplicate),
    })
    .select("id, ticket_id, title, status, created_at")
    .single();

  if (error) {
    console.error("Supabase insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // --- Send Email Notification via Resend ---
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const authorityEmail = "hackthondb@gmail.com"; // Default for now
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
          .header { background-color: #161616; padding: 32px 20px; text-align: center; border-bottom: 4px solid #C9A84C; }
          .logo { color: #C9A84C; font-size: 24px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; }
          .content { padding: 40px 30px; background-color: #ffffff; }
          .greeting { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #111; }
          .summary { margin-bottom: 32px; color: #4b5563; }
          .details-table { width: 100%; border-collapse: collapse; margin-bottom: 32px; border-radius: 8px; overflow: hidden; border: 1px solid #f3f4f6; }
          .details-table th { background-color: #f9fafb; padding: 12px 16px; text-align: left; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #f3f4f6; width: 35%; }
          .details-table td { padding: 12px 16px; font-size: 14px; color: #1f2937; border-bottom: 1px solid #f3f4f6; }
          .highlight { font-weight: 600; color: #C9A84C; }
          .btn-container { text-align: center; margin-top: 20px; }
          .btn { background-color: #C9A84C; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block; transition: background-color 0.2s; }
          .footer { background-color: #f9fafb; padding: 24px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">JanSamadhan</div>
            <div style="color: #9ca3af; font-size: 10px; margin-top: 4px;">OFFICIAL GRIEVANCE PORTAL</div>
          </div>
          <div class="content">
            <div class="greeting">New Complaint Registered</div>
            <p class="summary">A new complaint has been filed and assigned to your department. Please review the details below and take appropriate action within the SLA timelines.</p>
            
            <table class="details-table">
              <tr><th>Ticket ID</th><td class="highlight">${data.ticket_id}</td></tr>
              <tr><th>Severity</th><td>${canonicalComplaint.severity}</td></tr>
              <tr><th>Department</th><td>${canonicalComplaint.authority}</td></tr>
              <tr><th>Issue</th><td>${title}</td></tr>
              <tr><th>Location</th><td>${resolvedWard}, ${resolvedCity}</td></tr>
              <tr><th>Address</th><td>${resolvedAddress}</td></tr>
            </table>

            <div class="btn-container">
              <a href="https://jansamadhan.perkkk.dev/authority" class="btn">View in Dashboard</a>
            </div>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} JanSamadhan Portal. This is an automated notification.<br>
            Please do not reply to this email.
          </div>
        </div>
      </body>
      </html>
    `;

    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: authorityEmail,
      subject: `[New Complaint] ${data.ticket_id}: ${title}`,
      html: emailHtml,
    });
  } catch (emailErr) {
    console.error("Failed to send notification email:", emailErr);
  }

  // Award points for ticket creation
  try {
    await gamificationService.awardPoints(citizen_id, GAMIFICATION_CONFIG.POINTS_TICKET_CREATION, 'ticket_creation');
  } catch (err) {
    console.error("[API/Complaints] Failed to award points for ticket creation:", err);
  }

  return NextResponse.json({ success: true, complaint: data }, { status: 201 });

}

/**
 * PATCH /api/complaints
 * Upvote toggle for a complaint.
 */
export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { complaint_id: string; action?: 'upvote' | 'downvote' | 'toggle' } | null;
  if (!body?.complaint_id) {
    return NextResponse.json({ error: "complaint_id is required" }, { status: 400 });
  }

  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";

  let voterCitizenId: string | null = null;
  if (token) {
    const { data: { user } } = await getAuthClient()!.auth.getUser(token);
    voterCitizenId = user?.id ?? null;
  }

  const { data: current, error: fetchError } = await supabase
    .from("complaints")
    .select("id, upvote_count, ticket_id, status, citizen_id")
    .eq("id", body.complaint_id)
    .single();

  if (fetchError || !current) {
    return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
  }

  if (voterCitizenId) {
    const { data: existingVote } = await supabase
      .from("upvotes")
      .select("id")
      .eq("citizen_id", voterCitizenId)
      .eq("complaint_id", body.complaint_id)
      .maybeSingle();

    if (existingVote) {
      if (body.action === 'upvote') {
        return NextResponse.json({ success: true, complaint: current, duplicate: true });
      }
      // Remove upvote
      await supabase.from("upvotes").delete().eq("id", existingVote.id);
      await supabase.rpc('decrement_upvote_count', { p_complaint_id: body.complaint_id });
    } else {
      if (body.action === 'downvote') {
        return NextResponse.json({ success: true, complaint: current });
      }
      // Add upvote
      await supabase.from("upvotes").insert({ citizen_id: voterCitizenId, complaint_id: body.complaint_id });
      await supabase.rpc('increment_upvote_count', { p_complaint_id: body.complaint_id });
    }
  } else {
    // Anonymous upvote (if allowed)
    await supabase.rpc('increment_upvote_count', { p_complaint_id: body.complaint_id });
  }

  // Fetch updated count for milestone check
  const { data: updated } = await supabase
    .from("complaints")
    .select("id, upvote_count, ticket_id, status, citizen_id")
    .eq("id", body.complaint_id)
    .single();

  if (updated && updated.citizen_id) {
    await gamificationService.handleUpvoteMilestone(
      updated.id,
      updated.citizen_id,
      updated.upvote_count ?? 0
    );
  }

  return NextResponse.json({ success: true, complaint: updated }, { status: 200 });
}

/**
 * PUT /api/complaints
 * Update complaint status with lifecycle validation.
 */
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as StatusUpdatePayload | null;
  if (!body?.complaint_id || !body?.status) {
    return NextResponse.json({ error: "complaint_id and status are required" }, { status: 400 });
  }

  if (!ALLOWED_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabase
    .from("complaints")
    .select("id, status, ticket_id")
    .eq("id", body.complaint_id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
  }

  const currentStatus = toLifecycleStatus(existing.status);
  if (!canTransitionStatus(currentStatus, body.status)) {
    return NextResponse.json(
      { error: `Invalid status transition: ${currentStatus} -> ${body.status}` },
      { status: 409 },
    );
  }

  // Use the new RPC to perform the update with the citizen's ID context.
  // This satisfies the ticket_history.changed_by NOT NULL constraint which relies on auth.uid().
  const authorization = req.headers.get("authorization") ?? "";
  const bearerPrefix = "Bearer ";
  const token = authorization.startsWith(bearerPrefix)
    ? authorization.slice(bearerPrefix.length).trim()
    : "";

  let citizenId: string | null = null;
  if (token) {
    const authClient = getAuthClient();
    const { data: { user } } = await authClient.auth.getUser(token);
    citizenId = user?.id ?? null;
  }

  if (!citizenId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: updated, error: updateError } = await supabase
    .rpc("update_complaint_status_citizen", {
      p_complaint_id: body.complaint_id,
      p_status: DB_STATUS_BY_LIFECYCLE[body.status],
      p_citizen_id: citizenId,
    });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // The RPC returns {success: boolean, error: string}
  if (updated && (updated as any).success === false) {
    return NextResponse.json({ error: (updated as any).error }, { status: 403 });
  }

  // Need to fetch the updated record to match previous return format
  const { data: finalRecord } = await supabase
    .from("complaints")
    .select("id, ticket_id, status, updated_at, assigned_worker_id")
    .eq("id", body.complaint_id)
    .single();

  if (finalRecord?.assigned_worker_id && body.status === "reopened") {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      // We don't need to await this as it's a side effect to clear cache
      fetch(`${apiUrl}/api/worker/dashboard/invalidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_id: finalRecord.assigned_worker_id }),
      }).catch(err => console.error("Worker cache invalidation fetch error:", err));
    } catch (err) {
      console.error("Worker cache invalidation error:", err);
    }
  }

  return NextResponse.json(
    {
      success: true,
      complaint: {
        ...finalRecord,
        status: toLifecycleStatus(finalRecord?.status),
      },
    },
    { status: 200 },
  );
}
