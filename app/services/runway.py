"""Runway-backed generator for missing contextual clips.

When no API key is configured, falls back to an FFmpeg placeholder: a vertical
9:16 clip with a dark background and the prompt text baked in via `drawtext`.
That keeps the end-to-end pipeline runnable before the operator has Runway
credentials, and gives the rendered video visual signposts that flag which
scene roles are still gaps.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import textwrap
import time
import urllib.error
import urllib.request
from typing import Any

from app.config import FFMPEG_BIN
from app.config_store import runway_api_key

logger = logging.getLogger(__name__)

RUNWAY_BASE = "https://api.dev.runwayml.com/v1"
RUNWAY_API_VERSION = "2024-11-06"
_POLL_TIMEOUT_SEC = 600
_POLL_INTERVAL_SEC = 5

# Runway image_to_video only accepts these durations (seconds).
_VIDEO_DURATIONS = (5, 10)

# gen4_image ratios (text_to_image). See https://docs.dev.runwayml.com/api/
_IMAGE_RATIOS = {
    "9:16": "1080:1920",
    "16:9": "1920:1080",
    "1:1": "1080:1080",
}

# gen4_turbo image_to_video ratios.
_VIDEO_RATIOS = {
    "9:16": "720:1280",
    "16:9": "1280:720",
    "1:1": "960:960",
}


def is_stub_mode() -> bool:
    return not bool(runway_api_key())


def generate_clip(
    prompt: str,
    out_path: str,
    *,
    duration_sec: float = 5.0,
    aspect_ratio: str = "9:16",
) -> tuple[str, str]:
    """Produce a clip at out_path. Returns (source_tag, model_used)."""
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    if is_stub_mode():
        _ffmpeg_placeholder(prompt, out_path, duration_sec, aspect_ratio)
        return "ffmpeg_stub", "ffmpeg-drawtext-placeholder"
    try:
        _runway_text_to_video(prompt, out_path, duration_sec, aspect_ratio)
        return "runway", "gen3a_turbo"
    except Exception:
        logger.exception("Runway call failed; falling back to ffmpeg placeholder")
        _ffmpeg_placeholder(prompt, out_path, duration_sec, aspect_ratio)
        return "ffmpeg_stub", "ffmpeg-drawtext-placeholder"


def _ffmpeg_placeholder(prompt: str, out_path: str, duration_sec: float, aspect_ratio: str) -> None:
    width, height = _ar_to_dims(aspect_ratio)
    wrapped = "\n".join(textwrap.wrap(prompt, width=28))[:400]
    escaped = wrapped.replace("\\", "\\\\").replace(":", r"\:").replace("'", r"\'")
    vf = (
        f"drawtext=fontcolor=white:fontsize=48:"
        f"x=(w-text_w)/2:y=(h-text_h)/2:"
        f"box=1:boxcolor=0x00000066:boxborderw=24:"
        f"text='{escaped}'"
    )
    cmd = [
        FFMPEG_BIN,
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"color=c=0x0f172a:s={width}x{height}:d={max(1.0, duration_sec)}:r=24",
        "-vf",
        vf,
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        "-t",
        str(max(1.0, duration_sec)),
        out_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True, timeout=120)


def _ar_to_dims(aspect_ratio: str) -> tuple[int, int]:
    ar = (aspect_ratio or "9:16").strip()
    if ar == "16:9":
        return 1920, 1080
    if ar == "1:1":
        return 1080, 1080
    return 720, 1280


def _runway_text_to_video(prompt: str, out_path: str, duration_sec: float, aspect_ratio: str) -> None:
    """Runway Gen-3/4 is image-first: generate an image from the prompt, then
    feed that image to image_to_video."""
    key = runway_api_key()
    duration = 5 if duration_sec <= 7.5 else 10
    image_ratio = _IMAGE_RATIOS.get(aspect_ratio, _IMAGE_RATIOS["9:16"])
    video_ratio = _VIDEO_RATIOS.get(aspect_ratio, _VIDEO_RATIOS["9:16"])

    image_url = _runway_text_to_image(prompt, image_ratio, key)
    logger.info("Runway: got starting image, submitting image_to_video duration=%ss", duration)
    video_url = _runway_image_to_video(prompt, image_url, video_ratio, duration, key)
    _download(video_url, out_path)


def _runway_text_to_image(prompt: str, ratio: str, key: str) -> str:
    body = {
        "promptText": prompt[:1000],
        "model": "gen4_image",
        "ratio": ratio,
    }
    task_id = _post_runway("/text_to_image", body, key)
    return _poll_runway(f"/tasks/{task_id}", key)


def _runway_image_to_video(
    prompt: str, image_url: str, ratio: str, duration: int, key: str
) -> str:
    body = {
        "promptImage": image_url,
        "promptText": prompt[:1000],
        "model": "gen4_turbo",
        "ratio": ratio,
        "duration": duration,
    }
    task_id = _post_runway("/image_to_video", body, key)
    return _poll_runway(f"/tasks/{task_id}", key)


def _post_runway(path: str, body: dict, key: str) -> str:
    url = f"{RUNWAY_BASE}{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "X-Runway-Version": RUNWAY_API_VERSION,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload: dict[str, Any] = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")[:1500]
        logger.error("Runway POST %s failed %s: %s\nBody sent: %s", url, e.code, body_text, json.dumps(body)[:1000])
        raise ValueError(f"Runway {e.code} {e.reason}: {body_text}") from e
    task_id = payload.get("id") or (payload.get("task") or {}).get("id")
    if not task_id:
        raise ValueError(f"Unexpected Runway response: {payload}")
    return str(task_id)


def _poll_runway(path: str, key: str) -> str:
    url = f"{RUNWAY_BASE}{path}"
    headers = {"Authorization": f"Bearer {key}", "X-Runway-Version": RUNWAY_API_VERSION}
    deadline = time.time() + _POLL_TIMEOUT_SEC
    while time.time() < deadline:
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload: dict[str, Any] = json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body_text = e.read().decode("utf-8", errors="replace")[:1500]
            raise ValueError(f"Runway poll {e.code} {e.reason}: {body_text}") from e
        status = (payload.get("status") or "").upper()
        if status in ("SUCCEEDED", "SUCCESS", "COMPLETED"):
            outputs = payload.get("output") or payload.get("outputs") or []
            if isinstance(outputs, list) and outputs:
                return str(outputs[0])
            raise ValueError(f"Runway task completed without an output URL: {payload}")
        if status in ("FAILED", "ERROR", "CANCELED", "CANCELLED"):
            raise ValueError(f"Runway task failed: {payload}")
        time.sleep(_POLL_INTERVAL_SEC)
    raise TimeoutError("Runway task polling timed out")


def _download(url: str, dest: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
    urllib.request.urlretrieve(url, dest)
