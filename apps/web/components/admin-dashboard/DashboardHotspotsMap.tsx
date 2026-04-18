"use client"

import dynamic from "next/dynamic"
import { MapPin, Sparkles } from "lucide-react"

const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
      Loading map...
    </div>
  ),
})

export default function DashboardHotspotsMap() {
  return (
    <section className="flex h-[500px] flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:shadow-none">
      <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-[#2a2a2a]">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Geographic Hotspots</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Live complaint locations and heat zones for active issues.</p>
        </div>
        <div className="rounded-full bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200">
          <Sparkles size={18} />
        </div>
      </div>

      <div className="flex-1 w-full overflow-hidden rounded-b-2xl">
        <MapComponent highQuality={false} />
      </div>
    </section>
  )
}
