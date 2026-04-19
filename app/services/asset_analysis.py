"""Inspect uploaded videos with ffprobe — feeds dimensions/duration/aspect/fps
back to the planner and the Shotstack builder so narrow/short hero clips get
the right treatment instead of being played flat."""

from __future__ import annotations

import json
import logging
import subprocess
from typing import Any

from app.config import FFPROBE_BIN

logger = logging.getLogger(__name__)


def _parse_rate(rate: str) -> float:
    try:
        num, denom = rate.split("/")
        d = float(denom)
        return float(num) / d if d else 0.0
    except Exception:
        return 0.0


def probe_video(file_path: str) -> dict[str, Any]:
    try:
        proc = subprocess.run(
            [
                FFPROBE_BIN,
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                file_path,
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=True,
        )
        data: dict[str, Any] = json.loads(proc.stdout or "{}")
    except FileNotFoundError as e:
        logger.warning("ffprobe not found (%s); skipping asset analysis", e)
        return {}
    except subprocess.CalledProcessError as e:
        logger.warning("ffprobe failed for %s: %s", file_path, e.stderr)
        return {}
    except subprocess.TimeoutExpired:
        logger.warning("ffprobe timeout for %s", file_path)
        return {}

    width = height = 0
    fps = 0.0
    for s in data.get("streams", []) or []:
        if s.get("codec_type") == "video":
            width = int(s.get("width") or 0)
            height = int(s.get("height") or 0)
            fps = _parse_rate(s.get("r_frame_rate") or "0/1")
            break
    try:
        duration = float((data.get("format") or {}).get("duration") or 0.0)
    except (TypeError, ValueError):
        duration = 0.0
    aspect = (width / height) if width and height else 0.0
    is_narrow = 0 < aspect < 0.75  # narrower than 3:4 — needs layered treatment in 9:16
    is_short = 0 < duration < 10  # requires reuse/variation across scenes
    return {
        "width": width,
        "height": height,
        "fps": fps,
        "duration_sec": round(duration, 3),
        "aspect_ratio": round(aspect, 4),
        "is_narrow": is_narrow,
        "is_short": is_short,
        "raw": data,
    }
