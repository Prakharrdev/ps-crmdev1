import os
import json
import uuid
import base64
from io import BytesIO
from typing import Optional, Dict, List

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from google import genai
from PIL import Image


# =========================================================
# 1. CONFIGURATION
# =========================================================

GEMINI_API_KEY    = os.getenv("GEMINI_API_KEY")
SUPABASE_URL      = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")   # service role — bypasses RLS

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable not set.")
if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")

gemini_client = genai.Client(api_key=GEMINI_API_KEY)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# =========================================================
# 2. FASTAPI INITIALIZATION
# =========================================================

app = FastAPI(
    title="Civic Issue Detection API",
    description="AI powered civic complaint classification system",
)

origins = [
    "https://jansamadhan.perkkk.dev",
    "http://localhost:3000"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    latitude: float
    longitude: float
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
    photo_urls: List[str]
    latitude: float
    longitude: float


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


# =========================================================
# 6. GEMINI ANALYSIS FUNCTION
# =========================================================

def analyze_issue_with_gemini(
    image: Image.Image,
    text: str,
    latitude: float,
    longitude: float,
) -> dict:

    def _call_gemini_json(local_prompt: str) -> dict:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[local_prompt, image],
            config={"temperature": 0},
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

=== STEP 2: LOCATION ANALYSIS ===
Use the coordinates to determine:
- The locality and neighbourhood in Delhi
- The exact Delhi ward name (Delhi has 272 MCD wards)
- The correct 6-digit pincode for that area
- Whether location is in NDMC zone (Connaught Place/Lutyens: approx 28.62-28.64 N, 77.19-77.23 E) or MCD zone

Device coordinates:
Latitude : {latitude}
Longitude: {longitude}

Zone disambiguation rules:
- NDMC zone coordinates -> prefer categories 23, 24, 25, 26
- All other Delhi coordinates -> prefer MCD categories unless image clearly shows NDMC infrastructure

=== STEP 3: USER DESCRIPTION ===
User description (supporting context only, image is primary):
{text}

=== STEP 4: CLASSIFICATION ===
Using STEPS 1 + 2 + 3 together, select the single best Child ID:

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

=== STEP 5: SEVERITY ===
Based on visual damage and safety risk:
- Low      = Minor issue, no immediate risk (dim light, small pothole)
- Medium   = Inconvenient but not dangerous (garbage pile, broken footpath)
- High     = Potential safety risk (exposed wire, large pothole, sewage overflow)
- Critical = Immediate danger to life or property (live wire on ground, collapsed structure)

=== OUTPUT ===
Return ONLY this exact JSON:
{{
  "child_id": <integer 1-42>,
  "title": "<5-10 word title describing issue and area>",
  "description": "<2-3 sentences: what is visible, what is wrong, where>",
  "severity": "<Low | Medium | High | Critical>",
  "ward_name": "<real Delhi ward name from coordinates>",
  "pincode": "<valid 6-digit Delhi pincode from coordinates>"
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
  "ward_name": "<ward name from coordinates>",
  "pincode": "<6-digit pincode from coordinates>"
}}
"""
        result = _call_gemini_json(fallback_prompt)

    child_id = result.get("child_id")
    if not isinstance(child_id, int) or child_id not in CHILD_CATEGORIES:
        raise HTTPException(status_code=500, detail=f"Gemini returned invalid child_id: {child_id}")

    if result.get("severity") not in {"Low", "Medium", "High", "Critical"}:
        raise HTTPException(status_code=500, detail=f"Gemini returned invalid severity: {result.get('severity')}")

    for field in ["title", "description", "ward_name", "pincode"]:
        if not result.get(field):
            raise HTTPException(status_code=500, detail=f"Gemini did not return required field: {field}")

    return result


# =========================================================
# 7. ANALYZE ENDPOINT  (preview only — does NOT write to DB)
# =========================================================

@app.post("/analyze", response_model=TicketPreview)
async def analyze(
    image: UploadFile = File(...),
    user_text: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    authorization: Optional[str] = Header(None),
):
    # Auth check — must be logged in
    get_citizen_id_from_token(authorization)

    image_data = await image.read()
    img = Image.open(BytesIO(image_data))

    result = analyze_issue_with_gemini(img, user_text, latitude, longitude)

    child_id = result["child_id"]
    category = CHILD_CATEGORIES[child_id]
    severity_db = SEVERITY_MAP[result["severity"]]

    return TicketPreview(
        child_id=child_id,
        issue_name=category["name"],
        parent_id=category["parent"],
        authority=category["authority"],
        title=result["title"],
        description=result["description"],
        severity=result["severity"],
        severity_db=severity_db,
        status="submitted",
        ward_name=result["ward_name"],
        pincode=result["pincode"],
        latitude=latitude,
        longitude=longitude,
        user_text=user_text,
        confirm_prompt="✅ Ticket preview ready. Type \"confirm\" or \"submit\" to raise this ticket, or describe the issue differently to re-analyse.",
    )


# =========================================================
# 8. CONFIRM ENDPOINT  (user confirms preview -> writes to DB)
# =========================================================

@app.post("/confirm", response_model=TicketCreated)
async def confirm(
    image: UploadFile = File(...),
    user_text: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    child_id: int = Form(...),
    title: str = Form(...),
    description: str = Form(...),
    severity_db: str = Form(...),     # L1 / L2 / L3 / L4
    ward_name: str = Form(...),
    pincode: str = Form(...),
    authorization: Optional[str] = Header(None),
):
    # 1. Extract citizen_id from JWT
    citizen_id = get_citizen_id_from_token(authorization)

    if child_id not in CHILD_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid child_id: {child_id}")

    if severity_db not in {"L1", "L2", "L3", "L4"}:
        raise HTTPException(status_code=400, detail=f"Invalid severity_db: {severity_db}")

    category = CHILD_CATEGORIES[child_id]

    # 2. Upload image to Supabase Storage
    image_data = await image.read()
    filename = f"{uuid.uuid4()}.jpg"
    try:
        photo_url = upload_image_to_supabase(image_data, filename)
        photo_urls = [photo_url]
    except Exception as e:
        # Non-fatal: store empty list if upload fails
        photo_urls = []

    # 3. Build PostGIS geography point string
    location_wkt = f"POINT({longitude} {latitude})"

    # 4. Insert complaint into Supabase
    # ticket_id is auto-generated by a DB trigger (e.g. DL-2026-XXXXX)
    try:
        response = supabase.table("complaints").insert({
            "citizen_id":          citizen_id,
            "category_id":         child_id,
            "title":               title,
            "description":         description,
            "severity":            severity_db,
            "status":              "submitted",
            "location":            location_wkt,
            "ward_name":           ward_name,
            "pincode":             pincode,
            "photo_urls":          photo_urls,
            "photo_count":         len(photo_urls),
            "assigned_department": category["authority"],
            "city":                "Delhi",
            "upvote_count":        0,
            "is_spam":             False,
            "sla_breached":        False,
            "escalation_level":    0,
            "upvote_boost":        0,
        }).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database insert failed: {str(e)}")

    if not response.data:
        raise HTTPException(status_code=500, detail="Database insert returned no data.")

    inserted = response.data[0]

    return TicketCreated(
        ticket_id=inserted.get("ticket_id", "PENDING"),
        complaint_id=inserted["id"],
        child_id=child_id,
        issue_name=category["name"],
        authority=category["authority"],
        title=title,
        severity_db=severity_db,
        status="submitted",
        ward_name=ward_name,
        pincode=pincode,
        photo_urls=photo_urls,
        latitude=latitude,
        longitude=longitude,
    )


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