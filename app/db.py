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


def _ensure_render_job_columns() -> None:
    insp = inspect(engine)
    if "renderjob" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("renderjob")}
    missing = [(name, ddl) for name, ddl in _RENDER_JOB_COLUMN_DDL.items() if name not in cols]
    if not missing:
        return
    with engine.begin() as conn:
        for _, ddl in missing:
            conn.execute(text(ddl))


def init_db():
    # Import models so table metadata is registered before create_all
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _ensure_render_job_columns()


def get_session():
    with Session(engine) as session:
        yield session
