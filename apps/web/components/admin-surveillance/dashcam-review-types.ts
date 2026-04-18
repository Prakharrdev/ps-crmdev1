export interface DashcamBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
  track_id?: string;
}

export interface DashcamFrame {
  frame_index: number;
  timestamp_sec: number;
  boxes: DashcamBox[];
}

export interface DashcamPolicy {
  display_conf_threshold?: number;
  road_region_y_min?: number;
  min_box_area_ratio?: number;
  max_box_area_ratio?: number;
  temporal_min_hits?: number;
  temporal_window?: number;
  smoothing_window?: number;
  max_boxes_per_frame?: number;
  [key: string]: number | undefined;
}

export interface DashcamPrecomputedArtifact {
  video_id: string;
  fps_source: number;
  fps_processed: number;
  frame_count_processed: number;
  generated_at: string;
  policy: DashcamPolicy;
  frames: DashcamFrame[];
}

export interface DashcamOverlayState {
  frameIndex: number;
  timestampSec: number;
  boxCount: number;
}
