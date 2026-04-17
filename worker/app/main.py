from __future__ import annotations
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Literal, Dict, Any
import os
import sys
import shutil
import subprocess
import tempfile
from pathlib import Path

from .analysis import analyze_candidate_text
from .evaluation import evaluate_candidate

# Resolve external binaries. When running under the worker's venv, yt-dlp lives
# alongside the python interpreter — resolve that first so systemd's limited
# PATH doesn't matter.
_VENV_BIN = Path(sys.executable).parent
YT_DLP  = str(_VENV_BIN / "yt-dlp") if (_VENV_BIN / "yt-dlp").exists() else (shutil.which("yt-dlp") or "yt-dlp")
FFMPEG  = shutil.which("ffmpeg") or "ffmpeg"

app = FastAPI(title="Video Mixer Worker")

DOWNLOADS_DIR = Path(os.environ.get("VM_DOWNLOADS_DIR", "/home/videomixer/downloads"))
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)


class ClipOperation(BaseModel):
    op_type: Literal["remove", "replace", "side_by_side", "overlay"]
    from_sec: float
    to_sec: float
    text_content: Optional[str] = None
    layout_mode: Optional[str] = None
    config: Dict[str, Any] = {}


class RenderPayload(BaseModel):
    project_id: str
    topic: str
    script: Optional[str] = None
    selected_clips: List[Dict[str, Any]]
    clip_operations: Dict[str, List[ClipOperation]] = {}


class AnalyzePayload(BaseModel):
    candidate_id: str
    url:          str
    source:       str
    title:        Optional[str] = None
    description:  Optional[str] = None
    duration_sec: Optional[int] = None
    domain_tags:  Dict[str, Any] = Field(default_factory=dict)
    # Optional cookies (Netscape format text), e.g. for Facebook logged-in videos
    cookies_txt:  Optional[str] = None
    # Optional API keys forwarded by backend (encrypted in DB, decrypted before sending)
    anthropic_api_key: Optional[str] = None


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/render")
def render(payload: RenderPayload):
    return {
        "status":     "accepted",
        "project_id": payload.project_id,
        "message":    "Render payload received by worker",
        "output_url": "/outputs/demo-output.mp4",
    }


YT_DLP_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
)


def _run_yt_dlp(url: str, out_template: str, cookies_file: Optional[str]) -> tuple[int, str, str]:
    """Download a video. On YouTube's bot-check failure, retry with the
    mobile-web extractor client before giving up."""
    def _run(extra: list[str]) -> subprocess.CompletedProcess:
        cmd = [
            YT_DLP,
            "-f", "best[ext=mp4]/best",
            "--no-playlist",
            "--restrict-filenames",
            "-o", out_template,
            "--no-warnings",
            "--quiet",
            "--merge-output-format", "mp4",
            "--user-agent", YT_DLP_UA,
            "--retries", "2",
        ]
        if cookies_file:
            cmd.extend(["--cookies", cookies_file])
        cmd.extend(extra)
        cmd.append(url)
        return subprocess.run(cmd, capture_output=True, text=True, timeout=600)

    is_youtube = "youtube.com" in url or "youtu.be" in url

    # 1) Default attempt
    proc = _run([])
    if proc.returncode == 0:
        return proc.returncode, proc.stdout, proc.stderr

    # 2) YouTube fallback: try the mweb/ios clients which often bypass bot-check
    if is_youtube:
        for client in ("mweb", "web_safari", "ios"):
            proc = _run(["--extractor-args", f"youtube:player_client={client}"])
            if proc.returncode == 0:
                return proc.returncode, proc.stdout, proc.stderr

    return proc.returncode, proc.stdout, proc.stderr


def _ffmpeg_screenshot(video_path: Path, out_path: Path, at_sec: float = 3.0) -> None:
    cmd = [
        FFMPEG, "-y",
        "-ss", str(at_sec),
        "-i", str(video_path),
        "-frames:v", "1",
        "-q:v", "4",
        "-vf", "scale=640:-2",
        str(out_path),
    ]
    subprocess.run(cmd, capture_output=True, check=True, timeout=120)


@app.post("/analyze")
def analyze(payload: AnalyzePayload):
    """
    Download the candidate, extract a thumbnail screenshot, and produce
    a summary + strengths / weaknesses.
    """
    cid = payload.candidate_id

    # 1) Download with yt-dlp
    out_template = str(DOWNLOADS_DIR / f"{cid}.%(ext)s")
    cookies_file: Optional[str] = None
    tmp_cookies: Optional[Path] = None
    try:
        if payload.cookies_txt:
            tmp_cookies = Path(tempfile.mkstemp(prefix=f"cookies-{cid}-", suffix=".txt")[1])
            tmp_cookies.write_text(payload.cookies_txt)
            cookies_file = str(tmp_cookies)

        try:
            rc, _out, err = _run_yt_dlp(payload.url, out_template, cookies_file)
        except FileNotFoundError as exc:
            rc, err = 127, f"binary not found: {exc}"
        except subprocess.TimeoutExpired:
            rc, err = 124, "yt-dlp timed out"
        except Exception as exc:
            rc, err = 1, f"yt-dlp exception: {exc!r}"

        if rc != 0:
            cand_meta = {
                "title":        payload.title,
                "description":  payload.description,
                "duration_sec": payload.duration_sec,
                "domain_tags":  payload.domain_tags,
                "_anthropic_api_key": payload.anthropic_api_key,
            }
            analysis   = analyze_candidate_text(cand_meta)
            evaluation = evaluate_candidate(cand_meta, video_path=None)
            return {
                "status":               "failed",
                "error":                f"yt-dlp failed: {err.strip()[:500] or 'unknown error'}",
                "local_video_path":     None,
                "local_thumbnail_path": None,
                "evaluation":           evaluation,
                **analysis,
            }

        # Find the produced file
        candidates = sorted(DOWNLOADS_DIR.glob(f"{cid}.*"))
        video_file = next((p for p in candidates if p.suffix.lower() in (".mp4", ".webm", ".mkv", ".mov")), None)
        if not video_file:
            cand_meta = {
                "title":        payload.title,
                "description":  payload.description,
                "duration_sec": payload.duration_sec,
                "domain_tags":  payload.domain_tags,
                "_anthropic_api_key": payload.anthropic_api_key,
            }
            return {
                "status":               "failed",
                "error":                "yt-dlp returned 0 but no video file was produced",
                "local_video_path":     None,
                "local_thumbnail_path": None,
                "evaluation":           evaluate_candidate(cand_meta, video_path=None),
                **analyze_candidate_text(cand_meta),
            }

        # 2) Screenshot
        thumb_path = DOWNLOADS_DIR / f"{cid}.jpg"
        try:
            _ffmpeg_screenshot(video_file, thumb_path, at_sec=3.0)
        except Exception as exc:
            print(f"[analyze] screenshot failed for {cid}: {exc!r}")
            thumb_path = None

        # 3) Summary / strengths / weaknesses
        cand_meta = {
            "title":        payload.title,
            "description":  payload.description,
            "duration_sec": payload.duration_sec,
            "domain_tags":  payload.domain_tags,
            "_anthropic_api_key": payload.anthropic_api_key,
        }
        analysis   = analyze_candidate_text(cand_meta)
        evaluation = evaluate_candidate(cand_meta, video_path=video_file)

        # 4) Paths relative to nginx /downloads/
        local_video_path     = f"/downloads/{video_file.name}"
        local_thumbnail_path = f"/downloads/{thumb_path.name}" if thumb_path and thumb_path.exists() else None

        return {
            "status":               "done",
            "error":                None,
            "local_video_path":     local_video_path,
            "local_thumbnail_path": local_thumbnail_path,
            "evaluation":           evaluation,
            **analysis,
        }
    finally:
        if tmp_cookies and tmp_cookies.exists():
            try:
                tmp_cookies.unlink()
            except Exception:
                pass
