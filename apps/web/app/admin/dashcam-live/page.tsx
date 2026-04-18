'use client';

import React, { useMemo, useEffect, useState } from 'react';
import { CameraCard, CameraData } from '@/components/admin-surveillance/CameraCard';
import type {
  DashcamBox,
  DashcamOverlayState,
  DashcamPrecomputedArtifact,
} from '@/components/admin-surveillance/dashcam-review-types';

const PERMANENT_VIDEOS = [
  { name: 'smooth_vid1.mp4', url: 'https://bsdxzdydrhraaawkzglw.supabase.co/storage/v1/object/public/dashcam-demo/video/permanent/smooth_vid1.mp4' },
  { name: 'smooth_vid2.mp4', url: 'https://bsdxzdydrhraaawkzglw.supabase.co/storage/v1/object/public/dashcam-demo/video/permanent/smooth_vid2.mp4' },
  { name: 'video_1.mp4', url: 'https://bsdxzdydrhraaawkzglw.supabase.co/storage/v1/object/public/dashcam-demo/video/permanent/video_1.mp4' },
  { name: 'video_2.mp4', url: 'https://bsdxzdydrhraaawkzglw.supabase.co/storage/v1/object/public/dashcam-demo/video/permanent/video_2.mp4' },
];

const normalizeName = (name: string): string => name.trim().toLowerCase();

const centroid = (box: DashcamBox): { x: number; y: number } => ({
  x: (box.x1 + box.x2) / 2,
  y: (box.y1 + box.y2) / 2,
});

type PairKeyedBox = {
  key: string;
  box: DashcamBox;
};

const toKeyedBoxes = (boxes: DashcamBox[]): PairKeyedBox[] =>
  boxes.map((box, idx) => ({
    key: box.track_id ? String(box.track_id) : `idx_${idx}`,
    box,
  }));

const pairBoxes = (prev: DashcamBox[], next: DashcamBox[]): Array<[DashcamBox, DashcamBox]> => {
  const prevKeyed = toKeyedBoxes(prev);
  const nextKeyed = toKeyedBoxes(next);
  const nextByKey = new Map(nextKeyed.map((item) => [item.key, item.box]));

  const pairs: Array<[DashcamBox, DashcamBox]> = [];
  for (const item of prevKeyed) {
    const target = nextByKey.get(item.key);
    if (target) {
      pairs.push([item.box, target]);
      nextByKey.delete(item.key);
    }
  }

  if (pairs.length > 0) return pairs;

  const fallbackLength = Math.min(prev.length, next.length);
  for (let i = 0; i < fallbackLength; i += 1) {
    pairs.push([prev[i], next[i]]);
  }

  return pairs;
};

interface QualityMetrics {
  totalFrames: number;
  nonEmptyFrames: number;
  totalBoxes: number;
  maxCentroidJumpPx: number;
  avgCentroidJumpPx: number;
}

interface RuntimeStreamState {
  videoFileName: string;
  videoSizeBytes: number;
  artifact: DashcamPrecomputedArtifact | null;
  mappingStatus: 'resolved' | 'missing' | 'error';
  mappingMessage: string;
  locked: boolean;
  overlayState: DashcamOverlayState | null;
  metrics: QualityMetrics | null;
}

const buildQualityMetrics = (artifact: DashcamPrecomputedArtifact): QualityMetrics => {
  const frames = artifact.frames ?? [];
  const nonEmptyFrames = frames.filter((f) => f.boxes.length > 0).length;
  const totalBoxes = frames.reduce((sum, frame) => sum + frame.boxes.length, 0);

  const centroidDeltas: number[] = [];
  for (let i = 1; i < frames.length; i += 1) {
    const pairs = pairBoxes(frames[i - 1].boxes, frames[i].boxes);
    for (const [prevBox, nextBox] of pairs) {
      const a = centroid(prevBox);
      const b = centroid(nextBox);
      centroidDeltas.push(Math.hypot(a.x - b.x, a.y - b.y));
    }
  }

  return {
    totalFrames: frames.length,
    nonEmptyFrames,
    totalBoxes,
    maxCentroidJumpPx: centroidDeltas.length > 0 ? Math.max(...centroidDeltas) : 0,
    avgCentroidJumpPx: centroidDeltas.length > 0
      ? centroidDeltas.reduce((sum, value) => sum + value, 0) / centroidDeltas.length
      : 0,
  };
};

export default function DashcamLivePage() {
  const [dashcamStreams, setDashcamStreams] = useState<CameraData[]>([]);
  const [runtimeByStreamId, setRuntimeByStreamId] = useState<Record<string, RuntimeStreamState>>({});

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  useEffect(() => {
    let mounted = true;

    async function initializePermanentStreams() {
      const streams: CameraData[] = [];
      const runtimes: Record<string, RuntimeStreamState> = {};

      for (let i = 0; i < PERMANENT_VIDEOS.length; i++) {
        const vid = PERMANENT_VIDEOS[i];
        const streamId = `dashcam_fixed_${i}`;

        streams.push({
          camera_id: streamId,
          camera_name: `DASHCAM_${vid.name.replace(/\.[^.]+$/, '').toUpperCase()}`,
          road_type: 'City Road',
          latitude: 0,
          longitude: 0,
          digipin: '',
          video_url: vid.url,
          status: 'Idle',
        });

        runtimes[streamId] = {
          videoFileName: vid.name,
          videoSizeBytes: 0,
          artifact: null,
          mappingStatus: 'missing',
          mappingMessage: 'Loading mapping data...',
          locked: false,
          overlayState: null,
          metrics: null,
        };
      }

      setDashcamStreams(streams);
      setRuntimeByStreamId(runtimes);

      // Async fetch precomputed artifacts individually
      for (let i = 0; i < PERMANENT_VIDEOS.length; i++) {
        const vid = PERMANENT_VIDEOS[i];
        const streamId = `dashcam_fixed_${i}`;

        try {
          const response = await fetch(`${apiUrl}/dashcam/precomputed/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: vid.name,
            }),
          });

          if (response.ok) {
            const payload = await response.json();
            const artifact = payload?.artifact;
            if (artifact && Array.isArray(artifact.frames) && mounted) {
              setRuntimeByStreamId((prev) => ({
                ...prev,
                [streamId]: {
                  ...prev[streamId],
                  artifact,
                  mappingStatus: 'resolved',
                  mappingMessage: 'Ready to play.',
                  locked: Boolean(payload?.resolved?.locked),
                  metrics: buildQualityMetrics(artifact),
                },
              }));
            } else if (mounted) {
              setRuntimeByStreamId((prev) => ({
                ...prev,
                [streamId]: {
                  ...prev[streamId],
                  mappingStatus: 'error',
                  mappingMessage: 'Artifact format invalid.',
                },
              }));
            }
          } else if (mounted) {
             setRuntimeByStreamId((prev) => ({
                ...prev,
                [streamId]: {
                  ...prev[streamId],
                  mappingStatus: 'error',
                  mappingMessage: 'Failed to resolve map.',
                },
              }));
          }
        } catch (err) {
          console.error(`Error resolving artifact for ${vid.name}`, err);
          if (mounted) {
            setRuntimeByStreamId((prev) => ({
              ...prev,
              [streamId]: {
                ...prev[streamId],
                mappingStatus: 'error',
                mappingMessage: 'Network error resolving map.',
              },
            }));
          }
        }
      }
    }

    initializePermanentStreams();

    return () => {
      mounted = false;
    };
  }, [apiUrl]);

  const handleUpdateStream = (id: string, updates: Partial<CameraData>) => {
    setDashcamStreams((prev) =>
      prev.map((stream) => (stream.camera_id === id ? { ...stream, ...updates } : stream)),
    );
  };

  const setOverlayState = (streamId: string, state: DashcamOverlayState | null) => {
    setRuntimeByStreamId((prev) => {
      const runtime = prev[streamId];
      if (!runtime) return prev;

      return {
        ...prev,
        [streamId]: {
          ...runtime,
          overlayState: state,
        },
      };
    });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-4 dark:bg-[#161616] md:p-6">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Dashcam Telemetry Feed</h1>
            <p className="text-sm font-medium text-gray-500">
              Live streams connecting directly to the central remote surveillance bucket.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-4 sm:grid-cols-2">
          {dashcamStreams.map((stream) => {
            const streamId = stream.camera_id ?? '';
            const runtime = runtimeByStreamId[streamId];
            if (!runtime) return null;

            return (
              <div key={streamId} className="space-y-3">
                <CameraCard
                  data={stream}
                  localOnly
                  reviewMode
                  videoOnlyMode
                  reviewArtifact={runtime.artifact}
                  onOverlayStateChange={(state) => setOverlayState(streamId, state)}
                  onUpdate={handleUpdateStream}
                  onDelete={() => {}} // Disabling delete action for permanent streams
                />
                
                {runtime.mappingStatus !== 'resolved' && (
                  <div className={`rounded-xl border p-3 text-[12px] font-medium ${runtime.mappingStatus === 'error' ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300' : 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300'}`}>
                    {runtime.mappingMessage}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
