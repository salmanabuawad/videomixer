from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from app.db import engine as db_engine, get_session

logger = logging.getLogger(__name__)
from app.models import Asset, Knowledge, Project, RenderJob
from app.schemas import (
    AssetOut,
    EnhanceJobIn,
    KnowledgeOut,
    OpenAIConfigIn,
    ProjectCreate,
    ProjectDetailOut,
    ProjectOut,
    RenderJobOut,
    ShotstackConfigIn,
)
from app.services.asset_analysis import probe_video
from app.services.extract import extract_text_from_file
from app.services.openai_service import build_render_plan, extract_knowledge, revise_render_plan
from app.services.runway import generate_clip as runway_generate_clip, is_stub_mode as runway_is_stub
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
        narration_text=row.narration_text or "",
        generated_clip_requests=json.loads(row.generated_clip_requests_json or "[]"),
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
        stage=getattr(job, "stage", None) or "",
        progress_message=getattr(job, "progress_message", None) or "",
        parent_job_id=getattr(job, "parent_job_id", None),
        enhancement_request=getattr(job, "enhancement_request", None) or "",
        created_at=job.created_at,
        updated_at=getattr(job, "updated_at", None) or job.created_at,
        download_url=dl,
    )


def _update_job(job_id: int, **fields) -> None:
    with Session(db_engine) as s:
        row = s.get(RenderJob, job_id)
        if row is None:
            return
        for k, v in fields.items():
            setattr(row, k, v)
        row.updated_at = datetime.utcnow()
        s.add(row)
        s.commit()


def _runway_pass(project_id: int, report) -> None:
    """Fill scene-role gaps from the knowledge's generated_clip_requests by
    running Runway (or the ffmpeg stub) once per missing role."""
    with Session(db_engine) as s:
        k = s.exec(select(Knowledge).where(Knowledge.project_id == project_id)).first()
        if not k or not (k.generated_clip_requests_json or "").strip():
            return
        try:
            requests = json.loads(k.generated_clip_requests_json or "[]")
        except json.JSONDecodeError:
            return
        # Only *real* Runway outputs count as "already done". Stubs are placeholders
        # that should be upgraded the next time Runway is reachable/credited.
        existing = s.exec(
            select(Asset).where(
                Asset.project_id == project_id, Asset.source == "runway"
            )
        ).all()
        existing_roles = set()
        for a in existing:
            try:
                existing_roles.add(
                    (json.loads(a.metadata_json or "{}") or {}).get("role") or ""
                )
            except json.JSONDecodeError:
                pass
        stub_rows = s.exec(
            select(Asset).where(
                Asset.project_id == project_id, Asset.source == "ffmpeg_stub"
            )
        ).all()
        stale_stubs: dict[str, list[tuple[int, str]]] = {}
        for a in stub_rows:
            try:
                role = (json.loads(a.metadata_json or "{}") or {}).get("role") or ""
            except json.JSONDecodeError:
                role = ""
            stale_stubs.setdefault(role, []).append((a.id, a.file_path))
    if not requests:
        return
    report(
        "generating",
        f"Generating missing clips with {'FFmpeg placeholder' if runway_is_stub() else 'Runway'}…",
    )
    project_dir = os.path.join(UPLOAD_DIR, str(project_id), "generated")
    for idx, req in enumerate(requests, start=1):
        if not isinstance(req, dict):
            continue
        role = str(req.get("role") or "").strip()
        prompt = str(req.get("prompt") or "").strip()
        if not prompt or not req.get("needed", True):
            continue
        if role and role in existing_roles:
            continue
        # Replace any existing placeholder for this role before regenerating —
        # so a stub never permanently masks a role from Runway.
        if role in stale_stubs:
            with Session(db_engine) as s:
                for aid, fpath in stale_stubs.pop(role):
                    stale = s.get(Asset, aid)
                    if stale:
                        s.delete(stale)
                    try:
                        if fpath and os.path.exists(fpath):
                            os.remove(fpath)
                    except OSError:
                        logger.warning("could not remove stale stub file %s", fpath)
                s.commit()
        dur = float(req.get("duration_sec") or 5.0)
        slug = f"{role or 'generated'}_{idx}.mp4"
        out_path = os.path.abspath(os.path.join(project_dir, slug))
        try:
            source_tag, model = runway_generate_clip(prompt, out_path, duration_sec=dur)
        except Exception:
            logger.exception("runway pass failed for role=%s", role)
            continue
        meta = probe_video(out_path)
        probed = {k2: v for k2, v in (meta or {}).items() if k2 != "raw"}
        probed["role"] = role
        probed["prompt"] = prompt
        probed["model"] = model
        with Session(db_engine) as s:
            asset = Asset(
                project_id=project_id,
                asset_type="video",
                file_name=slug,
                file_path=out_path,
                mime_type="video/mp4",
                source=source_tag,
                width=int((meta or {}).get("width") or 0),
                height=int((meta or {}).get("height") or 0),
                duration_sec=float((meta or {}).get("duration_sec") or 0.0),
                fps=float((meta or {}).get("fps") or 0.0),
                metadata_json=json.dumps(probed, ensure_ascii=False),
            )
            s.add(asset)
            s.commit()


def _load_planner_context(session: Session, project_id: int) -> tuple[dict, list[dict], list[dict]]:
    knowledge = _knowledge_dict_for(session, project_id)
    hero, support = _project_asset_lists(session, project_id)
    return knowledge, hero, support


def _render_worker(job_id: int) -> None:
    """Runs in a background thread. Decides initial vs enhance based on the job row."""

    def report(stage: str, message: str) -> None:
        _update_job(job_id, stage=stage, progress_message=message)

    try:
        with Session(db_engine) as s:
            row = s.get(RenderJob, job_id)
            if row is None:
                return
            project_id = row.project_id
            enhancement_request = row.enhancement_request or ""
            parent_id = row.parent_job_id
            parent_plan_json = ""
            if parent_id:
                parent = s.get(RenderJob, parent_id)
                parent_plan_json = (parent.render_plan_json if parent else "") or ""

        _update_job(job_id, status="running", stage="planning", progress_message="Loading project context…")

        if not enhancement_request:
            # Initial render: generate missing contextual clips before planning.
            _runway_pass(project_id, report)

        with Session(db_engine) as s:
            knowledge, hero, support = _load_planner_context(s, project_id)

        if enhancement_request:
            report("planning", "Revising plan with your feedback…")
            previous_plan = json.loads(parent_plan_json) if parent_plan_json else {}
            plan = revise_render_plan(previous_plan, enhancement_request, knowledge, hero, support)
        else:
            report("planning", "Asking OpenAI for the professional plan…")
            plan = build_render_plan(knowledge, hero, support)

        _update_job(job_id, render_plan_json=json.dumps(plan, ensure_ascii=False))

        report("rendering", "Starting render…")
        output_path = produce_final_video(project_id, plan, RENDER_DIR, progress=report)
        _update_job(
            job_id,
            status="done",
            stage="done",
            progress_message="Render complete.",
            output_path=output_path,
        )
    except Exception as e:
        logger.exception("render worker failed for job %s", job_id)
        _update_job(
            job_id,
            status="failed",
            stage="failed",
            progress_message="Render failed — see error.",
            error_text=str(e),
        )


def _asset_meta_dict(asset: Asset) -> dict:
    d: dict = {
        "file_path": asset.file_path,
        "file_name": asset.file_name,
    }
    if asset.duration_sec:
        d["duration_sec"] = round(float(asset.duration_sec), 2)
    if asset.width and asset.height:
        d["width"] = asset.width
        d["height"] = asset.height
        d["aspect_ratio"] = round(asset.width / asset.height, 4)
        d["is_narrow"] = (asset.width / asset.height) < 0.75
    if asset.duration_sec:
        d["is_short"] = float(asset.duration_sec) < 10
    return d


def _backfill_asset_metadata(session: Session, asset: Asset) -> None:
    """Older rows may have been uploaded before ffprobe was wired in — fill on demand."""
    if asset.asset_type != "video" or (asset.width and asset.height):
        return
    if not os.path.exists(asset.file_path):
        return
    meta = probe_video(asset.file_path)
    if not meta:
        return
    asset.width = int(meta.get("width") or 0)
    asset.height = int(meta.get("height") or 0)
    asset.duration_sec = float(meta.get("duration_sec") or 0.0)
    asset.fps = float(meta.get("fps") or 0.0)
    asset.metadata_json = json.dumps(
        {k: v for k, v in meta.items() if k != "raw"}, ensure_ascii=False
    )
    session.add(asset)
    session.commit()


def _project_asset_lists(
    session: Session, project_id: int
) -> tuple[list[dict], list[dict]]:
    """Return (hero[s], support[s]) as richly-described asset dicts.

    Hero is the first video asset (oldest upload). Caller can use file_path
    for engine, or pass the full dict context to the planner.
    """
    assets = session.exec(
        select(Asset).where(Asset.project_id == project_id).order_by(Asset.id.asc())
    ).all()
    videos = [a for a in assets if a.asset_type == "video"]
    if not videos:
        raise HTTPException(status_code=400, detail="Upload at least one video")
    for v in videos:
        _backfill_asset_metadata(session, v)
    metas = [_asset_meta_dict(a) for a in videos]
    return metas[:1], metas[1:]


def _knowledge_dict_for(session: Session, project_id: int) -> dict:
    row = session.exec(select(Knowledge).where(Knowledge.project_id == project_id)).first()
    if not row:
        raise HTTPException(status_code=400, detail="Extract knowledge first")
    return {
        "summary": row.summary,
        "process_steps": json.loads(row.process_steps_json),
        "key_claims": json.loads(row.key_claims_json),
        "benefits": json.loads(row.benefits_json),
        "search_terms": json.loads(row.search_terms_json),
        "storyboard": json.loads(row.storyboard_json or "{}"),
    }


def _queue_render(
    session: Session,
    background_tasks: BackgroundTasks,
    project_id: int,
    *,
    parent_job_id: Optional[int] = None,
    enhancement_request: str = "",
    initial_stage: str = "queued",
    initial_message: str = "Queued.",
) -> RenderJob:
    engine_name = video_engine()
    job = RenderJob(
        project_id=project_id,
        status="queued",
        stage=initial_stage,
        progress_message=initial_message,
        render_engine=engine_name,
        parent_job_id=parent_job_id,
        enhancement_request=enhancement_request,
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    background_tasks.add_task(_render_worker, job.id)
    return job


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
        asset = Asset(
            project_id=project_id,
            asset_type=asset_type,
            file_name=safe_name,
            file_path=target,
            mime_type=file.content_type or "",
        )
        if asset_type == "video":
            meta = probe_video(target)
            if meta:
                asset.width = meta.get("width") or 0
                asset.height = meta.get("height") or 0
                asset.duration_sec = float(meta.get("duration_sec") or 0.0)
                asset.fps = float(meta.get("fps") or 0.0)
                asset.metadata_json = json.dumps(
                    {k: v for k, v in meta.items() if k != "raw"},
                    ensure_ascii=False,
                )
        asset.source = "upload"
        session.add(asset)
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
    inventory = [
        _asset_meta_dict(a) | {"source": a.source or "upload"}
        for a in assets
        if a.asset_type == "video"
    ]
    try:
        data = extract_knowledge(combined, inventory)
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
    row.narration_text = str(data.get("narration_text") or "")
    row.generated_clip_requests_json = json.dumps(
        data.get("generated_clip_requests", []), ensure_ascii=False
    )
    row.extracted_text = combined
    session.add(row)
    session.commit()
    return {"ok": True, "knowledge": _knowledge_to_out(row)}


@router.post("/projects/{project_id}/render")
def render_project(
    project_id: int,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Validate preconditions so the worker doesn't fail mysteriously.
    _knowledge_dict_for(session, project_id)
    _project_asset_lists(session, project_id)
    job = _queue_render(
        session,
        background_tasks,
        project_id,
        initial_stage="queued",
        initial_message="Queued — studying material, filling gaps, planning render…",
    )
    return {"ok": True, "job": _job_to_out(job)}


@router.post("/jobs/{job_id}/enhance")
def enhance_job(
    job_id: int,
    body: EnhanceJobIn,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    request_text = (body.request or "").strip()
    if not request_text:
        raise HTTPException(status_code=400, detail="Improvement request is required")
    parent = session.get(RenderJob, job_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Job not found")
    if parent.status != "done":
        raise HTTPException(status_code=400, detail="Only completed jobs can be enhanced")
    if not parent.render_plan_json:
        raise HTTPException(
            status_code=400,
            detail="This job has no stored plan (was rendered before enhancements were supported). Re-render first.",
        )
    _knowledge_dict_for(session, parent.project_id)
    _project_asset_lists(session, parent.project_id)
    job = _queue_render(
        session,
        background_tasks,
        parent.project_id,
        parent_job_id=parent.id,
        enhancement_request=request_text,
        initial_stage="queued",
        initial_message="Queued — revising plan with your feedback…",
    )
    return {"ok": True, "job": _job_to_out(job)}


@router.get("/jobs/{job_id}")
def get_job(job_id: int, session: Session = Depends(get_session)):
    job = session.get(RenderJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
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
