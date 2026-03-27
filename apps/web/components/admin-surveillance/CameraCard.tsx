'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, Maximize, MapPin, Loader2 } from 'lucide-react';
import { StatusBadge, CameraStatus } from './StatusBadge';
import { VerificationDropdown } from './VerificationDropdown';
import { cn } from "@/src/lib/utils";

export interface CameraData {
  camera_id: string;
  camera_name: string;
  road_type: string;
  latitude: number;
  longitude: number;
  digipin: string;
  video_url: string;
  status: CameraStatus;
  verification_result?: string;
}

interface CameraCardProps {
  data: CameraData;
  onUpdate: (id: string, updates: Partial<CameraData>) => void;
  onDelete: (id: string) => void;
}

export const CameraCard: React.FC<CameraCardProps> = ({ data, onUpdate, onDelete }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isResolvingDigipin, setIsResolvingDigipin] = useState(false);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
    onUpdate(data.camera_id, { status: 'Processing' });
  };

  const resolveDigipin = async (lat: number, lng: number) => {
    setIsResolvingDigipin(true);
    try {
      const res = await fetch(`http://localhost:8000/geocode?lat=${lat}&lng=${lng}`);
      const result = await res.json();
      if (result.digipin) {
        onUpdate(data.camera_id, { digipin: result.digipin });
      }
    } catch (err) {
      console.error("Failed to resolve DIGIPIN:", err);
    } finally {
      setIsResolvingDigipin(false);
    }
  };

  return (
    <div className="flex flex-col bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-[#2a2a2a] shadow-sm overflow-hidden group">
      {/* Header */}
      <div className="p-3 border-b border-gray-100 dark:border-[#2a2a2a] flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={data.camera_name}
            onChange={(e) => onUpdate(data.camera_id, { camera_name: e.target.value })}
            className="w-full bg-transparent font-bold text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#C9A84C] rounded px-1"
          />
          <select
            value={data.road_type}
            onChange={(e) => onUpdate(data.camera_id, { road_type: e.target.value })}
            className="text-[10px] text-gray-500 bg-transparent focus:outline-none cursor-pointer"
          >
            <option value="National Highway">National Highway</option>
            <option value="State Highway">State Highway</option>
            <option value="City Road">City Road</option>
            <option value="Colony Lane">Colony Lane</option>
          </select>
        </div>
        <button 
          onClick={() => onDelete(data.camera_id)}
          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Video Container */}
      <div className="relative aspect-video bg-black group/video">
        <video
          ref={videoRef}
          src={data.video_url}
          className="w-full h-full object-cover"
          onEnded={handleVideoEnd}
          playsInline
        />
        
        {/* Video Overlays */}
        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent flex items-center justify-between opacity-0 group-hover/video:opacity-100 transition-opacity">
          <button onClick={togglePlay} className="text-white hover:scale-110 transition-transform">
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <button className="text-white hover:scale-110 transition-transform">
            <Maximize size={18} />
          </button>
        </div>
      </div>

      {/* Location Section */}
      <div className="p-3 space-y-2 border-b border-gray-100 dark:border-[#2a2a2a]">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-gray-400">Latitude</label>
            <input
              type="number"
              value={data.latitude}
              step="0.0001"
              onChange={(e) => onUpdate(data.camera_id, { latitude: parseFloat(e.target.value) })}
              onBlur={() => resolveDigipin(data.latitude, data.longitude)}
              className="w-full bg-gray-50 dark:bg-[#161616] text-[11px] p-1.5 rounded border border-gray-100 dark:border-[#2a2a2a] focus:ring-1 focus:ring-[#C9A84C] outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-gray-400">Longitude</label>
            <input
              type="number"
              value={data.longitude}
              step="0.0001"
              onChange={(e) => onUpdate(data.camera_id, { longitude: parseFloat(e.target.value) })}
              onBlur={() => resolveDigipin(data.latitude, data.longitude)}
              className="w-full bg-gray-50 dark:bg-[#161616] text-[11px] p-1.5 rounded border border-gray-100 dark:border-[#2a2a2a] focus:ring-1 focus:ring-[#C9A84C] outline-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-[#161616] p-1.5 rounded border border-gray-100 dark:border-[#2a2a2a]">
          <MapPin size={12} className="text-[#C9A84C]" />
          <span className="text-[10px] font-mono font-bold text-gray-600 dark:text-gray-400 flex-1 truncate">
            {isResolvingDigipin ? "Resolving..." : (data.digipin || "NO DIGIPIN")}
          </span>
          {isResolvingDigipin && <Loader2 size={12} className="animate-spin text-gray-400" />}
        </div>
      </div>

      {/* Footer / Status */}
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-black text-gray-400 tracking-tighter">Current Status</span>
          <StatusBadge status={data.status} />
        </div>
        
        <div className="space-y-1">
           <span className="text-[10px] uppercase font-black text-gray-400 tracking-tighter">Field Verification</span>
           <VerificationDropdown 
              value={data.verification_result || ''}
              isEnabled={data.status === 'Pending Verification'}
              onChange={(val) => onUpdate(data.camera_id, { verification_result: val })}
           />
        </div>
      </div>
    </div>
  );
};
