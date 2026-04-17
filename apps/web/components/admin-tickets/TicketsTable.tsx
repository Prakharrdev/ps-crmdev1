import TicketRow from "@/components/admin-tickets/TicketRow"
import type { TicketRecord } from "@/components/admin-tickets/types"

type TicketsTableProps = {
  tickets: TicketRecord[]
  actionLoading?: boolean
  onView: (ticket: TicketRecord) => void
  onAssign: (ticket: TicketRecord) => void
  onEscalate: (ticket: TicketRecord) => void
  onSpam: (ticket: TicketRecord) => void
  highlightTicketId?: string | null
}

const headers = [
  "ID",
  "Title",
  "Category",
  "Location",
  "Status",
  "Priority",
  "Created",
  "Authority",
  "Worker",
  "Actions",
]

const columnWidths = [
  "9rem",   // ID
  "18rem",  // Title
  "11rem",  // Category
  "16rem",  // Location
  "8rem",   // Status
  "8rem",   // Priority
  "9rem",   // Created
  "12rem",  // Authority
  "10rem",  // Worker
  "12rem",  // Actions
]

export default function TicketsTable({
  tickets,
  actionLoading = false,
  onView,
  onAssign,
  onEscalate,
  onSpam,
  highlightTicketId,
}: TicketsTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#d4cdc2] bg-white shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:shadow-none">
      <table className="w-full min-w-[1130px] table-fixed border-collapse">
        <colgroup>
          {columnWidths.map((width, idx) => (
            <col key={idx} style={{ width }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-[#ece5db] text-left dark:bg-[#161616]">
            {headers.map((header) => (
              <th key={header} className="border-b border-r border-[#d9d1c5] px-3 py-3 text-lg font-semibold text-[#2d2824] last:border-r-0 dark:border-[#2a2a2a] dark:text-gray-100">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickets.length === 0 ? (
            <tr>
              <td colSpan={10} className="px-4 py-8 text-center text-sm text-[#5b544d] dark:text-gray-400">
                No tickets matched your current filters.
              </td>
            </tr>
          ) : (
            tickets.map((ticket) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                actionLoading={actionLoading}
                onView={onView}
                onAssign={onAssign}
                onEscalate={onEscalate}
                onSpam={onSpam}
                isHighlighted={ticket.id === highlightTicketId}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
