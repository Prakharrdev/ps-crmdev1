"""
shared.py  –  Shared state, clients, constants, and helpers
============================================================
Both main.py and whatsapp_webhook.py import from here to avoid
circular imports.
"""

import os
import json
import re
import hashlib
import uuid
import asyncio
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, Dict, List, Any
from math import radians, sin, cos, sqrt, atan2

from supabase import create_client, Client
from google import genai
from dotenv import load_dotenv
import redis
import httpx


# =========================================================
# 1. CONFIGURATION & ENVIRONMENT
# =========================================================

try:
    # Resolve project root for local development
    ROOT_DIR = Path(__file__).resolve().parents[2]
except IndexError:
    ROOT_DIR = Path(__file__).resolve().parent  # Docker fallback

# Load environment variables (overridden by system env in production)
load_dotenv(ROOT_DIR / ".env", override=False)
load_dotenv(ROOT_DIR / "apps" / "api" / ".env", override=False)
load_dotenv(ROOT_DIR / "apps" / "web" / ".env.local", override=False)

# Core Keys
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SUPABASE_URL = (os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")).strip().rstrip("/")
SUPABASE_SERVICE_KEY = (os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")).strip()

# Other Config
MAPPLS_API_KEY = os.getenv("MAPPLS_API_KEY")
RESEND_API_KEY = os.getenv("RESEND_API_KEY")
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "Jansamadhan@mail.perkkk.dev").strip() or "Jansamadhan@mail.perkkk.dev"
AI_SERVICE_URL = os.getenv("AI_SERVICE_URL")
REDIS_URL = os.getenv("REDIS_URL")
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "https://jansamadhan.perkkk.dev").strip().rstrip("/")

# Startup Validation
print(f"DEBUG: SUPABASE_URL={SUPABASE_URL}")
print(f"DEBUG: RESEND_API_KEY={'set' if RESEND_API_KEY else 'MISSING'}")
if not GEMINI_API_KEY:
    print("❌ FATAL: GEMINI_API_KEY is not set.")
if not SUPABASE_URL:
    print("❌ FATAL: SUPABASE_URL is not set.")
if not SUPABASE_SERVICE_KEY:
    print("❌ FATAL: SUPABASE_SERVICE_KEY is not set.")

if not all([GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY]):
    raise ValueError("Missing critical environment variables. Check your Railway/system variables.")

# Clients Initialization
gemini_client = genai.Client(api_key=GEMINI_API_KEY)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

redis_client: Optional[redis.Redis] = None
if REDIS_URL:
    try:
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        # redis_client.ping() # Optional health check
    except Exception as e:
        print(f"⚠️  WARNING: Redis connection failed: {e}")

GEMINI_PRIMARY_MODEL = os.getenv("GEMINI_PRIMARY_MODEL", "gemini-2.5-flash")
GEMINI_FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-2.0-flash")


_NOTIFICATION_EVENT_LABELS = {
    "complaint_created": "Complaint Registered",
    "worker_assigned": "Worker Assigned",
    "worker_reassigned": "Worker Reassigned",
    "status_changed": "Status Updated",
}

_NOTIFICATION_EVENT_SUMMARIES = {
    "complaint_created": "Your complaint has been successfully registered in JanSamadhan.",
    "worker_assigned": "A worker has been assigned to your complaint.",
    "worker_reassigned": "Worker assignment has been updated for your complaint.",
    "status_changed": "Your complaint status has changed. Please review the latest update below.",
}


def _normalize_email(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    candidate = str(value).strip().lower()
    if not candidate:
        return None
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", candidate):
        return None
    return candidate


async def _lookup_profile_email(profile_id: Optional[str], expected_role: str) -> Optional[str]:
    if not profile_id:
        return None

    try:
        profile_res = await asyncio.to_thread(
            lambda: supabase.table("profiles")
            .select("email, role, is_blocked")
            .eq("id", profile_id)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        print(f"[Email] Failed profile lookup for {profile_id}: {exc}")
        return None

    row = profile_res.data or {}
    if not row:
        print(f"[Email] Profile missing for {profile_id}; skipping recipient")
        return None

    role = str(row.get("role") or "").lower()
    if role != expected_role:
        print(f"[Email] Role mismatch for {profile_id}: expected {expected_role}, got {role or 'unknown'}")
        return None

    if bool(row.get("is_blocked")):
        print(f"[Email] Profile {profile_id} is blocked; skipping")
        return None

    email = _normalize_email(row.get("email"))
    if not email:
        print(f"[Email] Invalid/missing email for profile {profile_id}; skipping")
        return None
    return email


async def _resolve_recipients(
    *,
    event_type: str,
    citizen_id: Optional[str],
    worker_id: Optional[str],
    worker_id_override: Optional[str] = None,
) -> List[str]:
    recipients: List[str] = []

    include_citizen = event_type in {"complaint_created", "worker_assigned", "worker_reassigned", "status_changed"}
    include_worker = event_type in {"worker_assigned", "worker_reassigned", "status_changed"}

    if include_citizen:
        citizen_email = await _lookup_profile_email(citizen_id, expected_role="citizen")
        if citizen_email:
            recipients.append(citizen_email)

    if include_worker:
        worker_target = worker_id_override or worker_id
        worker_email = await _lookup_profile_email(worker_target, expected_role="worker")
        if worker_email:
            recipients.append(worker_email)

    # Preserve ordering while removing duplicates.
    return list(dict.fromkeys(recipients))


def _status_label(status: Optional[str]) -> str:
    if not status:
        return "Unknown"
    return str(status).replace("_", " ").title()


def build_ticket_details_url(complaint_id: Optional[str]) -> str:
    """Build an absolute URL to the citizen ticket details page."""
    base_url = FRONTEND_BASE_URL or "https://jansamadhan.perkkk.dev"
    normalized_id = str(complaint_id or "").strip()
    if not normalized_id:
        return f"{base_url}/citizen/tickets"
    encoded_id = urllib.parse.quote(normalized_id, safe="")
    return f"{base_url}/citizen/tickets/details?id={encoded_id}"


async def send_resend_email(
    ticket_id: str,
    title: str,
    authority: str,
    severity: str,
    ward: str,
    city: str,
    address: str,
    *,
    complaint_id: Optional[str] = None,
    citizen_id: Optional[str] = None,
    worker_id: Optional[str] = None,
    event_type: str = "complaint_created",
    status: Optional[str] = None,
    worker_id_override: Optional[str] = None,
) -> Dict[str, Any]:
    """Send complaint email notifications to worker/citizen recipients only."""
    if not RESEND_API_KEY:
        print("[Resend] API key missing, skipping email.")
        return {"status": "skipped", "reason": "missing_api_key"}

    event = event_type if event_type in _NOTIFICATION_EVENT_LABELS else "status_changed"
    recipients = await _resolve_recipients(
        event_type=event,
        citizen_id=citizen_id,
        worker_id=worker_id,
        worker_id_override=worker_id_override,
    )
    print(f"DEBUG: Email recipients for {ticket_id}: {recipients}")
    if not recipients:
        print(
            f"[Email] No eligible recipients for event={event} ticket={ticket_id} "
            f"citizen_id={citizen_id} worker_id={worker_id_override or worker_id}"
        )
        return {"status": "skipped", "reason": "no_recipients"}

    label = _NOTIFICATION_EVENT_LABELS[event]
    summary = _NOTIFICATION_EVENT_SUMMARIES[event]
    status_text = _status_label(status)
    current_year = datetime.now().year
    ticket_url = build_ticket_details_url(complaint_id)

    email_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }}
        .container {{ max-width: 600px; margin: 20px auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }}
        .header {{ background-color: #161616; padding: 32px 20px; text-align: center; border-bottom: 4px solid #C9A84C; }}
        .logo {{ color: #C9A84C; font-size: 24px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; }}
        .content {{ padding: 40px 30px; background-color: #ffffff; }}
        .greeting {{ font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #111; }}
        .summary {{ margin-bottom: 32px; color: #4b5563; }}
        .details-table {{ width: 100%; border-collapse: collapse; margin-bottom: 32px; border-radius: 8px; overflow: hidden; border: 1px solid #f3f4f6; }}
        .details-table th {{ background-color: #f9fafb; padding: 12px 16px; text-align: left; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #f3f4f6; width: 35%; }}
        .details-table td {{ padding: 12px 16px; font-size: 14px; color: #1f2937; border-bottom: 1px solid #f3f4f6; }}
        .highlight {{ font-weight: 600; color: #C9A84C; }}
        .btn-container {{ text-align: center; margin-top: 20px; }}
        .btn {{ background-color: #C9A84C; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block; }}
        .footer {{ background-color: #f9fafb; padding: 24px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">JanSamadhan</div>
          <div style="color: #9ca3af; font-size: 10px; margin-top: 4px;">OFFICIAL GRIEVANCE PORTAL</div>
        </div>
        <div class="content">
          <div class="greeting">{label}</div>
          <p class="summary">{summary}</p>

          <table class="details-table">
            <tr><th>Ticket ID</th><td class="highlight">{ticket_id}</td></tr>
            <tr><th>Current Status</th><td>{status_text}</td></tr>
            <tr><th>Severity</th><td>{severity}</td></tr>
            <tr><th>Department</th><td>{authority}</td></tr>
            <tr><th>Issue</th><td>{title}</td></tr>
            <tr><th>Location</th><td>{ward}, {city}</td></tr>
            <tr><th>Address</th><td>{address}</td></tr>
          </table>

          <div class="btn-container">
                        <a href="{ticket_url}" class="btn">View Ticket</a>
          </div>
        </div>
        <div class="footer">
          © {current_year} JanSamadhan Portal. This is an automated notification.<br>
          Please do not reply to this email.
        </div>
      </div>
    </body>
    </html>
    """

    payload = {
        "from": RESEND_FROM_EMAIL,
        "to": recipients,
        "subject": f"[{label}] {ticket_id}: {title}",
        "html": email_html,
    }

    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code not in (200, 201):
                print(f"[Resend Error] {resp.status_code}: {resp.text}")
                return {"status": "failed", "reason": f"http_{resp.status_code}"}
            return {"status": "sent", "recipients": recipients, "event": event}
        except Exception as exc:
            print(f"[Resend Exception] {exc}")
            return {"status": "failed", "reason": "exception"}




# =========================================================
# 2. CONSTANTS & CACHES
# =========================================================
REVERSE_GEOCODE_CACHE: Dict[str, Dict[str, str]] = {}
ALLOWED_STATUSES = {"submitted", "verified", "assigned", "in_progress", "pending_closure", "resolved", "closed"}
DUPLICATE_RADIUS_METERS = 20.0  # Synced with YOLO Reliability Engine
CCTV_SYSTEM_EMAIL = "cctv.system@jansamadhan.gov.in"
CCTV_SYSTEM_ID = "00000000-0000-0000-0000-000000000000" # Reserved for auto-tickets

ISSUE_TYPE_AUTHORITY_KEYWORDS = [
    (["street light", "light", "electricity", "power", "wire", "transformer"], "DISCOM"),
    (["garbage", "waste", "sanitation", "sweeping", "toilet", "drain", "sewage"], "MCD"),
    (["pothole", "road", "flyover", "bridge", "infrastructure", "lane"], "PWD"),
    (["water", "pipe", "sewer"], "DJB"),
    (["traffic", "signal", "parking", "accident"], "TRAFFIC_POLICE"),
    (["crime", "safety", "theft", "harassment"], "DELHI_POLICE"),
    (["metro", "station", "escalator", "lift"], "DMRC"),
    (["pollution", "burning", "noise", "industrial"], "DPCC"),
    (["tree", "forest"], "FOREST_DEPT"),
]

NDMC_LOCALITY_HINTS = ["connaught", "cp", "lutyens", "chanakyapuri", "janpath"]



# =========================================================
# 3. CHILD CATEGORY TAXONOMY (1-42)
# =========================================================

CHILD_CATEGORIES: Dict[int, Dict] = {
    1:  {"name": "Metro Station Issue",             "parent": 100, "authority": "DMRC"},
    2:  {"name": "Metro Track / Safety",            "parent": 100, "authority": "DMRC"},
    3:  {"name": "Escalator / Lift",                "parent": 100, "authority": "DMRC"},
    4:  {"name": "Metro Parking",                   "parent": 100, "authority": "DMRC"},
    5:  {"name": "Metro Station Hygiene",           "parent": 100, "authority": "DMRC"},
    6:  {"name": "Metro Property Damage",           "parent": 100, "authority": "DMRC"},
    7:  {"name": "National Highway Damage",         "parent": 101, "authority": "NHAI"},
    8:  {"name": "Toll Plaza Issue",                "parent": 101, "authority": "NHAI"},
    9:  {"name": "Expressway Problem",              "parent": 101, "authority": "NHAI"},
    10: {"name": "Highway Bridge Damage",           "parent": 101, "authority": "NHAI"},
    11: {"name": "State Highway / City Road",       "parent": 101, "authority": "PWD"},
    12: {"name": "Flyover / Overbridge",            "parent": 101, "authority": "PWD"},
    13: {"name": "Government Building Issue",       "parent": 109, "authority": "PWD"},
    14: {"name": "Large Drainage System",           "parent": 101, "authority": "PWD"},
    15: {"name": "Colony Road / Lane",              "parent": 101, "authority": "MCD"},
    16: {"name": "Garbage Collection",              "parent": 104, "authority": "MCD"},
    17: {"name": "Street Sweeping",                 "parent": 104, "authority": "MCD"},
    18: {"name": "Park Maintenance",                "parent": 105, "authority": "MCD"},
    19: {"name": "Public Toilet",                   "parent": 104, "authority": "MCD"},
    20: {"name": "Local Drain / Sewage",            "parent": 102, "authority": "MCD"},
    21: {"name": "Stray Animals",                   "parent": 104, "authority": "MCD"},
    22: {"name": "Street Light (MCD zone)",         "parent": 108, "authority": "MCD"},
    23: {"name": "Connaught Place / Lutyens Issue", "parent": 110, "authority": "NDMC"},
    24: {"name": "NDMC Road / Infrastructure",      "parent": 110, "authority": "NDMC"},
    25: {"name": "NDMC Street Light",               "parent": 108, "authority": "NDMC"},
    26: {"name": "Central Govt Residential Zone",   "parent": 109, "authority": "NDMC"},
    27: {"name": "Water Supply Failure",            "parent": 102, "authority": "DJB"},
    28: {"name": "Water Pipe Leakage",              "parent": 102, "authority": "DJB"},
    29: {"name": "Sewer Line Blockage",             "parent": 102, "authority": "DJB"},
    30: {"name": "Contaminated Water",              "parent": 102, "authority": "DJB"},
    31: {"name": "Power Outage",                    "parent": 103, "authority": "DISCOM"},
    32: {"name": "Transformer Issue",               "parent": 103, "authority": "DISCOM"},
    33: {"name": "Exposed / Fallen Wire",           "parent": 103, "authority": "DISCOM"},
    34: {"name": "Electricity Pole Damage",         "parent": 103, "authority": "DISCOM"},
    35: {"name": "Crime / Safety Issue",            "parent": 106, "authority": "DELHI_POLICE"},
    36: {"name": "Traffic Signal Problem",          "parent": 106, "authority": "TRAFFIC_POLICE"},
    37: {"name": "Illegal Parking",                 "parent": 106, "authority": "TRAFFIC_POLICE"},
    38: {"name": "Road Accident Black Spot",        "parent": 106, "authority": "TRAFFIC_POLICE"},
    39: {"name": "Illegal Tree Cutting",            "parent": 107, "authority": "FOREST_DEPT"},
    40: {"name": "Air Pollution / Burning",         "parent": 107, "authority": "DPCC"},
    41: {"name": "Noise Pollution",                 "parent": 107, "authority": "DPCC"},
    42: {"name": "Industrial Waste Dumping",        "parent": 107, "authority": "DPCC"},
}

# Severity mapping: Gemini label -> DB value
SEVERITY_MAP = {
    "Low":      "L1",
    "Medium":   "L2",
    "High":     "L3",
    "Critical": "L4",
}



def upload_image_to_supabase(image_data: bytes, filename: str) -> str:
    """
    Upload image to Supabase Storage bucket 'complaint-photos'.
    Returns the public URL of the uploaded file.
    """
    bucket = "complaint-photos"
    path   = f"complaints/{filename}"

    supabase.storage.from_(bucket).upload(
        path=path,
        file=image_data,
        file_options={"content-type": "image/jpeg", "upsert": "true"},
    )

    public_url = supabase.storage.from_(bucket).get_public_url(path)
    return public_url


def _coord_cache_key(latitude: float, longitude: float) -> str:
    # Rounded key keeps cache stable for repeated location reads in the same area.
    return f"{latitude:.5f},{longitude:.5f}"


def _pick_first(data: Dict, keys: List[str]) -> str:
    for key in keys:
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _compute_digipin(latitude: float, longitude: float) -> str:
    """Official DIGIPIN encoding algorithm (India Post / IIT Hyderabad / ISRO).

    Ported from the official source at github.com/INDIAPOST-gov/digipin.
    Encodes lat/lng into a 10-character alphanumeric code by subdividing
    India's bounding box into a 4×4 grid 10 times using 16 characters.
    Returns formatted code like 'J49-L3M-2345'.
    """
    # India bounding box (EPSG:4326 / WGS84)
    MIN_LAT, MAX_LAT = 2.5, 38.5
    MIN_LNG, MAX_LNG = 63.5, 99.5

    # Official 4×4 character grid (from INDIAPOST-gov/digipin)
    GRID = [
        ["F", "C", "9", "8"],
        ["J", "3", "2", "7"],
        ["K", "4", "5", "6"],
        ["L", "M", "P", "T"],
    ]

    # Clamp coordinates to India's bounding box
    lat = max(MIN_LAT, min(MAX_LAT, latitude))
    lng = max(MIN_LNG, min(MAX_LNG, longitude))

    lat_min, lat_max = MIN_LAT, MAX_LAT
    lng_min, lng_max = MIN_LNG, MAX_LNG

    code = []
    for _ in range(10):
        lat_div = (lat_max - lat_min) / 4.0
        lng_div = (lng_max - lng_min) / 4.0

        # Row: reversed bottom-up (matches official JS logic)
        row = 3 - int((lat - lat_min) / lat_div)
        col = int((lng - lng_min) / lng_div)

        # Clamp to valid range
        row = max(0, min(row, 3))
        col = max(0, min(col, 3))

        code.append(GRID[row][col])

        # Update bounds (official reverse logic for row)
        lat_max = lat_min + lat_div * (4 - row)
        lat_min = lat_min + lat_div * (3 - row)
        lng_min = lng_min + lng_div * col
        lng_max = lng_min + lng_div

    # Format as XXX-XXX-XXXX
    raw = "".join(code)
    return f"{raw[:3]}-{raw[3:6]}-{raw[6:]}"


def _fallback_digipin_raw(latitude: float, longitude: float) -> str:
    """Last-resort fallback: coordinate-based DG code if algorithm fails."""
    lat = str(abs(latitude)).replace(".", "")[:8]
    lng = str(abs(longitude)).replace(".", "")[:8]
    return f"DG-{lat}-{lng}"


def _haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    d_lat = radians(lat2 - lat1)
    d_lng = radians(lng2 - lng1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lng / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return r * c


def _parse_coords_from_location(location_value: Any) -> Optional[Dict[str, float]]:
    if isinstance(location_value, str):
        match = re.search(r"POINT\(([-0-9.]+)\s+([-0-9.]+)\)", location_value)
        if match:
            return {"lng": float(match.group(1)), "lat": float(match.group(2))}
    return None


def _find_active_spatial_duplicate(
    *,
    category_id: int,
    latitude: float,
    longitude: float,
    radius_meters: float = 20.0,
) -> Optional[Dict[str, Any]]:
    """
    Find existing active duplicates within a spatial radius using PostGIS.
    A duplicate is defined as an ANY complaint at the same location that is NOT
    resolved, closed, or rejected.
    """
    try:
        # PostGIS query: find records within X meters of point
        # target_digipin helps as a fallback for exact tile match
        target_digipin = _compute_digipin(latitude, longitude)

        # We query for tickets that are NOT in a 'final' state
        active_statuses = ["submitted", "verified", "assigned", "in_progress", "escalated"]

        rpc_response = supabase.rpc(
            "find_duplicate_complaints_v2",
            {
                "p_lat": latitude,
                "p_lng": longitude,
                "p_radius": radius_meters,
                "p_digipin": target_digipin,
                "p_category_id": category_id,
                "p_active_statuses": active_statuses
            }
        ).execute()

        if rpc_response.data and len(rpc_response.data) > 0:
            return rpc_response.data[0]
            
        return None

    except Exception as e:
        # Fallback to broad search if RPC fails (e.g. during migration)
        print(f"PostGIS RPC failed, falling back: {str(e)}")
        return None


def reverse_geocode_from_coordinates(latitude: float, longitude: float) -> Dict[str, str]:
    key = _coord_cache_key(latitude, longitude)
    if key in REVERSE_GEOCODE_CACHE:
        return REVERSE_GEOCODE_CACHE[key]

    location = {
        "pincode": "",
        "locality": "",
        "city": "",
        "district": "",
        "state": "",
        "formatted_address": "",
        "digipin": "",
    }

    if MAPPLS_API_KEY:
        try:
            query = urllib.parse.urlencode({"lat": latitude, "lng": longitude})
            url = f"https://apis.mappls.com/advancedmaps/v1/{MAPPLS_API_KEY}/rev_geocode?{query}"
            req = urllib.request.Request(
                url,
                headers={
                    "Referer": "https://jansamadhan.perkkk.dev",
                    "User-Agent": "JanSamadhan/1.0",
                },
            )
            with urllib.request.urlopen(req, timeout=8) as res:
                payload = json.loads(res.read().decode("utf-8"))

            results = payload.get("results") if isinstance(payload, dict) else None
            result = results[0] if isinstance(results, list) and results else {}
            if isinstance(result, dict):
                location["pincode"] = _pick_first(result, ["pincode", "pin", "postalCode"])
                location["locality"] = _pick_first(result, ["locality", "subLocality", "subDistrict"])
                location["city"] = _pick_first(result, ["city", "district", "county"])
                location["district"] = _pick_first(result, ["district", "city_district", "county"])
                location["state"] = _pick_first(result, ["state", "stateName"])
                location["formatted_address"] = _pick_first(
                    result,
                    ["formatted_address", "formattedAddress", "placeAddress", "address"],
                )
                # Note: Mappls rev_geocode does not return a digipin field;
                # DIGIPIN is computed independently via _compute_digipin below.
        except Exception:
            pass

    # Fallback to OSM reverse geocoder if Mappls data is unavailable.
    if not location["pincode"] or not location["formatted_address"]:
        try:
            query = urllib.parse.urlencode({
                "lat": latitude,
                "lon": longitude,
                "format": "jsonv2",
                "addressdetails": 1,
            })
            req = urllib.request.Request(
                f"https://nominatim.openstreetmap.org/reverse?{query}",
                headers={"User-Agent": "JanSamadhan/1.0"},
            )
            with urllib.request.urlopen(req, timeout=8) as res:
                payload = json.loads(res.read().decode("utf-8"))

            address = payload.get("address", {}) if isinstance(payload, dict) else {}
            if isinstance(address, dict):
                location["pincode"] = location["pincode"] or _pick_first(address, ["postcode"])
                location["locality"] = location["locality"] or _pick_first(
                    address,
                    ["suburb", "neighbourhood", "city_district", "village", "town"],
                )
                location["city"] = location["city"] or _pick_first(address, ["city", "town", "village"])
                location["district"] = location["district"] or _pick_first(address, ["state_district", "county"])
                location["state"] = location["state"] or _pick_first(address, ["state"])

            if not location["formatted_address"] and isinstance(payload, dict):
                display_name = payload.get("display_name")
                if isinstance(display_name, str):
                    location["formatted_address"] = display_name.strip()
        except Exception:
            pass

    if not location["city"]:
        location["city"] = "Delhi"
    if not location["state"]:
        location["state"] = "Delhi"
    if not location["pincode"]:
        location["pincode"] = "000000"
    if not location["formatted_address"]:
        location["formatted_address"] = f"Lat {latitude:.6f}, Lng {longitude:.6f}"
    # Always compute DIGIPIN using the official India Post algorithm (primary)
    try:
        location["digipin"] = _compute_digipin(latitude, longitude)
    except Exception:
        location["digipin"] = _fallback_digipin_raw(latitude, longitude)

    if len(REVERSE_GEOCODE_CACHE) >= 500:
        first_key = next(iter(REVERSE_GEOCODE_CACHE))
        REVERSE_GEOCODE_CACHE.pop(first_key, None)
    REVERSE_GEOCODE_CACHE[key] = location
    return location


def build_complaint_record(
    *,
    user_id: str,
    issue_type: str,
    severity: str,
    description: str,
    image_url: str,
    lat: float,
    lng: float,
    address: str,
    pincode: str,
    city: str,
    district: str,
    authority: str,
    status: str,
    digipin: str,
) -> Dict[str, Any]:
    """
    Canonical complaint model (coordinates-first) used as source before DB mapping.
    """
    return {
        "id": "",
        "user_id": user_id,
        "issue_type": issue_type,
        "severity": severity,
        "description": description,
        "image_url": image_url,
        "lat": lat,
        "lng": lng,
        "address": address,
        "pincode": pincode,
        "city": city,
        "district": district,
        "authority": authority,
        "status": status,
        "created_at": "",
        "digipin": digipin,
    }


def _in_ndmc_zone(latitude: float, longitude: float) -> bool:
    return 28.62 <= latitude <= 28.64 and 77.19 <= longitude <= 77.23


def _infer_authority_from_issue_type(issue_type: str) -> Optional[str]:
    value = issue_type.lower()
    for keywords, authority in ISSUE_TYPE_AUTHORITY_KEYWORDS:
        if any(k in value for k in keywords):
            return authority
    return None


def route_authority(
    *,
    issue_type: str,
    latitude: float,
    longitude: float,
    location: Dict[str, str],
    default_authority: str,
) -> str:
    inferred = _infer_authority_from_issue_type(issue_type)
    routed = inferred or default_authority

    locality = (location.get("locality") or "").lower()
    pincode = (location.get("pincode") or "").strip()
    is_ndmc = _in_ndmc_zone(latitude, longitude) or any(h in locality for h in NDMC_LOCALITY_HINTS) or pincode in {"110001", "110011", "110003"}

    if is_ndmc and routed in {"MCD", "PWD", "DISCOM"}:
        return "NDMC"

    return routed

