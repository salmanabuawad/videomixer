# Claude Instructions

Use this repo as the base system.

## Goals

Build a production-ready video generation system with this workflow:

1. User enters topic
2. User optionally uploads voice sample
3. User uploads custom content (text/images/videos)
4. System searches YouTube and Facebook for relevant videos
5. Frontend shows candidate videos
6. User reviews and selects suitable videos
7. Only then apply customizations
8. Customization engine supports interval-based operations:
   - remove
   - replace
   - side_by_side
   - overlay
   - multiple operations per clip
9. Render final draft and final video

## Required rules

- Frontend must use React + TypeScript.
- Backend uses Node.js + PostgreSQL.
- Worker can stay Python.
- Config credentials are managed from UI and stored in a `config` table.
- Credentials must be encrypted at rest.
- Never mutate original source assets.
- Render engine must work from derived timeline instructions.
- Search results must not be sent directly into rendering; only approved clips may be used.
- Keep source connectors modular.

## Immediate tasks for Claude

1. Upgrade timeline editor to drag/drop interval editing.
2. Implement interval normalization for overlapping operations.
3. Replace in-memory/demo YouTube search with full official API integration.
4. Add Facebook connector with session/cookie reuse.
5. Add voice-clone provider integration.
6. Expand worker render engine with real FFmpeg graph generation.
7. Add subtitle generation and scene templates.
8. Add authentication/roles if needed later.
