"""
whatsapp_webhook.py  –  JanSamadhan WhatsApp Bot
=================================================
Add this file to your project and register the router in main.py:

    from whatsapp_webhook import router as whatsapp_router
    app.include_router(whatsapp_router)

Required environment variables (add to your Render env):
    WHATSAPP_TOKEN          – your permanent / temporary access token
    WHATSAPP_PHONE_NUMBER_ID – the phone-number-id from Meta API Setup page
    WHATSAPP_VERIFY_TOKEN   – any string you choose (used for webhook verification)
"""

import os
import json
import uuid
import hashlib
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from io import BytesIO
from typing import Optional


import httpx
from fastapi import APIRouter, Request, Response, HTTPException
from PIL import Image

# ── reuse everything from shared.py (avoids circular import) ────────────────
from shared import (
    gemini_client,
    supabase,
    GEMINI_PRIMARY_MODEL,
    GEMINI_FALLBACK_MODEL,
    CHILD_CATEGORIES,
    SEVERITY_MAP,
    upload_image_to_supabase,
    reverse_geocode_from_coordinates,
    route_authority,
    _find_active_spatial_duplicate,
    build_complaint_record,
)

# ── config ────────────────────────────────────────────────────────────────────
WHATSAPP_TOKEN           = os.getenv("WHATSAPP_TOKEN", "")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
WHATSAPP_VERIFY_TOKEN    = os.getenv("WHATSAPP_VERIFY_TOKEN", "jansamadhan_verify")
GRAPH_API_URL            = f"https://graph.facebook.com/v22.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"

# In-memory session store  { phone_number: { ...session data } }
# For production, replace with Redis or Supabase table
SESSIONS: dict = {}

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])


# ═══════════════════════════════════════════════════════════════════════════════
# 1. WEBHOOK VERIFICATION  (Meta calls this once when you save the webhook URL)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/webhook")
async def verify_webhook(request: Request):
    params = dict(request.query_params)
    mode      = params.get("hub.mode")
    token     = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and token == WHATSAPP_VERIFY_TOKEN:
        return Response(content=challenge, media_type="text/plain")

    raise HTTPException(status_code=403, detail="Webhook verification failed")


# ═══════════════════════════════════════════════════════════════════════════════
# 2. INCOMING MESSAGE HANDLER
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/webhook")
async def receive_message(request: Request):
    body = await request.json()

    try:
        entry    = body["entry"][0]
        changes  = entry["changes"][0]
        value    = changes["value"]
        messages = value.get("messages")
        if not messages:
            return {"status": "no_message"}

        msg    = messages[0]
        from_  = msg["from"]          # sender's WhatsApp number
        msg_id = msg["id"]
        mtype  = msg.get("type")

        if mtype == "text":
            text = msg["text"]["body"].strip().lower()
            await handle_text(from_, text)

        elif mtype == "image":
            image_id = msg["image"]["id"]
            await handle_image(from_, image_id)

        elif mtype == "location":
            lat = msg["location"]["latitude"]
            lng = msg["location"]["longitude"]
            await handle_location(from_, lat, lng)

        else:
            await send_text(from_, "Sorry, I only understand text messages, images, and locations right now.")

    except Exception as e:
        print(f"[WhatsApp webhook error] {e}")

    # Always return 200 so Meta doesn't retry
    return {"status": "ok"}


# ═══════════════════════════════════════════════════════════════════════════════
# 3. TEXT HANDLER
# ═══════════════════════════════════════════════════════════════════════════════

async def handle_text(phone: str, text: str):
    session = SESSIONS.get(phone, {})

    # ── greeting ──────────────────────────────────────────────────────────────
    if text in ("hi", "hello", "hey", "start", "namaste"):
        SESSIONS[phone] = {}
        await send_text(phone,
            "🙏 *Namaste! Welcome to JanSamadhan.*\n\n"
            "I help you report civic issues (potholes, garbage, broken lights, etc.).\n\n"
            "👉 *Send a photo* of the issue to get started!\n"
            "_(Make sure location is attached or send it separately.)_"
        )
        return

    # ── confirm ticket ─────────────────────────────────────────────────────────
    if text in ("confirm", "submit", "yes", "haan", "ok") and session.get("preview"):
        await confirm_ticket(phone, session)
        return

    # ── cancel ────────────────────────────────────────────────────────────────
    if text in ("cancel", "no", "nahi", "reset"):
        SESSIONS.pop(phone, None)
        await send_text(phone, "❌ Cancelled. Send *hi* to start again.")
        return

    # ── status check ──────────────────────────────────────────────────────────
    if text.startswith("status"):
        parts = text.split()
        ticket_id = parts[1].upper() if len(parts) > 1 else None
        await check_status(phone, ticket_id)
        return

    # ── fallback ──────────────────────────────────────────────────────────────
    await send_text(phone,
        "I didn't understand that. Try:\n"
        "• Send *hi* to start\n"
        "• Send a *photo* of the civic issue\n"
        "• Reply *confirm* to submit a pending ticket\n"
        "• Reply *status DL-2026-XXXXX* to check a ticket"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 4. IMAGE HANDLER  –  download → Gemini analyze → send preview
# ═══════════════════════════════════════════════════════════════════════════════

async def handle_image(phone: str, image_id: str):
    await send_text(phone, "📸 Got your photo! Analyzing the issue... Please wait.")

    # 1. Download image bytes from Meta
    try:
        image_bytes = await download_whatsapp_media(image_id)
    except Exception as e:
        await send_text(phone, f"❌ Could not download image: {e}")
        return

    # 2. Convert to PIL for Gemini
    try:
        pil_image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception:
        await send_text(phone, "❌ Could not read image. Please send a clear JPEG or PNG.")
        return

    # 3. Run Gemini classification (same prompt as your /analyze endpoint)
    try:
        result = await classify_image_with_gemini(pil_image)
    except Exception as e:
        await send_text(phone, f"❌ AI analysis failed: {e}")
        return

    # 4. Store image + result in session; ask for location
    SESSIONS[phone] = {
        "image_bytes": image_bytes,
        "gemini_result": result,
        "state": "awaiting_location",
    }

    await send_text(phone,
        f"✅ *Issue detected:* {result['issue_name']}\n"
        f"📋 *{result['title']}*\n"
        f"🔴 Severity: {result['severity']}\n\n"
        "📍 Now please *share your location* so I can complete the ticket.\n"
        "_(Tap the 📎 attachment icon → Location)_"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 5. LOCATION HANDLER  –  finalize preview, prompt to confirm
# ═══════════════════════════════════════════════════════════════════════════════

async def handle_location(phone: str, lat: float, lng: float):
    session = SESSIONS.get(phone, {})

    if session.get("state") != "awaiting_location":
        await send_text(phone, "Please send a *photo* of the issue first, then share your location.")
        return

    result       = session["gemini_result"]
    image_bytes  = session["image_bytes"]

    # Reverse geocode
    try:
        location = reverse_geocode_from_coordinates(lat, lng)
    except Exception:
        location = {
            "pincode": "000000", "locality": "Unknown", "city": "Delhi",
            "district": "Delhi", "state": "Delhi",
            "formatted_address": f"Lat {lat:.5f}, Lng {lng:.5f}", "digipin": ""
        }

    # Route authority using location (so preview matches what gets saved)
    category = CHILD_CATEGORIES[result["child_id"]]
    routed_authority = route_authority(
        issue_type=category["name"],
        latitude=lat,
        longitude=lng,
        location=location,
        default_authority=category["authority"],
    )

    # Build preview
    preview = {
        "child_id":    result["child_id"],
        "issue_name":  result["issue_name"],
        "authority":   routed_authority,
        "title":       result["title"],
        "description": result["description"],
        "severity":    result["severity"],
        "severity_db": result["severity_db"],
        "latitude":    lat,
        "longitude":   lng,
        "location":    location,
        "image_bytes": image_bytes,
    }

    SESSIONS[phone] = {**session, "preview": preview, "state": "awaiting_confirm"}

    address_short = location.get("locality") or location.get("formatted_address", "")[:60]
    await send_text(phone,
        f"📋 *Ticket Preview*\n"
        f"━━━━━━━━━━━━━━━━━\n"
        f"🔖 Issue: {result['issue_name']}\n"
        f"📌 Title: {result['title']}\n"
        f"🏛 Authority: {result['authority']}\n"
        f"🔴 Severity: {result['severity']}\n"
        f"📍 Location: {address_short}\n"
        f"━━━━━━━━━━━━━━━━━\n\n"
        f"Reply *confirm* to submit this ticket ✅\n"
        f"Reply *cancel* to discard ❌"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 6. CONFIRM  –  write to Supabase
# ═══════════════════════════════════════════════════════════════════════════════

async def confirm_ticket(phone: str, session: dict):
    preview = session["preview"]

    await send_text(phone, "⏳ Submitting your complaint...")

    try:
        # Upload image to Supabase Storage
        filename  = f"{uuid.uuid4()}.jpg"
        photo_url = upload_image_to_supabase(preview["image_bytes"], filename)
        photo_urls = [photo_url]
    except Exception:
        photo_urls = []

    lat      = preview["latitude"]
    lng      = preview["longitude"]
    location = preview["location"]
    child_id = preview["child_id"]
    category = CHILD_CATEGORIES[child_id]

    # Use the authority already shown in the preview (computed during handle_location)
    routed_authority = preview["authority"]

    location_wkt  = f"POINT({lng} {lat})"
    address_text  = location.get("formatted_address", f"Lat {lat}, Lng {lng}")
    timestamp_str = datetime.now(timezone.utc).isoformat()

    # WhatsApp users don't have a Supabase JWT — use a dedicated bot user ID
    # Set WHATSAPP_BOT_USER_ID in your Render env to a valid Supabase user UUID
    citizen_id = os.getenv("WHATSAPP_BOT_USER_ID", "00000000-0000-0000-0000-000000000000")

    try:
        response = supabase.table("complaints").insert({
            "citizen_id":          citizen_id,
            "category_id":         child_id,
            "title":               preview["title"],
            "description":         preview["description"],
            "severity":            preview["severity_db"],
            "effective_severity":  preview["severity_db"],
            "status":              "submitted",
            "location":            location_wkt,
            "ward_name":           location.get("locality") or "Unknown",
            "pincode":             location.get("pincode") or "000000",
            "digipin":             location.get("digipin") or "",
            "address_text":        address_text,
            "photo_urls":          photo_urls,
            "photo_count":         len(photo_urls),
            "assigned_department": routed_authority,
            "city":                location.get("city") or "Delhi",
            "upvote_count":        0,
            "is_spam":             False,
            "possible_duplicate":  bool(_find_active_spatial_duplicate(category_id=child_id, latitude=lat, longitude=lng)),
            "sla_breached":        False,
            "escalation_level":    0,
            "upvote_boost":        0,
        }).execute()
    except Exception as e:
        await send_text(phone, f"❌ Failed to submit complaint: {e}")
        return

    if not response.data:
        await send_text(phone, "❌ Submission failed. Please try again.")
        return

    inserted  = response.data[0]
    ticket_id = inserted.get("ticket_id") or inserted.get("id", "PENDING")

    SESSIONS.pop(phone, None)   # clear session

    await send_text(phone,
        f"✅ *Complaint Submitted Successfully!*\n\n"
        f"🎫 Ticket ID: *{ticket_id}*\n"
        f"🏛 Assigned to: {routed_authority}\n"
        f"📍 {address_text[:80]}\n\n"
        f"You can track your complaint at:\n"
        f"🔗 https://jansamadhan.perkkk.dev/citizen\n\n"
        f"Thank you for helping improve your city! 🙏"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 7. STATUS CHECK
# ═══════════════════════════════════════════════════════════════════════════════

async def check_status(phone: str, ticket_id: Optional[str]):
    if not ticket_id:
        await send_text(phone, "Please provide a ticket ID. Example: *status DL-2026-00042*")
        return

    try:
        rows = supabase.table("complaints").select(
            "ticket_id, title, status, assigned_department, created_at"
        ).eq("ticket_id", ticket_id).limit(1).execute()
    except Exception as e:
        await send_text(phone, f"❌ Could not fetch status: {e}")
        return

    if not rows.data:
        await send_text(phone, f"❌ No ticket found with ID *{ticket_id}*.")
        return

    t = rows.data[0]
    await send_text(phone,
        f"📋 *Ticket Status*\n"
        f"━━━━━━━━━━━━━━\n"
        f"🎫 ID: {t.get('ticket_id')}\n"
        f"📌 {t.get('title')}\n"
        f"🏛 {t.get('assigned_department')}\n"
        f"🔄 Status: *{t.get('status', 'unknown').upper()}*\n"
        f"📅 Filed: {str(t.get('created_at', ''))[:10]}"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 8. GEMINI IMAGE CLASSIFICATION  (mirrors your /analyze endpoint logic)
# ═══════════════════════════════════════════════════════════════════════════════

async def classify_image_with_gemini(pil_image: Image.Image) -> dict:
    from google.genai import types as genai_types

    child_list = "\n".join(
        f"{cid}: {cat['name']} (authority={cat['authority']})"
        for cid, cat in CHILD_CATEGORIES.items()
    )

    prompt = f"""You are a civic-issue classifier for an Indian city grievance system.

Analyse the image and respond ONLY with a valid JSON object — no markdown, no extra text.

Available issue categories (id: name):
{child_list}

Return exactly:
{{
  "child_id": <integer from the list above>,
  "title": "<short 8-word title>",
  "description": "<2-3 sentence description>",
  "severity": "<Low|Medium|High|Critical>",
  "confidence": <0.0-1.0>
}}
"""

    import io
    buf = io.BytesIO()
    pil_image.save(buf, format="JPEG", quality=85)
    image_bytes = buf.getvalue()

    for model in [GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL]:
        try:
            response = gemini_client.models.generate_content(
                model=model,
                contents=[
                    genai_types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                    prompt,
                ],
            )
            raw = response.text.strip()
            # strip markdown fences if present
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            result = json.loads(raw)
            break
        except Exception as e:
            print(f"[Gemini {model}] error: {e}")
            result = None

    if not result:
        raise ValueError("Gemini could not classify the image.")

    child_id = int(result["child_id"])
    if child_id not in CHILD_CATEGORIES:
        child_id = 16   # default: Garbage Collection

    category     = CHILD_CATEGORIES[child_id]
    severity_lbl = result.get("severity", "Medium")
    severity_db  = {"Low": "L1", "Medium": "L2", "High": "L3", "Critical": "L4"}.get(severity_lbl, "L2")

    return {
        "child_id":    child_id,
        "issue_name":  category["name"],
        "authority":   category["authority"],
        "parent_id":   category["parent"],
        "title":       result.get("title", category["name"]),
        "description": result.get("description", ""),
        "severity":    severity_lbl,
        "severity_db": severity_db,
        "confidence":  float(result.get("confidence", 0.8)),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 9. SEND A TEXT MESSAGE VIA WHATSAPP API
# ═══════════════════════════════════════════════════════════════════════════════

async def send_text(phone: str, text: str):
    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "text",
        "text": {"body": text},
    }
    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(GRAPH_API_URL, json=payload, headers=headers)
        if resp.status_code != 200:
            print(f"[send_text error] {resp.status_code}: {resp.text}")


# ═══════════════════════════════════════════════════════════════════════════════
# 10. DOWNLOAD MEDIA FROM META
# ═══════════════════════════════════════════════════════════════════════════════

async def download_whatsapp_media(media_id: str) -> bytes:
    headers = {"Authorization": f"Bearer {WHATSAPP_TOKEN}"}

    async with httpx.AsyncClient(timeout=15) as client:
        # Step 1: get download URL
        meta_resp = await client.get(
            f"https://graph.facebook.com/v22.0/{media_id}",
            headers=headers,
        )
        meta_resp.raise_for_status()
        media_url = meta_resp.json()["url"]

        # Step 2: download the actual bytes
        file_resp = await client.get(media_url, headers=headers)
        file_resp.raise_for_status()
        return file_resp.content