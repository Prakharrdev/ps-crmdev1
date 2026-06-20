import os
import sys
import yaml
from datetime import datetime
from typing import Dict, List, Any, Optional
from supabase import create_client

class ReportCardManager:
    """Manages retrieving, ranking, and formatting of Universal Report Cards.
    Bridges database values with report_cards.yaml configuration rules.
    """
    
    def __init__(self, yaml_path: Optional[str] = None):
        if yaml_path is None:
            dir_path = os.path.dirname(os.path.abspath(__file__))
            yaml_path = os.path.join(dir_path, "report_cards.yaml")
        
        self.yaml_path = yaml_path
        self.config = self._load_config()
        self.supabase = self._init_supabase()

    def _load_config(self) -> Dict[str, Any]:
        if not os.path.exists(self.yaml_path):
            raise FileNotFoundError(f"Config not found at {self.yaml_path}")
        with open(self.yaml_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)

    def _init_supabase(self):
        paths = [
            "c:/Users/medha/OneDrive/Desktop/ps-crmdev1/.env",
            "c:/Users/medha/OneDrive/Desktop/ps-crmdev1/apps/api/.env",
            "c:/Users/medha/OneDrive/Desktop/ps-crmdev1/apps/web/.env.local"
        ]
        vals = {}
        for p in paths:
            if os.path.exists(p):
                with open(p, "r") as f:
                    for line in f:
                        line = line.strip()
                        if "=" in line and not line.startswith("#"):
                            k, v = line.split("=", 1)
                            vals[k.strip()] = v.strip().strip('"').strip("'")
        
        url = vals.get("SUPABASE_URL") or vals.get("NEXT_PUBLIC_SUPABASE_URL")
        key = vals.get("SUPABASE_SERVICE_KEY") or vals.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        if not url or not key:
            raise ValueError("Supabase credentials missing in env files.")
        return create_client(url, key)

    def get_report_card(self, entity_type: str, entity_id: str) -> Dict[str, Any]:
        """Calculates and returns the universal report card payload for an entity."""
        if entity_type not in ["department", "worker", "authority", "ward", "category", "citizen"]:
            raise ValueError(f"Invalid entity_type: {entity_type}")

        # 1. Fetch scores from database
        res = self.supabase.table("report_cards").select("*").eq("entity_type", entity_type).eq("entity_id", entity_id).execute()
        
        if not res.data:
            # Return default blank card if entity has no tickets yet
            return self._get_default_card(entity_type, entity_id)

        db_card = res.data[0]
        comp_score = float(db_card["composite_score"])
        sla_score = float(db_card["sla_score"])
        quality_score = float(db_card["quality_score"])
        speed_score = float(db_card["speed_score"])
        volume_score = float(db_card["volume_score"])

        # 2. Get Peer Ranking
        peer_rank = self._calculate_peer_rank(entity_type, entity_id, comp_score)

        # 3. Calculate Evidence (Raw counts from live complaints)
        evidence = self._calculate_evidence(entity_type, entity_id)

        # 4. Determine status thresholds (healthy, warning, critical)
        pillars = {
            "sla": {
                "score": sla_score,
                "status": "critical" if sla_score < 60.0 else ("warning" if sla_score < 80.0 else "healthy")
            },
            "quality": {
                "score": quality_score,
                "status": "critical" if quality_score < 50.0 else ("warning" if quality_score < 75.0 else "healthy")
            },
            "speed": {
                "score": speed_score,
                "status": "critical" if speed_score < 50.0 else ("warning" if speed_score < 75.0 else "healthy")
            },
            "volume": {
                "score": volume_score,
                "status": "critical" if volume_score < 50.0 else ("warning" if volume_score < 75.0 else "healthy")
            }
        }

        # 5. Rule constraints from config (e.g. requires_intervention)
        requires_intervention = comp_score < 50.0 or sla_score < 60.0

        # Output payload strictly matching report_card_schema.json
        return {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "grade": db_card["grade"],
            "composite_score": comp_score,
            "last_updated": db_card["last_updated"],
            "pillars": pillars,
            "context": {
                "peer_rank": peer_rank,
                "trend_direction": "stable",
                "score_delta": 0.00,
                "requires_intervention": requires_intervention
            },
            "evidence": evidence
        }

    def _calculate_peer_rank(self, entity_type: str, entity_id: str, comp_score: float) -> str:
        try:
            res = self.supabase.table("report_cards").select("entity_id, composite_score").eq("entity_type", entity_type).order("composite_score", desc=True).execute()
            if not res.data:
                return "1st of 1"
            
            peers = res.data
            total = len(peers)
            
            # Calculate rank based on competition rank (1 + count of strictly greater scores)
            target_score = float(comp_score)
            strictly_greater = sum(1 for p in peers if float(p["composite_score"]) > target_score)
            rank = strictly_greater + 1
            
            # Check if there are other peers with the same score (indicates a tie)
            tied_count = sum(1 for p in peers if float(p["composite_score"]) == target_score)
            prefix = "T-" if tied_count > 1 else ""
            
            # Format suffix
            num_str = str(rank)
            if num_str.endswith("1") and not num_str.endswith("11"): sfx = "st"
            elif num_str.endswith("2") and not num_str.endswith("12"): sfx = "nd"
            elif num_str.endswith("3") and not num_str.endswith("13"): sfx = "rd"
            else: sfx = "th"

            return f"{prefix}{rank}{sfx} of {total}"
        except Exception:
            return "1st of 1"

    def _calculate_evidence(self, entity_type: str, entity_id: str) -> Dict[str, int]:
        try:
            col_map = {
                "department": "assigned_department",
                "worker": "assigned_worker_id",
                "ward": "ward_name",
                "category": "category_id",
                "authority": "assigned_officer_id",
                "citizen": "citizen_id"
            }
            col = col_map.get(entity_type)
            if not col:
                return {"total_complaints": 0, "resolved_complaints": 0, "breached_complaints": 0}

            res = self.supabase.table("complaints").select("status, sla_breached, reopen_count, escalation_level").eq(col, entity_id).execute()
            data = res.data

            total = len(data)
            resolved = sum(1 for c in data if c.get("status") in ['resolved', 'rejected', 'spam'])
            breached = sum(1 for c in data if c.get("sla_breached"))
            reopened = sum(1 for c in data if (c.get("reopen_count") or 0) > 0)
            escalated = sum(1 for c in data if (c.get("escalation_level") or 0) > 0)
            active = sum(1 for c in data if c.get("status") in ['assigned', 'in_progress', 'escalated', 'submitted'])

            return {
                "total_complaints": total,
                "resolved_complaints": resolved,
                "breached_complaints": breached,
                "reopened_complaints": reopened,
                "escalated_complaints": escalated,
                "active_workload": active
            }
        except Exception:
            return {"total_complaints": 0, "resolved_complaints": 0, "breached_complaints": 0}

    def _get_default_card(self, entity_type: str, entity_id: str) -> Dict[str, Any]:
        return {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "grade": "A",
            "composite_score": 94.00,
            "last_updated": datetime.utcnow().isoformat() + "Z",
            "pillars": {
                "sla": {"score": 100.00, "status": "healthy"},
                "quality": {"score": 80.00, "status": "healthy"},
                "speed": {"score": 100.00, "status": "healthy"},
                "volume": {"score": 100.00, "status": "healthy"}
            },
            "context": {
                "peer_rank": "1st of 1",
                "trend_direction": "stable",
                "score_delta": 0.00,
                "requires_intervention": False
            },
            "evidence": {
                "total_complaints": 0,
                "resolved_complaints": 0,
                "breached_complaints": 0,
                "reopened_complaints": 0,
                "escalated_complaints": 0,
                "active_workload": 0
            }
        }
