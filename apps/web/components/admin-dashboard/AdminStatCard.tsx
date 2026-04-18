import type { ReactNode } from "react"

type AdminStatCardProps = {
  label: string
  value: string
  icon: ReactNode
  accentClass?: string
}

export default function AdminStatCard({ label, value, icon, accentClass = "text-gray-700" }: AdminStatCardProps) {
  return (
    <article className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-3 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:shadow-none">
      <div className="flex items-center gap-3 text-sm font-medium text-gray-600 dark:text-gray-300">
        <span className={`rounded-lg bg-gray-100 p-2 dark:bg-[#2a2a2a] ${accentClass}`}>{icon}</span>
        <span>{label}</span>
      </div>
      <p className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{value}</p>
    </article>
  )
}
