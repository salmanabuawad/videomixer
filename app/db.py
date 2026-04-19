from sqlalchemy import inspect, text
from sqlmodel import SQLModel, Session, create_engine

from app.config import DATABASE_URL


def _engine_kwargs():
    if DATABASE_URL.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    return {"pool_pre_ping": True, "pool_size": 5, "max_overflow": 10}


engine = create_engine(DATABASE_URL, echo=False, **_engine_kwargs())


_RENDER_JOB_COLUMN_DDL = {
    "render_engine": "ALTER TABLE renderjob ADD COLUMN render_engine VARCHAR(32) DEFAULT ''",
    "parent_job_id": "ALTER TABLE renderjob ADD COLUMN parent_job_id INTEGER",
    "enhancement_request": "ALTER TABLE renderjob ADD COLUMN enhancement_request TEXT DEFAULT ''",
    "render_plan_json": "ALTER TABLE renderjob ADD COLUMN render_plan_json TEXT DEFAULT ''",
    "stage": "ALTER TABLE renderjob ADD COLUMN stage VARCHAR(32) DEFAULT ''",
    "progress_message": "ALTER TABLE renderjob ADD COLUMN progress_message TEXT DEFAULT ''",
    "updated_at": "ALTER TABLE renderjob ADD COLUMN updated_at DATETIME",
}

_ASSET_COLUMN_DDL = {
    "width": "ALTER TABLE asset ADD COLUMN width INTEGER DEFAULT 0",
    "height": "ALTER TABLE asset ADD COLUMN height INTEGER DEFAULT 0",
    "duration_sec": "ALTER TABLE asset ADD COLUMN duration_sec REAL DEFAULT 0",
    "fps": "ALTER TABLE asset ADD COLUMN fps REAL DEFAULT 0",
    "metadata_json": "ALTER TABLE asset ADD COLUMN metadata_json TEXT DEFAULT ''",
}


def _ensure_columns(table: str, ddl_map: dict[str, str]) -> None:
    insp = inspect(engine)
    if table not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns(table)}
    missing = [ddl for name, ddl in ddl_map.items() if name not in cols]
    if not missing:
        return
    with engine.begin() as conn:
        for ddl in missing:
            conn.execute(text(ddl))


def init_db():
    # Import models so table metadata is registered before create_all
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _ensure_columns("renderjob", _RENDER_JOB_COLUMN_DDL)
    _ensure_columns("asset", _ASSET_COLUMN_DDL)


def get_session():
    with Session(engine) as session:
        yield session
