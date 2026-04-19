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


def _build_timeline(plan: dict) -> dict[str, Any]:
    scenes = plan.get("scenes") or []
    clips: list[dict[str, Any]] = []
    timeline_pos = 0.0
    for scene in scenes:
        asset_path = scene["asset"]
        src = _local_path_to_public_url(asset_path)
        dur = float(scene["duration_sec"])
        trim = float(scene.get("start_sec", 0))
        asset_dict: dict[str, Any] = {"type": "video", "src": src}
        if trim > 0:
            asset_dict["trim"] = trim
        clips.append(
            {
                "asset": asset_dict,
                "start": timeline_pos,
                "length": dur,
            }
        )
        timeline_pos += dur

    title = str(plan.get("title_overlay") or "").strip()
    tracks: list[dict[str, Any]] = [{"clips": clips}]
    if title:
        tracks.append(
            {
                "clips": [
                    {
                        "asset": {
                            "type": "title",
                            "text": title[:120],
                            "style": "minimal",
                            "color": "#ffffff",
                            "size": "medium",
                        },
                        "start": 0,
                        "length": min(5.0, timeline_pos),
                    }
                ]
            }
        )

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
