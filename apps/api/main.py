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
import httpx

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header, Response
from fastapi.responses import JSONResponse
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
    send_resend_email,
    AI_SERVICE_URL,
)

# Global constants for direct Supabase REST API calls (bypassing supabase-py bugs)
SERVICE_BASE_URL = SUPABASE_URL
SERVICE_API_KEY = SUPABASE_SERVICE_KEY


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
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "x-request-id"],
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


class ReviewSubmission(BaseModel):
    complaint_id: str
    rating: int        # 1-5
    feedback: Optional[str] = None


class MaterialRequestCreate(BaseModel):
    complaint_id: str
    material_id: str
    quantity: int
    notes: Optional[str] = None


class MaterialAllotRequest(BaseModel):
    request_id: str
    status: str # 'allotted' or 'rejected'
    notes: Optional[str] = None


class AdminAuthorityUpdate(BaseModel):
    authority_id: str
    department: str


class AdminAuthorityCreate(BaseModel):
    full_name: str
    email: str
    password: str
    phone: Optional[str] = None
    city: Optional[str] = None
    department: str


class AdminWorkerUpdate(BaseModel):
    worker_id: str
    department: str


class AdminWorkerCreate(BaseModel):
    full_name: str
    email: str
    password: str
    phone: Optional[str] = None
    city: Optional[str] = None
    department: str


class ComplaintAssignRequest(BaseModel):
    complaint_id: str
    worker_id: Optional[str] = None
    status: str


class CameraAnalyzeRequest(BaseModel):
    camera_id: str



@app.post("/cctv/analyze_live")
async def cctv_analyze_live(
    request: CameraAnalyzeRequest,
    x_request_id: Optional[str] = Header(None, alias="x-request-id")
):
    """
    Proxy request to the AI Service.
    """
    if not AI_SERVICE_URL:
        raise HTTPException(status_code=503, detail="AI Service not configured on backend.")

    base_url = AI_SERVICE_URL.strip()
    if not base_url.startswith(("http://", "https://")):
        base_url = f"https://{base_url}"
    target_url = f"{base_url.rstrip('/')}/cctv/analyze_live"
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                target_url,
                json=request.dict(),
                headers={"x-request-id": x_request_id} if x_request_id else {},
                timeout=60.0
            )
            data = resp.json()
            return JSONResponse(status_code=resp.status_code, content=data)
        except Exception as e:
            print(f"[AI Proxy Error] {e}")
            raise HTTPException(status_code=502, detail=f"Failed to reach AI service: {str(e)}")


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


async def require_admin(authorization: Optional[str]) -> str:
    """Verify the caller has the 'admin' role in the profiles table."""
    user_id = get_citizen_id_from_token(authorization)
    try:
        res = await asyncio.to_thread(
            lambda: supabase.table("profiles").select("role").eq("id", user_id).maybe_single().execute()
        )
        if not res.data or res.data.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Forbidden. Admin role required.")
        return user_id
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Admin validation failed: {str(e)}")



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

    # --- Background Email Notification ---
    asyncio.create_task(send_resend_email(
        ticket_id=inserted.get("ticket_id") or inserted["id"],
        title=title,
        authority=routed_authority,
        severity=severity_db,
        ward=derived_ward_name,
        city=complaint_record.get("city", "Delhi"),
        address=address_text
    ))

    return response_obj


# =========================================================
# 8b. CITIZEN TICKETS (with Redis Caching & Delta support)
# =========================================================

@app.get("/citizen/nearby")
async def get_citizen_nearby(authorization: Optional[str] = Header(None)):
    """
    Fetch all complaints for the nearby map, excluding the citizen's own tickets.
    Cached in Redis.
    """
    citizen_id = get_citizen_id_from_token(authorization)
    cache_key = "global:citizen:nearby_tickets"

    if redis_client:
        try:
            cached_data = redis_client.get(cache_key)
            if cached_data:
                all_tickets = json.loads(cached_data)
                filtered_tickets = [t for t in all_tickets if t.get("citizen_id") != citizen_id]
                return {"source": "cache", "items": filtered_tickets}
        except Exception as e:
            print(f"Redis read error: {e}")

    try:
        response = supabase.table("complaints").select(
            "id, ticket_id, title, description, severity, effective_severity, location, "
            "photo_urls, upvote_count, status, created_at, address_text, ward_name, "
            "category_id, assigned_department, citizen_id"
        ).order("upvote_count", desc=True).limit(500).execute()
        
        all_tickets = response.data or []
        
        if redis_client:
            try:
                redis_client.setex(cache_key, 300, json.dumps(all_tickets)) # 5 minute cache
            except Exception as e:
                print(f"Redis write error: {e}")

        filtered_tickets = [t for t in all_tickets if t.get("citizen_id") != citizen_id]
        return {"source": "database", "items": filtered_tickets}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")



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
        "id, ticket_id, title, address_text, assigned_department, status, created_at, upvote_count, reviews(rating)"
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


@app.post("/api/complaints/review")
async def submit_complaint_review(
    review: ReviewSubmission,
    authorization: Optional[str] = Header(None)
):
    """
    Allow citizens to rate resolved tickets.
    Updates worker performance via DB trigger on the 'reviews' table.
    """
    citizen_id = get_citizen_id_from_token(authorization)

    # 1. Fetch complaint to verify ownership, status, and assigned worker
    try:
        comp_res = await asyncio.to_thread(
            lambda: supabase.table("complaints")
            .select("id, status, citizen_id, assigned_worker_id")
            .eq("id", review.complaint_id)
            .maybe_single()
            .execute()
        )
        complaint = comp_res.data
        if not complaint:
            raise HTTPException(status_code=404, detail="Complaint not found")
        
        if complaint["citizen_id"] != citizen_id:
            raise HTTPException(status_code=403, detail="You can only rate your own tickets")
        
        if complaint["status"] not in ["resolved", "rejected"]:
            raise HTTPException(status_code=400, detail="Only resolved or rejected tickets can be rated")
        
        if not complaint.get("assigned_worker_id"):
            raise HTTPException(status_code=400, detail="No worker was assigned to this ticket")

        # 2. Insert the review
        # The 'worker_id' column in the 'reviews' table triggers the performance update in 'worker_profiles'
        review_res = await asyncio.to_thread(
            lambda: supabase.table("reviews").insert({
                "complaint_id": review.complaint_id,
                "citizen_id":   citizen_id,
                "worker_id":    complaint["assigned_worker_id"],
                "rating":       review.rating,
                "feedback":     review.feedback
            }).execute()
        )
        
        if not review_res.data:
            raise HTTPException(status_code=500, detail="Failed to save review")

        # Invalidate any authority/worker caches so they see the fresh rating
        if redis_client:
            try:
                # Invalidate worker dashboard and profiles for the specific worker
                wid = complaint["assigned_worker_id"]
                redis_client.delete(f"worker:dashboard:{wid}")
                redis_client.delete(f"worker:profile:v2:{wid}")
                # Plus any generic authority worker lists (lazy: wipe all, or pattern match)
                for key in redis_client.scan_iter("authority:workers:*"):
                    redis_client.delete(key)
            except Exception as e:
                print(f"Redis invalidation on review failed: {e}")

        return {"status": "success", "message": "Review submitted"}

    except HTTPException:
        raise
    except Exception as e:
        # Check for unique constraint violation (one review per complaint)
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="This ticket has already been rated")
        raise HTTPException(status_code=500, detail=f"Review submission failed: {str(e)}")


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



@app.patch("/api/admin/authorities")
async def update_admin_authority(
    payload: AdminAuthorityUpdate,
    authorization: Optional[str] = Header(None)
):
    """Update authority department and invalidate Redis cache."""
    await require_admin(authorization)
    
    try:
        # 1. Update Profile
        await asyncio.to_thread(
            lambda: supabase.table("profiles")
            .update({"department": payload.department})
            .eq("id", payload.authority_id)
            .execute()
        )

        # 2. Update active complaints assigned to this officer
        active_statuses = ["submitted", "under_review", "assigned", "in_progress", "escalated"]
        await asyncio.to_thread(
            lambda: supabase.table("complaints")
            .update({"assigned_department": payload.department})
            .eq("assigned_officer_id", payload.authority_id)
            .in_("status", active_statuses)
            .execute()
        )

        # 3. Invalidate Redis Cache
        if redis_client:
            try:
                redis_client.delete("admin:authorities:list")
            except Exception as e:
                print(f"Redis invalidation failed: {e}")

        return {"status": "success", "message": "Authority department updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update authority: {str(e)}")


@app.post("/api/admin/authorities")
async def create_admin_authority(
    payload: AdminAuthorityCreate,
    authorization: Optional[str] = Header(None)
):
    """Create a new authority: Auth user + Profile + Redis invalidation."""
    await require_admin(authorization)
    
    try:
        # 1. Create Auth User
        auth_res = await asyncio.to_thread(
            lambda: supabase.auth.admin.create_user({
                "email": payload.email,
                "password": payload.password,
                "email_confirm": True,
                "user_metadata": {
                    "full_name": payload.full_name,
                    "role": "authority",
                    "department": payload.department
                }
            })
        )
        
        user_id = auth_res.user.id

        # 2. Create Profile
        await asyncio.to_thread(
            lambda: supabase.table("profiles").upsert({
                "id": user_id,
                "email": payload.email,
                "full_name": payload.full_name,
                "phone": payload.phone,
                "city": payload.city,
                "department": payload.department,
                "role": "authority",
                "is_blocked": False
            }, on_conflict="id").execute()
        )

        # 3. Invalidate Redis
        if redis_client:
            try:
                redis_client.delete("admin:authorities:list")
            except Exception as e:
                print(f"Redis invalidation failed: {e}")

        return {"status": "success", "id": user_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create authority: {str(e)}")


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
            asyncio.to_thread(lambda: supabase.table("worker_profiles").select("worker_id, department, availability, total_resolved, average_rating, total_reviews").execute()),
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


@app.patch("/api/admin/workers")
async def update_admin_worker(
    payload: AdminWorkerUpdate,
    authorization: Optional[str] = Header(None)
):
    """Update worker department, upsert worker_profile, and invalidate Redis cache."""
    await require_admin(authorization)
    
    try:
        # 1. Update Profile
        await asyncio.to_thread(
            lambda: supabase.table("profiles")
            .update({"department": payload.department})
            .eq("id", payload.worker_id)
            .execute()
        )

        # 2. Upsert Worker Profile details
        await asyncio.to_thread(
            lambda: supabase.table("worker_profiles")
            .upsert({
                "worker_id": payload.worker_id,
                "department": payload.department,
                "availability": "available"
            }, on_conflict="worker_id")
            .execute()
        )

        # 3. Update active complaints assigned to this worker
        active_statuses = ["submitted", "under_review", "assigned", "in_progress", "escalated"]
        await asyncio.to_thread(
            lambda: supabase.table("complaints")
            .update({"assigned_department": payload.department})
            .eq("assigned_worker_id", payload.worker_id)
            .in_("status", active_statuses)
            .execute()
        )

        # 4. Invalidate Redis Cache
        if redis_client:
            try:
                redis_client.delete("admin:workers:list")
            except Exception as e:
                print(f"Redis invalidation failed: {e}")

        return {"status": "success", "message": "Worker department updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update worker: {str(e)}")


@app.post("/api/admin/workers")
async def create_admin_worker(
    payload: AdminWorkerCreate,
    authorization: Optional[str] = Header(None)
):
    """Create a new worker: Auth user + Profile + Worker Profile + Redis invalidation."""
    await require_admin(authorization)
    
    try:
        # 1. Create Auth User
        auth_res = await asyncio.to_thread(
            lambda: supabase.auth.admin.create_user({
                "email": payload.email,
                "password": payload.password,
                "email_confirm": True,
                "user_metadata": {
                    "full_name": payload.full_name,
                    "role": "worker",
                    "department": payload.department
                }
            })
        )
        
        user_id = auth_res.user.id

        # 2. Create Profile
        await asyncio.to_thread(
            lambda: supabase.table("profiles").upsert({
                "id": user_id,
                "email": payload.email,
                "full_name": payload.full_name,
                "phone": payload.phone,
                "city": payload.city,
                "department": payload.department,
                "role": "worker",
                "is_blocked": False
            }, on_conflict="id").execute()
        )

        # 3. Create Worker Profile details
        await asyncio.to_thread(
            lambda: supabase.table("worker_profiles").upsert({
                "worker_id": user_id,
                "department": payload.department,
                "city": payload.city or "Unknown",
                "availability": "available"
            }, on_conflict="worker_id").execute()
        )

        # 4. Invalidate Redis
        if redis_client:
            try:
                redis_client.delete("admin:workers:list")
            except Exception as e:
                print(f"Redis invalidation failed: {e}")

        return {"status": "success", "id": user_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create worker: {str(e)}")




@app.patch("/api/authority/assign")
async def assign_complaint(
    payload: ComplaintAssignRequest,
    authorization: Optional[str] = Header(None)
):
    """Assign/Unassign worker to a complaint and invalidate caches."""
    user_id = get_citizen_id_from_token(authorization)
    # Role check: must be admin or authority
    res = await asyncio.to_thread(lambda: supabase.table("profiles").select("role").eq("id", user_id).maybe_single().execute())
    
    current_role = (res.data.get("role") or "").lower() if res.data else ""
    print(f"DEBUG: User {user_id} has role: '{current_role}'")
    
    if current_role not in ["admin", "authority"]:
        print(f"DEBUG: Role check failed for user {user_id}. Role found: {current_role}")
        raise HTTPException(status_code=403, detail=f"Forbidden. {current_role.capitalize() if current_role else 'Unknown'} role not authorized for assignment.")


    try:
        # Update complaint
        print(f"DEBUG: Authority {user_id} assigning worker {payload.worker_id} to complaint {payload.complaint_id}")
        
        res = await asyncio.to_thread(
            lambda: supabase.rpc("assign_worker_to_complaint", {
                "p_admin_id": user_id,
                "p_complaint_id": payload.complaint_id,
                "p_worker_id": payload.worker_id if payload.worker_id else None
            }).execute()
        )
        
        if hasattr(res, 'error') and res.error:
            print(f"DEBUG: Assignment DB Error: {res.error}")
            raise Exception(str(res.error))

        # Invalidate Redis Caches
        if redis_client:
            try:
                # 1. Dashboard for THIS user (authority)
                redis_client.delete(f"authority:dashboard:{user_id}")
                # 2. Admin complaints list (Flush all since page/filters are dynamic)
                # Note: deleting the invalid key "admin:complaints:list"
                for key in redis_client.scan_iter("admin:complaints:*"):
                    redis_client.delete(key)
            except Exception as e:
                print(f"Redis invalidation failed: {e}")

        return {"status": "success"}
    except Exception as e:
        print(f"DEBUG: Full Assignment Exception: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Assignment failed: {str(e)}")



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
            "average_rating, total_reviews, "
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
    if not worker_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

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
                .select("last_location, average_rating, total_reviews")
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
                .select("department, joined_at, availability, total_resolved, current_complaint_id, average_rating, total_reviews")
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
# 8j. WAREHOUSE & MATERIAL TRACKING
# =========================================================

@app.get("/api/warehouse/inventory")
async def get_warehouse_inventory(
    authorization: Optional[str] = Header(None)
):
    """Fetch all materials from warehouse_inventory."""
    get_citizen_id_from_token(authorization)
    
    try:
        response = await asyncio.to_thread(
            lambda: supabase.table("warehouse_inventory")
            .select("*")
            .order("name")
            .execute()
        )
        return {"items": response.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch inventory: {str(e)}")


@app.post("/api/worker/material-request")
async def create_material_request(
    request: MaterialRequestCreate,
    authorization: Optional[str] = Header(None)
):
    """Worker requests materials for a complaint."""
    worker_id = get_citizen_id_from_token(authorization)
    
    try:
        # 1. Verify worker is assigned to this complaint using direct REST API
        async with httpx.AsyncClient() as client:
            comp_resp = await client.get(
                f"{SERVICE_BASE_URL}/rest/v1/complaints",
                params={
                    "id": f"eq.{request.complaint_id}",
                    "select": "id,assigned_worker_id"
                },
                headers={
                    "apikey": SERVICE_API_KEY,
                    "Authorization": f"Bearer {SERVICE_API_KEY}"
                },
                timeout=10.0
            )
        
        if comp_resp.status_code != 200:
            raise HTTPException(status_code=comp_resp.status_code, detail=f"Failed to verify complaint ({comp_resp.status_code}): {comp_resp.text}")
        
        comp_data = comp_resp.json()
        if not comp_data:
            raise HTTPException(status_code=404, detail="Complaint not found")
        
        # Check assignment
        if comp_data[0].get("assigned_worker_id") != worker_id:
            raise HTTPException(status_code=403, detail="You are not assigned to this complaint")
            
        # 2. Insert via direct REST API (bypasses supabase-py 204 bug)
        insert_payload = {
            "worker_id": worker_id,
            "complaint_id": request.complaint_id,
            "material_id": request.material_id,
            "requested_quantity": request.quantity,
            "status": "pending",
            "notes": request.notes
        }
        
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{SERVICE_BASE_URL}/rest/v1/material_requests",
                    json=insert_payload,
                    headers={
                        "apikey": SERVICE_API_KEY,
                        "Authorization": f"Bearer {SERVICE_API_KEY}",
                        "Content-Type": "application/json",
                        "Prefer": "return=representation",
                    },
                    timeout=15.0,
                )
            
            print(f"[material-request] PostgREST status={resp.status_code}")
            if resp.status_code in (200, 201):
                try:
                    data = resp.json()
                    return {"status": "success", "data": data[0] if isinstance(data, list) and data else data}
                except Exception as json_err:
                    print(f"[material-request] JSON parse error: {str(json_err)}")
                    return {"status": "success", "data": insert_payload}
            elif resp.status_code == 204:
                return {"status": "success", "data": insert_payload}
            else:
                err_text = resp.text[:500]
                print(f"[material-request] PostgREST error {resp.status_code}: {err_text}")
                raise HTTPException(status_code=resp.status_code, detail=f"PostgREST error ({resp.status_code}): {err_text}")
                
        except httpx.HTTPError as http_err:
            print(f"[material-request] httpx error: {repr(http_err)}")
            raise HTTPException(status_code=500, detail=f"HTTP connection error: {repr(http_err)}")
        except Exception as inner_e:
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Internal logic error: {type(inner_e).__name__}: {str(inner_e)}")
            
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Critical failure: {str(e)}")


@app.get("/api/authority/material-requests")
async def get_authority_material_requests(
    authorization: Optional[str] = Header(None)
):
    """Authority sees pending material requests."""
    get_citizen_id_from_token(authorization)
    
    try:
        # Authority sees pending material requests using direct REST API
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{SERVICE_BASE_URL}/rest/v1/material_requests",
                params={
                    "status": "eq.pending",
                    "select": "*,profiles:worker_id(full_name),complaints(ticket_id),warehouse_inventory(name,unit)",
                    "order": "created_at.desc"
                },
                headers={
                    "apikey": SERVICE_API_KEY,
                    "Authorization": f"Bearer {SERVICE_API_KEY}"
                },
                timeout=10.0
            )
        
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"Failed to fetch requests ({resp.status_code}): {resp.text}")
            
        return {"requests": resp.json()}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to fetch requests: {str(e)}")


@app.post("/api/authority/material-allot")
async def allot_material(
    request: MaterialAllotRequest,
    authorization: Optional[str] = Header(None)
):
    """Authority approves/allots or rejects material request."""
    get_citizen_id_from_token(authorization)
    
    try:
        # 1. Get the request details
        async with httpx.AsyncClient() as client:
            req_resp = await client.get(
                f"{SERVICE_BASE_URL}/rest/v1/material_requests",
                params={
                    "id": f"eq.{request.request_id}",
                    "select": "*,warehouse_inventory(available_quantity)"
                },
                headers={
                    "apikey": SERVICE_API_KEY,
                    "Authorization": f"Bearer {SERVICE_API_KEY}"
                },
                timeout=10.0
            )
        
        if req_resp.status_code != 200:
            raise HTTPException(status_code=req_resp.status_code, detail=f"Failed to fetch request ({req_resp.status_code}): {req_resp.text}")
        
        req_list = req_resp.json()
        if not req_list:
            raise HTTPException(status_code=404, detail="Request not found")
        
        req_data = req_list[0]
        if req_data["status"] != "pending":
            raise HTTPException(status_code=400, detail=f"Request is already {req_data['status']}")
            
        if request.status == "allotted":
            available = req_data["warehouse_inventory"]["available_quantity"]
            if available < req_data["requested_quantity"]:
                raise HTTPException(status_code=400, detail="Insufficient inventory for this request")
            
            # Decrement inventory using httpx
            async with httpx.AsyncClient() as client:
                inv_resp = await client.patch(
                    f"{SERVICE_BASE_URL}/rest/v1/warehouse_inventory",
                    params={"id": f"eq.{req_data['material_id']}"},
                    json={"available_quantity": available - req_data["requested_quantity"]},
                    headers={
                        "apikey": SERVICE_API_KEY,
                        "Authorization": f"Bearer {SERVICE_API_KEY}",
                        "Content-Type": "application/json"
                    },
                    timeout=10.0
                )
            if inv_resp.status_code not in (200, 201, 204):
                raise HTTPException(status_code=inv_resp.status_code, detail=f"Failed to update inventory ({inv_resp.status_code}): {inv_resp.text}")
            
        # 2. Update request status
        update_payload = {
            "status": request.status,
            "notes": request.notes,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        async with httpx.AsyncClient() as client:
            upd_resp = await client.patch(
                f"{SERVICE_BASE_URL}/rest/v1/material_requests",
                params={"id": f"eq.{request.request_id}"},
                json=update_payload,
                headers={
                    "apikey": SERVICE_API_KEY,
                    "Authorization": f"Bearer {SERVICE_API_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=representation"
                },
                timeout=10.0
            )
        
        if upd_resp.status_code not in (200, 201, 204):
            raise HTTPException(status_code=upd_resp.status_code, detail=f"Failed to update request status ({upd_resp.status_code}): {upd_resp.text}")
            
        upd_data = upd_resp.json() if upd_resp.status_code != 204 else update_payload
        return {"status": "success", "data": upd_data[0] if isinstance(upd_data, list) and upd_data else upd_data}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process allotment: {str(e)}")


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
