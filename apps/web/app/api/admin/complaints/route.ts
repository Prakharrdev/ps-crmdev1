import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { Database, Enums } from "@/src/types/database.types"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase environment variables for admin complaints API")
}

const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)

type ComplaintRow = {
  id: string
  ticket_id: string
  title: string
  category_id: number
  address_text: string | null
  ward_name: string | null
  city: string
  status: Enums<"complaint_status">
  severity: Enums<"severity_level">
  escalation_level: number
  created_at: string
  assigned_department: string | null
  assigned_worker_id: string | null
  assigned_officer_id: string | null
  citizen_id: string | null
  is_spam: boolean
  categories: { name: string | null }[] | { name: string | null } | null
}

function parsePriorityToSeverity(priority: string | null): Enums<"severity_level"> | null {
  if (priority === "low") return "L1"
  if (priority === "medium") return "L2"
  if (priority === "high") return "L3"
  if (priority === "emergency") return "L4"
  return null
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams

  const page = Math.max(1, Number(searchParams.get("page") ?? "1"))
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20")))
  const status = (searchParams.get("status") ?? "all").trim()
  const priority = (searchParams.get("priority") ?? "all").trim()
  const authority = (searchParams.get("authority") ?? "all").trim()
  const category = (searchParams.get("category") ?? "all").trim()
  const search = (searchParams.get("search") ?? "").trim()

  const rangeFrom = (page - 1) * pageSize
  const rangeTo = rangeFrom + pageSize - 1

  let query = supabase
    .from("complaints")
    .select(
      "id, ticket_id, title, category_id, address_text, ward_name, city, status, severity, escalation_level, created_at, assigned_department, assigned_worker_id, assigned_officer_id, citizen_id, is_spam, categories(name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })

  if (status === "pending") {
    query = query.in("status", ["submitted", "under_review", "assigned"])
  } else if (status !== "all") {
    query = query.eq("status", status as Enums<"complaint_status">)
  }

  const severity = parsePriorityToSeverity(priority)
  if (severity) {
    query = query.eq("severity", severity)
  }

  if (authority !== "all") {
    query = query.eq("assigned_department", authority)
  }

  if (category !== "all") {
    const { data: categoryRows } = await supabase.from("categories").select("id").eq("name", category)
    const ids = (categoryRows ?? []).map((row) => row.id)
    if (ids.length === 0) {
      return NextResponse.json({ items: [], profiles: [], totalCount: 0 })
    }
    query = query.in("category_id", ids)
  }

  if (search) {
    const safe = search.replace(/,/g, " ")
    query = query.or(
      `ticket_id.ilike.%${safe}%,title.ilike.%${safe}%,address_text.ilike.%${safe}%,ward_name.ilike.%${safe}%,city.ilike.%${safe}%`,
    )
  }

  const { data, error, count } = await query.range(rangeFrom, rangeTo)

  if (error) {
    return NextResponse.json({ error: error.message || "Failed to fetch complaints" }, { status: 500 })
  }

  const complaintRows = (data ?? []) as unknown as ComplaintRow[]

  const profileIds = Array.from(
    new Set(
      complaintRows
        .flatMap((row) => [row.assigned_worker_id, row.assigned_officer_id])
        .filter((value): value is string => Boolean(value)),
    ),
  )

  let profiles: Array<{ id: string; full_name: string | null; department: string | null }> = []
  if (profileIds.length > 0) {
    const { data: profileData } = await supabase.from("profiles").select("id, full_name, department").in("id", profileIds)
    profiles = profileData ?? []
  }

  return NextResponse.json({
    items: complaintRows,
    profiles,
    totalCount: count ?? 0,
  })
}
