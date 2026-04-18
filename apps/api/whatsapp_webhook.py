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
import asyncio

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
    send_resend_email,
    build_ticket_details_url,
)


# ── config ────────────────────────────────────────────────────────────────────
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "jansamadhan_verify").strip()

def get_whatsapp_token():
    return os.getenv("WHATSAPP_TOKEN", "").strip()

def get_graph_api_url():
    """Generates the URL dynamically to ensure environment changes are picked up."""
    id_val = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "").strip()
    return f"https://graph.facebook.com/v22.0/{id_val}/messages"

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

        elif mtype == "interactive":
            itype = msg["interactive"]["type"]
            if itype == "button_reply":
                button_id = msg["interactive"]["button_reply"]["id"]
                # Route button replies to handle_text to reuse existing logic
                if button_id == "confirm_ticket":
                    await handle_text(from_, "confirm")
                elif button_id == "cancel_ticket":
                    await handle_text(from_, "cancel")
            elif itype == "list_reply":
                list_id = msg["interactive"]["list_reply"]["id"]
                await handle_list_selection(from_, list_id)

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
    if text in ("hi", "hello", "hey", "start", "namaste", "menu", "help"):
        SESSIONS[phone] = {}
        await send_list_message(
            phone=phone,
            body_text=(
                "🙏 *Namaste! Welcome to JanSamadhan.*\n\n"
                "I am your virtual civic assistant. How can I help you today?"
            ),
            button_text="Main Menu ☰",
            sections=[
                {
                    "title": "Report an Issue",
                    "rows": [
                        {
                            "id": "menu_report_issue",
                            "title": "📸 Report Issue",
                            "description": "Upload a photo to report a civic issue"
                        }
                    ]
                },
                {
                    "title": "My Complaints",
                    "rows": [
                        {
                            "id": "menu_recent_tickets",
                            "title": "📋 Recent Tickets",
                            "description": "Track the status of your complaints"
                        },
                        {
                            "id": "menu_my_stats",
                            "title": "📊 My Statistics",
                            "description": "View your total reported issues"
                        }
                    ]
                }
            ]
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

    # ── account linking ───────────────────────────────────────────────────────
    if text.startswith("link-"):
        code = text.upper()
        await link_whatsapp_account(phone, code)
        return

    # ── fallback ──────────────────────────────────────────────────────────────
    await send_text(phone,
        "I didn't understand that. Please use the Menu by sending *Hi* or send a *photo* to report an issue."
    )


async def link_whatsapp_account(phone: str, code: str):
    """Links the WhatsApp phone number to the profile that matches the generated linking code."""
    db_phone = f"+{phone}" if not phone.startswith("+") else phone
    try:
        # Find the profile with this code
        resp = supabase.table("profiles").select("id, full_name").eq("whatsapp_link_code", code).execute()
        if not resp.data:
            await send_text(phone, f"❌ Invalid or expired linking code: *{code}*. Please generate a new one from the Web Portal.")
            return

        user_id = resp.data[0]["id"]
        full_name = resp.data[0].get("full_name") or "Citizen"

        # Update the profile with the phone number and clear the code to prevent reuse
        update_resp = supabase.table("profiles").update({
            "phone": db_phone,
            "whatsapp_link_code": None
        }).eq("id", user_id).execute()

        await send_text(phone, f"✅ *Success!* Your WhatsApp number has been successfully linked to your JanSamadhan account, *{full_name}*.\nAll reports submitted here will now sync to your dashboard.")
        
    except Exception as e:
        print(f"[link error] {e}")
        await send_text(phone, "⚠️ Sorry, an error occurred while linking your account. Please try again later.")


async def handle_list_selection(phone: str, list_id: str):
    """Routes the selected list item ID from WhatsApp interactive lists."""
    if list_id == "menu_report_issue":
        await send_text(phone, "📸 *Report an Issue*\nPlease send a clear photo of the civic issue (pothole, garbage, etc.) to get started.")
    elif list_id == "menu_recent_tickets":
        await handle_action_recent_tickets(phone)
    elif list_id == "menu_my_stats":
        await handle_action_stats(phone)
    elif list_id.startswith("view_ticket_"):
        ticket_id = list_id.replace("view_ticket_", "")
        await show_ticket_details(phone, ticket_id)
    else:
        await send_text(phone, "Invalid selection.")


async def get_citizen_id(phone: str) -> str:
    db_phone = f"+{phone}" if not phone.startswith("+") else phone
    try:
        resp = supabase.table("profiles").select("id").eq("phone", db_phone).execute()
        if resp.data and len(resp.data) > 0:
            return resp.data[0]["id"]
    except Exception as e:
        print("[auth error]", e)
    return os.getenv("WHATSAPP_BOT_USER_ID", "00000000-0000-0000-0000-000000000000")


async def handle_action_recent_tickets(phone: str):
    citizen_id = await get_citizen_id(phone)
    resp = supabase.table("complaints").select("id, ticket_id, title, status").eq("citizen_id", citizen_id).order("created_at", desc=True).limit(5).execute()
    
    if not resp.data:
        await send_text(phone, "You don't have any recent tickets. Send a photo to report an issue!")
        return

    rows = []
    for t in resp.data:
        status_clean = str(t['status']).replace('_', ' ').title()
        # Row layout: Title (Status), Description (Complaint title)
        # Title limit is 24 chars, description is 72 chars
        title_str = f"[{status_clean}]"[:24]
        desc_str = str(t['title'])[:72]
        
        rows.append({
            "id": f"view_ticket_{t['ticket_id']}",
            "title": title_str,
            "description": desc_str
        })

    await send_list_message(
        phone=phone,
        body_text="📋 *Your Recent Tickets*\nHere are your last 5 reports. Tap one to view details:",
        button_text="View Tickets 🔽",
        sections=[{"title": "Recent Complaints", "rows": rows}]
    )


async def handle_action_stats(phone: str):
    citizen_id = await get_citizen_id(phone)
    resp = supabase.table("complaints").select("id", count="exact").eq("citizen_id", citizen_id).execute()
    count = resp.count or 0
    await send_button_message(phone,
        f"📊 *My Statistics*\n\nYou have reported a total of *{count}* civic issues.\nThank you for keeping your city clean and safe! 🙏",
        [{"id": "menu_recent_tickets", "title": "🔙 Recent Tickets"}]
    )


async def show_ticket_details(phone: str, ticket_id_str: str):
    resp = supabase.table("complaints").select("*").eq("ticket_id", ticket_id_str).execute()
    if not resp.data:
        await send_text(phone, "❌ Ticket not found.")
        return
        
    t = resp.data[0]
    status_clean = str(t['status']).replace('_', ' ').title()
    body = (
        f"🎫 *Ticket: {t['ticket_id']}*\n"
        f"━━━━━━━━━━━━━━━━━\n"
        f"📌 *Title:* {t['title']}\n"
        f"🏛 *Authority:* {t.get('assigned_department') or 'Pending'}\n"
        f"🚦 *Status:* {status_clean}\n"
        f"🔴 *Severity:* {t['severity']}\n"
        f"📅 *Reported:* {str(t['created_at'])[:10]}\n"
    )
    if t.get('resolution_note'):
        body += f"📝 *Resolution:* {t['resolution_note']}\n"

    body += "━━━━━━━━━━━━━━━━━"
    await send_button_message(phone, body, [{"id": "menu_recent_tickets", "title": "🔙 Back to List"}])


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

    await send_location_request(phone,
        f"✅ *Issue detected:* {result['issue_name']}\n"
        f"📋 *{result['title']}*\n"
        f"🔴 Severity: {result['severity']}\n\n"
        "📍 Please tap *Send Location* below to complete your ticket.\n"
        "(Or reply *No* to cancel report)"
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
    await send_button_message(phone,
        (
            f"📋 *Ticket Preview*\n"
            f"━━━━━━━━━━━━━━━━━\n"
            f"🔖 Issue: {result['issue_name']}\n"
            f"📌 Title: {result['title']}\n"
            f"🏛 Authority: {result['authority']}\n"
            f"🔴 Severity: {result['severity']}\n"
            f"📍 Location: {address_short}\n"
            f"━━━━━━━━━━━━━━━━━\n\n"
            f"Please tap a button below to proceed:"
        ),
        [
            {"id": "confirm_ticket", "title": "Confirm ✅"},
            {"id": "cancel_ticket", "title": "Cancel ❌"}
        ]
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

    # Automatic Profile Lookup (Zero-Login)
    citizen_id = await get_citizen_id(phone)

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
    ticket_details_url = build_ticket_details_url(inserted.get("id"))

    SESSIONS.pop(phone, None)   # clear session

    await send_text(phone,
        f"✅ *Complaint Submitted Successfully!*\n\n"
        f"🎫 Ticket ID: *{ticket_id}*\n"
        f"🏛 Assigned to: {routed_authority}\n"
        f"📍 {address_text[:80]}\n\n"
        f"You can track your complaint at:\n"
        f"🔗 {ticket_details_url}\n\n"
        f"Thank you for helping improve your city! 🙏"
    )

    # --- Background Email Notification ---
    asyncio.create_task(send_resend_email(
        ticket_id=ticket_id,
        complaint_id=inserted.get("id"),
        title=preview["title"],
        authority=routed_authority,
        severity=preview["severity_db"],
        ward=location.get("locality") or "Unknown",
        city=location.get("city") or "Delhi",
        address=address_text,
        citizen_id=citizen_id,
        worker_id=None,
        event_type="complaint_created",
        status="submitted",
    ))



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
        "recipient_type": "individual",
        "to": phone,
        "type": "text",
        "text": {"body": text},
    }
    headers = {
        "Authorization": f"Bearer {get_whatsapp_token()}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(get_graph_api_url(), json=payload, headers=headers)
            if resp.status_code != 200:
                print(f"[send_text error] {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"[send_text exception] {e}")


async def send_location_request(phone: str, text: str):
    """
    Sends a native 'location_request_message' that triggers the mobile location picker.
    """
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": "interactive",
        "interactive": {
            "type": "location_request_message",
            "body": {
                "text": text
            },
            "action": {
                "name": "send_location"
            }
        }
    }
    headers = {
        "Authorization": f"Bearer {get_whatsapp_token()}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(get_graph_api_url(), json=payload, headers=headers)
            if resp.status_code != 200:
                print(f"[send_location_request error] {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"[send_location_request exception] {e}")


async def send_button_message(phone: str, body_text: str, buttons: list):
    """
    Sends an interactive message with up to 3 reply buttons.
    Each button in the list should be a dict: {"id": "unique_id", "title": "Button Title"}
    """
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "body": {
                "text": body_text
            },
            "action": {
                "buttons": [
                    {
                        "type": "reply",
                        "reply": {
                            "id": b["id"],
                            "title": b["title"]
                        }
                    } for b in buttons
                ]
            }
        }
    }
    headers = {
        "Authorization": f"Bearer {get_whatsapp_token()}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(get_graph_api_url(), json=payload, headers=headers)
            if resp.status_code != 200:
                print(f"[send_button_message error] {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"[send_button_message exception] {e}")


async def send_list_message(phone: str, body_text: str, button_text: str, sections: list):
    """
    Sends an interactive message of type 'list'.
    Sections should be formatted according to WhatsApp Cloud API structure.
    """
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": "interactive",
        "interactive": {
            "type": "list",
            "body": {
                "text": body_text
            },
            "action": {
                "button": button_text,
                "sections": sections
            }
        }
    }
    headers = {
        "Authorization": f"Bearer {get_whatsapp_token()}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(get_graph_api_url(), json=payload, headers=headers)
            if resp.status_code != 200:
                print(f"[send_list_message error] {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"[send_list_message exception] {e}")


async def send_list_message(phone: str, body_text: str, button_text: str, sections: list):
    """
    Sends an interactive message of type 'list'.
    Sections should be formatted according to WhatsApp Cloud API structure.
    """
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": "interactive",
        "interactive": {
            "type": "list",
            "body": {
                "text": body_text
            },
            "action": {
                "button": button_text,
                "sections": sections
            }
        }
    }
    headers = {
        "Authorization": f"Bearer {get_whatsapp_token()}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(get_graph_api_url(), json=payload, headers=headers)
        if resp.status_code != 200:
            print(f"[send_list_message error] {resp.status_code}: {resp.text}")


# ═══════════════════════════════════════════════════════════════════════════════
# 10. DOWNLOAD MEDIA FROM META
# ═══════════════════════════════════════════════════════════════════════════════

async def download_whatsapp_media(media_id: str) -> bytes:
    headers = {"Authorization": f"Bearer {get_whatsapp_token()}"}

    try:
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
    except Exception as e:
        print(f"[download_whatsapp_media exception] {e}")
        raise