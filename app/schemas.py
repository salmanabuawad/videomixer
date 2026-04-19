from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class OpenAIConfigIn(BaseModel):
    openai_api_key: str
    openai_model: str = "gpt-4o"


class ShotstackConfigIn(BaseModel):
    """Persisted in `app_config`. Empty strings clear optional fields; env is used as fallback."""

    video_engine: str = "local"
    public_upload_url_prefix: str = ""
    shotstack_use_production: bool = False
    shotstack_api_key: str = ""
    shotstack_sandbox_key: str = ""
    shotstack_production_key: str = ""
    shotstack_api_env: str = ""


class ProjectCreate(BaseModel):
    name: str


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    status: str
    created_at: datetime


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    asset_type: str
    file_name: str
    mime_type: str = ""
    source: str = ""
    width: int = 0
    height: int = 0
    duration_sec: float = 0.0
    fps: float = 0.0
    created_at: datetime


class KnowledgeOut(BaseModel):
    summary: str
    process_steps: list[Any]
    key_claims: list[Any]
    benefits: list[Any]
    search_terms: list[Any]
    storyboard: dict[str, Any]
    narration_text: str = ""
    intro_script: str = ""
    closing_script: str = ""
    generated_clip_requests: list[Any] = []


class RenderJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    status: str
    output_path: str = ""
    error_text: str = ""
    render_engine: str = ""
    stage: str = ""
    progress_message: str = ""
    parent_job_id: Optional[int] = None
    enhancement_request: str = ""
    created_at: datetime
    updated_at: Optional[datetime] = None
    download_url: Optional[str] = None


class EnhanceJobIn(BaseModel):
    request: str


class ProjectDetailOut(BaseModel):
    project: ProjectOut
    assets: list[AssetOut]
    knowledge: Optional[KnowledgeOut] = None
    jobs: list[RenderJobOut]
