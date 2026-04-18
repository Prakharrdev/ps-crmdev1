"""
CCTV feature handler for JanSamadhan V2.
Features:
1. /cctv/process - Auto-ticket generation from CCTV frame detections
2. /cctv/verify - Proof verification (before/after comparison)
"""

from typing import Dict, Any, Optional, List
from datetime import datetime
import json
from PIL import Image
import io
import logging
import os
from dotenv import load_dotenv

logger = logging.getLogger("CCTVHandler")

# Load environment variables
load_dotenv()

try:
    from service.supabase_client import (
        get_camera,
        list_cameras,
        create_complaint,
        find_duplicate_complaint,
        log_analysis,
        update_camera_status,
        log_detection,
        update_suspected_incident,
        get_system_user_id,
        count_detections_in_window,
        get_distinct_timestamps_count,
        count_distinct_detection_days,
        get_recent_citizen_report,
        upload_cctv_proof_image,
    )
except ModuleNotFoundError:
    from supabase_client import (
        get_camera,
        list_cameras,
        create_complaint,
        find_duplicate_complaint,
        log_analysis,
        update_camera_status,
        log_detection,
        update_suspected_incident,
        get_system_user_id,
        count_detections_in_window,
        get_distinct_timestamps_count,
        count_distinct_detection_days,
        get_recent_citizen_report,
        upload_cctv_proof_image,
    )

def _compute_digipin(lat: float, lon: float) -> str:
    """Mock DIGIPIN generator for demo."""
    return f"{str(lat)[:5]}+{str(lon)[:5]}"


class CCTVAutoTicketHandler:
    """Handle CCTV to auto-ticket generation."""

    @property
    def CONF_THRESHOLD_HIGH(self) -> float:
        return float(os.getenv("CONF_THRESHOLD", 0.35))

    @property
    def CONF_THRESHOLD_LOW(self) -> float:
        return float(os.getenv("WEAK_THRESHOLD", 0.25))

    @property
    def BURST_WINDOW_SECONDS(self) -> int:
        return int(os.getenv("TIME_WINDOW_SEC", 30))

    @property
    def DUP_HOURS(self) -> int:
        return int(os.getenv("DUP_HOURS", 24))

    CITIZEN_CORROB_HOURS = 24
    HOTSPOT_WINDOW_HOURS = 144
    PERSISTENCE_DAYS_ESCALATION = 21

    def __init__(self):
        # System account for CCTV tickets
        self.system_citizen = {"id": get_system_user_id()}

    def process_burst(self, camera_id: str, burst_data: List[List[Dict[str, Any]]], timestamps: List[str] = None, best_frame: Image.Image = None, request_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Process a high-recall burst of (typically 10) frames.
        """
        camera = get_camera(camera_id, request_id=request_id)
        if not camera:
            return {"error": f"Camera {camera_id} not found"}

        # Use DIGIPIN stored by the frontend — NEVER re-compute it.
        # _compute_digipin produces '28.64+77.08' but the frontend stores '2864+7708'.
        # The two formats never match, causing the duplicate check to always return empty.
        digipin = camera.get("digipin") or _compute_digipin(camera["latitude"], camera["longitude"])
        now = datetime.utcnow().isoformat()
        
        # Duplicate block check
        duplicate = find_duplicate_complaint(
            latitude=camera.get("latitude"),
            longitude=camera.get("longitude"),
            digipin=digipin,
            hours_back=24,
            request_id=request_id,
        )
        if duplicate:
            update_camera_status(
                camera_id,
                "Duplicate Ticket",
                request_id=request_id,
                generated_ticket_id=duplicate.get("ticket_id"),
                verification_status="pending",
            )
            return {"status": "duplicate_prevented", "complaint_id": duplicate["id"], "ticket_id": duplicate.get("ticket_id")}

        # Log telemetry
        valid_detections = []
        for i, frame_detections in enumerate(burst_data):
            ts = timestamps[i] if (timestamps and i < len(timestamps)) else now
            for det in frame_detections:
                if det.get("class") == "pothole" or det.get("class_name") == "pothole":
                    conf = det.get("confidence", 0)
                    if conf >= self.CONF_THRESHOLD_LOW:
                        log_detection(camera_id, digipin, conf, ts, request_id=request_id)
                        valid_detections.append(det)

        if not valid_detections:
            update_camera_status(camera_id, "No Issue Detected", request_id=request_id)
            return {"status": "no_signals_detected", "digipin": digipin}

        # Reliability Engine
        trigger_meta = self._check_reliability_triggers(digipin, request_id)
        triggered = trigger_meta.get("triggered", False)

        if triggered:
            # Create auto-ticket
            best_det = max(valid_detections, key=lambda d: d.get("confidence", 0))
            severity, escalation_msg = self._calculate_severity(digipin, trigger_meta["rule"], best_det["confidence"], request_id)
            
            # Map road_type to Category Taxonomy ML IDs
            road_type_raw = camera.get("road_type", "").lower().strip()
            tax_mapping = {
                "national highway": (7, "NHAI"),
                "state highway": (11, "PWD"),
                "expressway": (9, "NHAI"),
                "flyover": (12, "PWD"),
                "main road": (11, "PWD"),
                "national": (7, "NHAI"),
                "colony": (15, "MCD"),
                "colony road": (15, "MCD")
            }
            category_id, fallback_dept = tax_mapping.get(road_type_raw, (11, "PWD"))
            
            # Use assigned_department from camera if specified, otherwise use fallback from taxonomy
            target_dept = camera.get("assigned_department")
            if not target_dept or target_dept.strip() == "":
                target_dept = fallback_dept

            # Visual Evidence
            photo_url = None
            if best_frame:
                try:
                    # In relocated service, use main as service entry
                    from service.main import get_service
                    service = get_service()
                    boxed_img = service.draw_detections(best_frame, [best_det])

                    filename = f"ticket_{digipin}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"

                    image_buffer = io.BytesIO()
                    boxed_img.save(image_buffer, format="JPEG", quality=85)
                    image_data = image_buffer.getvalue()

                    photo_url = upload_cctv_proof_image(
                        image_data=image_data,
                        filename=filename,
                        request_id=request_id,
                    )
                except Exception as e:
                    logger.error(f"[VISUAL EVIDENCE] Processing failed: {e}")

            lat = camera.get("latitude")
            lon = camera.get("longitude")
            has_coords = isinstance(lat, (int, float)) and isinstance(lon, (int, float))
            location_wkt = f"POINT({lon} {lat})" if has_coords else None
            photo_urls = [photo_url] if photo_url else []
            address_text = camera.get("address_text") or f"Auto-reported by CCTV camera {camera.get('name', camera_id)}"

            complaint = create_complaint({
                "citizen_id": self.system_citizen["id"],
                "category_id": category_id,
                "title": f"[AI] Pothole at {camera['name']}",
                "description": f"Automatically detected by CCTV network at {camera.get('name', 'Camera Location')}. {escalation_msg}",
                "location": location_wkt,
                "digipin": digipin,
                "address_text": address_text,
                "ward_name": camera.get("ward_name") or "Unknown",
                "pincode": camera.get("pincode") or "000000",
                "city": camera.get("city") or "Delhi",
                "severity": severity,
                "effective_severity": severity,
                "status": "submitted",
                "assigned_department": target_dept,
                "photo_urls": photo_urls,
                "photo_count": len(photo_urls),
                "upvote_count": 0,
                "is_spam": False,
                "possible_duplicate": False,
                "sla_breached": False,
                "escalation_level": 0,
                "upvote_boost": 0
            }, request_id=request_id)
            
            log_analysis({
                "camera_id": camera_id,
                "complaint_id": complaint["id"],
                "status_result": "Ticket Generated",
                "ai_metadata": trigger_meta
            }, request_id=request_id)
            update_camera_status(
                camera_id,
                "Ticket Generated",
                request_id=request_id,
                generated_ticket_id=complaint.get("ticket_id"),
                verification_status="pending",
            )
            
            return {
                "status": "ticket_created",
                "complaint_id": complaint["id"],
                "ticket_id": complaint.get("ticket_id"),
                "trigger_rule": trigger_meta.get("rule", "T1_MULTI_FRAME_CONFIRMATION"),
                "severity": severity
            }
        else:
            best_det = max(valid_detections, key=lambda d: d.get("confidence", 0))
            update_suspected_incident(digipin, "SUSPECTED", best_det["confidence"], camera_id, now, request_id=request_id)
            update_camera_status(camera_id, "No Issue Detected", request_id=request_id)
            return {
                "status": "signal_buffered_suspected",
                "digipin": digipin,
                "message": f"Confirmed {len(valid_detections)} weak signals. Buffered for corroboration."
            }

    def _check_reliability_triggers(self, digipin: str, request_id: Optional[str] = None) -> Dict[str, Any]:
        """Evaluate multi-signal reliability (T1-T4) using telemetry."""
        # T1: Standard Multi-Frame Confirmation (>=3 detections, >=2 timestamps)
        t1_count = count_detections_in_window(digipin, seconds=self.BURST_WINDOW_SECONDS, min_conf=self.CONF_THRESHOLD_HIGH, request_id=request_id)
        t1_timestamps = get_distinct_timestamps_count(digipin, seconds=self.BURST_WINDOW_SECONDS, request_id=request_id)
        
        if t1_count >= 3 and t1_timestamps >= 2:
            return {"triggered": True, "rule": "T1_MULTI_FRAME_CONFIRMATION"}

        # T2: Weak-Signal Cluster Confirm (>=2 detections, confidence floor)
        t2_count = count_detections_in_window(digipin, seconds=self.BURST_WINDOW_SECONDS*2, min_conf=self.CONF_THRESHOLD_LOW, max_conf=self.CONF_THRESHOLD_HIGH, request_id=request_id)
        if t2_count >= 2:
            return {"triggered": True, "rule": "T2_WEAK_SIGNAL_CLUSTER"}

        # T3: Citizen + CCTV Corroboration
        t3_cctv_count = count_detections_in_window(digipin, seconds=self.BURST_WINDOW_SECONDS*2, min_conf=self.CONF_THRESHOLD_LOW, request_id=request_id)
        if t3_cctv_count >= 1:
            citizen_report = get_recent_citizen_report(digipin, hours_back=self.CITIZEN_CORROB_HOURS, request_id=request_id)
            if citizen_report:
                return {"triggered": True, "rule": "T3_CITIZEN_CORROBORATION"}

        # T4: Persistent Hotspot Tracking (144h window)
        seconds_in_144h = self.HOTSPOT_WINDOW_HOURS * 3600
        t4_count = count_detections_in_window(digipin, seconds=seconds_in_144h, min_conf=self.CONF_THRESHOLD_LOW, max_conf=self.CONF_THRESHOLD_HIGH, request_id=request_id)
        if t4_count >= 3:
            return {"triggered": True, "rule": "T4_PERSISTENT_HOTSPOT"}

        return {"triggered": False}

    def _calculate_severity(self, digipin: str, trigger_rule: str, best_conf: float, request_id: Optional[str] = None) -> tuple[str, str]:
        if trigger_rule == "T2_WEAK_SIGNAL_CLUSTER":
            severity = "L1"
        elif trigger_rule in ["T1_MULTI_FRAME_CONFIRMATION", "T3_CITIZEN_CORROBORATION"]:
            severity = "L2"
        else:
            severity = "L3"

        if best_conf >= 0.9 and severity == "L2":
            severity = "L3"

        distinct_days = count_distinct_detection_days(digipin, days=self.PERSISTENCE_DAYS_ESCALATION, request_id=request_id)
        if distinct_days >= 3 and severity != "L3_HIGH":
            severity = "L3_HIGH"
            msg = f"Escalated to L3 due to persistence across {distinct_days} scan days."
        else:
            msg = f"Persistence check: {distinct_days} scan days observed."

        return severity, msg


def get_cctv_auto_handler():
    return CCTVAutoTicketHandler()
