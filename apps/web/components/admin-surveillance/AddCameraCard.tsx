'use client';

import React from 'react';
import { Plus } from 'lucide-react';

interface AddCameraCardProps {
  onClick: () => void;
}

export const AddCameraCard: React.FC<AddCameraCardProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center aspect-[4/5] bg-gray-50 dark:bg-[#161616] rounded-xl border-2 border-dashed border-gray-200 dark:border-[#2a2a2a] hover:border-[#C9A84C] hover:bg-gray-100 dark:hover:bg-[#1e1e1e] transition-all group"
    >
      <div className="w-12 h-12 rounded-full bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#2a2a2a] flex items-center justify-center mb-3 shadow-sm group-hover:scale-110 transition-transform">
        <Plus size={24} className="text-gray-400 group-hover:text-[#C9A84C]" />
      </div>
      <span className="text-sm font-bold text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300">
        Add New Camera
      </span>
      <span className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest font-bold">
        Surveillance Node
      </span>
    </button>
  );
};
