from sqlalchemy import inspect, text
from sqlmodel import SQLModel, Session, create_engine

from app.config import DATABASE_URL


def _engine_kwargs():
    if DATABASE_URL.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    return {"pool_pre_ping": True, "pool_size": 5, "max_overflow": 10}


engine = create_engine(DATABASE_URL, echo=False, **_engine_kwargs())


def _ensure_render_job_engine_column() -> None:
    """Existing DBs created before `render_engine` need a migration."""
    insp = inspect(engine)
    tables = insp.get_table_names()
    if "renderjob" not in tables:
        return
    cols = {c["name"] for c in insp.get_columns("renderjob")}
    if "render_engine" in cols:
        return
    ddl = "ALTER TABLE renderjob ADD COLUMN render_engine VARCHAR(32) DEFAULT ''"
    with engine.begin() as conn:
        conn.execute(text(ddl))


def init_db():
    # Import models so table metadata is registered before create_all
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _ensure_render_job_engine_column()


def get_session():
    with Session(engine) as session:
        yield session
