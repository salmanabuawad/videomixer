# Zym-Tec Production System

Production-oriented app for uploading company documents and video clips, extracting knowledge, planning a render with OpenAI, and producing a first-pass vertical marketing video with FFmpeg.

## Architecture

| Layer | Stack |
|--------|--------|
| Frontend | React 18 + TypeScript + Vite (`frontend/`) |
| API | FastAPI (`app/`), JSON under `/api` |
| Database | PostgreSQL (recommended) or SQLite for local-only dev |
| AI | OpenAI Responses API |
| Video | FFmpeg / ffprobe |

## Prerequisites

- Python 3.11+
- Node.js 20+ (for the frontend)
- PostgreSQL 16+ (install natively on your OS — no container required)
- FFmpeg on `PATH` (`ffmpeg`, `ffprobe`)

## PostgreSQL (native install)

Install PostgreSQL locally, create a database and user, then set `DATABASE_URL` in `.env`. Example URL shape:

`postgresql+psycopg2://USER:PASSWORD@127.0.0.1:5432/DBNAME`

On **Linux** (Debian/Ubuntu): `sudo apt install postgresql` and use `sudo -u postgres psql` to create roles/databases. On **Windows**, use the [official installer](https://www.postgresql.org/download/windows/) or your preferred package manager.

## Backend setup

```bash
cd d:\zymtech_innovation
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Set `OPENAI_API_KEY` in `.env` (or insert into the `app_config` table — see below). Adjust `DATABASE_URL` if needed (SQLite: `sqlite:///./zymtec.db`).

### Runtime config (`app_config` table)

Secrets and defaults can live in the database instead of only in `.env`:

| `key` | Purpose |
|-------|---------|
| `openai_api_key` | OpenAI API key |
| `openai_model` | Model name (e.g. `gpt-4o`) |

If a row has a non-empty `value`, it **overrides** the matching environment variable. On startup, missing rows are **seeded from `.env`** when `OPENAI_API_KEY` / `OPENAI_MODEL` are set, so the first run can populate the table without manual SQL.

Check readiness: `GET /api/config/status` (returns whether a key is configured; does not expose the key).

In the web UI, use **Settings** (after login) to save the OpenAI API key and model into `app_config`. Optional server env **`CONFIG_ADMIN_TOKEN`**: if set, the same value must be sent from the UI when updating an already-configured key.

Run the API:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- REST API: `http://localhost:8000/api`
- Health: `GET /api/health`

## Frontend setup (development)

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to `http://127.0.0.1:8000`.

Set `CORS_ORIGINS` in `.env` to include your dev origin if it differs from the defaults.

## Production-style single server

Build the SPA and serve it from FastAPI (static `frontend/dist` is mounted automatically when present):

```bash
cd frontend
npm install
npm run build
cd ..
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Then open `http://localhost:8000` — the UI loads from the built assets and calls `/api` on the same host.

## Production deploy (VPS / custom domain)

For **https://mixer.wavelync.com** on a Linux host with **local PostgreSQL**, your **existing Nginx** (add one vhost), **systemd**, and **Let’s Encrypt**, follow [deploy/README.md](deploy/README.md). Point DNS **A** for `mixer.wavelync.com` to your server IP before obtaining certificates.

**When code is ready to ship**, use the **“Deploy when the code is ready”** section in [deploy/README.md](deploy/README.md) (`remote-deploy.sh` or `build-release.ps1` + `post-deploy.sh`).

## Folder roles

- `app/` — backend code
- `frontend/` — React + TypeScript UI
- `data/uploads/` — uploaded assets
- `data/renders/` — rendered output
- `docs/CURSOR_INSTRUCTIONS.md` — product notes

## Important notes

- Use the main uploaded clip as the hero; additional clips are support only.
- This build does not perform external clip search.
- Output is a structured first-pass marketing clip, not a final agency edit.
- **Extract** builds a fuller **story arc** (hook → CTA) and a **voiceover_script** is generated at **render** time; speech uses OpenAI **TTS** (`tts-1-hd`) and is muxed to the final MP4. Re-run **Extract knowledge** after upgrading so the model refreshes the storyboard shape.
