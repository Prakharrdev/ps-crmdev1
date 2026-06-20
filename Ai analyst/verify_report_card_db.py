import os
import sys
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

def main():
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
        print("Error: Supabase credentials missing in env.")
        sys.exit(1)
        
    supabase = create_client(url, key)
    
    tables = [
        "report_cards",
        "report_card_rules",
        "report_card_speed_rules"
    ]
    
    print("\n--- Verifying Report Card Tables ---")
    for t in tables:
        try:
            res = supabase.table(t).select("*").limit(1).execute()
            print(f"[OK] Table '{t}' exists and is accessible.")
            
            # If rules tables, show the seeded counts
            if t == "report_card_rules":
                all_rules = supabase.table(t).select("*").execute()
                print(f"     Seeded rules: {len(all_rules.data)} rows.")
            elif t == "report_card_speed_rules":
                all_speed = supabase.table(t).select("*").execute()
                print(f"     Seeded speed rules: {len(all_speed.data)} rows.")
        except Exception as e:
            print(f"[FAIL] Table '{t}' check failed: {e}")

if __name__ == "__main__":
    main()
