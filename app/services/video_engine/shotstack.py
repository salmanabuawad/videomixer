"""
Shotstack cloud render (https://shotstack.io) — professional timeline API.

Requires (from app_config with .env fallback):
  shotstack_api_key or sandbox/production keys, public_upload_url_prefix — HTTPS base where uploads are reachable
  (e.g. https://example.com/zym-uploads maps to UPLOAD_DIR on disk via Nginx alias).
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from typing import Any, Callable, Optional

ProgressCallback = Optional[Callable[[str, str], None]]

from app.config import UPLOAD_DIR
from app.config_store import (
    public_upload_url_prefix,
    shotstack_api_env_resolved,
    shotstack_api_key_resolved,
)

logger = logging.getLogger(__name__)


def _require_config() -> None:
    if not shotstack_api_key_resolved():
        raise ValueError(
            "Shotstack API key is not set (app_config or env). Required when video_engine=shotstack."
        )
    if not public_upload_url_prefix():
        raise ValueError(
            "Public upload URL prefix is not set. Shotstack must fetch your clips over HTTPS; "
            "set public_upload_url_prefix in app_config (or PUBLIC_UPLOAD_URL_PREFIX in .env) and expose uploads via Nginx."
        )


def _local_path_to_public_url(local_path: str) -> str:
    base = public_upload_url_prefix().rstrip("/")
    root = os.path.abspath(UPLOAD_DIR)
    ap = os.path.abspath(local_path)
    if not ap.startswith(root + os.sep) and ap != root:
        raise ValueError(f"File must live under UPLOAD_DIR for public URL mapping: {local_path}")
    rel = os.path.relpath(ap, root).replace("\\", "/")
    return f"{base}/{rel}"


def _read_error_body(exc: urllib.error.HTTPError) -> str:
    try:
        body = exc.read().decode("utf-8", errors="replace").strip()
    except Exception:
        body = ""
    return body[:2000]


def _post_json(url: str, payload: dict) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    key = shotstack_api_key_resolved()
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-api-key": key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = _read_error_body(e)
        logger.error(
            "Shotstack POST %s failed %s: %s\nPayload: %s",
            url,
            e.code,
            body,
            json.dumps(payload)[:2000],
        )
        raise ValueError(f"Shotstack {e.code} {e.reason}: {body}") from e


def _get_json(url: str) -> dict[str, Any]:
    key = shotstack_api_key_resolved()
    req = urllib.request.Request(url, headers={"x-api-key": key})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = _read_error_body(e)
        logger.error("Shotstack GET %s failed %s: %s", url, e.code, body)
        raise ValueError(f"Shotstack {e.code} {e.reason}: {body}") from e


def _download(url: str, dest: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
    urllib.request.urlretrieve(url, dest)


_VALID_TRANSITIONS = {"fade", "slideLeft", "slideRight", "slideUp", "slideDown", "zoom"}


def _trim_or_zero(scene: dict) -> float:
    for key in ("trim_sec", "start_sec", "trim"):
        if key in scene and scene[key] is not None:
            try:
                return max(0.0, float(scene[key]))
            except (TypeError, ValueError):
                continue
    return 0.0


def _scene_transitions(scene: dict) -> dict[str, str]:
    out: dict[str, str] = {}
    t_in = str(scene.get("transition_in") or "").strip()
    t_out = str(scene.get("transition_out") or "").strip()
    if t_in in _VALID_TRANSITIONS:
        out["in"] = t_in
    if t_out in _VALID_TRANSITIONS:
        out["out"] = t_out
    return out


def _build_video_clip(
    scene: dict,
    src: str,
    start: float,
    length: float,
    *,
    fit: str,
    filter_: str = "",
) -> dict[str, Any]:
    asset_dict: dict[str, Any] = {"type": "video", "src": src}
    trim = _trim_or_zero(scene)
    if trim > 0:
        asset_dict["trim"] = trim
    clip: dict[str, Any] = {
        "asset": asset_dict,
        "start": start,
        "length": length,
        "fit": fit,
    }
    if filter_:
        clip["filter"] = filter_
    trans = _scene_transitions(scene)
    if trans:
        clip["transition"] = trans
    return clip


def _title_track_clips(scene: dict, start: float, length: float) -> list[dict[str, Any]]:
    clips: list[dict[str, Any]] = []
    title = str(scene.get("title") or "").strip()
    subtitle = str(scene.get("subtitle") or "").strip()
    if title:
        clips.append(
            {
                "asset": {
                    "type": "title",
                    "text": title[:120],
                    "style": "minimal",
                    "color": "#ffffff",
                    "size": "medium",
                    "position": "top",
                },
                "start": start,
                "length": length,
                "transition": {"in": "fade", "out": "fade"},
            }
        )
    if subtitle:
        clips.append(
            {
                "asset": {
                    "type": "title",
                    "text": subtitle[:160],
                    "style": "minimal",
                    "color": "#ffffff",
                    "size": "small",
                    "position": "bottom",
                },
                "start": start,
                "length": length,
                "transition": {"in": "fade", "out": "fade"},
            }
        )
    return clips


def _build_timeline(plan: dict) -> dict[str, Any]:
    scenes = plan.get("scenes") or []
    hero_treatment = plan.get("hero_treatment") or {}
    hero_asset = str(hero_treatment.get("asset") or "").strip()
    composition = str(hero_treatment.get("composition") or "").strip()
    default_layered = composition == "layered_narrow"

    fg_clips: list[dict[str, Any]] = []
    bg_clips: list[dict[str, Any]] = []
    title_clips: list[dict[str, Any]] = []
    timeline_pos = 0.0

    for scene in scenes:
        asset_path = scene["asset"]
        src = _local_path_to_public_url(asset_path)
        dur = float(scene["duration_sec"])
        use_layered = bool(scene.get("use_layered_hero")) or (
            default_layered and asset_path == hero_asset
        )

        if use_layered:
            bg_clips.append(
                _build_video_clip(
                    scene, src, timeline_pos, dur, fit="cover", filter_="darken"
                )
            )
            fg_clips.append(
                _build_video_clip(scene, src, timeline_pos, dur, fit="contain")
            )
        else:
            fg_clips.append(
                _build_video_clip(scene, src, timeline_pos, dur, fit="cover")
            )

        title_clips.extend(_title_track_clips(scene, timeline_pos, dur))
        timeline_pos += dur

    # Shotstack renders track index 0 on top. Titles > foreground > background.
    tracks: list[dict[str, Any]] = []
    if title_clips:
        tracks.append({"clips": title_clips})
    tracks.append({"clips": fg_clips})
    if bg_clips:
        tracks.append({"clips": bg_clips})

    return {"timeline": {"background": "#000000", "tracks": tracks}}


_SHOTSTACK_STAGE_MESSAGES = {
    "queued": "Shotstack queued your render.",
    "fetching": "Shotstack is fetching the source clips.",
    "rendering": "Shotstack is rendering the video.",
    "saving": "Shotstack is saving the final file.",
}


def _report(cb: ProgressCallback, stage: str, message: str) -> None:
    if cb is None:
        return
    try:
        cb(stage, message)
    except Exception:
        logger.exception("progress callback raised; continuing render")


def render_via_shotstack(
    project_id: int,
    plan: dict,
    render_root: str,
    progress: ProgressCallback = None,
) -> str:
    _require_config()
    env = (shotstack_api_env_resolved() or "stage").strip()
    base_api = f"https://api.shotstack.io/edit/{env}"

    _report(progress, "submitting", "Submitting render to Shotstack…")
    timeline_payload = _build_timeline(plan)
    body = {
        **timeline_payload,
        "output": {
            "format": "mp4",
            "resolution": "hd",
            "aspectRatio": "9:16",
            "fps": 25,
            "scaleTo": "1080",
        },
    }

    render_url = f"{base_api}/render"
    logger.info("Shotstack: submitting render to %s", render_url)
    created = _post_json(render_url, body)
    render_id = created.get("response", {}).get("id") or created.get("id")
    if not render_id:
        raise ValueError(f"Unexpected Shotstack response: {created}")

    status_url = f"{base_api}/render/{render_id}"
    deadline = time.time() + 900
    output_url = None
    last_reported_status = ""
    while time.time() < deadline:
        st = _get_json(status_url)
        response = st.get("response", st)
        status = (response.get("status") or "").lower()
        if status and status != last_reported_status:
            msg = _SHOTSTACK_STAGE_MESSAGES.get(
                status, f"Shotstack status: {status}"
            )
            _report(progress, status, msg)
            last_reported_status = status
        if status in ("done", "complete", "finished"):
            output_url = response.get("url")
            break
        if status in ("failed", "error"):
            raise ValueError(f"Shotstack render failed: {response}")
        time.sleep(4)

    if not output_url:
        raise TimeoutError("Shotstack render timed out")

    _report(progress, "downloading", "Downloading rendered file…")
    out_dir = os.path.join(render_root, str(project_id))
    os.makedirs(out_dir, exist_ok=True)
    final_path = os.path.abspath(os.path.join(out_dir, "final.mp4"))
    _download(output_url, final_path)
    return final_path
