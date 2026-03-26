import os
import json
import uuid
import base64
import hashlib
import re
import asyncio
import urllib.parse
import urllib.request
from pathlib import Path
from io import BytesIO
from datetime import datetime, timezone
from typing import Optional, Dict, List, Any
from math import radians, sin, cos, sqrt, atan2

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from google import genai

from shared import (
    gemini_client,
    supabase,
    GEMINI_API_KEY,
    GEMINI_PRIMARY_MODEL,
    GEMINI_FALLBACK_MODEL,
    MAPPLS_API_KEY,
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    CHILD_CATEGORIES,
    SEVERITY_MAP,
    REVERSE_GEOCODE_CACHE,
    ALLOWED_STATUSES,
    DUPLICATE_LOOKBACK_HOURS,
    DUPLICATE_RADIUS_METERS,
    ISSUE_TYPE_AUTHORITY_KEYWORDS,
    NDMC_LOCALITY_HINTS,
    upload_image_to_supabase,
    reverse_geocode_from_coordinates,
    route_authority,
    _find_recent_duplicate,
    build_complaint_record,
    redis_client,
)


# =========================================================
# 2. FASTAPI INITIALIZATION
# =========================================================

app = FastAPI(
    title="Civic Issue Detection API",
    description="AI powered civic complaint classification system",
)

origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://10.176.53.15:3000",
    "https://jansamadhan.perkkk.dev",
    "https://api.jansamadhan.perkkk.dev",
    "https://ps-crmdev1-production.up.railway.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS", "GET"],
    allow_headers=["Content-Type", "Authorization"],
)


# =========================================================
# 4. RESPONSE MODELS
# =========================================================

class TicketPreview(BaseModel):
    child_id: int
    issue_name: str
    parent_id: int
    authority: str
    title: str
    description: str
    severity: str          # Human label: Low / Medium / High / Critical
    severity_db: str       # DB label:    L1 / L2 / L3 / L4
    status: str
    ward_name: str
    pincode: str
    digipin: str
    locality: str
    city: str
    district: str
    state: str
    formatted_address: str
    latitude: float
    longitude: float
    accuracy: float
    timestamp: str
    confidence: float
    user_text: str
    confirm_prompt: str    # Instruction shown below ticket preview in chat


class TicketCreated(BaseModel):
    ticket_id: str         # e.g. DL-2026-00042 (from DB trigger)
    complaint_id: str      # uuid of the inserted row
    child_id: int
    issue_name: str
    authority: str
    title: str
    severity_db: str
    status: str
    ward_name: str
    pincode: str
    digipin: str
    formatted_address: str
    photo_urls: List[str]
    latitude: float
    longitude: float
    accuracy: float
    timestamp: str
    image_metadata: Optional[Dict[str, str]] = None


# =========================================================
# 5. HELPERS
# =========================================================

def get_citizen_id_from_token(authorization: Optional[str]) -> str:
    """
    Decode the Supabase JWT passed as 'Bearer <token>' and extract the user uuid.
    We do NOT verify signature here — Supabase service key insert already trusts the caller.
    For production, verify the JWT using Supabase JWT secret.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")

    token = authorization.split(" ", 1)[1]
    try:
        # JWT payload is the middle segment, base64url encoded
        payload_b64 = token.split(".")[1]
        # Add padding
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        citizen_id = payload.get("sub")
        if not citizen_id:
            raise HTTPException(status_code=401, detail="JWT does not contain user id (sub).")
        return citizen_id
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Failed to decode JWT: {str(e)}")




# =========================================================
# 6. GEMINI ANALYSIS FUNCTION
# =========================================================

def analyze_issue_with_gemini(
    image: Image.Image,
    text: str,
    latitude: float,
    longitude: float,
) -> dict:

    def _is_quota_error(err: Exception) -> bool:
        msg = str(err)
        return "RESOURCE_EXHAUSTED" in msg or "quota" in msg.lower() or "429" in msg

    def _is_model_not_found(err: Exception) -> bool:
        msg = str(err)
        return "NOT_FOUND" in msg or "not found" in msg.lower() or "404" in msg

    def _retry_hint(err: Exception) -> str:
        msg = str(err)
        m = re.search(r"retry in\s+([0-9.]+s)", msg, flags=re.IGNORECASE)
        return m.group(1) if m else "a few seconds"

    def _call_gemini_json(local_prompt: str) -> dict:
        models = [GEMINI_PRIMARY_MODEL]
        if GEMINI_FALLBACK_MODEL and GEMINI_FALLBACK_MODEL != GEMINI_PRIMARY_MODEL:
            models.append(GEMINI_FALLBACK_MODEL)

        last_quota_error: Optional[Exception] = None

        for model_name in models:
            try:
                response = gemini_client.models.generate_content(
                    model=model_name,
                    contents=[local_prompt, image],
                    config={"temperature": 0},
                )
                break
            except Exception as e:
                if _is_quota_error(e):
                    last_quota_error = e
                    continue
                if _is_model_not_found(e):
                    # Skip retired/unsupported model IDs and try next configured model.
                    continue
                raise HTTPException(status_code=500, detail=f"Gemini request failed: {str(e)}")
        else:
            hint = _retry_hint(last_quota_error) if last_quota_error else "a few seconds"
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Gemini quota exhausted for configured models ({', '.join(models)}). "
                    f"Please retry in {hint} or switch to a billed Gemini project."
                ),
            )

        raw = response.text.strip()

        # Strip markdown fences if model adds them despite instructions
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=500,
                detail=f"Gemini returned non-JSON response: {raw[:300]}"
            )

    prompt = f"""
You are a strict civic issue analyst for a Delhi government complaint platform.

Analyze the provided image step by step and return a single JSON object.
No explanation, no markdown, no code fences — ONLY raw JSON.

=== STEP 1: IMAGE ANALYSIS ===
Carefully examine the image. Identify:
- What physical object or infrastructure is visible?
- What is wrong with it? (damaged, broken, missing, overflowing, dirty, etc.)
- How severe does the damage appear visually?

=== STEP 2: USER DESCRIPTION ===
User description (supporting context only, image is primary):
{text}

=== STEP 3: CLASSIFICATION ===
Using STEPS 1 + 2 together, select the single best Child ID:

1=Metro Station Issue | 2=Metro Track/Safety | 3=Escalator/Lift | 4=Metro Parking
5=Metro Station Hygiene | 6=Metro Property Damage | 7=National Highway Damage
8=Toll Plaza Issue | 9=Expressway Problem | 10=Highway Bridge Damage
11=State Highway/City Road | 12=Flyover/Overbridge | 13=Government Building Issue
14=Large Drainage System | 15=Colony Road/Lane | 16=Garbage Collection
17=Street Sweeping | 18=Park Maintenance | 19=Public Toilet | 20=Local Drain/Sewage
21=Stray Animals | 22=Street Light (MCD zone) | 23=Connaught Place/Lutyens Issue
24=NDMC Road/Infrastructure | 25=NDMC Street Light | 26=Central Govt Residential Zone
27=Water Supply Failure | 28=Water Pipe Leakage | 29=Sewer Line Blockage
30=Contaminated Water | 31=Power Outage | 32=Transformer Issue
33=Exposed/Fallen Wire | 34=Electricity Pole Damage | 35=Crime/Safety Issue
36=Traffic Signal Problem | 37=Illegal Parking | 38=Road Accident Black Spot
39=Illegal Tree Cutting | 40=Air Pollution/Burning | 41=Noise Pollution
42=Industrial Waste Dumping

=== STEP 4: SEVERITY ===
Based on visual damage and safety risk:
- Low      = Minor issue, no immediate risk (dim light, small pothole)
- Medium   = Inconvenient but not dangerous (garbage pile, broken footpath)
- High     = Potential safety risk (exposed wire, large pothole, sewage overflow)
- Critical = Immediate danger to life or property (live wire on ground, collapsed structure)

=== OUTPUT ===
Return ONLY this exact JSON:
{{
  "child_id": <integer 1-42>,
        "title": "<5-10 word title describing issue>",
        "description": "<2-3 sentences: what is visible and what is wrong>",
        "severity": "<Low | Medium | High | Critical>",
        "confidence": <float between 0 and 1>
}}

If image is NOT a civic infrastructure issue return exactly: {{"error": "INVALID"}}
"""

    result = _call_gemini_json(prompt)

    if result.get("error") == "INVALID":
        # Fallback pass: force a best-effort civic classification instead of rejecting outright.
        fallback_prompt = f"""
You are a Delhi civic issue classifier.

The previous classifier marked the image as INVALID, but for this workflow you MUST return
the closest civic infrastructure category with a best-effort assessment.
Never return INVALID.

Device coordinates:
Latitude : {latitude}
Longitude: {longitude}

User description:
{text}

Choose one child_id from 1-42. If the issue appears to involve lighting/poles/wires,
prefer 22, 25, 33, or 34.

Return ONLY JSON in this exact shape:
{{
  "child_id": <integer 1-42>,
  "title": "<5-10 word title>",
  "description": "<2-3 sentence best-effort assessment>",
        "severity": "<Low | Medium | High | Critical>",
        "confidence": <float between 0 and 1>
}}
"""
        result = _call_gemini_json(fallback_prompt)

    child_id = result.get("child_id")
    if not isinstance(child_id, int) or child_id not in CHILD_CATEGORIES:
        raise HTTPException(status_code=500, detail=f"Gemini returned invalid child_id: {child_id}")

    if result.get("severity") not in {"Low", "Medium", "High", "Critical"}:
        raise HTTPException(status_code=500, detail=f"Gemini returned invalid severity: {result.get('severity')}")

    confidence = result.get("confidence")
    if not isinstance(confidence, (int, float)):
        result["confidence"] = 0.5
    else:
        result["confidence"] = max(0.0, min(1.0, float(confidence)))

    for field in ["title", "description"]:
        if not result.get(field):
            raise HTTPException(status_code=500, detail=f"Gemini did not return required field: {field}")

    return result


# =========================================================
# 6b. REVERSE GEOCODE ENDPOINT
# =========================================================

@app.get("/geocode")
async def geocode(lat: float, lng: float):
    """Return reverse-geocoded details (pincode, digipin, address, etc.)."""
    location = await asyncio.to_thread(reverse_geocode_from_coordinates, lat, lng)
    return location


# =========================================================
# 7. ANALYZE ENDPOINT  (preview only — does NOT write to DB)
# =========================================================

@app.options("/analyze")
async def analyze_options() -> Response:
    return Response(status_code=204)

@app.post("/analyze", response_model=TicketPreview)
async def analyze(
    image: UploadFile = File(...),
    user_text: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    accuracy: float = Form(...),
    timestamp: str = Form(...),
    authorization: Optional[str] = Header(None),
):
    # Auth check — must be logged in
    get_citizen_id_from_token(authorization)

    image_data = await image.read()
    img = Image.open(BytesIO(image_data))

    # Run AI classification and reverse geocoding in parallel to reduce latency.
    result, location = await asyncio.gather(
        asyncio.to_thread(analyze_issue_with_gemini, img, user_text, latitude, longitude),
        asyncio.to_thread(reverse_geocode_from_coordinates, latitude, longitude),
    )

    child_id = result["child_id"]
    category = CHILD_CATEGORIES[child_id]
    severity_db = SEVERITY_MAP[result["severity"]]
    ward_name = location["locality"] or "Unknown locality"
    routed_authority = route_authority(
        issue_type=category["name"],
        latitude=latitude,
        longitude=longitude,
        location=location,
        default_authority=category["authority"],
    )

    return TicketPreview(
        child_id=child_id,
        issue_name=category["name"],
        parent_id=category["parent"],
        authority=routed_authority,
        title=result["title"],
        description=result["description"],
        severity=result["severity"],
        severity_db=severity_db,
        status="submitted",
        ward_name=ward_name,
        pincode=location["pincode"],
        digipin=location["digipin"],
        locality=location["locality"],
        city=location["city"],
        district=location["district"],
        state=location["state"],
        formatted_address=location["formatted_address"],
        latitude=latitude,
        longitude=longitude,
        accuracy=accuracy,
        timestamp=timestamp,
        confidence=result["confidence"],
        user_text=user_text,
        confirm_prompt="✅ Ticket preview ready. Type \"confirm\" or \"submit\" to raise this ticket, or describe the issue differently to re-analyse.",
    )


# =========================================================
# 8. CONFIRM ENDPOINT  (user confirms preview -> writes to DB)
# =========================================================

@app.options("/confirm")
async def confirm_options() -> Response:
    return Response(status_code=204)

@app.post("/confirm", response_model=TicketCreated)
async def confirm(
    image: UploadFile = File(...),
    user_text: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    accuracy: float = Form(...),
    timestamp: str = Form(...),
    child_id: int = Form(...),
    title: str = Form(...),
    description: str = Form(...),
    severity_db: str = Form(...),     # L1 / L2 / L3 / L4
    ward_name: Optional[str] = Form(None),
    pincode: Optional[str] = Form(None),
    force_submit: bool = Form(False),
    authorization: Optional[str] = Header(None),
    user_agent: Optional[str] = Header(None),
):
    # 1. Extract citizen_id from JWT
    citizen_id = get_citizen_id_from_token(authorization)

    if child_id not in CHILD_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid child_id: {child_id}")

    if severity_db not in {"L1", "L2", "L3", "L4"}:
        raise HTTPException(status_code=400, detail=f"Invalid severity_db: {severity_db}")

    category = CHILD_CATEGORIES[child_id]

    duplicate = _find_recent_duplicate(category_id=child_id, latitude=latitude, longitude=longitude)
    if duplicate and not force_submit:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "DUPLICATE_DETECTED",
                "message": "A similar complaint exists within 50 meters in the last 24 hours.",
                "duplicate": duplicate,
                "options": ["upload_anyway", "upvote_existing"],
            },
        )

    location = reverse_geocode_from_coordinates(latitude, longitude)
    derived_ward_name = location["locality"] or (ward_name or "Unknown locality")
    derived_pincode = location["pincode"] or (pincode or "000000")
    formatted_address = location["formatted_address"]
    digipin = location["digipin"]
    routed_authority = route_authority(
        issue_type=category["name"],
        latitude=latitude,
        longitude=longitude,
        location=location,
        default_authority=category["authority"],
    )

    # 2. Upload image to Supabase Storage
    image_data = await image.read()
    image_hash = hashlib.sha256(image_data).hexdigest()
    upload_time = datetime.now(timezone.utc).isoformat()
    device_type = (user_agent or "unknown")[:120]
    img_metadata = {
        "upload_time": upload_time,
        "image_hash": image_hash,
        "device_type": device_type,
    }
    filename = f"{uuid.uuid4()}.jpg"
    try:
        photo_url = upload_image_to_supabase(image_data, filename)
        photo_urls = [photo_url]
    except Exception:
        # Non-fatal: store empty list if upload fails
        photo_urls = []

    # 3. Build PostGIS geography point string
    location_wkt = f"POINT({longitude} {latitude})"
    address_text = (
        f"{formatted_address} | gps_accuracy_m={accuracy:.1f} | gps_timestamp={timestamp}"
    )
    complaint_record = build_complaint_record(
        user_id=citizen_id,
        issue_type=category["name"],
        severity=severity_db,
        description=description,
        image_url=photo_urls[0] if photo_urls else "",
        lat=latitude,
        lng=longitude,
        address=formatted_address,
        pincode=derived_pincode,
        city=location["city"] or "Delhi",
        district=location["district"],
        authority=routed_authority,
        status="submitted",
        digipin=digipin,
    )

    # 4. Insert complaint into Supabase
    # ticket_id is auto-generated by a DB trigger (e.g. DL-2026-XXXXX)
    try:
        response = supabase.table("complaints").insert({
            "citizen_id":          complaint_record["user_id"],
            "category_id":         child_id,
            "title":               title,
            "description":         complaint_record["description"],
            "severity":            complaint_record["severity"],
            "effective_severity":  complaint_record["severity"],
            "status":              complaint_record["status"],
            "location":            location_wkt,
            "ward_name":           derived_ward_name,
            "pincode":             complaint_record["pincode"],
            "digipin":             complaint_record["digipin"],
            "address_text":        address_text,
            "photo_urls":          photo_urls,
            "photo_count":         len(photo_urls),
            "assigned_department": complaint_record["authority"],
            "city":                complaint_record["city"],
            "upvote_count":        0,
            "is_spam":             False,
            "possible_duplicate":  bool(duplicate),
            "sla_breached":        False,
            "escalation_level":    0,
            "upvote_boost":        0,
        }).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database insert failed: {str(e)}")

    # Clear Redis Cache for this user
    if redis_client:
        try:
            redis_client.delete(f"user:tickets:{citizen_id}")
        except Exception as e:
            print(f"Redis cache invalidation failed: {e}")

    if not response.data:
        raise HTTPException(status_code=500, detail="Database insert returned no data.")

    inserted = response.data[0]
    complaint_record["id"] = inserted["id"]
    complaint_record["created_at"] = inserted.get("created_at") or datetime.now(timezone.utc).isoformat()

    return TicketCreated(
        ticket_id=inserted.get("ticket_id", "PENDING"),
        complaint_id=inserted["id"],
        child_id=child_id,
        issue_name=category["name"],
        authority=routed_authority,
        title=title,
        severity_db=severity_db,
        status="submitted",
        ward_name=derived_ward_name,
        pincode=derived_pincode,
        digipin=digipin,
        formatted_address=formatted_address,
        photo_urls=photo_urls,
        latitude=latitude,
        longitude=longitude,
        accuracy=accuracy,
        timestamp=timestamp,
        image_metadata=img_metadata,
    )


# =========================================================
# 8b. CITIZEN TICKETS (with Redis Caching & Delta support)
# =========================================================

@app.get("/citizen/tickets")
async def get_citizen_tickets(
    since: Optional[str] = None,
    authorization: Optional[str] = Header(None)
):
    """
    Fetch citizen tickets with Redis caching.
    Supports a 'since' parameter (ISO timestamp) to return only new/updated records.
    """
    citizen_id = get_citizen_id_from_token(authorization)
    cache_key = f"user:tickets:{citizen_id}"

    # 1. Try to fetch from Redis if no delta is requested
    if not since and redis_client:
        try:
            cached_data = redis_client.get(cache_key)
            if cached_data:
                return {
                    "source": "cache",
                    "tickets": json.loads(cached_data)
                }
        except Exception as e:
            print(f"Redis read error: {e}")

    # 2. Fallback to Supabase
    query = supabase.table("complaints").select(
        "id, ticket_id, title, address_text, assigned_department, status, created_at, upvote_count"
    ).eq("citizen_id", citizen_id).order("created_at", desc=True)

    if since:
        query = query.gt("created_at", since)

    try:
        response = query.execute()
        tickets = response.data or []
        
        # 3. Cache the FULL list in Redis for 1 hour (only if not a delta query)
        if not since and redis_client:
            try:
                redis_client.setex(cache_key, 3600, json.dumps(tickets))
            except Exception as e:
                print(f"Redis write error: {e}")

        return {
            "source": "database" if not since else "delta",
            "tickets": tickets
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")


# =========================================================
# 9. ROOT MESSAGE
# =========================================================

@app.get("/")
def home():
    return {
        "message":
        "Welcome to the Civic Issue Reporting Assistant. "
        "POST /analyze to preview a ticket. POST /confirm to submit it."
    }


# ── Register WhatsApp webhook router (imported here to avoid circular import) ─
from whatsapp_webhook import router as whatsapp_router
app.include_router(whatsapp_router)
