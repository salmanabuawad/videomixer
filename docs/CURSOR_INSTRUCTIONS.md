# Cursor Instructions

## Product goal
Build a production system that:
- receives uploaded docs and uploaded videos from the UI
- extracts the Zym-Tec story from those docs
- consults OpenAI to create a storyboard and render plan
- uses the main uploaded clip as the dominant hero asset
- uses additional uploaded clips as support only
- renders a structured marketing video on the Ubuntu server
- is accessed from Windows clients through the browser

## Constraints
- No external clip search for now
- Do not hallucinate claims not grounded in uploaded docs
- Keep FFmpeg as the final renderer
- Keep OpenAI responses in strict JSON format

## Next implementation priorities
1. Replace the simple HTML UI with React if desired
2. Add timeline editing per scene
3. Add narration/TTS provider integration
4. Add background music selection/upload
5. Add subtitle generation
6. Add authentication + project ownership
7. Add background job queue (RQ/Celery/Dramatiq/etc.)

## Render quality roadmap
- add branded opener/closer templates
- add logo watermark option
- add 16:9 export in addition to 9:16
- add transitions between scenes
- add audio ducking under narration
- add text-safe zones and theme settings
