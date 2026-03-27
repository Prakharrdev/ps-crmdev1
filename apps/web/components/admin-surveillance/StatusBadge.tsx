'use client';

import React from 'react';
import { cn } from "@/src/lib/utils";

export type CameraStatus = 
  | 'Idle' 
  | 'Processing' 
  | 'Ticket Generated' 
  | 'Duplicate Ticket' 
  | 'No Issue Detected' 
  | 'Pending Verification' 
  | 'Closed' 
  | 'In Progress';

interface StatusBadgeProps {
  status: CameraStatus;
  className?: string;
}

const statusConfig: Record<CameraStatus, { label: string, color: string, dot: string }> = {
  'Idle':                 { label: 'Idle',                 color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', dot: 'bg-gray-400' },
  'Processing':           { label: 'Processing',           color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', dot: 'bg-blue-500' },
  'Ticket Generated':     { label: 'Ticket Generated',     color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', dot: 'bg-red-500' },
  'Duplicate Ticket':     { label: 'Duplicate Ticket',     color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', dot: 'bg-orange-500' },
  'No Issue Detected':    { label: 'No Issue Detected',    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', dot: 'bg-green-500' },
  'Pending Verification': { label: 'Pending Verification', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', dot: 'bg-purple-500' },
  'Closed':               { label: 'Closed',               color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500' },
  'In Progress':          { label: 'In Progress',          color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', dot: 'bg-yellow-500' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
  const config = statusConfig[status] || statusConfig['Idle'];

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase",
      config.color,
      className
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dot, status === 'Processing' && "animate-pulse")} />
      {config.label}
    </div>
  );
};
