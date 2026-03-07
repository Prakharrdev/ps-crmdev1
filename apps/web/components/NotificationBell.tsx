'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';

type NotificationBellProps = {
  className?: string;
};

export default function NotificationBell({ className }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }

    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Notifications"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <Bell size={18} />
      </button>

      {open ? (
        <div className="absolute right-0 z-[60] mt-2 w-72 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
          waiting for new notification
        </div>
      ) : null}
    </div>
  );
}
