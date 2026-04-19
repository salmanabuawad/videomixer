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
_POLL_TIMEOUT_SEC = 600
_POLL_INTERVAL_SEC = 5


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
    key = runway_api_key()
    body = {
        "promptText": prompt[:1000],
        "model": "gen3a_turbo",
        "duration": int(round(duration_sec)) or 5,
        "ratio": aspect_ratio.replace(":", ":"),
    }
    job_id = _post_runway("/image_to_video", body, key)
    output_url = _poll_runway(f"/tasks/{job_id}", key)
    _download(output_url, out_path)


def _post_runway(path: str, body: dict, key: str) -> str:
    url = f"{RUNWAY_BASE}{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "X-Runway-Version": "2024-11-06",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload: dict[str, Any] = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")[:1500]
        raise ValueError(f"Runway {e.code} {e.reason}: {body_text}") from e
    task_id = payload.get("id") or payload.get("task", {}).get("id")
    if not task_id:
        raise ValueError(f"Unexpected Runway response: {payload}")
    return str(task_id)


def _poll_runway(path: str, key: str) -> str:
    url = f"{RUNWAY_BASE}{path}"
    headers = {"Authorization": f"Bearer {key}", "X-Runway-Version": "2024-11-06"}
    deadline = time.time() + _POLL_TIMEOUT_SEC
    while time.time() < deadline:
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload: dict[str, Any] = json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body_text = e.read().decode("utf-8", errors="replace")[:1500]
            raise ValueError(f"Runway poll {e.code} {e.reason}: {body_text}") from e
        status = (payload.get("status") or "").lower()
        if status in ("succeeded", "success", "completed"):
            outputs = payload.get("output") or payload.get("outputs") or []
            if isinstance(outputs, list) and outputs:
                return str(outputs[0])
            raise ValueError(f"Runway task completed without an output URL: {payload}")
        if status in ("failed", "error", "canceled"):
            raise ValueError(f"Runway task failed: {payload}")
        time.sleep(_POLL_INTERVAL_SEC)
    raise TimeoutError("Runway task polling timed out")


def _download(url: str, dest: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
    urllib.request.urlretrieve(url, dest)
