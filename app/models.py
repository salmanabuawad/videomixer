from __future__ import annotations
from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field

class Project(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    status: str = "draft"
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Asset(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    asset_type: str
    file_name: str
    file_path: str
    mime_type: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Knowledge(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True, unique=True)
    summary: str = ""
    process_steps_json: str = "[]"
    key_claims_json: str = "[]"
    benefits_json: str = "[]"
    search_terms_json: str = "[]"
    storyboard_json: str = "{}"
    extracted_text: str = ""

class RenderJob(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    status: str = "queued"
    output_path: str = ""
    error_text: str = ""
    render_engine: str = ""  # local | shotstack
    stage: str = ""  # planning | submitting | queued | fetching | rendering | saving | downloading | done
    progress_message: str = ""
    parent_job_id: Optional[int] = Field(default=None, foreign_key="renderjob.id", index=True)
    enhancement_request: str = ""
    render_plan_json: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AppConfig(SQLModel, table=True):
    """Key-value application settings (e.g. OpenAI API key). Prefer DB over env when set."""

    __tablename__ = "app_config"

    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(unique=True, index=True, max_length=128)
    value: str = ""
    updated_at: datetime = Field(default_factory=datetime.utcnow)
