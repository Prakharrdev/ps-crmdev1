import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

function getAuthClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getServiceClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: NextRequest) {
  const authClient = getAuthClient();
  const serviceClient = getServiceClient();

  if (!authClient || !serviceClient) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const authorization = req.headers.get("authorization") ?? "";
  const bearerPrefix = "Bearer ";
  const token = authorization.startsWith(bearerPrefix)
    ? authorization.slice(bearerPrefix.length).trim()
    : "";

  if (!token) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token);

  if (authError || !user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { complaintIds?: string[] } | null;
  const complaintIds = Array.isArray(body?.complaintIds)
    ? body!.complaintIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  if (complaintIds.length === 0) {
    return NextResponse.json({ counts: {} }, { status: 200 });
  }

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("department")
    .eq("id", user.id)
    .maybeSingle();

  const department = profile?.department ?? "";

  const visibilityQuery = serviceClient
    .from("complaints")
    .select("id")
    .in("id", complaintIds)
    .eq("assigned_officer_id", user.id);

  let visibleComplaintIds: string[] = [];

  const { data: officerVisible } = await visibilityQuery;
  visibleComplaintIds = (officerVisible ?? []).map((row) => row.id);

  if (visibleComplaintIds.length === 0 && department) {
    const { data: departmentVisible } = await serviceClient
      .from("complaints")
      .select("id")
      .in("id", complaintIds)
      .eq("assigned_department", department);
    visibleComplaintIds = (departmentVisible ?? []).map((row) => row.id);
  }

  if (visibleComplaintIds.length === 0) {
    return NextResponse.json({ counts: {} }, { status: 200 });
  }

  const { data: upvoteRows, error: upvoteError } = await serviceClient
    .from("upvotes")
    .select("complaint_id")
    .in("complaint_id", visibleComplaintIds);

  if (upvoteError) {
    return NextResponse.json({ error: upvoteError.message }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  for (const complaintId of visibleComplaintIds) {
    counts[complaintId] = 0;
  }

  for (const vote of upvoteRows ?? []) {
    counts[vote.complaint_id] = (counts[vote.complaint_id] ?? 0) + 1;
  }

  return NextResponse.json({ counts }, { status: 200 });
}
