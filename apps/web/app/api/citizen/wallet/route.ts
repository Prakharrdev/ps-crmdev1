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

function extractBearerToken(req: NextRequest): string | null {
  const authorization = req.headers.get("authorization") ?? "";
  const bearerPrefix = "Bearer ";
  if (!authorization.startsWith(bearerPrefix)) return null;
  const token = authorization.slice(bearerPrefix.length).trim();
  return token || null;
}

async function resolveUserId(req: NextRequest): Promise<{ userId: string } | { error: NextResponse }> {
  const authClient = getAuthClient();
  if (!authClient) {
    return {
      error: NextResponse.json(
        { error: "Server misconfiguration: missing Supabase auth environment variables" },
        { status: 500 },
      ),
    };
  }

  const token = extractBearerToken(req);
  if (!token) {
    return { error: NextResponse.json({ error: "Missing auth token" }, { status: 401 }) };
  }

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { userId: user.id };
}

export async function GET(req: NextRequest) {
  const serviceClient = getServiceClient();
  if (!serviceClient) {
    return NextResponse.json(
      { error: "Server misconfiguration: missing Supabase service environment variables" },
      { status: 500 },
    );
  }

  const userResult = await resolveUserId(req);
  if ("error" in userResult) return userResult.error;

  const [walletResult, rewardsResult, redemptionsResult] = await Promise.all([
    serviceClient
      .from("gamification_wallets")
      .select("user_id, points_balance, lifetime_earned, lifetime_spent, updated_at")
      .eq("user_id", userResult.userId)
      .maybeSingle(),
    serviceClient
      .from("reward_catalog")
      .select("id, title, kind, points_cost, active, stock_remaining, per_user_limit")
      .eq("active", true)
      .order("points_cost", { ascending: true }),
    serviceClient
      .from("reward_redemptions")
      .select("reward_id, status")
      .eq("user_id", userResult.userId)
      .in("status", ["pending", "issued", "used"]),
  ]);

  if (walletResult.error) {
    return NextResponse.json({ error: walletResult.error.message }, { status: 500 });
  }
  if (rewardsResult.error) {
    return NextResponse.json({ error: rewardsResult.error.message }, { status: 500 });
  }
  if (redemptionsResult.error) {
    return NextResponse.json({ error: redemptionsResult.error.message }, { status: 500 });
  }

  const wallet = walletResult.data ?? {
    user_id: userResult.userId,
    points_balance: 0,
    lifetime_earned: 0,
    lifetime_spent: 0,
    updated_at: new Date().toISOString(),
  };

  const redeemedRewardIds = (redemptionsResult.data ?? []).map((row) => row.reward_id);

  return NextResponse.json(
    {
      wallet,
      rewards: rewardsResult.data ?? [],
      redeemedRewardIds,
    },
    { status: 200 },
  );
}

type RedeemRequestBody = {
  reward_id?: string;
};

export async function POST(req: NextRequest) {
  const serviceClient = getServiceClient();
  if (!serviceClient) {
    return NextResponse.json(
      { error: "Server misconfiguration: missing Supabase service environment variables" },
      { status: 500 },
    );
  }

  const userResult = await resolveUserId(req);
  if ("error" in userResult) return userResult.error;

  const body = (await req.json().catch(() => null)) as RedeemRequestBody | null;
  const rewardId = body?.reward_id?.trim();

  if (!rewardId) {
    return NextResponse.json({ error: "reward_id is required" }, { status: 400 });
  }

  const { data: rpcResponse, error: rpcError } = await serviceClient.rpc("redeem_reward", {
    p_user_id: userResult.userId,
    p_reward_id: rewardId,
  });

  if (rpcError) {
    const raw = rpcError.message || "Failed to redeem reward";
    const normalized = raw.toLowerCase();

    let status = 400;
    if (normalized.includes("not found")) status = 404;
    if (normalized.includes("insufficient") || normalized.includes("limit") || normalized.includes("stock")) {
      status = 409;
    }

    return NextResponse.json({ error: raw }, { status });
  }

  const { data: wallet, error: walletError } = await serviceClient
    .from("gamification_wallets")
    .select("user_id, points_balance, lifetime_earned, lifetime_spent, updated_at")
    .eq("user_id", userResult.userId)
    .maybeSingle();

  if (walletError) {
    return NextResponse.json({ error: walletError.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      success: true,
      result: rpcResponse,
      wallet: wallet ?? {
        user_id: userResult.userId,
        points_balance: 0,
        lifetime_earned: 0,
        lifetime_spent: 0,
        updated_at: new Date().toISOString(),
      },
    },
    { status: 200 },
  );
}
