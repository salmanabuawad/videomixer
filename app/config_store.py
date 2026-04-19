"""Runtime settings stored in the database (`app_config` table), with env fallback."""

from __future__ import annotations

import os
from datetime import datetime

from sqlmodel import Session, select

from app.config import OPENAI_API_KEY as ENV_OPENAI_API_KEY
from app.config import OPENAI_MODEL as ENV_OPENAI_MODEL
from app.config import (
    PUBLIC_UPLOAD_URL_PREFIX as ENV_PUBLIC_UPLOAD_URL_PREFIX,
    SHOTSTACK_API_KEY_EXPLICIT,
    SHOTSTACK_PRODUCTION_KEY as ENV_SHOTSTACK_PRODUCTION_KEY,
    SHOTSTACK_SANDBOX_KEY as ENV_SHOTSTACK_SANDBOX_KEY,
    SHOTSTACK_USE_PRODUCTION as ENV_SHOTSTACK_USE_PRODUCTION,
    VIDEO_ENGINE as ENV_VIDEO_ENGINE,
)
from app.db import engine
from app.models import AppConfig

KEY_OPENAI_API_KEY = "openai_api_key"
KEY_OPENAI_MODEL = "openai_model"

KEY_VIDEO_ENGINE = "video_engine"
KEY_SHOTSTACK_API_KEY = "shotstack_api_key"
KEY_SHOTSTACK_SANDBOX_KEY = "shotstack_sandbox_key"
KEY_SHOTSTACK_PRODUCTION_KEY = "shotstack_production_key"
KEY_SHOTSTACK_USE_PRODUCTION = "shotstack_use_production"
KEY_SHOTSTACK_API_ENV = "shotstack_api_env"
KEY_PUBLIC_UPLOAD_URL_PREFIX = "public_upload_url_prefix"
KEY_RUNWAY_API_KEY = "runway_api_key"
KEY_HEYGEN_API_KEY = "heygen_api_key"
KEY_HEYGEN_AVATAR_ID = "heygen_avatar_id_default"

# Settings whose value must never touch disk in plaintext when encryption is enabled.
SENSITIVE_KEYS = frozenset(
    {
        KEY_OPENAI_API_KEY,
        KEY_SHOTSTACK_API_KEY,
        KEY_SHOTSTACK_SANDBOX_KEY,
        KEY_SHOTSTACK_PRODUCTION_KEY,
        KEY_RUNWAY_API_KEY,
        KEY_HEYGEN_API_KEY,
    }
)

# Values copied from .env.example that must be replaced (never call OpenAI with these).
_PLACEHOLDER_KEYS = frozenset(
    {
        "",
        "your_openai_key",
        "sk-your-key-here",
        "changeme",
        "replace_me",
    }
)


def is_placeholder_api_key(key: str) -> bool:
    k = (key or "").strip().lower()
    if not k:
        return True
    if k in _PLACEHOLDER_KEYS:
        return True
    if k.startswith("your_") and "key" in k:
        return True
    return False


def get_setting(key: str, default: str = "") -> str:
    from app.services import config_crypto

    with Session(engine) as session:
        row = session.exec(select(AppConfig).where(AppConfig.key == key)).first()
        if row is None:
            return default
        raw = (row.value or "").strip()
        if not raw:
            return default
        if getattr(row, "is_encrypted", False) or config_crypto.is_ciphertext(raw):
            try:
                return config_crypto.decrypt(raw).strip()
            except Exception:
                # Fail closed — never return garbled ciphertext to callers.
                return default
        return raw


def _truthy_setting(key: str, env_default: bool) -> bool:
    raw = get_setting(key, "")
    if raw.strip():
        return raw.strip().lower() in ("1", "true", "yes")
    return env_default


def openai_api_key() -> str:
    db_val = get_setting(KEY_OPENAI_API_KEY, "")
    cand = db_val if db_val else (ENV_OPENAI_API_KEY or "").strip()
    if is_placeholder_api_key(cand):
        return ""
    return cand


def openai_model() -> str:
    db_val = get_setting(KEY_OPENAI_MODEL, "")
    if db_val:
        return db_val
    return (ENV_OPENAI_MODEL or "").strip() or "gpt-4o"


def _normalize_video_engine(raw: str) -> str:
    """Only ``local`` and ``shotstack`` are valid; unknown values fall back to ``local``."""
    x = (raw or "").strip().lower()
    if x in ("local", "ffmpeg", ""):
        return "local"
    if x == "shotstack":
        return "shotstack"
    return "local"


def video_engine() -> str:
    """Which renderer to use: env VIDEO_ENGINE wins (runtime / systemd), then app_config, then default."""
    env_first = (os.getenv("VIDEO_ENGINE") or "").strip().lower()
    if env_first:
        return _normalize_video_engine(env_first)
    v = get_setting(KEY_VIDEO_ENGINE, "").strip().lower()
    if v:
        return _normalize_video_engine(v)
    return _normalize_video_engine((ENV_VIDEO_ENGINE or "local"))


def shotstack_api_key_resolved() -> str:
    """Single explicit key, else production or sandbox key depending on shotstack_use_production."""
    explicit = get_setting(KEY_SHOTSTACK_API_KEY, "").strip() or SHOTSTACK_API_KEY_EXPLICIT
    if explicit.strip():
        return explicit.strip()
    use_prod = _truthy_setting(KEY_SHOTSTACK_USE_PRODUCTION, ENV_SHOTSTACK_USE_PRODUCTION)
    sandbox = get_setting(KEY_SHOTSTACK_SANDBOX_KEY, "").strip() or ENV_SHOTSTACK_SANDBOX_KEY
    prod = get_setting(KEY_SHOTSTACK_PRODUCTION_KEY, "").strip() or ENV_SHOTSTACK_PRODUCTION_KEY
    return (prod if use_prod else sandbox).strip()


def shotstack_api_env_override_raw() -> str:
    """Value stored in app_config (may be empty to mean 'auto')."""
    return get_setting(KEY_SHOTSTACK_API_ENV, "").strip()


def shotstack_api_env_resolved() -> str:
    db = shotstack_api_env_override_raw()
    if db:
        return db
    env_seg = (os.getenv("SHOTSTACK_API_ENV") or "").strip()
    if env_seg:
        return env_seg
    use_prod = _truthy_setting(KEY_SHOTSTACK_USE_PRODUCTION, ENV_SHOTSTACK_USE_PRODUCTION)
    return "v1" if use_prod else "stage"


def public_upload_url_prefix() -> str:
    v = get_setting(KEY_PUBLIC_UPLOAD_URL_PREFIX, "").strip()
    if v:
        return v.rstrip("/")
    return (ENV_PUBLIC_UPLOAD_URL_PREFIX or "").strip().rstrip("/")


def shotstack_use_production_effective() -> bool:
    return _truthy_setting(KEY_SHOTSTACK_USE_PRODUCTION, ENV_SHOTSTACK_USE_PRODUCTION)


def runway_api_key() -> str:
    db_val = get_setting(KEY_RUNWAY_API_KEY, "")
    if db_val:
        return db_val
    return (os.getenv("RUNWAY_API_KEY") or "").strip()


def heygen_api_key() -> str:
    db_val = get_setting(KEY_HEYGEN_API_KEY, "")
    if db_val:
        return db_val
    return (os.getenv("HEYGEN_API_KEY") or "").strip()


def heygen_avatar_id() -> str:
    db_val = get_setting(KEY_HEYGEN_AVATAR_ID, "")
    if db_val:
        return db_val
    return (os.getenv("HEYGEN_AVATAR_ID") or "").strip()


def upsert_setting(session: Session, key: str, value: str) -> None:
    from app.services import config_crypto

    stored = value or ""
    encrypted = False
    if stored and key in SENSITIVE_KEYS and config_crypto.is_enabled():
        stored = config_crypto.encrypt(stored)
        encrypted = True
    row = session.exec(select(AppConfig).where(AppConfig.key == key)).first()
    now = datetime.utcnow()
    if row:
        row.value = stored
        row.is_encrypted = encrypted
        row.updated_at = now
        session.add(row)
    else:
        session.add(AppConfig(key=key, value=stored, is_encrypted=encrypted, updated_at=now))


def backfill_encrypt_sensitive() -> int:
    """One-shot: re-store any SENSITIVE_KEYS row whose value is still plaintext.

    Runs at startup after migrations. No-op when the master key is missing — so
    a half-configured server doesn't drop keys on the floor. Returns the number
    of rows re-encrypted.
    """
    from app.services import config_crypto

    if not config_crypto.is_enabled():
        return 0
    rewritten = 0
    with Session(engine) as s:
        for key in SENSITIVE_KEYS:
            row = s.exec(select(AppConfig).where(AppConfig.key == key)).first()
            if not row or not (row.value or "").strip():
                continue
            if getattr(row, "is_encrypted", False) or config_crypto.is_ciphertext(row.value):
                continue
            row.value = config_crypto.encrypt(row.value)
            row.is_encrypted = True
            row.updated_at = datetime.utcnow()
            s.add(row)
            rewritten += 1
        s.commit()
    return rewritten


def seed_from_env() -> None:
    """If DB has no rows for a setting, copy from environment so first deploy can use .env once."""
    with Session(engine) as session:
        key_row = session.exec(select(AppConfig).where(AppConfig.key == KEY_OPENAI_API_KEY)).first()
        env_key = (ENV_OPENAI_API_KEY or "").strip()
        if not key_row and env_key and not is_placeholder_api_key(env_key):
            upsert_setting(session, KEY_OPENAI_API_KEY, env_key)
        model_row = session.exec(select(AppConfig).where(AppConfig.key == KEY_OPENAI_MODEL)).first()
        if not model_row:
            upsert_setting(session, KEY_OPENAI_MODEL, (ENV_OPENAI_MODEL or "gpt-4o").strip())

        # Do not seed video_engine=local — that would pin the DB to FFmpeg and ignore later .env VIDEO_ENGINE=shotstack.
        ve_row = session.exec(select(AppConfig).where(AppConfig.key == KEY_VIDEO_ENGINE)).first()
        env_ve = (ENV_VIDEO_ENGINE or "").strip().lower()
        if not ve_row and env_ve == "shotstack":
            upsert_setting(session, KEY_VIDEO_ENGINE, "shotstack")

        if not session.exec(select(AppConfig).where(AppConfig.key == KEY_PUBLIC_UPLOAD_URL_PREFIX)).first():
            pub = (ENV_PUBLIC_UPLOAD_URL_PREFIX or "").strip()
            if pub:
                upsert_setting(session, KEY_PUBLIC_UPLOAD_URL_PREFIX, pub)

        sk_row = session.exec(select(AppConfig).where(AppConfig.key == KEY_SHOTSTACK_API_KEY)).first()
        if not sk_row and SHOTSTACK_API_KEY_EXPLICIT:
            upsert_setting(session, KEY_SHOTSTACK_API_KEY, SHOTSTACK_API_KEY_EXPLICIT.strip())
        if not session.exec(select(AppConfig).where(AppConfig.key == KEY_SHOTSTACK_SANDBOX_KEY)).first():
            if ENV_SHOTSTACK_SANDBOX_KEY.strip():
                upsert_setting(session, KEY_SHOTSTACK_SANDBOX_KEY, ENV_SHOTSTACK_SANDBOX_KEY.strip())
        if not session.exec(select(AppConfig).where(AppConfig.key == KEY_SHOTSTACK_PRODUCTION_KEY)).first():
            if ENV_SHOTSTACK_PRODUCTION_KEY.strip():
                upsert_setting(session, KEY_SHOTSTACK_PRODUCTION_KEY, ENV_SHOTSTACK_PRODUCTION_KEY.strip())

        if not session.exec(select(AppConfig).where(AppConfig.key == KEY_SHOTSTACK_USE_PRODUCTION)).first():
            upsert_setting(
                session,
                KEY_SHOTSTACK_USE_PRODUCTION,
                "true" if ENV_SHOTSTACK_USE_PRODUCTION else "false",
            )

        if not session.exec(select(AppConfig).where(AppConfig.key == KEY_SHOTSTACK_API_ENV)).first():
            env_api = (os.getenv("SHOTSTACK_API_ENV") or "").strip()
            if env_api:
                upsert_setting(session, KEY_SHOTSTACK_API_ENV, env_api)

        session.commit()
