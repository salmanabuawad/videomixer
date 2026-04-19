"""Video output backends: local FFmpeg (default) or third-party APIs (e.g. Shotstack)."""

from app.services.video_engine.dispatch import produce_final_video

__all__ = ["produce_final_video"]
