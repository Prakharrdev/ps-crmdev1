'use client';

import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from "@/src/lib/utils";

interface VerificationDropdownProps {
  value: string;
  isEnabled: boolean;
  onChange: (value: string) => void;
  className?: string;
}

export const VerificationDropdown: React.FC<VerificationDropdownProps> = ({
  value,
  isEnabled,
  onChange,
  className
}) => {
  return (
    <div className={cn("relative flex gap-2 w-full", className)}>
      <button
        type="button"
        disabled={!isEnabled}
        onClick={() => onChange('Repaired')}
        className={cn(
          "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-bold transition-all",
          value === 'Repaired' 
            ? "bg-green-500 text-white shadow-sm" 
            : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700",
          !isEnabled && "opacity-50 cursor-not-allowed filter grayscale"
        )}
      >
        <CheckCircle2 size={14} />
        REPAIRED
      </button>

      <button
        type="button"
        disabled={!isEnabled}
        onClick={() => onChange('Not Repaired')}
        className={cn(
          "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-bold transition-all",
          value === 'Not Repaired' 
            ? "bg-red-500 text-white shadow-sm" 
            : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700",
          !isEnabled && "opacity-50 cursor-not-allowed filter grayscale"
        )}
      >
        <XCircle size={14} />
        NOT REPAIRED
      </button>
    </div>
  );
};
