from dotenv import load_dotenv
load_dotenv()
import asyncio
from shared import supabase

async def main():
    print("--- PROFILES (Authority) ---")
    res = supabase.table("profiles").select("id, role, department").eq("role", "authority").execute()
    for p in res.data:
        print(p)
        
    print("\n--- WORKER PROFILES ---")
    res2 = supabase.table("worker_profiles").select("worker_id, department").execute()
    for w in res2.data:
        print(w)

asyncio.run(main())
