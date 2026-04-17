import { AlertTriangle, Eye, ShieldAlert, UserPlus } from "lucide-react"

type TicketActionsProps = {
  ticketId: string
  disabled?: boolean
  onView: () => void
  onAssign: () => void
  onEscalate: () => void
  onSpam: () => void
}

export default function TicketActions({ ticketId, disabled = false, onView, onAssign, onEscalate, onSpam }: TicketActionsProps) {
  const baseClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d6cec3] bg-[#faf8f4] text-[#5c544c] transition hover:bg-white dark:border-[#3a3a3a] dark:bg-[#2a2a2a] dark:text-gray-200 dark:hover:bg-[#3a3a3a]"

  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={`View ${ticketId}`} className={baseClass} onClick={onView} disabled={disabled}>
        <Eye size={16} />
      </button>
      <button type="button" aria-label={`Assign ${ticketId}`} className={baseClass} onClick={onAssign} disabled={disabled}>
        <UserPlus size={16} />
      </button>
      <button type="button" aria-label={`Escalate ${ticketId}`} className={baseClass} onClick={onEscalate} disabled={disabled}>
        <AlertTriangle size={16} />
      </button>
      <button 
        type="button" 
        aria-label={`Mark as Spam ${ticketId}`} 
        className={`${baseClass} text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300`} 
        onClick={onSpam} 
        disabled={disabled}
      >
        <ShieldAlert size={16} />
      </button>
    </div>
  )
}
