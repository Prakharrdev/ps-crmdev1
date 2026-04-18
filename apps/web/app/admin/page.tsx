import Link from "next/link"
import AdminStatsOverview from "@/components/admin-dashboard/AdminStatsOverview"
import DashboardHotspotsMap from "@/components/admin-dashboard/DashboardHotspotsMap"
import DepartmentPerformanceList from "@/components/admin-dashboard/DepartmentPerformanceList"

export default function AdminDashboardPage() {
  return (
    <div className="space-y-5 p-2 sm:p-4">
      <AdminStatsOverview />

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <DashboardHotspotsMap />

        <div className="flex h-[500px] min-h-0 flex-col gap-4">
          <DepartmentPerformanceList />

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:shadow-none">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Need more detail?</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">View the complete dashboard reports for deeper analytics.</p>
              </div>
              <Link
                href="/admin/reports"
                className="inline-flex items-center justify-center rounded-full bg-[#C9A84C] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b2933f]"
              >
                More Info
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
