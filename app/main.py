import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import CORS_ORIGINS, RENDER_DIR, UPLOAD_DIR
from app.config_store import seed_from_env
from app.db import init_db
from app.routers import api


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_from_env()
    yield


app = FastAPI(title="Zym-Tec Production System", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api.router)

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(RENDER_DIR, exist_ok=True)

FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def _serve_spa_index():
    index = FRONTEND_DIST / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=404, detail="Frontend build not found")
    return FileResponse(index)


if FRONTEND_DIST.is_dir() and (FRONTEND_DIST / "index.html").is_file():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/")
    def spa_root():
        return _serve_spa_index()

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = FRONTEND_DIST / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return _serve_spa_index()
