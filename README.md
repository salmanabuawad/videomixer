# Video AI Studio

A full-stack starter application for building topic-based videos from:
- a user-provided topic
- optional voice sample
- uploaded images/videos/text
- candidate videos discovered from YouTube and Facebook
- user review/selection of candidate videos
- timeline customizations (remove, replace, side-by-side, overlay) applied **only after approval**

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + PostgreSQL
- Worker: Python + FastAPI + FFmpeg hooks
- Queue: BullMQ + Redis
- DB: PostgreSQL

## What this repo includes

- project creation
- config management UI
- encrypted config storage in PostgreSQL
- topic search endpoint
- YouTube discovery stub/service
- Facebook credential config flow
- candidate review flow
- selected clips + clip operations model
- render job creation
- Python worker skeleton for voice/render pipeline
- SQL schema and seed-ready migrations
- Claude instructions for expanding the app

## Important notes

- This is a strong MVP starter, not a finished studio-grade render engine.
- Facebook/YouTube login automation is brittle and may require maintenance. Use APIs where possible.
- Credentials are stored in a `config` table and encrypted before persistence.
- The render engine should only operate on approved clips and user-uploaded assets.

## Local development

### 1) Prerequisites

- Node.js 20+
- Python 3.11+
- PostgreSQL 15+
- Redis 7+
- FFmpeg installed on Ubuntu

### 2) Database

Create a database named `video_ai_studio`, then run:

```bash
psql -U postgres -d video_ai_studio -f backend/sql/001_init.sql
```

### 3) Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

### 4) Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

### 5) Worker

```bash
cd worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

## Environment variables

### Backend `.env`

```env
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/video_ai_studio
REDIS_URL=redis://localhost:6379
ENCRYPTION_KEY=change_this_to_a_long_random_secret_32_chars
YOUTUBE_API_KEY=
WORKER_BASE_URL=http://localhost:8001
FRONTEND_ORIGIN=http://localhost:5173
```

### Frontend `.env`

```env
VITE_API_BASE_URL=http://localhost:4000/api
```

## Main workflow

1. User creates a project with topic/script.
2. User uploads optional voice sample and assets.
3. User saves config from UI (Facebook/YouTube credentials if needed).
4. Backend searches sources and stores candidate videos.
5. Frontend shows candidate videos.
6. User approves/rejects and optionally defines clip ranges.
7. User adds timeline operations:
   - remove
   - replace
   - side_by_side
   - overlay
8. Backend creates render job.
9. Worker processes the job and returns output metadata.

## Claude instructions

See `CLAUDE_INSTRUCTIONS.md`.
