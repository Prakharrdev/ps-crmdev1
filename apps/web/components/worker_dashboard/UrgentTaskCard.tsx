"use client"

import { useEffect, useRef, useState } from "react"
import { gsap } from "gsap"
import { supabase } from "@/src/lib/supabase"

type UrgentTask = {
  complaintId: string
  title: string
  location: string
  severity: string
}

export default function UrgentTaskCard() {

  const cardRef = useRef<HTMLDivElement>(null)

  const [urgentTask, setUrgentTask] = useState<UrgentTask | null>(null)

  useEffect(() => {

    async function loadUrgentTask() {

      const { data: userData } = await supabase.auth.getUser()
      const workerId = userData?.user?.id

      if (!workerId) return

      const { data } = await supabase
        .from("complaints")
        .select("id, title, address_text, effective_severity")
        .eq("assigned_worker_id", workerId)
        .eq("effective_severity", "L4")
        .order("created_at", { ascending: false })
        .limit(1)
        .single()

      if (!data) return

      setUrgentTask({
        complaintId: data.id,
        title: data.title,
        location: data.address_text ?? "Unknown location",
        severity: data.effective_severity
      })
    }

    loadUrgentTask()

  }, [])

  useEffect(() => {

    if (!cardRef.current) return

    gsap.fromTo(
      cardRef.current,
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }
    )

  }, [urgentTask])

  if (!urgentTask) return null

  return (
    <div
      ref={cardRef}
      className="border rounded-xl p-6 bg-orange-50 border-orange-200 flex justify-between items-center gap-6"
    >

      <div className="space-y-1">

        <div className="text-sm font-semibold text-orange-600">
          URGENT TASK
        </div>

        <div className="text-lg font-semibold text-gray-900">
          {urgentTask.complaintId}: {urgentTask.title}
        </div>

        <div className="text-sm text-gray-600">
          Location: {urgentTask.location}
        </div>

        <div className="text-sm text-gray-600">
          Severity: {urgentTask.severity}
        </div>

      </div>

      <div className="flex gap-3">

        <button className="px-5 py-2 rounded-lg bg-amber-700 text-white font-medium hover:bg-amber-800 transition">
          Start Work
        </button>

        <button className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition">
          Navigate
        </button>

      </div>

    </div>
  )
}