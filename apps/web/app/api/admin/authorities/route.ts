import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/src/types/database.types"
import type { SupabaseClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

function getSupabaseAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    return null
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

type CreateAuthorityPayload = {
  full_name?: string
  email?: string
  password?: string
  phone?: string | null
  city?: string | null
  department?: string
}

type AssignDepartmentPayload = {
  authority_id?: string
  department?: string
}

function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization")
  if (!header || !header.startsWith("Bearer ")) return null
  return header.slice(7)
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function requireAdmin(supabaseAdmin: SupabaseClient<Database>, req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !authData.user) {
    return { error: NextResponse.json({ error: "Invalid session" }, { status: 401 }) }
  }

  const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle()

  const profileRole = (callerProfile?.role ?? "").toString().trim().toLowerCase()
  const metadataRole = (authData.user.user_metadata?.role ?? "").toString().trim().toLowerCase()
  const isAdmin = profileRole === "admin" || metadataRole === "admin"

  if (callerProfileError || !isAdmin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  return { userId: authData.user.id }
}

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdminClient()
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server misconfiguration: missing Supabase service role key" }, { status: 500 })
  }
  const authResult = await requireAdmin(supabaseAdmin, req)
  if ("error" in authResult) return authResult.error

  const [profilesResult, complaintsResult, workersResult, categoriesResult] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, phone, city, department, is_blocked, created_at")
      .eq("role", "authority")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("complaints")
      .select("id, assigned_officer_id, assigned_worker_id, assigned_department, status, created_at, resolved_at"),
    supabaseAdmin
      .from("worker_profiles")
      .select("worker_id, department, average_rating, total_reviews, profiles(full_name, email)"),
    supabaseAdmin.from("categories").select("name, department").eq("is_active", true),
  ])

  const firstError = profilesResult.error || complaintsResult.error || workersResult.error || categoriesResult.error
  if (firstError) {
    return NextResponse.json({ error: firstError.message || "Failed to load authorities data" }, { status: 500 })
  }

  return NextResponse.json({
    profiles: profilesResult.data ?? [],
    complaints: complaintsResult.data ?? [],
    workers: workersResult.data ?? [],
    categories: categoriesResult.data ?? [],
  })
}

export async function PATCH(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdminClient()
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server misconfiguration: missing Supabase service role key" }, { status: 500 })
  }
  const authResult = await requireAdmin(supabaseAdmin, req)
  if ("error" in authResult) return authResult.error

  const body = (await req.json().catch(() => null)) as AssignDepartmentPayload | null
  const authorityId = body?.authority_id?.trim() ?? ""
  const department = body?.department?.trim() ?? ""

  if (!authorityId || !department) {
    return NextResponse.json({ error: "authority_id and department are required" }, { status: 400 })
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ department })
    .eq("id", authorityId)

  if (profileError) {
    return NextResponse.json({ error: profileError.message || "Failed to update authority department" }, { status: 500 })
  }

  await supabaseAdmin
    .from("complaints")
    .update({ assigned_department: department })
    .eq("assigned_officer_id", authorityId)
    .in("status", ["submitted", "under_review", "assigned", "in_progress", "escalated"])

  return NextResponse.json({ success: true })
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdminClient()
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server misconfiguration: missing Supabase service role key" }, { status: 500 })
  }
  const authResult = await requireAdmin(supabaseAdmin, req)
  if ("error" in authResult) return authResult.error

  const body = (await req.json().catch(() => null)) as CreateAuthorityPayload | null
  const fullName = body?.full_name?.trim() ?? ""
  const email = body?.email?.trim().toLowerCase() ?? ""
  const password = body?.password ?? ""
  const phone = body?.phone?.trim() || null
  const city = body?.city?.trim() || null
  const department = body?.department?.trim() ?? ""

  if (!fullName || !email || !department || !password) {
    return NextResponse.json({ error: "Name, email, password and department are required" }, { status: 400 })
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }

  const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role: "authority",
      department,
    },
  })

  if (createUserError || !createdUser.user) {
    return NextResponse.json({ error: createUserError?.message || "Failed to create auth user" }, { status: 400 })
  }

  const userId = createdUser.user.id

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      phone,
      city,
      department,
      role: "authority",
      is_blocked: false,
    },
    { onConflict: "id" },
  )

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: profileError.message || "Failed to create authority profile" }, { status: 500 })
  }

  return NextResponse.json(
    {
      id: userId,
      email,
      full_name: fullName,
      role: "authority",
      department,
    },
    { status: 201 },
  )
}
