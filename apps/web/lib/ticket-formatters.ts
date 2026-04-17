/**
 * Shared ticket formatting utilities
 * Used across dashboard components (RecentTickets, CurrentTicketCard, etc.)
 */

/**
 * Format status text: "in_progress" → "In Progress"
 */
export function formatStatus(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Get severity dot color class
 * L4 = Red, L3 = Orange/Yellow, L2 = Blue, L1 = Gray
 */
export function getSeverityDotColor(severity: string): string {
  const normalized = severity.trim().toUpperCase();
  if (normalized === "L4") return "bg-red-500";
  if (normalized === "L3") return "bg-yellow-500";
  if (normalized === "L2") return "bg-blue-500";
  if (normalized === "L1") return "bg-gray-400";
  return "bg-gray-300";
}

/**
 * Format timestamp to relative time
 * e.g., "Just now", "5m ago", "2h ago", "3d ago"
 */
export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600)
    return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400)
    return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)}d ago`;

  // For older dates, show formatted date
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * Get status badge color classes
 * Returns Tailwind classes for light/dark mode
 */
export function statusClasses(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "submitted") {
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  }
  if (normalized === "assigned") {
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  }
  if (normalized === "in_progress") {
    return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
  }
  if (normalized === "under_review") {
    return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
  }
  if (normalized === "pending_closure") {
    return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
  }
  if (normalized === "resolved") {
    return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  }
  if (normalized === "reopened") {
    return "bg-red-100 text-red-700 animate-pulse font-bold dark:bg-red-900/40 dark:text-red-300 ring-2 ring-red-500/20";
  }
  if (normalized === "rejected" || normalized === "spam") {
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  }
  return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
}
