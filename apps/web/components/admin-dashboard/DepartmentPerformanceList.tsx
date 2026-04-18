"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowUpRight, Trophy } from "lucide-react"
import { supabase } from "@/src/lib/supabase"

type DepartmentPerformance = {
  department: string
  avgResolutionDays: number
  resolvedCount: number
  activeCount: number
}

const initialData: DepartmentPerformance[] = []

export default function DepartmentPerformanceList() {
  const [items, setItems] = useState<DepartmentPerformance[]>(initialData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPerformance = useCallback(async () => {
    setError(null)
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("No session")

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const res = await fetch(`${apiUrl}/api/admin/dashboard/department-performance`, {
        headers: { "Authorization": `Bearer ${token}` },
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const payload = await res.json()
      setItems(payload.items ?? [])
    } catch (err) {
      console.error("Department performance fetch error:", err)
      setError("Unable to load department performance.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchPerformance()
  }, [fetchPerformance])

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:shadow-none">
      <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-[#2a2a2a]">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Department Performance</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Top teams by average resolution time over recent complaints.</p>
        </div>
        <div className="rounded-full bg-sky-100 p-2 text-sky-700 dark:bg-sky-900/20 dark:text-sky-200">
          <Trophy size={18} />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-200 dark:divide-[#2a2a2a] pr-1">
        {loading ? (
          <div className="space-y-3 p-5">
            <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-[#2a2a2a]" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-[#2a2a2a]" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-gray-200 dark:bg-[#2a2a2a]" />
          </div>
        ) : error ? (
          <div className="p-5 text-sm text-red-700 dark:text-red-300">{error}</div>
        ) : items.length === 0 ? (
          <div className="p-5 text-sm text-gray-600 dark:text-gray-400">No recent department performance data available.</div>
        ) : (
          items.map((item) => (
            <div key={item.department} className="px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.department}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Resolved {item.resolvedCount} tickets</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-[#2a2a2a] dark:text-gray-300">
                  <ArrowUpRight size={14} />
                  {item.avgResolutionDays.toFixed(1)}d
                </span>
              </div>
              <div className="mt-3 flex gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span>{item.activeCount} active</span>
                <span>•</span>
                <span>{item.resolvedCount} resolved</span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
