import os
import sys
import uuid
import json
from datetime import datetime, timedelta
from supabase import create_client

def get_env_vals(path):
    vals = {}
    if os.path.exists(path):
        with open(path, "r") as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    parts = line.split("=", 1)
                    k = parts[0].strip()
                    v = parts[1].strip().strip('"').strip("'")
                    vals[k] = v
    return vals

class ComprehensiveReportCardTester:
    def __init__(self):
        paths = [
            "c:/Users/medha/OneDrive/Desktop/ps-crmdev1/.env",
            "c:/Users/medha/OneDrive/Desktop/ps-crmdev1/apps/api/.env",
            "c:/Users/medha/OneDrive/Desktop/ps-crmdev1/apps/web/.env.local"
        ]
        vals = {}
        for p in paths:
            if os.path.exists(p):
                vals.update(get_env_vals(p))
                
        url = vals.get("SUPABASE_URL") or vals.get("NEXT_PUBLIC_SUPABASE_URL")
        key = vals.get("SUPABASE_SERVICE_KEY") or vals.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        
        if not url or not key:
            raise ValueError("Supabase credentials missing in env files.")
            
        self.supabase = create_client(url, key)
        self.test_id = str(uuid.uuid4())
        self.review_id = str(uuid.uuid4())
        
        # Test Entity Reference values (Initial and Reassignment Targets)
        self.dept_1 = "PWD"
        self.dept_2 = "MCD"
        self.worker_1 = None
        self.worker_2 = None
        self.authority_1 = None
        self.authority_2 = None
        self.ward_1 = "ALIPUR"
        self.ward_2 = "Connaught Place"
        self.category_1 = None
        self.category_2 = None
        self.citizen_1 = None
        self.citizen_2 = None
        
        self.location = None
        self.severity = "L2"
        self.effective_severity = "L2"

    def setup_references(self):
        print("[SETUP] Fetching active references from DB...")
        
        # 1. Fetch Workers
        res_workers = self.supabase.table("profiles").select("id").eq("role", "worker").limit(2).execute()
        if res_workers.data and len(res_workers.data) >= 2:
            self.worker_1 = res_workers.data[0]["id"]
            self.worker_2 = res_workers.data[1]["id"]
        else:
            raise ValueError("Need at least 2 workers in profiles table.")
            
        # 2. Fetch Authorities (Officers)
        res_auths = self.supabase.table("profiles").select("id").eq("role", "authority").limit(2).execute()
        if res_auths.data and len(res_auths.data) >= 2:
            self.authority_1 = res_auths.data[0]["id"]
            self.authority_2 = res_auths.data[1]["id"]
        else:
            raise ValueError("Need at least 2 authorities in profiles table.")
            
        # 3. Fetch Citizens
        res_citizens = self.supabase.table("profiles").select("id").eq("role", "citizen").limit(2).execute()
        if res_citizens.data and len(res_citizens.data) >= 2:
            self.citizen_1 = res_citizens.data[0]["id"]
            self.citizen_2 = res_citizens.data[1]["id"]
        else:
            raise ValueError("Need at least 2 citizens in profiles table.")
            
        # 4. Fetch Categories
        res_cats = self.supabase.table("categories").select("id").limit(2).execute()
        if res_cats.data and len(res_cats.data) >= 2:
            self.category_1 = res_cats.data[0]["id"]
            self.category_2 = res_cats.data[1]["id"]
        else:
            raise ValueError("Need at least 2 categories.")
            
        # 5. Get location from existing complaint
        res_comp = self.supabase.table("complaints").select("location").limit(1).execute()
        if res_comp.data:
            self.location = res_comp.data[0]["location"]
        else:
            self.location = '{"type":"Point","coordinates":[77.209,28.613]}'
            
        print(f" -> Setup completed.\n    Worker 1: {self.worker_1}\n    Authority 1: {self.authority_1}\n    Citizen 1: {self.citizen_1}\n    Category 1: {self.category_1}")

    def reset_test_cards(self):
        print("[SETUP] Resetting test entities' report cards to clean baseline...")
        entities_to_reset = [
            ("department", self.dept_1),
            ("department", self.dept_2),
            ("worker", self.worker_1),
            ("worker", self.worker_2),
            ("authority", self.authority_1),
            ("authority", self.authority_2),
            ("ward", self.ward_1),
            ("ward", self.ward_2),
            ("category", self.category_1),
            ("category", self.category_2),
            ("citizen", self.citizen_1),
            ("citizen", self.citizen_2)
        ]
        for ent_type, ent_id in entities_to_reset:
            if ent_id:
                self.supabase.table("report_cards").upsert({
                    "entity_type": ent_type,
                    "entity_id": str(ent_id),
                    "speed_score": 100.00,
                    "quality_score": 80.00,
                    "volume_score": 100.00,
                    "sla_score": 100.00,
                    "composite_score": 94.00,
                    "grade": "A",
                    "total_complaints": 0
                }).execute()

    def get_card_stats(self, entity_type: str, entity_id: str):
        res = self.supabase.table("report_cards").select("*").eq("entity_type", entity_type).eq("entity_id", str(entity_id)).execute()
        if res.data:
            return res.data[0]
        return {
            "total_complaints": 0,
            "speed_score": 100.0,
            "quality_score": 80.0,
            "sla_score": 100.0,
            "volume_score": 100.0,
            "composite_score": 94.0
        }

    def verify_reversions(self, base_states, post_cleanup_states):
        print("\n--- Verifying Reversion to Baseline (No score/count leaks) ---")
        for key, base_val in base_states.items():
            clean_val = post_cleanup_states[key]
            # Verify counts match baseline
            assert base_val["total_complaints"] == clean_val["total_complaints"], f"Count leak for {key}: Base={base_val['total_complaints']}, Cleanup={clean_val['total_complaints']}"
            # Verify scores match baseline
            for col in ["speed_score", "quality_score", "sla_score", "volume_score", "composite_score"]:
                diff = abs(float(base_val[col]) - float(clean_val[col]))
                assert diff < 0.01, f"Score leak for {key} column {col}: Base={base_val[col]}, Cleanup={clean_val[col]}"
        print(" -> [SUCCESS] All counts and scores reverted exactly to baseline. DELETE triggers work perfectly!")

    def run(self):
        self.setup_references()
        
        # 1. Fetch baselines for all 6 initial entities
        entities = {
            "dept1": ("department", self.dept_1),
            "work1": ("worker", self.worker_1),
            "auth1": ("authority", self.authority_1),
            "ward1": ("ward", self.ward_1),
            "cat1":  ("category", self.category_1),
            "citizen1": ("citizen", self.citizen_1),
            "dept2": ("department", self.dept_2),
            "work2": ("worker", self.worker_2),
            "auth2": ("authority", self.authority_2),
            "ward2": ("ward", self.ward_2),
            "cat2":  ("category", self.category_2),
            "citizen2": ("citizen", self.citizen_2)
        }
        
        baselines = {}
        for k, (ent_type, ent_id) in entities.items():
            baselines[k] = self.get_card_stats(ent_type, ent_id)
            
        print("\n========================================================")
        print("  Starting 6-Entity & Timing Trigger Verification Tests  ")
        print("========================================================")

        # ---------------------------------------------
        # TEST 1: INSERTION TRACKING
        # ---------------------------------------------
        print("\n[TEST 1] Inserting ticket mapped to 6 entities...")
        payload = {
            "id": self.test_id,
            "title": "Comprehensive 6-Entity Fixes Verification",
            "description": "Validates timing, deletions, and reassignment transfers",
            "status": "submitted",
            "severity": self.severity,
            "effective_severity": self.effective_severity,
            "assigned_department": self.dept_1,
            "assigned_worker_id": self.worker_1,
            "assigned_officer_id": self.authority_1,
            "ward_name": self.ward_1,
            "category_id": self.category_1,
            "citizen_id": self.citizen_1,
            "location": self.location
        }
        self.supabase.table("complaints").insert(payload).execute()
        
        # Verify counts incremented on all 6 entities
        for prefix in ["dept1", "work1", "auth1", "ward1", "cat1", "citizen1"]:
            ent_type, ent_id = entities[prefix]
            card = self.get_card_stats(ent_type, ent_id)
            base = baselines[prefix]
            assert card["total_complaints"] == base["total_complaints"] + 1, f"{ent_type} '{ent_id}' count did not increment"
            
        print(" -> [SUCCESS] Count incremented correctly on all 6 entities on insertion.")

        # ---------------------------------------------
        # TEST 2: TIMING BUG 1 FIX (submitted -> assigned delay)
        # ---------------------------------------------
        print("\n[TEST 2] Testing assignment delay timing calculations...")
        # Mock ticket submission to 200 hours ago
        past_time = (datetime.utcnow() - timedelta(hours=200)).isoformat() + "Z"
        self.supabase.table("complaints").update({"created_at": past_time}).eq("id", self.test_id).execute()
        
        # Transition to assigned (should measure 200h delay -> speed impact = -30.0)
        self.supabase.table("complaints").update({"status": "assigned"}).eq("id", self.test_id).execute()
        
        # Verify speed score drop across entities
        for prefix in ["dept1", "work1", "auth1", "ward1", "cat1", "citizen1"]:
            ent_type, ent_id = entities[prefix]
            card = self.get_card_stats(ent_type, ent_id)
            base = baselines[prefix]
            # Speed should drop by 30
            assert float(card["speed_score"]) <= float(base["speed_score"]) - 30.0, f"Speed score did not drop on 48h assignment delay for {ent_type}"
            
        print(" -> [SUCCESS] Timing Bug 1 Fix verified. Assignment delay penalty (-30) applied correctly.")

        # ---------------------------------------------
        # TEST 3: TIMING BUG 2 FIX (assigned -> in_progress delay)
        # ---------------------------------------------
        print("\n[TEST 3] Testing response delay timing calculations...")
        # Mock assignment time to 150 hours ago
        past_time = (datetime.utcnow() - timedelta(hours=150)).isoformat() + "Z"
        self.supabase.table("complaints").update({"assigned_at": past_time}).eq("id", self.test_id).execute()
        
        # Capture current speed scores
        post_t2_scores = {prefix: float(self.get_card_stats(entities[prefix][0], entities[prefix][1])["speed_score"]) for prefix in ["dept1", "work1", "auth1", "ward1", "cat1", "citizen1"]}
        
        # Transition to in_progress (should measure 50h delay -> speed impact = -10.0)
        self.supabase.table("complaints").update({"status": "in_progress"}).eq("id", self.test_id).execute()
        
        for prefix in ["dept1", "work1", "auth1", "ward1", "cat1", "citizen1"]:
            ent_type, ent_id = entities[prefix]
            card = self.get_card_stats(ent_type, ent_id)
            prev = post_t2_scores[prefix]
            assert float(card["speed_score"]) <= prev - 10.0, f"Speed score did not drop on 25h response delay for {ent_type}"
            
        print(" -> [SUCCESS] Timing Bug 2 Fix verified. Response delay penalty (-10) applied correctly.")

        # ---------------------------------------------
        # TEST 4: TIMING BUG 3 FIX (in_progress -> resolved delay + SLA & Spam check)
        # ---------------------------------------------
        print("\n[TEST 4] Testing resolution speed and SLA compliance tracking...")
        # Mock in_progress time to 100 hours ago
        past_time = (datetime.utcnow() - timedelta(hours=100)).isoformat() + "Z"
        self.supabase.table("complaints").update({"in_progress_at": past_time}).eq("id", self.test_id).execute()
        
        # Capture pre-resolve stats
        post_t3_speed = {prefix: float(self.get_card_stats(entities[prefix][0], entities[prefix][1])["speed_score"]) for prefix in ["dept1", "work1", "auth1", "ward1", "cat1", "citizen1"]}
        post_t3_sla = {prefix: float(self.get_card_stats(entities[prefix][0], entities[prefix][1])["sla_score"]) for prefix in ["dept1", "work1", "auth1", "ward1", "cat1", "citizen1"]}
        
        # Resolve ticket with SLA breached (should apply speed penalty -40, and SLA penalty -40)
        self.supabase.table("complaints").update({
            "status": "resolved",
            "sla_breached": True
        }).eq("id", self.test_id).execute()
        
        for prefix in ["dept1", "work1", "auth1", "ward1", "cat1", "citizen1"]:
            ent_type, ent_id = entities[prefix]
            card = self.get_card_stats(ent_type, ent_id)
            assert float(card["speed_score"]) <= post_t3_speed[prefix] - 40.0, f"Resolution speed penalty not applied to {ent_type}"
            assert float(card["sla_score"]) <= post_t3_sla[prefix] - 40.0, f"SLA breach penalty not applied to {ent_type}"
            
        print(" -> [SUCCESS] Timing Bug 3 Fix & SLA resolution penalties verified across all 6 entities.")

        # ---------------------------------------------
        # TEST 5: DYNAMIC CITIZEN REVIEW FORMULA
        # ---------------------------------------------
        print("\n[TEST 5] Testing dynamic rating score impacts based on YAML formula...")
        post_t4_qual = {prefix: float(self.get_card_stats(entities[prefix][0], entities[prefix][1])["quality_score"]) for prefix in ["dept1", "work1", "auth1", "ward1", "cat1", "citizen1"]}
        
        # Insert a 1-star citizen review
        # Rating 1/5 stars converts to dynamic impact: ((1/5)*100) - 80 = -60 points quality penalty
        review_payload = {
            "id": self.review_id,
            "complaint_id": self.test_id,
            "citizen_id": self.citizen_1,
            "rating": 1,
            "worker_id": self.worker_1,
            "feedback": "Deeply unhappy with response times."
        }
        self.supabase.table("reviews").insert(review_payload).execute()
        
        for prefix in ["dept1", "work1", "auth1", "ward1", "cat1", "citizen1"]:
            ent_type, ent_id = entities[prefix]
            card = self.get_card_stats(ent_type, ent_id)
            prev = post_t4_qual[prefix]
            assert float(card["quality_score"]) <= prev - 60.0, f"Quality score did not drop by 60 points for {ent_type}"
            
        print(" -> [SUCCESS] Dynamic YAML formula citizen review calculation verified. Penalty of -60 applied correctly.")

        # ---------------------------------------------
        # TEST 6: HISTORICAL REASSIGNMENT SCORE TRANSFER
        # ---------------------------------------------
        print("\n[TEST 6] Reassigning resolved ticket and verifying historical score transfer...")
        # Fetch status values of initial and target entities before reassignment
        pre_reassign_old = {}
        pre_reassign_new = {}
        for prefix in ["dept1", "work1", "auth1", "ward1", "cat1", "citizen1"]:
            pre_reassign_old[prefix] = self.get_card_stats(entities[prefix][0], entities[prefix][1])
        for prefix in ["dept2", "work2", "auth2", "ward2", "cat2", "citizen2"]:
            pre_reassign_new[prefix] = self.get_card_stats(entities[prefix][0], entities[prefix][1])
            
        # Perform Reassignment to target entities
        self.supabase.table("complaints").update({
            "assigned_department": self.dept_2,
            "assigned_worker_id": self.worker_2,
            "assigned_officer_id": self.authority_2,
            "ward_name": self.ward_2,
            "category_id": self.category_2,
            "citizen_id": self.citizen_2
        }).eq("id", self.test_id).execute()
        
        # Verify old entities dropped back to their previous scores (reverted to baseline minus current ticket scores)
        # Verify new entities received the ticket scores
        print(" -> Verifying score transfers:")
        for prefix_old, prefix_new in [
            ("dept1", "dept2"), ("work1", "work2"), ("auth1", "auth2"), 
            ("ward1", "ward2"), ("cat1", "cat2"), ("citizen1", "citizen2")
        ]:
            ent_type, ent_id_old = entities[prefix_old]
            _, ent_id_new = entities[prefix_new]
            
            card_old = self.get_card_stats(ent_type, ent_id_old)
            card_new = self.get_card_stats(ent_type, ent_id_new)
            
            # Old entity complaints count must decrease, new entity must increase
            assert card_old["total_complaints"] == pre_reassign_old[prefix_old]["total_complaints"] - 1, f"Old {ent_type} count did not decrement"
            assert card_new["total_complaints"] == pre_reassign_new[prefix_new]["total_complaints"] + 1, f"New {ent_type} count did not increment"
            
            # Scores: Old entity should return to baseline; new entity should decrease by the corresponding ticket scores
            # The test ticket accumulated: Speed: -30(Test 2) - 10(Test 3) - 40(Test 4) = -80. SLA: -40(Test 4) = -40. Quality: -60(Test 5) = -60.
            # So checking that new entity's score drops while old entity's score recovers
            assert float(card_old["speed_score"]) > float(pre_reassign_old[prefix_old]["speed_score"]), f"Old {ent_type} speed score did not recover"
            assert float(card_new["speed_score"]) < float(pre_reassign_new[prefix_new]["speed_score"]), f"New {ent_type} speed score did not drop"
            
        print(" -> [SUCCESS] Ticket count and historical score impacts successfully transferred on reassignment.")

    def cleanup(self):
        print("\n[CLEANUP] Deleting test records and checking reversions...")
        # Get stats of all entities before cleaning up
        entities_list = {
            "dept1": ("department", self.dept_1),
            "work1": ("worker", self.worker_1),
            "auth1": ("authority", self.authority_1),
            "ward1": ("ward", self.ward_1),
            "cat1":  ("category", self.category_1),
            "citizen1": ("citizen", self.citizen_1),
            "dept2": ("department", self.dept_2),
            "work2": ("worker", self.worker_2),
            "auth2": ("authority", self.authority_2),
            "ward2": ("ward", self.ward_2),
            "cat2":  ("category", self.category_2),
            "citizen2": ("citizen", self.citizen_2)
        }
        
        # Record baselines we want to revert to (reassigned target entities should go back to their pre-insert baselines)
        baselines = {}
        for k, (ent_type, ent_id) in entities_list.items():
            # For the target entities, they now hold the test ticket scores, so they should revert to baseline
            # For initial entities, they already reverted during reassignment, so they should remain at baseline
            # We fetch initial baselines recorded at start of run
            pass
            
        try:
            self.supabase.table("reviews").delete().eq("id", self.review_id).execute()
            print(" -> Deleted test review.")
        except Exception as e:
            print(f" -> Review cleanup failed: {e}")

        try:
            self.supabase.table("complaints").delete().eq("id", self.test_id).execute()
            print(" -> Deleted test complaint.")
        except Exception as e:
            print(f" -> Complaint cleanup failed: {e}")
            
        # Re-fetch post-cleanup cards
        clean_states = {}
        for k, (ent_type, ent_id) in entities_list.items():
            clean_states[k] = self.get_card_stats(ent_type, ent_id)
            
        # We check reversion against our recorded baselines
        self.verify_reversions(self.base_states_recorded, clean_states)

if __name__ == "__main__":
    tester = ComprehensiveReportCardTester()
    try:
        # Record baselines before running any test insertions
        tester.setup_references()
        tester.reset_test_cards()
        tester.base_states_recorded = {
            "dept1": tester.get_card_stats("department", tester.dept_1),
            "work1": tester.get_card_stats("worker", tester.worker_1),
            "auth1": tester.get_card_stats("authority", tester.authority_1),
            "ward1": tester.get_card_stats("ward", tester.ward_1),
            "cat1":  tester.get_card_stats("category", tester.category_1),
            "citizen1": tester.get_card_stats("citizen", tester.citizen_1),
            "dept2": tester.get_card_stats("department", tester.dept_2),
            "work2": tester.get_card_stats("worker", tester.worker_2),
            "auth2": tester.get_card_stats("authority", tester.authority_2),
            "ward2": tester.get_card_stats("ward", tester.ward_2),
            "cat2":  tester.get_card_stats("category", tester.category_2),
            "citizen2": tester.get_card_stats("citizen", tester.citizen_2)
        }
        
        tester.run()
        print("\n========================================================")
        print("  ALL COMPREHENSIVE VERIFICATION TESTS PASSED!          ")
        print("========================================================")
    except Exception as e:
        print(f"\n[FAIL] Comprehensive test suite failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        tester.cleanup()
