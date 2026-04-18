import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load env
load_dotenv(".env")
url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Missing Supabase credentials")
    exit(1)

supabase = create_client(url, key)

def check_table(table_name):
    try:
        res = supabase.table(table_name).select("*").limit(0).execute()
        print(f"Table '{table_name}' exists.")
    except Exception as e:
        print(f"Table '{table_name}' check failed: {e}")

def get_table_schema(table_name):
    print(f"\n--- Schema for {table_name} ---")
    query = f"""
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = '{table_name}'
    AND table_schema = 'public'
    ORDER BY ordinal_position;
    """
    res = supabase.rpc("run_sql", {"sql": query}).execute()
    if res.data:
        for col in res.data:
            print(f"{col['column_name']}: {col['data_type']} (Nullable: {col['is_nullable']})")
    else:
        print(f"Could not get schema for {table_name}")

def get_triggers(table_name):
    print(f"\n--- Triggers for {table_name} ---")
    query = f"""
    SELECT trigger_name, action_statement, action_timing, event_manipulation
    FROM information_schema.triggers
    WHERE event_object_table = '{table_name}'
    AND event_object_schema = 'public';
    """
    res = supabase.rpc("run_sql", {"sql": query}).execute()
    if res.data:
        for trig in res.data:
            print(f"{trig['trigger_name']} ({trig['action_timing']} {trig['event_manipulation']}): {trig['action_statement']}")
    else:
        print(f"No triggers found for {table_name}")

def get_function_def(function_name):
    print(f"\n--- Definition for {function_name} ---")
    query = f"""
    SELECT pg_get_functiondef(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = '{function_name}';
    """
    res = supabase.rpc("run_sql", {"sql": query}).execute()
    if res.data:
        print(res.data[0]['pg_get_functiondef'])
    else:
        print(f"Function {function_name} not found")

print("Checking tables...")
check_table("ticket_history")
check_table("cctv_analysis_logs")

# Attempt to list all tables in public schema
print("\n--- Listing all tables in public schema ---")
query = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
try:
    res = supabase.rpc("run_sql", {"sql": query}).execute()
    if res.data:
        for t in res.data:
            print(t['table_name'])
except Exception as e:
    print(f"Failed to list tables: {e}")

get_table_schema("ticket_history")
get_triggers("ticket_history")
# Usually triggers call functions, let's see if we can find them.
# I'll need to see the trigger output first to know the function name.
