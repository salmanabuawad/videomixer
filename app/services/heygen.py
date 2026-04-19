"""HeyGen avatar video generation for short presenter intro/outro clips.

Scope (per Zym-Tec spec): HeyGen produces only the intro and closing presenter
clips that bookend the main reel. Main machinery footage stays with the user's
uploads plus Runway gap-fills.

Falls back to an FFmpeg placeholder (same style as runway.py) when no key is
configured or the call fails — the render pipeline never blocks on HeyGen.
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from typing import Any

from app.config_store import heygen_api_key, heygen_avatar_id
from app.services.runway import _ffmpeg_placeholder  # reuse the same drawtext fallback

logger = logging.getLogger(__name__)

HEYGEN_BASE = "https://api.heygen.com/v2"
_POLL_TIMEOUT_SEC = 600
_POLL_INTERVAL_SEC = 5
_DEFAULT_VOICE_ID = "1bd001e7e50f421d891986aad5158bc8"  # HeyGen English male default


def is_stub_mode() -> bool:
    return not bool(heygen_api_key())


def generate_presenter_clip(
    script: str,
    out_path: str,
    *,
    duration_hint_sec: float = 6.0,
    aspect_ratio: str = "9:16",
) -> tuple[str, str]:
    """Produce a presenter video reading `script` at `out_path`. Returns (source_tag, model)."""
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    if is_stub_mode() or not heygen_avatar_id():
        _ffmpeg_placeholder(
            f"[HeyGen placeholder]\n{script}",
            out_path,
            duration_hint_sec,
            aspect_ratio,
        )
        return "heygen_stub", "ffmpeg-drawtext-placeholder"
    try:
        _heygen_generate(script, out_path, aspect_ratio)
        return "heygen", "heygen-v2"
    except Exception:
        logger.exception("HeyGen call failed; falling back to ffmpeg placeholder")
        _ffmpeg_placeholder(
            f"[HeyGen placeholder]\n{script}",
            out_path,
            duration_hint_sec,
            aspect_ratio,
        )
        return "heygen_stub", "ffmpeg-drawtext-placeholder"


def _heygen_generate(script: str, out_path: str, aspect_ratio: str) -> None:
    key = heygen_api_key()
    avatar_id = heygen_avatar_id()
    width, height = (720, 1280) if aspect_ratio == "9:16" else (1280, 720)
    body = {
        "video_inputs": [
            {
                "character": {
                    "type": "avatar",
                    "avatar_id": avatar_id,
                    "avatar_style": "normal",
                },
                "voice": {
                    "type": "text",
                    "input_text": script[:1500],
                    "voice_id": _DEFAULT_VOICE_ID,
                },
            }
        ],
        "dimension": {"width": width, "height": height},
    }
    video_id = _post_generate(body, key)
    video_url = _poll_status(video_id, key)
    _download(video_url, out_path)


def _post_generate(body: dict, key: str) -> str:
    req = urllib.request.Request(
        f"{HEYGEN_BASE}/video/generate",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "X-Api-Key": key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload: dict[str, Any] = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")[:1500]
        logger.error("HeyGen POST failed %s: %s\nBody sent: %s", e.code, body_text, json.dumps(body)[:1000])
        raise ValueError(f"HeyGen {e.code} {e.reason}: {body_text}") from e
    data = payload.get("data") or {}
    video_id = data.get("video_id") or payload.get("video_id")
    if not video_id:
        raise ValueError(f"Unexpected HeyGen response: {payload}")
    return str(video_id)


def _poll_status(video_id: str, key: str) -> str:
    url = f"{HEYGEN_BASE.replace('/v2', '/v1')}/video_status.get?video_id={video_id}"
    headers = {"X-Api-Key": key}
    deadline = time.time() + _POLL_TIMEOUT_SEC
    while time.time() < deadline:
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload: dict[str, Any] = json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body_text = e.read().decode("utf-8", errors="replace")[:1500]
            raise ValueError(f"HeyGen poll {e.code} {e.reason}: {body_text}") from e
        data = payload.get("data") or {}
        status = (data.get("status") or "").lower()
        if status == "completed":
            video_url = data.get("video_url")
            if not video_url:
                raise ValueError(f"HeyGen completed without a video_url: {payload}")
            return str(video_url)
        if status in ("failed", "error"):
            raise ValueError(f"HeyGen task failed: {payload}")
        time.sleep(_POLL_INTERVAL_SEC)
    raise TimeoutError("HeyGen polling timed out")


def _download(url: str, dest: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
    urllib.request.urlretrieve(url, dest)
