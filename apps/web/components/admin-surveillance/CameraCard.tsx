'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, Maximize, MapPin, Loader2, Plus, Save, Trash2, Video } from 'lucide-react';
import { StatusBadge, CameraStatus } from './StatusBadge';
import { VerificationDropdown } from './VerificationDropdown';
import { cn } from "@/src/lib/utils";
import { supabase } from "@/src/lib/supabase";

export interface CameraData {
  camera_id?: string; // Optional for Add Mode
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
  isAddMode?: boolean;
  onUpdate?: (id: string, updates: Partial<CameraData>) => void;
  onSave?: (data: CameraData, file: File) => void;
  onDelete?: (id: string) => void;
  onAnalyzeNotFound?: () => void | Promise<void>;
}

export const CameraCard: React.FC<CameraCardProps> = ({ 
  data, 
  isAddMode = false, 
  onUpdate, 
  onSave, 
  onDelete,
  onAnalyzeNotFound,
}) => {
  // --- Local State ---
  const [localData, setLocalData] = useState<CameraData>(data);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isResolvingDigipin, setIsResolvingDigipin] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(data.video_url || null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync local data with props for existing cameras
  useEffect(() => {
    if (!isAddMode) {
      setLocalData(data);
      if (data.video_url) setVideoPreviewUrl(data.video_url);
    }
  }, [data, isAddMode]);

  // Real-time listener: auto-activate dropdown when worker triggers Pending Verification
  useEffect(() => {
    if (isAddMode || !localData.camera_id) return;

    const channel = supabase
      .channel(`camera-status-${localData.camera_id}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cctv_cameras',
          filter: `id=eq.${localData.camera_id}`,
        },
        (payload: any) => {
          const newStatus = payload.new?.last_status as CameraStatus | undefined;
          if (newStatus) {
            setLocalData(prev => ({ ...prev, status: newStatus }));
            if (onUpdate && localData.camera_id) {
              onUpdate(localData.camera_id, { status: newStatus });
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAddMode, localData.camera_id]);

  // --- Logic ---
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const handleVideoEnd = async () => {
    if (isAddMode || !onUpdate || !localData.camera_id) return;
    
    const requestId = `cctv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    setIsPlaying(false);
    onUpdate(localData.camera_id, { status: 'Processing' });

    console.info('[CCTV_DIAG][START]', {
      requestId,
      camera_id: localData.camera_id,
      video_url: localData.video_url,
      started_at: new Date().toISOString()
    });

    try {
      const response = await fetch(`${apiUrl}/cctv/analyze_live`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify({ camera_id: localData.camera_id })
      });

      const rawBody = await response.text();
      const contentType = response.headers.get('content-type');
      let result: any;
      try {
        result = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        console.error('[CCTV_DIAG][PARSE_ERROR]', {
          requestId,
          http_status: response.status,
          statusText: response.statusText,
          contentType,
          bodySize: rawBody.length,
          rawBody,
        });
        onUpdate(localData.camera_id, { status: 'Idle' });
        return;
      }

      if (!response.ok) {
        const failureType = response.status >= 500 ? 'HTTP_5XX' : 'HTTP_4XX';
        const backendError = result?.error || {};
        const backendCode = backendError.code as string | undefined;
        const backendStage = result?.stage_reached as string | undefined;
        console.error('[CCTV_DIAG][API_ERROR]', {
          requestId,
          failureType,
          http_status: response.status,
          statusText: response.statusText,
          contentType,
          bodySize: rawBody.length,
          rawBodySample: rawBody.slice(0, 500),
          backend_error_code: backendError.code,
          backend_error_message: backendError.message,
          backend_request_id: result?.request_id,
          backend_stage_reached: result?.stage_reached,
          result,
        });

        if (backendCode === 'NOT_FOUND' && backendStage === 'STAGE_1_CAMERA_FETCH') {
          console.warn('[CCTV_DIAG][ID_RESYNC_TRIGGER]', {
            requestId,
            camera_id: localData.camera_id,
            reason: 'Camera ID not found in backend, refreshing camera list',
          });
          if (onAnalyzeNotFound) {
            await onAnalyzeNotFound();
          }
        }

        onUpdate(localData.camera_id, { status: 'Idle' });
        return;
      }
      
      let finalStatus: CameraStatus = 'Idle';
      if (result.status === 'ticket_created') finalStatus = 'Ticket Generated';
      else if (result.status === 'duplicate_prevented') finalStatus = 'Duplicate Ticket';
      else if (result.status === 'no_signals_detected') finalStatus = 'No Issue Detected';
      else if (result.status === 'signal_buffered_suspected') finalStatus = 'No Issue Detected';

      if (!result.status) {
        console.error('[CCTV_DIAG][EMPTY_STATUS]', {
          requestId,
          result,
        });
      }

      console.info('[CCTV_DIAG][END]', {
        requestId,
        backend_status: result.status,
        finalStatus,
        ticket_id: result.ticket_id,
        complaint_id: result.complaint_id,
        diagnostics: result.diagnostics,
        elapsed_ms: Date.now() - startedAt,
      });

      const displayedTicketId = result.ticket_id || result.complaint_id || undefined;
      console.info('[CCTV_DIAG][TICKET_BAR]', {
        requestId,
        finalStatus,
        ticket_id: result.ticket_id,
        complaint_id: result.complaint_id,
        displayedTicketId,
      });

      onUpdate(localData.camera_id, { 
        status: finalStatus,
        verification_result: displayedTicketId
      });

    } catch (err) {
      console.error("[CCTV_DIAG][NETWORK_OR_RUNTIME_ERROR] AI Analysis failed:", {
        requestId,
        err,
      });
      onUpdate(localData.camera_id, { status: 'Idle' });
    }
  };

  const resolveDigipin = async (lat: number, lng: number) => {
    if (!lat || !lng) return;
    setIsResolvingDigipin(true);
    try {
      const res = await fetch(`${apiUrl}/geocode?lat=${lat}&lng=${lng}`);
      const result = await res.json();
      if (result.digipin) {
        if (isAddMode) {
          setLocalData(prev => ({ ...prev, digipin: result.digipin }));
        } else if (onUpdate && localData.camera_id) {
          onUpdate(localData.camera_id, { digipin: result.digipin });
        }
      }
    } catch (err) {
      console.error("Failed to resolve DIGIPIN:", err);
    } finally {
      setIsResolvingDigipin(false);
    }
  };

  const handleVerification = async (verificationResult: 'Repaired' | 'Not Repaired') => {
    if (!onUpdate || !localData.camera_id) return;
    
    setIsVerifying(true);
    const resultValue = verificationResult === 'Repaired' ? 'repaired' : 'not_repaired';
    
    try {
      const response = await fetch(`${apiUrl}/cctv/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          camera_id: localData.camera_id,
          verification_result: resultValue
        })
      });

      const result = await response.json();
      
      if (result.status && result.status.startsWith('verified_')) {
        setVerifyError(null);
        // Update camera status based on verification result
        let finalStatus: CameraStatus = 'Idle';
        if (result.verification_status === 'repaired') {
          finalStatus = 'Closed';
        } else if (result.verification_status === 'not_repaired') {
          finalStatus = 'In Progress';
        }

        onUpdate(localData.camera_id, {
          status: finalStatus,
          verification_result: verificationResult
        });
      } else {
        const errMsg = result.error?.message || result.detail || 'Verification failed. Please try again.';
        console.error('Verification failed:', result);
        setVerifyError(errMsg);
      }
    } catch (err) {
      console.error('Verification API call failed:', err);
      setVerifyError('Network error. Please check connection and try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoPreviewUrl(url);
      setLocalData(prev => ({ ...prev, video_url: url }));
    }
  };

  const handleSave = () => {
    if (onSave && videoFile) onSave(localData, videoFile);
  };

  const isFieldsDisabled = isAddMode && !videoPreviewUrl;
  const isSaveDisabled = isFieldsDisabled || !localData.camera_name || !localData.road_type;

  return (
    <div className={cn(
      "flex flex-col rounded-xl border border-gray-200 dark:border-[#2a2a2a] shadow-sm overflow-hidden group transition-all duration-200",
      isAddMode ? "bg-gray-50/50 dark:bg-[#1a1a1a]/50 border-dashed" : "bg-white dark:bg-[#1e1e1e]"
    )}>
      {/* Header */}
      <div className="p-3 border-b border-gray-100 dark:border-[#2a2a2a] flex items-center justify-between gap-2">
        <div className={cn("flex-1 min-w-0 space-y-1", isFieldsDisabled && "opacity-40 grayscale pointer-events-none")}>
          <input
            type="text"
            placeholder="Enter Camera Name..."
            disabled={isFieldsDisabled}
            value={localData.camera_name}
            onChange={(e) => {
              if (isAddMode) setLocalData(prev => ({ ...prev, camera_name: e.target.value }));
              else if (onUpdate && localData.camera_id) onUpdate(localData.camera_id, { camera_name: e.target.value });
            }}
            className="w-full bg-transparent font-bold text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#C9A84C] rounded px-1"
          />
          <select
            disabled={isFieldsDisabled}
            value={localData.road_type}
            onChange={(e) => {
              if (isAddMode) setLocalData(prev => ({ ...prev, road_type: e.target.value }));
              else if (onUpdate && localData.camera_id) onUpdate(localData.camera_id, { road_type: e.target.value });
            }}
            className="w-full text-[11px] text-gray-500 bg-transparent focus:outline-none cursor-pointer"
          >
            <option value="" disabled>Select Road Type</option>
            <option value="National Highway">National Highway</option>
            <option value="State Highway">State Highway</option>
            <option value="City Road">City Road</option>
            <option value="Colony Road">Colony Road</option>
          </select>
        </div>
        
        <div className="flex gap-1">
          {isAddMode ? (
            <button 
              onClick={handleSave}
              disabled={isSaveDisabled}
              title={isSaveDisabled ? "Please upload video and enter camera name" : "Save Camera"}
              className={cn(
                "p-2 rounded-lg transition-all",
                isSaveDisabled 
                  ? "text-gray-300 bg-gray-100 dark:bg-gray-800 cursor-not-allowed" 
                  : "text-white bg-blue-600 hover:bg-blue-700 shadow-sm"
              )}
            >
              <Save size={16} />
            </button>
          ) : (
            <button 
              onClick={() => onDelete && localData.camera_id && onDelete(localData.camera_id)}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Video / Add Container */}
      <div 
        className="relative aspect-video bg-[#050505] group/video flex items-center justify-center overflow-hidden" 
        onClick={() => isAddMode && !videoPreviewUrl && fileInputRef.current?.click()}
      >
        {videoPreviewUrl ? (
          <>
            <video
              ref={videoRef}
              src={videoPreviewUrl}
              controls={localData.status !== 'Processing'}
              className={cn("w-full h-full object-contain", localData.status === 'Processing' && "blur-[2px] opacity-60")}
              onEnded={handleVideoEnd}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              playsInline
            />
            {localData.status === 'Processing' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[4px] z-20">
                <Loader2 className="w-10 h-10 animate-spin text-white mb-3" />
                <div className="text-white text-sm font-bold tracking-tight px-4 py-2 rounded-lg bg-black/40 border border-white/20">
                  AI Signals Analysis In Progress...
                </div>
                <div className="mt-2 text-[10px] text-gray-300 uppercase tracking-widest font-bold">
                  Extracting 10 Burst Frames
                </div>
              </div>
            )}
            {isAddMode && localData.status !== 'Processing' && (
              <button 
                onClick={(e) => { e.stopPropagation(); setVideoPreviewUrl(null); setVideoFile(null); }}
                className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-md hover:bg-red-600 transition-colors z-10"
              >
                <Trash2 size={16} />
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-[#C9A84C] transition-colors p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-[#222] flex items-center justify-center mb-2">
              <Plus size={32} className="opacity-40" />
            </div>
            <span className="text-[10px] uppercase font-bold tracking-widest">Select Video File</span>
            <p className="text-[9px] text-gray-400 mt-1">CCTV footage for analysis</p>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="video/*" 
              onChange={handleFileChange} 
            />
          </div>
        )}
      </div>

      {/* Location Section */}
      <div className={cn("p-3 space-y-2 border-b border-gray-100 dark:border-[#2a2a2a]", isFieldsDisabled && "opacity-40 grayscale pointer-events-none")}>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-gray-400">Latitude</label>
            <input
              type="number"
              disabled={isFieldsDisabled}
              value={localData.latitude || ''}
              step="0.0001"
              placeholder="e.g. 28.6139"
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (isAddMode) setLocalData(prev => ({ ...prev, latitude: val }));
                else if (onUpdate && localData.camera_id) onUpdate(localData.camera_id, { latitude: val });
              }}
              onBlur={() => resolveDigipin(localData.latitude, localData.longitude)}
              className="w-full bg-gray-50 dark:bg-[#161616] text-[11px] p-1.5 rounded border border-gray-100 dark:border-[#2a2a2a] focus:ring-1 focus:ring-[#C9A84C] outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-gray-400">Longitude</label>
            <input
              type="number"
              disabled={isFieldsDisabled}
              value={localData.longitude || ''}
              step="0.0001"
              placeholder="e.g. 77.2090"
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (isAddMode) setLocalData(prev => ({ ...prev, longitude: val }));
                else if (onUpdate && localData.camera_id) onUpdate(localData.camera_id, { longitude: val });
              }}
              onBlur={() => resolveDigipin(localData.latitude, localData.longitude)}
              className="w-full bg-gray-50 dark:bg-[#161616] text-[11px] p-1.5 rounded border border-gray-100 dark:border-[#2a2a2a] focus:ring-1 focus:ring-[#C9A84C] outline-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-[#161616] p-1.5 rounded border border-gray-100 dark:border-[#2a2a2a]">
          <MapPin size={12} className="text-[#C9A84C]" />
          <span className="text-[10px] font-mono font-bold text-gray-600 dark:text-gray-400 flex-1 truncate">
            {isResolvingDigipin ? "Resolving..." : (localData.digipin || "NO DIGIPIN")}
          </span>
          {isResolvingDigipin && <Loader2 size={12} className="animate-spin text-gray-400" />}
        </div>
      </div>

      {/* Footer / Status */}
      <div className={cn("p-3 space-y-3", isAddMode && "opacity-30 grayscale pointer-events-none")}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-black text-gray-400 tracking-tighter">Current Status</span>
          <StatusBadge status={localData.status} />
        </div>

        {/* Ticket Info Section */}
        {(localData.status === 'Ticket Generated' || localData.status === 'Duplicate Ticket' || localData.status === 'Pending Verification') && localData.verification_result && (
          <div className={cn(
            "p-2 rounded border",
            localData.status === 'Duplicate Ticket'
              ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800"
              : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
          )}>
            <span className={cn(
              "text-[9px] uppercase font-black tracking-tighter block mb-1",
              localData.status === 'Duplicate Ticket'
                ? "text-orange-700 dark:text-orange-400"
                : "text-blue-700 dark:text-blue-400"
            )}>
              {localData.status === 'Duplicate Ticket' ? 'Duplicate Of Ticket' : 'Generated Ticket'}
            </span>
            <span className={cn(
              "text-[10px] font-mono font-bold break-all",
              localData.status === 'Duplicate Ticket'
                ? "text-orange-900 dark:text-orange-300"
                : "text-blue-900 dark:text-blue-300"
            )}>
              {localData.verification_result?.startsWith('DL-') ? localData.verification_result : `ID: ${localData.verification_result?.substring(0, 8)}...`}
            </span>
          </div>
        )}
        
        <div className="space-y-1">
           <span className="text-[10px] uppercase font-black text-gray-400 tracking-tighter">Field Verification</span>
           <VerificationDropdown 
              value={localData.verification_result || ''}
              isEnabled={localData.status === 'Pending Verification' && !isVerifying}
              onChange={(val) => handleVerification(val as 'Repaired' | 'Not Repaired')}
           />
           {isVerifying && (
             <div className="flex items-center justify-center gap-2 py-2 text-blue-600 dark:text-blue-400">
               <Loader2 size={12} className="animate-spin" />
               <span className="text-[9px] font-bold">Verifying...</span>
             </div>
           )}
           {verifyError && (
             <p className="text-[9px] font-semibold text-red-600 dark:text-red-400 mt-1">{verifyError}</p>
           )}
        </div>
      </div>
    </div>
  );
};
