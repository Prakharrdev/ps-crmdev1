import os
import re
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
from typing import Optional, Dict, List, Any, Tuple

# Load environment variables from the ai-service root
ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env", override=True)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    # Fallback for CI/Initial setup: allow it to be missing but warn
    print("WARNING: SUPABASE_URL or SUPABASE_SERVICE_KEY missing from .env")
else:
    print(f"DEBUG: Loaded URL: {SUPABASE_URL}")
    print(f"DEBUG: Key starts with: {SUPABASE_SERVICE_KEY[:10]}... ends with: {SUPABASE_SERVICE_KEY[-10:]}")

_client: Optional[Client] = None


class BackendConfigError(RuntimeError):
    """Raised when required backend runtime configuration is missing."""


def has_supabase_config() -> Tuple[bool, str]:
    has_url = bool(SUPABASE_URL)
    has_key = bool(SUPABASE_SERVICE_KEY)
    if has_url and has_key:
        return True, "OK"
    return False, f"SUPABASE_URL present={has_url}, SUPABASE_SERVICE_KEY present={has_key}"


def _diag(message: str, request_id: Optional[str] = None):
    prefix = f"[CCTV_DIAG][{request_id}]" if request_id else "[CCTV_DIAG]"
    print(f"{prefix} {message}")


def _extract_missing_column_name(error_text: str) -> Optional[str]:
    """Best-effort extraction of a missing column from PostgREST error text."""
    patterns = [
        r"Could not find the '([^']+)' column",
        r"column\s+[^\.]+\.([a-zA-Z0-9_]+)\s+does not exist",
    ]
    for pattern in patterns:
        match = re.search(pattern, error_text)
        if match:
            return match.group(1)
    return None


def _extract_invalid_enum_name(error_text: str) -> Optional[str]:
    """Extract enum type name from Postgres enum value errors."""
    match = re.search(r"invalid input value for enum\s+([a-zA-Z0-9_]+):", error_text)
    return match.group(1) if match else None


def _normalize_severity_enum(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip().upper()
    mapping = {
        "L1": "L1",
        "L1_LOW": "L1",
        "LOW": "L1",
        "L2": "L2",
        "L2_MEDIUM": "L2",
        "MEDIUM": "L2",
        "L3": "L3",
        "L3_HIGH": "L3",
        "HIGH": "L3",
        "L4": "L4",
        "L4_CRITICAL": "L4",
        "CRITICAL": "L4",
    }
    return mapping.get(text)

def get_supabase() -> Client:
    global _client
    if _client is None:
        ok, reason = has_supabase_config()
        if not ok:
            raise BackendConfigError(f"Supabase environment variables NOT properly set. {reason}")
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _client

def get_camera(camera_id: str, request_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Fetch camera details by ID."""
    try:
        sb = get_supabase()
        res = sb.table("cctv_cameras").select("*").eq("id", camera_id).single().execute()
        _diag(f"get_camera success camera_id={camera_id} found={bool(res.data)}", request_id)
        return res.data if res.data else None
    except BackendConfigError:
        raise
    except Exception as e:
        # PGRST116 typically means no rows for .single(); treat as not found.
        if "PGRST116" in str(e) or "0 rows" in str(e):
            _diag(f"get_camera not_found camera_id={camera_id}", request_id)
            return None
        _diag(f"get_camera failed camera_id={camera_id} error={e}", request_id)
        return None

def list_cameras() -> List[Dict[str, Any]]:
    """List all active cameras."""
    try:
        sb = get_supabase()
        res = sb.table("cctv_cameras").select("*").execute()
        return res.data if res.data else []
    except Exception as e:
        print(f"ERROR listing cameras: {e}")
        return []

def find_duplicate_complaint(
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    hours_back: int = 24,
    request_id: Optional[str] = None,
    digipin: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Exhaustive duplicate check: queries BOTH complaints table AND cctv_cameras table.
    Rule: SAME DIGIPIN = DUPLICATE TICKET. No time window. No exceptions.
    """
    if not digipin and (latitude is None or longitude is None):
        _diag("find_duplicate_complaint skipped: no location key provided", request_id)
        return None

    try:
        sb = get_supabase()

        # ── TABLE 1: complaints ─────────────────────────────────────────────────
        # Check for ANY unresolved ticket at this DIGIPIN in the complaints ledger
        if digipin:
            complaints_res = (
                sb.table("complaints")
                .select("id, digipin, status, ticket_id")
                .eq("digipin", digipin)
                .in_("status", ["submitted", "assigned", "in_progress", "escalated"])
                .limit(1)
                .execute()
            )
        else:
            complaints_res = (
                sb.table("complaints")
                .select("id, digipin, status, ticket_id")
                .eq("latitude", latitude).eq("longitude", longitude)
                .in_("status", ["submitted", "assigned", "in_progress", "escalated"])
                .limit(1)
                .execute()
            )

        if complaints_res.data:
            _diag(f"find_duplicate_complaint BLOCKED by complaints table digipin={digipin} ticket_id={complaints_res.data[0].get('id')}", request_id)
            return complaints_res.data[0]

        # ── TABLE 2: cctv_cameras ───────────────────────────────────────────────
        # Check if any camera at this DIGIPIN already shows an active ticket badge
        if digipin:
            cam_res = (
                sb.table("cctv_cameras")
                .select("id, digipin, last_status")
                .eq("digipin", digipin)
                .in_("last_status", ["Ticket Generated", "Pending Verification", "In Progress"])
                .limit(1)
                .execute()
            )
            if cam_res.data:
                _diag(f"find_duplicate_complaint BLOCKED by cctv_cameras table digipin={digipin} camera_id={cam_res.data[0].get('id')} status={cam_res.data[0].get('last_status')}", request_id)
                return {"id": f"CCTV-CAM-BLOCK-{cam_res.data[0].get('id')}", "digipin": digipin}

        _diag(f"find_duplicate_complaint CLEAR — no duplicate found digipin={digipin}", request_id)
        return None

    except Exception as e:
        _diag(f"find_duplicate_complaint failed error={e}", request_id)
        return None

def create_complaint(data: Dict[str, Any], request_id: Optional[str] = None) -> Dict[str, Any]:
    """Create a new complaint ticket in Supabase."""
    sb = get_supabase()

    payload = dict(data)

    # Normalize legacy CCTV payload keys to the complaints table shape used by apps/api.
    lat = payload.pop("latitude", None)
    lon = payload.pop("longitude", None)
    if "location" not in payload and lat is not None and lon is not None:
        payload["location"] = f"POINT({lon} {lat})"

    photo_url = payload.pop("photo_url", None)
    if "photo_urls" not in payload:
        payload["photo_urls"] = [photo_url] if photo_url else []
    if "photo_count" not in payload:
        payload["photo_count"] = len(payload.get("photo_urls", []))

    if "effective_severity" not in payload and payload.get("severity"):
        payload["effective_severity"] = payload["severity"]
    payload.setdefault("status", "submitted")
    payload.setdefault("upvote_count", 0)
    payload.setdefault("is_spam", False)
    payload.setdefault("possible_duplicate", False)
    payload.setdefault("sla_breached", False)
    payload.setdefault("escalation_level", 0)
    payload.setdefault("upvote_boost", 0)

    max_retries = 8
    for attempt in range(max_retries + 1):
        try:
            res = sb.table("complaints").insert(payload).execute()
            if not res.data:
                _diag("create_complaint failed no data returned", request_id)
                raise Exception("Failed to insert complaint into Supabase")
            created = res.data[0]
            created_id = created.get("id")
            if created_id and not created.get("ticket_id"):
                try:
                    hydrated = (
                        sb.table("complaints")
                        .select("id, ticket_id")
                        .eq("id", created_id)
                        .single()
                        .execute()
                    )
                    if hydrated.data and hydrated.data.get("ticket_id"):
                        created["ticket_id"] = hydrated.data.get("ticket_id")
                except Exception as hydrate_err:
                    _diag(f"create_complaint ticket_id hydration skipped error={hydrate_err}", request_id)

            _diag(
                f"create_complaint success complaint_id={created.get('id')} ticket_id={created.get('ticket_id')}",
                request_id,
            )
            return created
        except Exception as e:
            err_text = str(e)
            missing_col = _extract_missing_column_name(err_text)
            if missing_col and missing_col in payload and attempt < max_retries:
                payload.pop(missing_col, None)
                _diag(f"create_complaint retry dropping missing column={missing_col}", request_id)
                continue

            invalid_enum = _extract_invalid_enum_name(err_text)
            if invalid_enum and attempt < max_retries:
                enum_to_payload_field = {
                    "complaint_source": "source",
                    "complaint_status": "status",
                    "severity_level": "severity",
                }
                field = enum_to_payload_field.get(invalid_enum)
                if field and field in payload:
                    if field == "severity":
                        normalized = _normalize_severity_enum(payload.get("severity"))
                        if normalized:
                            payload["severity"] = normalized
                            if "effective_severity" in payload:
                                payload["effective_severity"] = normalized
                            _diag(f"create_complaint retry normalized severity={normalized}", request_id)
                            continue
                    payload.pop(field, None)
                    _diag(f"create_complaint retry dropping invalid enum field={field}", request_id)
                    continue
            raise

def update_camera_status(camera_id: str, status: str, request_id: Optional[str] = None, **extra_updates):
    """Update camera status and optional metadata in one write."""
    try:
        sb = get_supabase()
        updates = {"last_status": status}
        updates.update(extra_updates)
        sb.table("cctv_cameras").update(updates).eq("id", camera_id).execute()
        _diag(f"update_camera_status success camera_id={camera_id} status={status} updates={list(extra_updates.keys())}", request_id)
    except Exception as e:
        _diag(f"update_camera_status failed camera_id={camera_id} status={status} error={e}", request_id)

def log_analysis(log_data: Dict[str, Any], request_id: Optional[str] = None):
    """Log the AI analysis result."""
    try:
        sb = get_supabase()
        sb.table("cctv_analysis_logs").insert(log_data).execute()
        _diag(f"log_analysis success camera_id={log_data.get('camera_id')} complaint_id={log_data.get('complaint_id')}", request_id)
    except Exception as e:
        _diag(f"log_analysis failed error={e}", request_id)

def log_detection(camera_id: str, digipin: str, confidence: float, timestamp: str = None, request_id: Optional[str] = None):
    """Log a raw detection event to telemetry."""
    try:
        sb = get_supabase()
        from datetime import datetime
        now = timestamp or datetime.utcnow().isoformat()
        sb.table("detections_telemetry").insert({
            "camera_id": camera_id,
            "digipin": digipin,
            "confidence": confidence,
            "timestamp": now
        }).execute()
        _diag(f"log_detection success digipin={digipin} conf={confidence:.2f}", request_id)
    except Exception as e:
        _diag(f"log_detection failed error={e}", request_id)


def update_suspected_incident(digipin: str, status: str, confidence: float, camera_id: str, timestamp: str = None, request_id: Optional[str] = None):
    """Upsert a suspected incident record based on telemetry."""
    try:
        sb = get_supabase()
        from datetime import datetime
        now = timestamp or datetime.utcnow().isoformat()
        
        res = sb.table("suspected_incidents").select("*").eq("digipin", digipin).execute()
        row = res.data[0] if res.data else None
        
        if row:
            new_count = row.get('detection_count', 1) + 1
            new_max_conf = max(float(row.get('max_confidence', 0)), confidence)
            sb.table("suspected_incidents").update({
                "status": status,
                "last_detected": now,
                "detection_count": new_count,
                "max_confidence": new_max_conf,
                "last_camera_id": camera_id
            }).eq("digipin", digipin).execute()
        else:
            sb.table("suspected_incidents").insert({
                "digipin": digipin,
                "status": status,
                "first_detected": now,
                "last_detected": now,
                "detection_count": 1,
                "max_confidence": confidence,
                "last_camera_id": camera_id
            }).execute()
        _diag(f"update_suspected_incident success digipin={digipin} status={status}", request_id)
    except Exception as e:
        _diag(f"update_suspected_incident failed error={e}", request_id)


def count_detections_in_window(digipin: str, seconds: int, min_conf: float = 0.25, max_conf: float = 1.0, request_id: Optional[str] = None) -> int:
    """Count detections for a DIGIPIN within a sliding time window."""
    try:
        sb = get_supabase()
        from datetime import datetime, timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(seconds=seconds)).isoformat()
        
        # Postgres uses exact count
        res = sb.table("detections_telemetry").select("id", count="exact").eq("digipin", digipin).gte("confidence", min_conf).lte("confidence", max_conf).gt("timestamp", cutoff).execute()
        return res.count if res.count is not None else 0
    except Exception as e:
        _diag(f"count_detections_in_window failed error={e}", request_id)
        return 0


def get_distinct_timestamps_count(digipin: str, seconds: int, request_id: Optional[str] = None) -> int:
    """Get count of distinct timestamps (seconds resolution) for T1 spread check."""
    try:
        sb = get_supabase()
        from datetime import datetime, timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(seconds=seconds)).isoformat()
        
        res = sb.table("detections_telemetry").select("timestamp").eq("digipin", digipin).gt("timestamp", cutoff).execute()
        if not res.data: return 0
        
        # Extract unique seconds (first 19 chars of ISO format: '2026-03-27T12:00:00')
        unique_times = set([ts.get("timestamp", "")[:19] for ts in res.data])
        unique_times.discard("")
        return len(unique_times)
    except Exception as e:
        _diag(f"get_distinct_timestamps_count failed error={e}", request_id)
        return 0


def count_distinct_detection_days(digipin: str, days: int = 14, request_id: Optional[str] = None) -> int:
    """Count distinct days on which detections were recorded for a DIGIPIN."""
    try:
        sb = get_supabase()
        from datetime import datetime, timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        
        res = sb.table("detections_telemetry").select("timestamp").eq("digipin", digipin).gt("timestamp", cutoff).execute()
        if not res.data: return 0
        
        # Extract unique dates (first 10 chars of ISO format: '2026-03-27')
        unique_days = set([ts.get("timestamp", "")[:10] for ts in res.data])
        unique_days.discard("")
        return len(unique_days)
    except Exception as e:
        _diag(f"count_distinct_detection_days failed error={e}", request_id)
        return 0


def get_recent_citizen_report(digipin: str, hours_back: int = 72, request_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Check for recent citizen reports at same DIGIPIN (T3 corollary)."""
    try:
        sb = get_supabase()
        from datetime import datetime, timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours_back)).isoformat()
        
        res = sb.table("complaints").select("*").eq("digipin", digipin).neq("source", "cctv").gt("created_at", cutoff).order("created_at", desc=True).limit(1).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        _diag(f"get_recent_citizen_report failed error={e}", request_id)
        return None

def get_system_user_id() -> str:
    """Return the ID for the system user responsible for CCTV tickets."""
    # Production Admin ID
    return '0e3a680d-b896-4b74-940c-c68a2201503c'

def verify_camera(camera_id: str, verification_result: str, verified_by: str = None) -> Dict[str, Any]:
    """
    Verification gate: called when Admin selects Repaired / Not Repaired on the
    Surveillance Card after the worker has clicked 'Mark as Complete'.

    repaired     → complaint status = 'resolved', complaint CCTV verdict = 'repaired', camera last_status = 'Closed'
    not_repaired → complaint status = 'submitted', complaint CCTV verdict = 'not_repaired',
                   camera last_status = 'Ticket Generated' so the same ticket can be reassigned.

    Uses only valid Postgres enum values: submitted, assigned, in_progress, escalated, resolved.
    """
    if verification_result not in ['repaired', 'not_repaired']:
        raise ValueError(f"Invalid verification_result: {verification_result}. Must be 'repaired' or 'not_repaired'")

    if not verified_by:
        verified_by = get_system_user_id()

    try:
        sb = get_supabase()
        from datetime import datetime

        now = datetime.utcnow().isoformat()

        # ── Resolve target complaint deterministically ──────────────────────────
        active_statuses = ["submitted", "assigned", "in_progress", "pending_closure", "escalated"]
        complaint_select = "id, status, digipin, assigned_worker_id, citizen_id, created_at"
        complaint = None

        camera_res = (
            sb.table("cctv_cameras")
            .select("generated_ticket_id")
            .eq("id", camera_id)
            .maybe_single()
            .execute()
        )
        generated_ticket_id = (camera_res.data or {}).get("generated_ticket_id") if camera_res and camera_res.data else None

        # Primary path: use camera.generated_ticket_id to avoid cross-ticket ambiguity.
        if generated_ticket_id:
            by_ticket_res = (
                sb.table("complaints")
                .select(complaint_select)
                .eq("ticket_id", generated_ticket_id)
                .in_("status", active_statuses)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            complaint = by_ticket_res.data[0] if by_ticket_res.data else None

            if complaint:
                # Keep linkage healthy for legacy rows that were created without camera_id.
                sb.table("complaints").update({"camera_id": camera_id}).eq("id", complaint["id"]).execute()
                _diag(f"verify_camera matched by generated_ticket_id id={complaint['id']} ticket_id={generated_ticket_id}", None)

        # Fallback: resolve among active complaints tied to the camera.
        if not complaint:
            by_camera_res = (
                sb.table("complaints")
                .select(complaint_select)
                .eq("camera_id", camera_id)
                .in_("status", active_statuses)
                .order("created_at", desc=True)
                .limit(20)
                .execute()
            )
            candidates = by_camera_res.data or []

            if candidates:
                status_priority = {
                    "pending_closure": 0,
                    "in_progress": 1,
                    "assigned": 2,
                    "submitted": 3,
                    "escalated": 4,
                }
                best_rank = min(status_priority.get(row.get("status"), 99) for row in candidates)
                best_rank_rows = [row for row in candidates if status_priority.get(row.get("status"), 99) == best_rank]
                complaint = max(best_rank_rows, key=lambda row: row.get("created_at") or "")
                _diag(
                    f"verify_camera matched by camera candidates={len(candidates)} picked={complaint.get('id')} status={complaint.get('status')}",
                    None,
                )

        complaint_id = complaint["id"] if complaint else None
        old_status = complaint["status"] if complaint else None
        assigned_worker_id = complaint.get("assigned_worker_id") if complaint else None
        complaint_citizen_id = complaint.get("citizen_id") if complaint else None
        _diag(f"verify_camera camera_id={camera_id} result={verification_result} complaint_id={complaint_id}", None)

        # ── Map result to valid Postgres enum values ────────────────────────────
        if verification_result == "repaired":
            ticket_status = "resolved"          # valid enum ✅
            camera_badge  = "Closed"
        else:
            ticket_status = "submitted"         # requeue the same ticket for reassignment
            camera_badge  = "Ticket Generated"

        complaint_update_applied = False

        # ── Update complaint ────────────────────────────────────────────────────
        if complaint_id:
            try:
                sb.table("complaints").update({
                    "status": ticket_status,
                    "assigned_worker_id": None,
                    "resolved_at": now if ticket_status == "resolved" else None,
                    "cctv_verification_status": verification_result,
                    "cctv_verified_at": now,
                }).eq("id", complaint_id).execute()
                complaint_update_applied = True
                _diag(f"verify_camera updated complaint {complaint_id} → {ticket_status}", None)

                if assigned_worker_id:
                    sb.table("worker_profiles").update({
                        "current_complaint_id": None,
                        "availability": "available",
                    }).eq("worker_id", assigned_worker_id).execute()
            except Exception as complaint_update_error:
                error_text = str(complaint_update_error)
                # DB trigger writes ticket_history with auth.uid(); service-key updates can fail
                # with changed_by NULL. Let frontend finalize complaint update using admin session.
                if (
                    "ticket_history" in error_text
                    and "changed_by" in error_text
                    and "null value" in error_text
                ):
                    # Preferred recovery: transition status through existing RPC that sets actor safely.
                    # Then patch remaining CCTV fields in a non-status update.
                    rpc_applied = False
                    if complaint_citizen_id:
                        try:
                            rpc_res = sb.rpc(
                                "update_complaint_status_citizen",
                                {
                                    "p_complaint_id": complaint_id,
                                    "p_status": ticket_status,
                                    "p_citizen_id": complaint_citizen_id,
                                },
                            ).execute()
                            rpc_payload = rpc_res.data or {}
                            if isinstance(rpc_payload, dict) and rpc_payload.get("success") is False:
                                _diag(
                                    f"verify_camera status rpc rejected complaint_id={complaint_id} error={rpc_payload.get('error')}",
                                    None,
                                )
                            else:
                                rpc_applied = True
                        except Exception as rpc_error:
                            _diag(f"verify_camera status rpc failed complaint_id={complaint_id} error={rpc_error}", None)

                    if rpc_applied:
                        sb.table("complaints").update({
                            "assigned_worker_id": None,
                            "resolved_at": now if ticket_status == "resolved" else None,
                            "cctv_verification_status": verification_result,
                            "cctv_verified_at": now,
                        }).eq("id", complaint_id).execute()
                        complaint_update_applied = True
                        _diag(
                            f"verify_camera finalized complaint via rpc complaint_id={complaint_id} status={ticket_status}",
                            None,
                        )

                        if assigned_worker_id:
                            sb.table("worker_profiles").update({
                                "current_complaint_id": None,
                                "availability": "available",
                            }).eq("worker_id", assigned_worker_id).execute()
                    else:
                        _diag(
                            f"verify_camera deferred complaint update to frontend complaint_id={complaint_id} reason=changed_by_null",
                            None,
                        )
                else:
                    raise

        # ── Update camera badge ─────────────────────────────────────────────────
        sb.table("cctv_cameras").update({
            "last_status": camera_badge,
            "verification_status": verification_result,
            "verified_at": now,
            "verified_by": verified_by,
        }).eq("id", camera_id).execute()
        _diag(f"verify_camera updated camera {camera_id} → {camera_badge}", None)

        return {
            "status": f"verified_{verification_result}",
            "camera_id": camera_id,
            "complaint_id": complaint_id,
            "verification_status": verification_result,
            "ticket_status": ticket_status,
            "assigned_worker_id": assigned_worker_id,
            "complaint_update_applied": complaint_update_applied,
            "verified_at": now
        }

    except Exception as e:
        _diag(f"verify_camera failed camera_id={camera_id} error={e}", None)
        raise
