import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

function getServiceClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: NextRequest) {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return NextResponse.json(
      { error: "Server misconfiguration: missing Supabase environment variables" },
      { status: 500 },
    );
  }

  const { data, error } = await serviceClient
    .from("leaderboard_all_time")
    .select("user_id, full_name, avatar_url, points, rank")
    .order("rank", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message || "Failed to fetch leaderboard" }, { status: 500 });
  }

  const items = (data ?? []).map((row) => ({
    user_id: row.user_id,
    full_name: row.full_name,
    avatar_url: row.avatar_url,
    points: row.points ?? 0,
    rank: row.rank ?? null,
  }));

  return NextResponse.json({ items }, { status: 200 });
}
