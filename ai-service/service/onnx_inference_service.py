from __future__ import annotations

import io
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image
from ultralytics import YOLO
import cv2
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("InferenceService")

import os
from dotenv import load_dotenv

# Load .env if present
load_dotenv()

@dataclass
class InferenceConfig:
    """Configuration for YOLO inference. Frozen for System Reliability phase (Mar 24, 2026)."""
    conf: float = None
    iou: float = 0.7
    imgsz: int = None
    device: str = None

    def __post_init__(self):
        if self.conf is None:
            self.conf = float(os.getenv("CONF_THRESHOLD", 0.35))
        if self.imgsz is None:
            self.imgsz = int(os.getenv("IMGSZ", 640))
        if self.device is None:
            self.device = os.getenv("DEVICE", "cpu")


class OnnxInferenceService:
    """
    Thin ONNX inference adapter for pothole detection using frozen model settings.
    This service is the source of truth for the 'Detector Signal' in the V2 loop.
    """

    def __init__(self, model_path: str | Path, config: InferenceConfig | None = None) -> None:
        self.model_path = str(Path(model_path).resolve())
        self.config = config or InferenceConfig()
        
        # Diagnostic: Check for ONNX GPU Support
        try:
            import onnxruntime as ort
            providers = ort.get_available_providers()
            logger.info(f"Available ONNX providers: {providers}")
            if 'CUDAExecutionProvider' in providers:
                logger.info("Successfully identified CUDA GPU Acceleration!")
            else:
                logger.warning("CUDA not found in ONNX providers. Falling back to CPU.")
        except ImportError:
            logger.warning("onnxruntime not found. Skipping GPU diagnostic.")

        self.model = YOLO(self.model_path)

    def predict_image(self, image_cv2) -> dict[str, Any]:
        """Perform inference on a numpy array (OpenCV frame)."""
        image_rgb = cv2.cvtColor(image_cv2, cv2.COLOR_BGR2RGB)
        image_pil = Image.fromarray(image_rgb)
        
        # We reuse the logic but without byte conversion
        return self._predict_common(image_pil)

    def predict_image_bytes(self, image_bytes: bytes) -> dict[str, Any]:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        return self._predict_common(image)

    def _predict_common(self, image: Image.Image) -> dict[str, Any]:
        start = time.perf_counter()
        logger.debug(f"Inference request received. Imgsz: {self.config.imgsz}")

        result = self.model.predict(
            source=image,
            conf=self.config.conf,
            iou=self.config.iou,
            imgsz=self.config.imgsz,
            device=self.config.device,
            verbose=False,
            save=False,
        )[0]

        detections = []
        best_conf = 0.0
        if result.boxes is not None and len(result.boxes) > 0:
            xyxy = result.boxes.xyxy.cpu().tolist()
            confs = result.boxes.conf.cpu().tolist()
            clss = result.boxes.cls.cpu().tolist()

            for i in range(len(xyxy)):
                cls_id = int(clss[i])
                conf = round(confs[i], 4)
                if conf > best_conf: best_conf = conf
                
                detections.append({
                    "class_id": cls_id,
                    "class_name": "pothole" if cls_id == 0 else f"class_{cls_id}",
                    "confidence": conf,
                    "bbox_xyxy": [round(float(v), 3) for v in xyxy[i]],
                    "severity": self._severity_from_confidence(conf),
                })

        latency_ms = (time.perf_counter() - start) * 1000
        logger.info(f"Inferred frame in {latency_ms:.1f}ms. Detections: {len(detections)}. Max Conf: {best_conf:.2f}")

        return {
            "model_path": self.model_path,
            "config": {
                "conf": self.config.conf,
                "iou": self.config.iou,
                "imgsz": self.config.imgsz,
            },
            "detections": detections,
            "num_detections": len(detections),
            "best_confidence": round(best_conf, 6),
            "pothole_detected": len(detections) > 0,
            "latency_ms": round(latency_ms, 3),
        }

    def draw_detections(self, image: Image.Image, detections: list[dict[str, Any]]) -> Image.Image:
        """Draw bounding boxes and labels on a PIL image for Visual Evidence."""
        from PIL import ImageDraw, ImageFont
        
        # Create a copy to avoid modifying original
        img_out = image.copy()
        draw = ImageDraw.Draw(img_out)
        
        try:
            # Increase font size for readability
            font = ImageFont.truetype("arial.ttf", 24)
        except Exception:
            font = ImageFont.load_default()

        for det in detections:
            bbox = det["bbox_xyxy"]  # [x1, y1, x2, y2]
            conf = det["confidence"]
            label = f"POTHOLE ({conf:.2f})"
            
            # Severity color coding (Red for high-conf/critical, Yellow for low-conf)
            color = "#FF0000" if conf >= 0.7 else "#FFFF00"
            
            # Draw bounding box
            draw.rectangle(bbox, outline=color, width=5)
            
            # Draw label tab
            text_bbox = draw.textbbox((bbox[0], bbox[1] - 30), label, font=font)
            draw.rectangle(text_bbox, fill=color)
            draw.text((bbox[0], bbox[1] - 30), label, fill="#000000", font=font)
            
        return img_out

    @staticmethod
    def _severity_from_confidence(score: float) -> str:
        if score >= 0.90:
            return "L3_HIGH"
        if score >= 0.70:
            return "L2_MEDIUM"
        return "L1_LOW"
