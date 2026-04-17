import type { CSSProperties } from "react"
import PriorityBadge from "@/components/admin-tickets/PriorityBadge"
import StatusBadge from "@/components/admin-tickets/StatusBadge"
import TicketActions from "@/components/admin-tickets/TicketActions"
import { formatRelativeCreated } from "@/components/admin-tickets/formatters"
import type { TicketRecord } from "@/components/admin-tickets/types"

type TicketRowProps = {
  ticket: TicketRecord
  actionLoading?: boolean
  onView: (ticket: TicketRecord) => void
  onAssign: (ticket: TicketRecord) => void
  onEscalate: (ticket: TicketRecord) => void
  onSpam: (ticket: TicketRecord) => void
  isHighlighted?: boolean
}

export default function TicketRow({ ticket, actionLoading = false, onView, onAssign, onEscalate, onSpam, isHighlighted = false }: TicketRowProps) {
  const clamp3Lines: CSSProperties = {
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  }

  const highlightClass = isHighlighted ? "bg-[#C9A84C]/20 dark:bg-[#C9A84C]/30 transition-colors duration-1000 scale-[1.01] shadow-[inset_0_0_10px_rgba(201,168,76,0.3)] relative z-10" : ""

  return (
    <tr className={`border-t border-[#ded6cb] align-top dark:border-[#2a2a2a] ${highlightClass}`}>
      <td className="px-3 py-4 text-sm font-medium text-[#332d28] dark:text-gray-300">
        <span className="block w-full" style={clamp3Lines}>
          {ticket.ticketId}
          {ticket.isSpam && (
            <span className="ml-2 inline-flex items-center rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700 dark:bg-red-900/40 dark:text-red-400">
              Spam
            </span>
          )}
        </span>
      </td>
      <td className="px-3 py-4 text-sm font-semibold text-[#29231f] dark:text-gray-100">
        <span style={clamp3Lines}>{ticket.title}</span>
      </td>
      <td className="px-3 py-4 text-sm text-[#332d28] dark:text-gray-300">
        <span style={clamp3Lines}>{ticket.category}</span>
      </td>
      <td className="px-3 py-4 text-sm text-[#332d28] dark:text-gray-300">
        <span style={clamp3Lines}>{ticket.location}</span>
      </td>
      <td className="px-3 py-4"><StatusBadge status={ticket.status} /></td>
      <td className="px-3 py-4"><PriorityBadge severity={ticket.severity} /></td>
      <td className="px-3 py-4 text-sm text-[#332d28] dark:text-gray-300">
        <span style={clamp3Lines}>{formatRelativeCreated(ticket.createdAt)}</span>
      </td>
      <td className="px-3 py-4 text-sm text-[#332d28] dark:text-gray-300">
        <span style={clamp3Lines}>{ticket.authority}</span>
      </td>
      <td className="px-3 py-4 text-sm text-[#332d28] dark:text-gray-300">
        <span style={clamp3Lines}>{ticket.worker}</span>
      </td>
      <td className="px-3 py-4 whitespace-nowrap">
        <TicketActions
          ticketId={ticket.ticketId}
          disabled={actionLoading}
          onView={() => onView(ticket)}
          onAssign={() => onAssign(ticket)}
          onEscalate={() => onEscalate(ticket)}
          onSpam={() => onSpam(ticket)}
        />
      </td>
    </tr>
  )
}
