'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type {
  DashcamBox,
  DashcamFrame,
  DashcamOverlayState,
  DashcamPrecomputedArtifact,
} from './dashcam-review-types';

interface RenderRect {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

interface DashcamFrameOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  artifact?: DashcamPrecomputedArtifact | null;
  enabled?: boolean;
  onOverlayStateChange?: (state: DashcamOverlayState | null) => void;
}

const findNearestFrame = (frames: DashcamFrame[], timestampSec: number): DashcamFrame | null => {
  if (!frames.length) return null;

  let low = 0;
  let high = frames.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midValue = frames[mid].timestamp_sec;

    if (midValue < timestampSec) {
      low = mid + 1;
    } else if (midValue > timestampSec) {
      high = mid - 1;
    } else {
      return frames[mid];
    }
  }

  const right = Math.min(low, frames.length - 1);
  const left = Math.max(right - 1, 0);

  const leftDiff = Math.abs(frames[left].timestamp_sec - timestampSec);
  const rightDiff = Math.abs(frames[right].timestamp_sec - timestampSec);
  return leftDiff <= rightDiff ? frames[left] : frames[right];
};

const getRenderRect = (video: HTMLVideoElement): RenderRect | null => {
  const sourceW = video.videoWidth;
  const sourceH = video.videoHeight;
  const renderW = video.clientWidth;
  const renderH = video.clientHeight;

  if (!sourceW || !sourceH || !renderW || !renderH) return null;

  const sourceAspect = sourceW / sourceH;
  const renderAspect = renderW / renderH;

  if (sourceAspect > renderAspect) {
    const width = renderW;
    const height = width / sourceAspect;
    return {
      offsetX: 0,
      offsetY: (renderH - height) / 2,
      width,
      height,
    };
  }

  const height = renderH;
  const width = height * sourceAspect;
  return {
    offsetX: (renderW - width) / 2,
    offsetY: 0,
    width,
    height,
  };
};

const toOverlayStyle = (box: DashcamBox, sourceW: number, sourceH: number, rect: RenderRect): React.CSSProperties => {
  const x = rect.offsetX + (box.x1 / sourceW) * rect.width;
  const y = rect.offsetY + (box.y1 / sourceH) * rect.height;
  const width = ((box.x2 - box.x1) / sourceW) * rect.width;
  const height = ((box.y2 - box.y1) / sourceH) * rect.height;

  return {
    left: `${Math.max(0, x)}px`,
    top: `${Math.max(0, y)}px`,
    width: `${Math.max(1, width)}px`,
    height: `${Math.max(1, height)}px`,
  };
};

export const DashcamFrameOverlay: React.FC<DashcamFrameOverlayProps> = ({
  videoRef,
  artifact,
  enabled = false,
  onOverlayStateChange,
}) => {
  const [activeFrame, setActiveFrame] = useState<DashcamFrame | null>(null);
  const [renderRect, setRenderRect] = useState<RenderRect | null>(null);

  const frames = artifact?.frames ?? [];

  const clearOverlay = () => {
    setActiveFrame(null);
    setRenderRect(null);
    onOverlayStateChange?.(null);
  };

  const syncOverlayToVideo = () => {
    const video = videoRef.current;
    if (!video || !artifact || !enabled || !frames.length) {
      clearOverlay();
      return;
    }

    const rect = getRenderRect(video);
    const nearestFrame = findNearestFrame(frames, video.currentTime);

    if (!rect || !nearestFrame) {
      clearOverlay();
      return;
    }

    setRenderRect(rect);
    setActiveFrame(nearestFrame);
    onOverlayStateChange?.({
      frameIndex: nearestFrame.frame_index,
      timestampSec: nearestFrame.timestamp_sec,
      boxCount: nearestFrame.boxes.length,
    });
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !enabled) {
      clearOverlay();
      return;
    }

    const handlePlay = () => syncOverlayToVideo();
    const handleTimeUpdate = () => syncOverlayToVideo();
    const handleResize = () => syncOverlayToVideo();
    const handleLoadedMetadata = () => syncOverlayToVideo();

    const handlePauseOrEnd = () => clearOverlay();

    video.addEventListener('play', handlePlay);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('seeked', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('pause', handlePauseOrEnd);
    video.addEventListener('ended', handlePauseOrEnd);
    video.addEventListener('emptied', handlePauseOrEnd);
    window.addEventListener('resize', handleResize);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('seeked', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('pause', handlePauseOrEnd);
      video.removeEventListener('ended', handlePauseOrEnd);
      video.removeEventListener('emptied', handlePauseOrEnd);
      window.removeEventListener('resize', handleResize);
    };
  }, [artifact, enabled, videoRef]);

  const boxes = useMemo(() => {
    if (!activeFrame || !renderRect || !videoRef.current) return [];

    const sourceW = videoRef.current.videoWidth;
    const sourceH = videoRef.current.videoHeight;
    if (!sourceW || !sourceH) return [];

    return activeFrame.boxes.map((box, idx) => ({
      key: `${activeFrame.frame_index}-${box.track_id ?? idx}`,
      label: `${Math.round(box.confidence * 100)}%`,
      style: toOverlayStyle(box, sourceW, sourceH, renderRect),
    }));
  }, [activeFrame, renderRect, videoRef]);

  if (!enabled || !artifact || !activeFrame || !renderRect) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {boxes.map((box) => (
        <div
          key={box.key}
          className="absolute border-2 border-[#22c55e] bg-green-500/10 shadow-[0_0_0_1px_rgba(255,255,255,0.15)]"
          style={box.style}
        >
          <span className="absolute -top-5 left-0 rounded bg-[#22c55e] px-1 py-0.5 text-[9px] font-bold text-black">
            {box.label}
          </span>
        </div>
      ))}

      <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px] font-semibold tracking-wide text-white">
        Frame {activeFrame.frame_index} · {activeFrame.boxes.length} boxes
      </div>
    </div>
  );
};
