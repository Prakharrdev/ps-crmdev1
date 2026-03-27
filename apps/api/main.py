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
    DUPLICATE_RADIUS_METERS,
    ISSUE_TYPE_AUTHORITY_KEYWORDS,
    NDMC_LOCALITY_HINTS,
    upload_image_to_supabase,
    reverse_geocode_from_coordinates,
    route_authority,
    _find_active_spatial_duplicate,
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
        return citizen_id
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Failed to decode JWT: {str(e)}")


class ChatHistory(BaseModel):
    messages: List[Dict[str, Any]]


@app.get("/api/chat/history/{session_id}")
async def get_chat_history(session_id: str):
    """Retrieve chat history from Redis for a given session."""
    if not redis_client:
        return {"messages": []}
    
    try:
        data = redis_client.get(f"chat:history:{session_id}")
        if data:
            return {"messages": json.loads(data)}
        return {"messages": []}
    except Exception as e:
        print(f"Redis chat history read error: {e}")
        return {"messages": []}


@app.post("/api/chat/history/{session_id}")
async def save_chat_history(session_id: str, history: ChatHistory):
    """Save chat history to Redis with a 24-hour TTL."""
    if not redis_client:
        return {"status": "ok"}
    
    try:
        # Store for 24 hours (persists across browser sessions while logged in)
        redis_client.setex(
            f"chat:history:{session_id}",
            86400, 
            json.dumps(history.messages)
        )
        return {"status": "ok"}
    except Exception as e:
        print(f"Redis chat history write error: {e}")
        raise HTTPException(status_code=500, detail="Failed to save chat history")


@app.delete("/api/chat/history/{session_id}")
async def delete_chat_history(session_id: str):
    """Delete chat history from Redis on logout."""
    if not redis_client:
        return {"status": "ok"}
    
    try:
        redis_client.delete(f"chat:history:{session_id}")
        return {"status": "ok"}
    except Exception as e:
        print(f"Redis chat history delete error: {e}")
        return {"status": "ok"}




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

    duplicate = _find_active_spatial_duplicate(category_id=child_id, latitude=latitude, longitude=longitude)
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

    # Clear Redis Cache for this user + admin complaints
    if redis_client:
        try:
            redis_client.delete(f"user:tickets:{citizen_id}")
            # Invalidate all admin complaint cache keys so dashboard reflects new ticket
            for key in redis_client.scan_iter("admin:complaints:*"):
                redis_client.delete(key)
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
# 8c. ADMIN DASHBOARD STATS (Consolidated + Redis)
# =========================================================

@app.get("/api/admin/dashboard/stats")
async def get_admin_dashboard_stats(
    authorization: Optional[str] = Header(None)
):
    """
    Consolidates 6 heavy Supabase counts into one Redis-cached payload.
    Used by AdminStatsOverview component.
    """
    # 1. Check Redis Cache (5-minute TTL)
    cache_key = "admin:stats:global"
    if redis_client:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                return { "source": "cache", **json.loads(cached) }
        except Exception as e:
            print(f"Redis read error: {e}")

    # 2. Fetch from Supabase in Parallel
    try:
        [
            total_res, active_res, resolved_res, escalated_res, authorities_res, resolved_rows
        ] = await asyncio.gather(
            asyncio.to_thread(lambda: supabase.table("complaints").select("id", count="exact").execute()),
            asyncio.to_thread(lambda: supabase.table("complaints").select("id", count="exact").in_("status", ["submitted", "under_review", "assigned", "in_progress", "escalated"]).execute()),
            asyncio.to_thread(lambda: supabase.table("complaints").select("id", count="exact").eq("status", "resolved").execute()),
            asyncio.to_thread(lambda: supabase.table("complaints").select("id", count="exact").eq("status", "escalated").execute()),
            asyncio.to_thread(lambda: supabase.table("profiles").select("id", count="exact").eq("role", "authority").eq("is_blocked", False).execute()),
            asyncio.to_thread(lambda: supabase.table("complaints").select("created_at, resolved_at").eq("status", "resolved").execute())
        )

        # Calculate Average Resolution Days
        resolved_data = resolved_rows.data or []
        durations = []
        for r in resolved_data:
            if r.get("resolved_at"):
                try:
                    start = datetime.fromisoformat(r["created_at"].replace("Z", "+00:00"))
                    end = datetime.fromisoformat(r["resolved_at"].replace("Z", "+00:00"))
                    delta = (end - start).total_seconds() / (3600 * 24)
                    if delta >= 0:
                        durations.append(delta)
                except Exception:
                    pass
        
        avg_days = sum(durations) / len(durations) if durations else 0

        stats = {
            "totalComplaints":    total_res.count or 0,
            "activeComplaints":   active_res.count or 0,
            "resolvedComplaints": resolved_res.count or 0,
            "urgentEscalations":  escalated_res.count or 0,
            "avgResolutionDays":  round(avg_days, 1),
            "authoritiesActive": authorities_res.count or 0,
        }

        # 3. Cache in Redis
        if redis_client:
            try:
                redis_client.setex(cache_key, 300, json.dumps(stats))
            except Exception as e:
                print(f"Redis write error: {e}")

        return { "source": "database", **stats }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Admin stats fetch failed: {str(e)}")


# =========================================================
# 8d. ADMIN AUTHORITIES LIST (Consolidated + Redis)
# =========================================================

@app.get("/api/admin/authorities")
async def get_admin_authorities_list(
    authorization: Optional[str] = Header(None)
):
    """
    Consolidates profiles, worker counts, and category data into one payload.
    Matches the exact schema of the original Next.js /api/admin/authorities route.
    """
    cache_key = "admin:authorities:list"
    if redis_client:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                return { "source": "cache", **json.loads(cached) }
        except Exception as e:
            print(f"Redis read error: {e}")

    try:
        [profiles_res, complaints_res, workers_res, categories_res] = await asyncio.gather(
            asyncio.to_thread(lambda: supabase.table("profiles").select("id, full_name, email, phone, city, department, is_blocked, created_at").eq("role", "authority").order("created_at", desc=True).execute()),
            asyncio.to_thread(lambda: supabase.table("complaints").select("id, assigned_officer_id, assigned_department, status, created_at, resolved_at").execute()),
            asyncio.to_thread(lambda: supabase.table("worker_profiles").select("worker_id, department").execute()),
            asyncio.to_thread(lambda: supabase.table("categories").select("name, department").eq("is_active", True).execute())
        )

        payload = {
            "profiles":   profiles_res.data or [],
            "complaints": complaints_res.data or [],
            "workers":    workers_res.data or [],
            "categories": categories_res.data or [],
        }

        if redis_client:
            try:
                redis_client.setex(cache_key, 600, json.dumps(payload))
            except Exception as e:
                print(f"Redis write error: {e}")

        return { "source": "database", **payload }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Authorities data fetch failed: {str(e)}")


# =========================================================
# 8e. ADMIN WORKERS LIST (Consolidated + Redis)
# =========================================================

@app.get("/api/admin/workers")
async def get_admin_workers_list(
    authorization: Optional[str] = Header(None)
):
    """
    Consolidates worker profiles, complaints, worker_profiles table, and categories
    into one payload. Matches the exact schema of Next.js /api/admin/workers route.
    """
    cache_key = "admin:workers:list"
    if redis_client:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                return { "source": "cache", **json.loads(cached) }
        except Exception as e:
            print(f"Redis read error: {e}")

    try:
        [profiles_res, complaints_res, worker_profiles_res, categories_res] = await asyncio.gather(
            asyncio.to_thread(lambda: supabase.table("profiles").select("id, full_name, email, phone, city, department, is_blocked, created_at").eq("role", "worker").order("created_at", desc=True).execute()),
            asyncio.to_thread(lambda: supabase.table("complaints").select("id, assigned_worker_id, assigned_department, status, created_at, resolved_at").execute()),
            asyncio.to_thread(lambda: supabase.table("worker_profiles").select("worker_id, department, availability, total_resolved").execute()),
            asyncio.to_thread(lambda: supabase.table("categories").select("name, department").eq("is_active", True).execute())
        )

        payload = {
            "profiles":       profiles_res.data or [],
            "complaints":     complaints_res.data or [],
            "workerProfiles": worker_profiles_res.data or [],
            "categories":     categories_res.data or [],
        }

        if redis_client:
            try:
                redis_client.setex(cache_key, 600, json.dumps(payload))
            except Exception as e:
                print(f"Redis write error: {e}")

        return { "source": "database", **payload }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Workers data fetch failed: {str(e)}")


# =========================================================
# 8f. ADMIN COMPLAINTS LIST (Consolidated + Redis)
# =========================================================

def _parse_priority_to_severity(priority: str) -> Optional[str]:
    mapping = {"low": "L1", "medium": "L2", "high": "L3", "emergency": "L4"}
    return mapping.get(priority)


@app.get("/api/admin/complaints")
async def get_admin_complaints_list(
    page: int = 1,
    pageSize: int = 20,
    status: str = "all",
    priority: str = "all",
    authority: str = "all",
    category: str = "all",
    search: str = "",
    authorization: Optional[str] = Header(None),
):
    """
    Consolidated complaints endpoint with pagination, filters, Redis caching,
    and batch profile + worker + category fetching in a single response.
    Replaces the Next.js /api/admin/complaints API route.
    """
    page = max(1, page)
    pageSize = min(100, max(1, pageSize))
    search = search.strip()

    # Build a cache key from all query params
    cache_key = f"admin:complaints:p={page}&ps={pageSize}&st={status}&pr={priority}&au={authority}&ca={category}&q={search}"

    if redis_client:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                return {"source": "cache", **json.loads(cached)}
        except Exception as e:
            print(f"Redis read error: {e}")

    range_from = (page - 1) * pageSize
    range_to = range_from + pageSize - 1

    # --- Step 1: Resolve category filter to IDs (if needed) ---
    category_ids: Optional[List[int]] = None
    if category != "all":
        try:
            cat_res = await asyncio.to_thread(
                lambda: supabase.table("categories").select("id").eq("name", category).execute()
            )
            category_ids = [row["id"] for row in (cat_res.data or [])]
            if not category_ids:
                empty_payload = {"items": [], "profiles": [], "workers": [], "categories": [], "totalCount": 0}
                return {"source": "database", **empty_payload}
        except Exception:
            category_ids = None

    # --- Step 2: Build and execute the complaints query ---
    def _build_complaints_query():
        q = supabase.table("complaints").select(
            "id, ticket_id, title, category_id, address_text, ward_name, city, "
            "status, severity, escalation_level, created_at, "
            "assigned_department, assigned_worker_id, assigned_officer_id, "
            "categories(name)",
            count="exact",
        ).order("created_at", desc=True)

        if status == "pending":
            q = q.in_("status", ["submitted", "under_review", "assigned"])
        elif status != "all":
            q = q.eq("status", status)

        severity_val = _parse_priority_to_severity(priority)
        if severity_val:
            q = q.eq("severity", severity_val)

        if authority != "all":
            q = q.eq("assigned_department", authority)

        if category_ids is not None:
            q = q.in_("category_id", category_ids)

        if search:
            safe = search.replace(",", " ")
            q = q.or_(
                f"ticket_id.ilike.%{safe}%,"
                f"title.ilike.%{safe}%,"
                f"address_text.ilike.%{safe}%,"
                f"ward_name.ilike.%{safe}%,"
                f"city.ilike.%{safe}%"
            )

        return q.range(range_from, range_to).execute()

    # --- Step 3: Run complaints + static data in parallel ---
    try:
        [complaints_res, workers_res, categories_res] = await asyncio.gather(
            asyncio.to_thread(_build_complaints_query),
            asyncio.to_thread(
                lambda: supabase.table("worker_profiles")
                .select("worker_id, department, availability, worker:profiles!worker_profiles_worker_id_fkey(id, full_name, department)")
                .order("joined_at", desc=True)
                .execute()
            ),
            asyncio.to_thread(
                lambda: supabase.table("categories")
                .select("id, name, department")
                .eq("is_active", True)
                .order("name")
                .execute()
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Admin complaints fetch failed: {str(e)}")

    complaint_rows = complaints_res.data or []
    total_count = complaints_res.count or 0

    # --- Step 4: Batch fetch profiles for assigned workers/officers ---
    profile_ids = list(set(
        pid
        for row in complaint_rows
        for pid in [row.get("assigned_worker_id"), row.get("assigned_officer_id")]
        if pid
    ))

    profiles: List[Dict[str, Any]] = []
    if profile_ids:
        try:
            profiles_res = await asyncio.to_thread(
                lambda: supabase.table("profiles")
                .select("id, full_name, department")
                .in_("id", profile_ids)
                .execute()
            )
            profiles = profiles_res.data or []
        except Exception:
            profiles = []

    payload = {
        "items": complaint_rows,
        "profiles": profiles,
        "workers": workers_res.data or [],
        "categories": categories_res.data or [],
        "totalCount": total_count,
    }

    # Cache for 2 minutes (short TTL since complaints change frequently)
    if redis_client:
        try:
            redis_client.setex(cache_key, 120, json.dumps(payload))
        except Exception as e:
            print(f"Redis write error: {e}")

    return {"source": "database", **payload}

# =========================================================
# 8g. AUTHORITY DASHBOARD (Consolidated + Redis)
# =========================================================

COMPLAINT_DASHBOARD_SELECT = (
    "id, ticket_id, title, status, effective_severity, sla_deadline, "
    "escalation_level, created_at, resolved_at, address_text, assigned_worker_id, "
    "upvote_count, categories(name)"
)

TREND_SELECT = "status, created_at, resolved_at"


@app.get("/api/authority/dashboard")
async def get_authority_dashboard(
    authorization: Optional[str] = Header(None),
):
    """
    Consolidated authority dashboard endpoint.
    Returns complaints, trend rows, workers, department, and stats
    in a single cached payload. Replaces 4-6 Supabase queries from the frontend.
    """
    officer_id = get_citizen_id_from_token(authorization)

    # Check Redis cache
    cache_key = f"authority:dashboard:{officer_id}"
    if redis_client:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                return {"source": "cache", **json.loads(cached)}
        except Exception as e:
            print(f"Redis read error: {e}")

    # Step 1: Get officer's department
    try:
        profile_res = await asyncio.to_thread(
            lambda: supabase.table("profiles")
            .select("department")
            .eq("id", officer_id)
            .maybe_single()
            .execute()
        )
        department = (profile_res.data or {}).get("department", "") or ""
    except Exception:
        department = ""

    # Step 2: Date cutoffs
    six_month_cutoff = datetime.now(timezone.utc)
    # Go back 5 months to start of that month
    month = six_month_cutoff.month - 5
    year = six_month_cutoff.year
    while month <= 0:
        month += 12
        year -= 1
    six_month_cutoff = six_month_cutoff.replace(year=year, month=month, day=1, hour=0, minute=0, second=0, microsecond=0)
    six_month_iso = six_month_cutoff.isoformat()

    # Step 3: Fetch complaints (try officer first, fallback to department)
    try:
        [officer_complaints_res, officer_trend_res] = await asyncio.gather(
            asyncio.to_thread(
                lambda: supabase.table("complaints")
                .select(COMPLAINT_DASHBOARD_SELECT)
                .eq("assigned_officer_id", officer_id)
                .neq("status", "rejected")
                .execute()
            ),
            asyncio.to_thread(
                lambda: supabase.table("complaints")
                .select(TREND_SELECT)
                .eq("assigned_officer_id", officer_id)
                .gte("created_at", six_month_iso)
                .execute()
            ),
        )
        all_rows = officer_complaints_res.data or []
        trend_rows = officer_trend_res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Authority dashboard fetch failed: {str(e)}")

    # Fallback: fetch by department if officer has no direct assignments
    if len(all_rows) == 0 and department:
        try:
            [dept_complaints_res, dept_trend_res] = await asyncio.gather(
                asyncio.to_thread(
                    lambda: supabase.table("complaints")
                    .select(COMPLAINT_DASHBOARD_SELECT)
                    .eq("assigned_department", department)
                    .neq("status", "rejected")
                    .execute()
                ),
                asyncio.to_thread(
                    lambda: supabase.table("complaints")
                    .select(TREND_SELECT)
                    .eq("assigned_department", department)
                    .gte("created_at", six_month_iso)
                    .execute()
                ),
            )
            all_rows = dept_complaints_res.data or []
            trend_rows = dept_trend_res.data or []
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Authority dashboard dept fetch failed: {str(e)}")

    # Step 4: Fetch workers for this department
    workers: List[Dict[str, Any]] = []
    if department:
        try:
            workers_res = await asyncio.to_thread(
                lambda: supabase.table("worker_profiles")
                .select("worker_id, availability, department, profiles(full_name)")
                .eq("department", department)
                .execute()
            )
            workers = workers_res.data or []
        except Exception:
            workers = []

    payload = {
        "department": department,
        "complaints": all_rows,
        "trendRows": trend_rows,
        "workers": workers,
    }

    # Cache for 5 minutes
    if redis_client:
        try:
            redis_client.setex(cache_key, 300, json.dumps(payload))
        except Exception as e:
            print(f"Redis write error: {e}")

    return {"source": "database", **payload}


# =========================================================
# 8h. AUTHORITY WORKERS LIST (Consolidated + Redis)
# =========================================================

@app.get("/api/authority/workers")
async def get_authority_workers(
    authorization: Optional[str] = Header(None),
):
    """
    Consolidated authority workers endpoint.
    Returns worker profiles with active complaint counts in a single cached payload.
    """
    officer_id = get_citizen_id_from_token(authorization)

    cache_key = f"authority:workers:{officer_id}"
    if redis_client:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                return {"source": "cache", **json.loads(cached)}
        except Exception as e:
            print(f"Redis read error: {e}")

    # Step 1: Get officer's department
    try:
        profile_res = await asyncio.to_thread(
            lambda: supabase.table("profiles")
            .select("department")
            .eq("id", officer_id)
            .maybe_single()
            .execute()
        )
        department = (profile_res.data or {}).get("department", "") or ""
    except Exception:
        department = ""

    # Step 2: Fetch worker profiles (filtered by department if available)
    try:
        worker_query = supabase.table("worker_profiles").select(
            "worker_id, availability, department, city, total_resolved, "
            "current_complaint_id, joined_at, profiles(full_name, email)"
        )
        if department:
            worker_query = worker_query.eq("department", department)

        workers_res = await asyncio.to_thread(lambda: worker_query.execute())
        worker_rows = workers_res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Authority workers fetch failed: {str(e)}")

    if not worker_rows:
        payload = {"department": department, "workers": [], "activeCounts": {}}
        if redis_client:
            try:
                redis_client.setex(cache_key, 600, json.dumps(payload))
            except Exception:
                pass
        return {"source": "database", **payload}

    # Step 3: Count active complaints per worker
    worker_ids = [w["worker_id"] for w in worker_rows]
    try:
        active_res = await asyncio.to_thread(
            lambda: supabase.table("complaints")
            .select("assigned_worker_id")
            .in_("assigned_worker_id", worker_ids)
            .not_.in_("status", ["resolved", "rejected"])
            .execute()
        )
        active_rows = active_res.data or []
    except Exception:
        active_rows = []

    active_counts: Dict[str, int] = {wid: 0 for wid in worker_ids}
    for row in active_rows:
        wid = row.get("assigned_worker_id")
        if wid and wid in active_counts:
            active_counts[wid] += 1

    payload = {
        "department": department,
        "workers": worker_rows,
        "activeCounts": active_counts,
    }

    # Cache for 10 minutes
    if redis_client:
        try:
            redis_client.setex(cache_key, 600, json.dumps(payload))
        except Exception as e:
            print(f"Redis write error: {e}")

    return {"source": "database", **payload}

# =========================================================
# 8i. WORKER DASHBOARD (Consolidated + Redis)
# =========================================================

WORKER_COMPLAINT_SELECT = (
    "id, ticket_id, title, assigned_worker_id, description, address_text, "
    "severity, status, created_at, resolved_at, location, categories(name)"
)


@app.get("/api/worker/dashboard")
async def get_worker_dashboard(
    authorization: Optional[str] = Header(None),
):
    """
    Consolidated worker dashboard endpoint.
    Returns worker profile, complaints, and activity feed in one payload.
    Used by both worker/page.tsx (dashboard) and worker/tasks/page.tsx.
    """
    worker_id = get_citizen_id_from_token(authorization)

    cache_key = f"worker:dashboard:{worker_id}"
    if redis_client:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                return {"source": "cache", **json.loads(cached)}
        except Exception as e:
            print(f"Redis read error: {e}")

    # Step 1: Verify worker role
    try:
        profile_res = await asyncio.to_thread(
            lambda: supabase.table("profiles")
            .select("id, email, role")
            .eq("id", worker_id)
            .eq("role", "worker")
            .maybe_single()
            .execute()
        )
        profile_data = profile_res.data
        if not profile_data:
            raise HTTPException(status_code=403, detail="Access denied. Worker role required.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Profile check failed: {str(e)}")

    # Step 2: Fetch worker profile, complaints, and activity in parallel
    try:
        [worker_profile_res, complaints_res, history_res] = await asyncio.gather(
            asyncio.to_thread(
                lambda: supabase.table("worker_profiles")
                .select("last_location")
                .eq("worker_id", worker_id)
                .maybe_single()
                .execute()
            ),
            asyncio.to_thread(
                lambda: supabase.table("complaints")
                .select(WORKER_COMPLAINT_SELECT)
                .eq("assigned_worker_id", worker_id)
                .in_("status", ["assigned", "in_progress", "resolved"])
                .order("created_at", desc=True)
                .execute()
            ),
            asyncio.to_thread(
                lambda: supabase.table("ticket_history")
                .select("id, complaint_id, old_status, new_status, note, created_at")
                .eq("changed_by", worker_id)
                .order("created_at", desc=True)
                .limit(10)
                .execute()
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Worker dashboard fetch failed: {str(e)}")

    payload = {
        "workerId": worker_id,
        "workerProfile": worker_profile_res.data,
        "complaints": complaints_res.data or [],
        "activityHistory": history_res.data or [],
    }

    # Cache for 2 minutes (worker data changes frequently with task updates)
    if redis_client:
        try:
            redis_client.setex(cache_key, 120, json.dumps(payload))
        except Exception as e:
            print(f"Redis write error: {e}")

    return {"source": "database", **payload}


@app.get("/api/worker/profile")
async def get_worker_profile_data(
    authorization: Optional[str] = Header(None),
):
    """
    Consolidated worker profile endpoint.
    Returns personal profile, worker role profile, comprehensive complaints, and ticket history.
    Used by /worker/profile for performance metrics and trends.
    """
    worker_id = get_citizen_id_from_token(authorization)
    if not worker_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    cache_key = f"worker:profile:v2:{worker_id}"
    if redis_client:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                return {"source": "cache", **json.loads(cached)}
        except Exception as e:
            print(f"Redis read error: {e}")

    try:
        [profile_res, worker_profile_res, complaints_res, history_res] = await asyncio.gather(
            asyncio.to_thread(
                lambda: supabase.table("profiles")
                .select("full_name, email, city")
                .eq("id", worker_id)
                .maybe_single()
                .execute()
            ),
            asyncio.to_thread(
                lambda: supabase.table("worker_profiles")
                .select("department, joined_at, availability, total_resolved, current_complaint_id")
                .eq("worker_id", worker_id)
                .maybe_single()
                .execute()
            ),
            asyncio.to_thread(
                lambda: supabase.table("complaints")
                .select("id, status, created_at, resolved_at, updated_at, sla_deadline, assigned_worker_id")
                .eq("assigned_worker_id", worker_id)
                .execute()
            ),
            asyncio.to_thread(
                lambda: supabase.table("ticket_history")
                .select("id, note, created_at")
                .eq("changed_by", worker_id)
                .order("created_at", desc=True)
                .limit(200)
                .execute()
            ),
        )
    except Exception as e:
        print(f"Parallel fetch error in /api/worker/profile: {e}")
        raise HTTPException(status_code=500, detail=f"Data fetch failed: {str(e)}")

    if not profile_res.data or not worker_profile_res.data:
        raise HTTPException(status_code=404, detail="Worker profile not found.")

    payload = {
        "profile": profile_res.data,
        "workerProfile": worker_profile_res.data,
        "complaints": complaints_res.data or [],
        "ticketHistory": history_res.data or [],
    }

    # Cache for 5 minutes (stats change slower on profile than dashboard)
    if redis_client:
        try:
            redis_client.setex(cache_key, 300, json.dumps(payload))
        except Exception as e:
            print(f"Redis write error: {e}")

    return {"source": "database", **payload}


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
