'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CameraCard, CameraData } from '@/components/admin-surveillance/CameraCard';
import { supabase } from '@/src/lib/supabase';
import { Loader2 } from 'lucide-react';

type SupabaseErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
};

const extractSupabaseError = (error: unknown): SupabaseErrorLike => {
  if (!error || typeof error !== 'object') {
    return { message: String(error) };
  }
  const e = error as Record<string, unknown>;
  return {
    message: typeof e.message === 'string' ? e.message : undefined,
    code: typeof e.code === 'string' ? e.code : undefined,
    details: typeof e.details === 'string' ? e.details : undefined,
    hint: typeof e.hint === 'string' ? e.hint : undefined,
    status: typeof e.status === 'number' ? e.status : undefined,
  };
};

const getSupabaseHost = (): string => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return 'missing';
  try {
    return new URL(raw).host;
  } catch {
    return 'malformed';
  }
};

const toVerificationLabel = (value?: string | null): string | undefined => {
  if (value === 'repaired') return 'Repaired';
  if (value === 'not_repaired') return 'Not Repaired';
  return undefined;
};

const toVerificationStatus = (value?: string): string | undefined => {
  if (value === 'Repaired') return 'repaired';
  if (value === 'Not Repaired') return 'not_repaired';
  return undefined;
};

export default function SurveillancePage() {
  const [cameras, setCameras] = useState<CameraData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const mapCameraRow = useCallback((cam: any): CameraData => ({
    camera_id: cam.id,
    camera_name: cam.name,
    road_type: cam.road_type,
    latitude: cam.latitude,
    longitude: cam.longitude,
    digipin: cam.digipin,
    video_url: cam.video_url,
    status: cam.last_status || 'Idle',
    generated_ticket_id: cam.generated_ticket_id || undefined,
    verification_result: toVerificationLabel(cam.verification_status),
  }), []);

  const fetchCameras = useCallback(async (showLoader = true) => {
    if (showLoader) setIsLoading(true);
    const { data, error } = await (supabase
      .from('cctv_cameras' as any)
      .select('*')
      .order('created_at', { ascending: true }) as any);

    if (error) {
      console.error('[SURVEILLANCE][FETCH_CAMERAS_ERROR]', {
        context: 'cctv_cameras.select',
        supabaseHost: getSupabaseHost(),
        error: extractSupabaseError(error),
        rawError: error,
      });
    } else if (data) {
      setCameras(data.map(mapCameraRow));
    }
    if (showLoader) setIsLoading(false);
  }, [mapCameraRow]);

  useEffect(() => {
    void fetchCameras();
  }, [fetchCameras]);

  useEffect(() => {
    const channel = supabase
      .channel('surveillance-cctv-cameras')
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'cctv_cameras' },
        (payload: any) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = payload.old?.id as string | undefined;
            if (!deletedId) return;
            setCameras((prev) => prev.filter((cam) => cam.camera_id !== deletedId));
            return;
          }

          const row = payload.new;
          if (!row?.id) return;
          const mapped = mapCameraRow(row);

          setCameras((prev) => {
            const idx = prev.findIndex((cam) => cam.camera_id === mapped.camera_id);
            if (idx === -1) return [...prev, mapped];
            const next = [...prev];
            next[idx] = { ...next[idx], ...mapped };
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mapCameraRow]);

  const handleUpdateCamera = async (id: string, updates: Partial<CameraData>) => {
    // Optimistic update
    setCameras(prev => prev.map(cam => 
      cam.camera_id === id ? { ...cam, ...updates } : cam
    ));

    // Persist to DB if the changes are metadata related
    const dbUpdates: any = {};
    if (updates.camera_name !== undefined) dbUpdates.name = updates.camera_name;
    if (updates.road_type !== undefined) dbUpdates.road_type = updates.road_type;
    if (updates.latitude !== undefined) dbUpdates.latitude = updates.latitude;
    if (updates.longitude !== undefined) dbUpdates.longitude = updates.longitude;
    if (updates.digipin !== undefined) dbUpdates.digipin = updates.digipin;
    if (updates.status !== undefined) dbUpdates.last_status = updates.status;
    if (updates.generated_ticket_id !== undefined) dbUpdates.generated_ticket_id = updates.generated_ticket_id;
    if (updates.verification_result !== undefined) {
      dbUpdates.verification_status = toVerificationStatus(updates.verification_result);
    }

    if (Object.keys(dbUpdates).length > 0) {
      await supabase.from('cctv_cameras' as any).update(dbUpdates).eq('id', id);
    }
  };

  const handleDeleteCamera = async (id: string) => {
    if (confirm("Are you sure you want to delete this surveillance node?")) {
      const { error } = await supabase
        .from('cctv_cameras' as any)
        .delete()
        .eq('id', id);

      if (error) {
        alert('Failed to delete camera: ' + error.message);
      } else {
        setCameras(prev => prev.filter(cam => cam.camera_id !== id));
      }
    }
  };

  const handleSaveNewCamera = async (newCam: CameraData, file: File) => {
    setIsLoading(true);
    try {
      // 1. Upload video to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `cctv_footage/${fileName}`;

      let uploadError: any = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const uploadResult = await supabase.storage
            .from('cctv-videos')
            .upload(filePath, file, { upsert: true });
          uploadError = uploadResult.error;
          if (!uploadError) break;

          console.error('[SURVEILLANCE][UPLOAD_ERROR]', {
            attempt,
            bucket: 'cctv-videos',
            filePath,
            supabaseHost: getSupabaseHost(),
            error: extractSupabaseError(uploadError),
            rawError: uploadError,
          });

          // Retry once only for transient fetch/network issues
          const msg = uploadError?.message || '';
          const shouldRetry = attempt === 1 && /failed to fetch|network|fetch/i.test(msg);
          if (!shouldRetry) break;
        } catch (err) {
          const isNetworkError = err instanceof TypeError;
          console.error('[SURVEILLANCE][UPLOAD_RUNTIME_ERROR]', {
            attempt,
            bucket: 'cctv-videos',
            filePath,
            supabaseHost: getSupabaseHost(),
            isNetworkError,
            message: err instanceof Error ? err.message : String(err),
            rawError: err,
          });

          if (!(isNetworkError && attempt === 1)) {
            throw err;
          }
        }
      }

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message || 'Unknown upload error'}`);
      }

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('cctv-videos')
        .getPublicUrl(filePath);

      // 3. Insert metadata into DB
      const { data, error } = await (supabase
        .from('cctv_cameras' as any)
        .insert({
          name: newCam.camera_name,
          road_type: newCam.road_type,
          latitude: newCam.latitude,
          longitude: newCam.longitude,
          digipin: newCam.digipin,
          video_url: publicUrl,
          last_status: 'Idle'
        })
        .select()
        .single() as any);

      if (error) {
        console.error('[SURVEILLANCE][DB_INSERT_ERROR]', {
          context: 'cctv_cameras.insert',
          supabaseHost: getSupabaseHost(),
          payloadPreview: {
            name: newCam.camera_name,
            road_type: newCam.road_type,
            latitude: newCam.latitude,
            longitude: newCam.longitude,
            digipin: newCam.digipin,
            video_url_present: Boolean(publicUrl),
          },
          error: extractSupabaseError(error),
          rawError: error,
        });
        throw new Error(`DB Insert failed: ${error.message}`);
      }

      if (data) {
        // Force refresh from DB to avoid stale in-memory IDs.
        await fetchCameras(false);
      }
    } catch (err: any) {
      const isNetworkError = err instanceof TypeError || /failed to fetch/i.test(err?.message || '');
      if (isNetworkError) {
        console.error('[SURVEILLANCE][NETWORK_FAILURE]', {
          message: err?.message,
          supabaseHost: getSupabaseHost(),
        });
      }
      alert(err.message);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-[#161616]">
        <Loader2 className="w-8 h-8 animate-spin text-[#C9A84C]" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50 dark:bg-[#161616]">
      <div className="max-w-[1600px] mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {cameras.map((camera) => (
            <CameraCard
              key={camera.camera_id}
              data={camera}
              onUpdate={handleUpdateCamera}
              onDelete={handleDeleteCamera}
              onAnalyzeNotFound={() => fetchCameras(false)}
            />
          ))}          
          {/* Permanent Add Camera Card */}
          <CameraCard
            isAddMode
            data={{
              camera_name: '',
              road_type: 'City Road',
              latitude: 0,
              longitude: 0,
              digipin: '',
              video_url: '',
              status: 'Idle'
            }}
            onSave={handleSaveNewCamera}
          />
        </div>
        
        {cameras.length === 0 && (
          <div className="mt-12 text-center">
            <p className="text-gray-500 dark:text-gray-400 font-medium">No active surveillance nodes.</p>
            <p className="text-xs text-gray-400">Use the card above to register a new camera point.</p>
          </div>
        )}
      </div>
    </div>
  );
}
