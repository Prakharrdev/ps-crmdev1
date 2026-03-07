"use client"

import { useEffect, useRef, useState } from "react"
import { gsap } from "gsap"
import { supabase } from "@/src/lib/supabase"

type Stats = {
  label: string
  value: number
  icon: string
}

export default function WorkerStatsCards() {

  const cardsRef = useRef<HTMLDivElement>(null)

  const [stats, setStats] = useState<Stats[]>([
    { label: "Tasks Today", value: 0, icon: "📋" },
    { label: "Pending Tasks", value: 0, icon: "⭕" },
    { label: "Completed Today", value: 0, icon: "✅" },
    { label: "Urgent Tasks", value: 0, icon: "🔥" }
  ])

  useEffect(() => {

    async function loadStats() {

      const { data: user } = await supabase.auth.getUser()

      const workerId = user?.user?.id
      if (!workerId) return

      const today = new Date().toISOString().split("T")[0]

      const { count: todayTasks } = await supabase
        .from("complaints")
        .select("*", { count: "exact", head: true })
        .eq("assigned_worker_id", workerId)
        .gte("created_at", today)

      const { count: pending } = await supabase
        .from("complaints")
        .select("*", { count: "exact", head: true })
        .eq("assigned_worker_id", workerId)
        .neq("status", "resolved")

      const { count: completed } = await supabase
        .from("complaints")
        .select("*", { count: "exact", head: true })
        .eq("assigned_worker_id", workerId)
        .gte("resolved_at", today)

      const { count: urgent } = await supabase
        .from("complaints")
        .select("*", { count: "exact", head: true })
        .eq("assigned_worker_id", workerId)
        .eq("effective_severity", "L4")

      setStats([
        { label: "Tasks Today", value: todayTasks || 0, icon: "📋" },
        { label: "Pending Tasks", value: pending || 0, icon: "⭕" },
        { label: "Completed Today", value: completed || 0, icon: "✅" },
        { label: "Urgent Tasks", value: urgent || 0, icon: "🔥" }
      ])
    }

    loadStats()

  }, [])

  useEffect(() => {

    if (!cardsRef.current) return

    gsap.fromTo(
      cardsRef.current.children,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.12, ease: "power2.out" }
    )

  }, [stats])

  return (
    <div ref={cardsRef} className="grid grid-cols-4 gap-4">

      {stats.map((stat, index) => (
        <div
          key={index}
          className="bg-white rounded-xl shadow-sm border p-5 flex items-center gap-4 hover:shadow-md transition"
        >

          <div className="text-2xl w-12 h-12 flex items-center justify-center bg-gray-100 rounded-lg">
            {stat.icon}
          </div>

          <div>
            <div className="text-sm text-gray-500">
              {stat.label}
            </div>

            <div className="text-2xl font-semibold text-gray-900">
              {stat.value}
            </div>
          </div>

        </div>
      ))}

    </div>
  )
}