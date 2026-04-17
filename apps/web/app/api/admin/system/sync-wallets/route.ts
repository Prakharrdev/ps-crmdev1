import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

export async function GET(req: NextRequest) {
  try {
    console.log("[SyncWallets] Starting retroactive wallet synchronization...");
    
    // 1. Fetch all profile IDs
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id');
    
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ message: "No profiles found to sync." });
    }

    console.log(`[SyncWallets] Found ${profiles.length} profiles. Syncing...`);

    // 2. Prepare UPSERT data
    const wallets = profiles.map(p => ({
      user_id: p.id,
      points_balance: 0,
      lifetime_earned: 0,
      lifetime_spent: 0
    }));

    // 3. Batch UPSERT
    // Supabase handles conflicts automatically if we specify onConflict: 'user_id'
    const { error: upsertError } = await supabase
      .from('gamification_wallets')
      .upsert(wallets, { onConflict: 'user_id' });

    if (upsertError) {
      console.error("[SyncWallets] Error during batch upsert:", upsertError);
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    console.log(`[SyncWallets] Successfully synchronized ${wallets.length} wallets.`);
    return NextResponse.json({ 
      success: true, 
      count: wallets.length,
      message: "Retroactive wallet synchronization complete." 
    });
  } catch (err) {
    console.error("[SyncWallets] Unexpected error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
