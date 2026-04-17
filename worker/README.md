# Worker

This service is the Python media/AI worker.

## Planned responsibilities

- voice sample cleanup
- optional voice cloning provider integration
- transcript/narration generation
- clip operation normalization
- FFmpeg graph generation
- final MP4 rendering

The current code is a minimal FastAPI service with a `/render` endpoint.
