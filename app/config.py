import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://zymtech:zymtech@localhost:5432/zymtech",
)
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./data/uploads")
RENDER_DIR = os.getenv("RENDER_DIR", "./data/renders")
FFMPEG_BIN = os.getenv("FFMPEG_BIN", "ffmpeg")
FFPROBE_BIN = os.getenv("FFPROBE_BIN", "ffprobe")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# If set, UI/API must send header X-Admin-Token with this value to save OpenAI keys.
# If empty, saving is allowed only while no API key is configured yet (first-time setup).
CONFIG_ADMIN_TOKEN = os.getenv("CONFIG_ADMIN_TOKEN", "").strip()

# Video output: "local" (FFmpeg on server) or "shotstack" (Shotstack cloud API).
VIDEO_ENGINE = os.getenv("VIDEO_ENGINE", "local").strip()

# Shotstack: use either SHOTSTACK_API_KEY alone, OR sandbox + production keys with SHOTSTACK_USE_PRODUCTION.
SHOTSTACK_API_KEY_EXPLICIT = os.getenv("SHOTSTACK_API_KEY", "").strip()
SHOTSTACK_SANDBOX_KEY = os.getenv("SHOTSTACK_SANDBOX_KEY", "").strip()
SHOTSTACK_PRODUCTION_KEY = os.getenv("SHOTSTACK_PRODUCTION_KEY", "").strip()
SHOTSTACK_USE_PRODUCTION = os.getenv("SHOTSTACK_USE_PRODUCTION", "false").lower() in (
    "1",
    "true",
    "yes",
)

if SHOTSTACK_API_KEY_EXPLICIT:
    SHOTSTACK_API_KEY = SHOTSTACK_API_KEY_EXPLICIT
else:
    SHOTSTACK_API_KEY = (
        SHOTSTACK_PRODUCTION_KEY if SHOTSTACK_USE_PRODUCTION else SHOTSTACK_SANDBOX_KEY
    )

# API host segment: "stage" (sandbox key) or "v1" (production key). Override if needed.
_shotstack_env = os.getenv("SHOTSTACK_API_ENV", "").strip()
if _shotstack_env:
    SHOTSTACK_API_ENV = _shotstack_env
else:
    SHOTSTACK_API_ENV = "v1" if SHOTSTACK_USE_PRODUCTION else "stage"

# HTTPS base where UPLOAD_DIR files are publicly reachable (required for Shotstack to fetch clips).
PUBLIC_UPLOAD_URL_PREFIX = os.getenv("PUBLIC_UPLOAD_URL_PREFIX", "").strip()

# Comma-separated list, e.g. "http://localhost:5173,http://127.0.0.1:5173"
_cors = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
CORS_ORIGINS = [o.strip() for o in _cors.split(",") if o.strip()]
