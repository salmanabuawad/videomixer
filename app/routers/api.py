from __future__ import annotations

import json
import os
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from app.db import get_session
from app.models import Asset, Knowledge, Project, RenderJob
from app.schemas import (
    AssetOut,
    KnowledgeOut,
    OpenAIConfigIn,
    ProjectCreate,
    ProjectDetailOut,
    ProjectOut,
    RenderJobOut,
    ShotstackConfigIn,
)
from app.services.extract import extract_text_from_file
from app.services.openai_service import build_render_plan, extract_knowledge
from app.config import CONFIG_ADMIN_TOKEN, RENDER_DIR, UPLOAD_DIR
from app.services.video_engine import produce_final_video
from app.config_store import (
    KEY_OPENAI_API_KEY,
    KEY_OPENAI_MODEL,
    KEY_PUBLIC_UPLOAD_URL_PREFIX,
    KEY_SHOTSTACK_API_ENV,
    KEY_SHOTSTACK_API_KEY,
    KEY_SHOTSTACK_PRODUCTION_KEY,
    KEY_SHOTSTACK_SANDBOX_KEY,
    KEY_SHOTSTACK_USE_PRODUCTION,
    KEY_VIDEO_ENGINE,
    is_placeholder_api_key,
    openai_api_key,
    openai_model,
    public_upload_url_prefix,
    shotstack_api_env_override_raw,
    shotstack_api_env_resolved,
    shotstack_api_key_resolved,
    shotstack_use_production_effective,
    upsert_setting,
    video_engine,
)

router = APIRouter(prefix="/api", tags=["api"])


def _knowledge_to_out(row: Knowledge) -> KnowledgeOut:
    return KnowledgeOut(
        summary=row.summary,
        process_steps=json.loads(row.process_steps_json or "[]"),
        key_claims=json.loads(row.key_claims_json or "[]"),
        benefits=json.loads(row.benefits_json or "[]"),
        search_terms=json.loads(row.search_terms_json or "[]"),
        storyboard=json.loads(row.storyboard_json or "{}"),
    )


def _job_to_out(job: RenderJob) -> RenderJobOut:
    dl: Optional[str] = None
    if job.status == "done" and job.output_path:
        dl = f"/api/jobs/{job.id}/download"
    return RenderJobOut(
        id=job.id,
        project_id=job.project_id,
        status=job.status,
        output_path=job.output_path or "",
        error_text=job.error_text or "",
        render_engine=getattr(job, "render_engine", None) or "",
        created_at=job.created_at,
        download_url=dl,
    )


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/config/status")
def config_status():
    """Non-secret sanity check: whether an API key is available and which model name is used."""
    return {
        "openai_configured": bool(openai_api_key()),
        "openai_model": openai_model(),
        "video_engine": video_engine(),
        "video_engine_env": (os.getenv("VIDEO_ENGINE") or "").strip(),
        "shotstack_configured": bool(shotstack_api_key_resolved()),
        "public_upload_url_configured": bool(public_upload_url_prefix()),
        "public_upload_url_prefix": public_upload_url_prefix(),
        "shotstack_use_production": shotstack_use_production_effective(),
        "shotstack_api_env_effective": shotstack_api_env_resolved(),
        "shotstack_api_env_override": shotstack_api_env_override_raw(),
    }


def _admin_gate(request: Request, require_token_if_secret_set: bool) -> None:
    header = request.headers.get("X-Admin-Token", "").strip()
    if CONFIG_ADMIN_TOKEN:
        if header != CONFIG_ADMIN_TOKEN:
            raise HTTPException(status_code=403, detail="Invalid or missing X-Admin-Token header.")
        return
    if require_token_if_secret_set:
        raise HTTPException(
            status_code=403,
            detail=(
                "Sensitive config is already set. Add CONFIG_ADMIN_TOKEN to the server .env and pass the same value "
                "in the Admin token field, or edit values in .env / database."
            ),
        )


@router.post("/admin/openai")
def save_openai_config(body: OpenAIConfigIn, request: Request, session: Session = Depends(get_session)):
    """Save OpenAI API key and model into app_config (persists in the database)."""
    _admin_gate(request, bool(openai_api_key()))
    key = body.openai_api_key.strip()
    if is_placeholder_api_key(key):
        raise HTTPException(status_code=400, detail="Provide a real API key, not a placeholder.")
    model = (body.openai_model or "").strip() or "gpt-4o"
    upsert_setting(session, KEY_OPENAI_API_KEY, key)
    upsert_setting(session, KEY_OPENAI_MODEL, model)
    session.commit()
    return {"ok": True, "openai_configured": True, "openai_model": model}


@router.post("/admin/shotstack")
def save_shotstack_config(body: ShotstackConfigIn, request: Request, session: Session = Depends(get_session)):
    """Save video engine and Shotstack-related settings into app_config."""
    _admin_gate(request, bool(shotstack_api_key_resolved()))

    ve = (body.video_engine or "local").strip().lower()
    if ve not in ("local", "shotstack"):
        raise HTTPException(status_code=400, detail="video_engine must be 'local' or 'shotstack'.")
    upsert_setting(session, KEY_VIDEO_ENGINE, ve)

    pub = (body.public_upload_url_prefix or "").strip()
    upsert_setting(session, KEY_PUBLIC_UPLOAD_URL_PREFIX, pub)

    upsert_setting(session, KEY_SHOTSTACK_USE_PRODUCTION, "true" if body.shotstack_use_production else "false")

    single = (body.shotstack_api_key or "").strip()
    sand = (body.shotstack_sandbox_key or "").strip()
    prod = (body.shotstack_production_key or "").strip()

    if single:
        upsert_setting(session, KEY_SHOTSTACK_API_KEY, single)
        upsert_setting(session, KEY_SHOTSTACK_SANDBOX_KEY, "")
        upsert_setting(session, KEY_SHOTSTACK_PRODUCTION_KEY, "")
    else:
        upsert_setting(session, KEY_SHOTSTACK_API_KEY, "")
        upsert_setting(session, KEY_SHOTSTACK_SANDBOX_KEY, sand)
        upsert_setting(session, KEY_SHOTSTACK_PRODUCTION_KEY, prod)

    raw_env = (body.shotstack_api_env or "").strip()
    env_lower = raw_env.lower()
    alias = {"staging": "stage", "sandbox": "stage", "production": "v1", "prod": "v1"}
    env_override = alias.get(env_lower, env_lower) if env_lower else ""
    if env_override and env_override not in ("stage", "v1"):
        raise HTTPException(
            status_code=400,
            detail=(
                "shotstack_api_env must be empty (auto), stage, or v1. "
                f"Got {raw_env!r} — use stage (sandbox) or v1 (production)."
            ),
        )
    upsert_setting(session, KEY_SHOTSTACK_API_ENV, env_override)

    session.commit()
    return {
        "ok": True,
        "video_engine": video_engine(),
        "shotstack_configured": bool(shotstack_api_key_resolved()),
        "public_upload_url_configured": bool(public_upload_url_prefix()),
        "public_upload_url_prefix": public_upload_url_prefix(),
        "shotstack_use_production": shotstack_use_production_effective(),
        "shotstack_api_env_effective": shotstack_api_env_resolved(),
        "shotstack_api_env_override": shotstack_api_env_override_raw(),
    }


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(session: Session = Depends(get_session)):
    rows = session.exec(select(Project).order_by(Project.id.desc())).all()
    return rows


@router.post("/projects", response_model=ProjectOut)
def create_project(body: ProjectCreate, session: Session = Depends(get_session)):
    project = Project(name=body.name.strip())
    if not project.name:
        raise HTTPException(status_code=400, detail="Project name is required")
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


@router.get("/projects/{project_id}", response_model=ProjectDetailOut)
def get_project(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    assets = session.exec(select(Asset).where(Asset.project_id == project_id)).all()
    knowledge_row = session.exec(select(Knowledge).where(Knowledge.project_id == project_id)).first()
    jobs = session.exec(
        select(RenderJob).where(RenderJob.project_id == project_id).order_by(RenderJob.id.desc())
    ).all()
    knowledge: Optional[KnowledgeOut] = None
    if knowledge_row:
        knowledge = _knowledge_to_out(knowledge_row)
    return ProjectDetailOut(
        project=project,
        assets=assets,
        knowledge=knowledge,
        jobs=[_job_to_out(j) for j in jobs],
    )


@router.post("/projects/{project_id}/upload")
async def upload_assets(
    project_id: int,
    files: list[UploadFile] = File(...),
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project_dir = os.path.join(UPLOAD_DIR, str(project_id))
    os.makedirs(project_dir, exist_ok=True)
    for file in files:
        safe_name = os.path.basename(file.filename or "upload")
        target = os.path.join(project_dir, safe_name)
        data = await file.read()
        with open(target, "wb") as f:
            f.write(data)
        asset_type = "video" if (file.content_type or "").startswith("video/") else "document"
        session.add(
            Asset(
                project_id=project_id,
                asset_type=asset_type,
                file_name=safe_name,
                file_path=target,
                mime_type=file.content_type or "",
            )
        )
    session.commit()
    return {"ok": True, "uploaded": len(files)}


@router.post("/projects/{project_id}/extract")
def extract_project_knowledge(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    assets = session.exec(select(Asset).where(Asset.project_id == project_id)).all()
    texts = []
    for asset in assets:
        if asset.asset_type == "document":
            text = extract_text_from_file(asset.file_path)
            if text:
                texts.append(text)
    if not texts:
        raise HTTPException(status_code=400, detail="No document text found")
    combined = "\n\n".join(texts)[:40000]
    try:
        data = extract_knowledge(combined)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="Invalid response from language model")
    row = session.exec(select(Knowledge).where(Knowledge.project_id == project_id)).first()
    if not row:
        row = Knowledge(project_id=project_id)
    row.summary = data.get("summary", "")
    row.process_steps_json = json.dumps(data.get("process_steps", []), ensure_ascii=False)
    row.key_claims_json = json.dumps(data.get("key_claims", []), ensure_ascii=False)
    row.benefits_json = json.dumps(data.get("benefits", []), ensure_ascii=False)
    row.search_terms_json = json.dumps(data.get("search_terms", []), ensure_ascii=False)
    row.storyboard_json = json.dumps(data.get("storyboard", {}), ensure_ascii=False)
    row.extracted_text = combined
    session.add(row)
    session.commit()
    return {"ok": True, "knowledge": _knowledge_to_out(row)}


@router.post("/projects/{project_id}/render")
def render_project(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    assets = session.exec(select(Asset).where(Asset.project_id == project_id)).all()
    knowledge = session.exec(select(Knowledge).where(Knowledge.project_id == project_id)).first()
    if not knowledge:
        raise HTTPException(status_code=400, detail="Extract knowledge first")
    main_assets = [a.file_path for a in assets if a.asset_type == "video"][:1]
    support_assets = [a.file_path for a in assets if a.asset_type == "video"][1:]
    if not main_assets:
        raise HTTPException(status_code=400, detail="Upload at least one video")
    knowledge_dict = {
        "summary": knowledge.summary,
        "process_steps": json.loads(knowledge.process_steps_json),
        "key_claims": json.loads(knowledge.key_claims_json),
        "benefits": json.loads(knowledge.benefits_json),
        "search_terms": json.loads(knowledge.search_terms_json),
        "storyboard": json.loads(knowledge.storyboard_json or "{}"),
    }
    try:
        plan = build_render_plan(knowledge_dict, main_assets, support_assets)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    engine_name = video_engine()
    job = RenderJob(project_id=project_id, status="running", render_engine=engine_name)
    session.add(job)
    session.commit()
    session.refresh(job)
    try:
        output_path = produce_final_video(project_id, plan, RENDER_DIR)
        job.status = "done"
        job.output_path = output_path
    except Exception as e:
        job.status = "failed"
        job.error_text = str(e)
    session.add(job)
    session.commit()
    session.refresh(job)
    return {"ok": True, "job": _job_to_out(job)}


@router.get("/jobs/{job_id}/download")
def download_render(job_id: int, session: Session = Depends(get_session)):
    job = session.get(RenderJob, job_id)
    if not job or not job.output_path or not os.path.exists(job.output_path):
        raise HTTPException(status_code=404, detail="Render not available")
    return FileResponse(
        job.output_path,
        filename=os.path.basename(job.output_path),
        media_type="video/mp4",
    )
