import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/database.types";
import { gamificationService } from "@/src/lib/gamification";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[Spam API] Received request body:", JSON.stringify(body, null, 2));
    const { complaint_id, citizen_id } = body;

    if (!complaint_id || !citizen_id) {
      console.warn("[Spam API] Validation failed: missing IDs", { complaint_id, citizen_id });
      return NextResponse.json({ error: "complaint_id and citizen_id are required" }, { status:400 });
    }

    // 1. Mark as spam
    const { error: updateError } = await supabase
      .from("complaints")
      .update({ is_spam: true, status: 'resolved' }) // Resolving as spam effectively closes it
      .eq("id", complaint_id);

    if (updateError) throw updateError;

    // 2. Award penalty points and increment strikes
    await gamificationService.handleSpamPenalty(citizen_id);

    return NextResponse.json({ success: true, citizen_id });
  } catch (err: any) {
    console.error("[Spam API] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
