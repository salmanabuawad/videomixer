"""Select local FFmpeg vs professional cloud API based on VIDEO_ENGINE."""

import importlib
import logging
from typing import Callable, Optional

from app.config_store import video_engine

logger = logging.getLogger(__name__)

ProgressCallback = Optional[Callable[[str, str], None]]


def produce_final_video(
    project_id: int,
    plan: dict,
    render_root: str,
    progress: ProgressCallback = None,
) -> str:
    engine = video_engine()
    logger.info("produce_final_video project_id=%s engine=%r", project_id, engine)
    if engine in ("local", "ffmpeg", ""):
        from app.services.render import render_plan

        if progress is not None:
            progress("rendering", "Rendering locally with FFmpeg…")
        return render_plan(project_id, plan, render_root)
    if engine == "shotstack":
        mod = importlib.import_module("app.services.video_engine.shotstack")
        logger.info("Shotstack render: calling render_via_shotstack for project_id=%s", project_id)
        return mod.render_via_shotstack(project_id, plan, render_root, progress=progress)
    raise ValueError(
        f"Unknown VIDEO_ENGINE={engine!r}. Use 'local' or 'shotstack'. See docs/VIDEO_PROVIDERS.md"
    )
