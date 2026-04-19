"""AES-256-GCM symmetric encryption for provider API keys at rest.

The master key comes from the environment (`CONFIG_MASTER_KEY`) — it is the only
long-term secret outside the DB. If the env var is unset or invalid, encryption
is disabled and the caller falls back to plaintext storage; this keeps existing
deployments working until the operator provisions a master key, at which point
a one-shot backfill re-encrypts the plaintext rows.

Ciphertext layout (base64url, no padding):
    version_byte || nonce(12) || aes_gcm_ciphertext_with_tag
version_byte = 0x01 for AES-256-GCM.
"""

from __future__ import annotations

import base64
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

_VERSION_BYTE = 0x01
_NONCE_LEN = 12
_MASTER_KEY_ENV = "CONFIG_MASTER_KEY"
_PREFIX = "enc:v1:"


def _decode_master_key() -> Optional[bytes]:
    raw = (os.getenv(_MASTER_KEY_ENV) or "").strip()
    if not raw:
        return None
    # Accept hex (64 chars) or base64url (≥43 chars) for 32-byte keys.
    try:
        if len(raw) == 64:
            key = bytes.fromhex(raw)
        else:
            key = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
    except Exception:
        logger.error("CONFIG_MASTER_KEY is not valid hex/base64; encryption disabled")
        return None
    if len(key) != 32:
        logger.error("CONFIG_MASTER_KEY must decode to 32 bytes (got %s)", len(key))
        return None
    return key


def is_enabled() -> bool:
    return _decode_master_key() is not None


def encrypt(plaintext: str) -> str:
    """Return an `enc:v1:<b64>` token. Caller must mark the row is_encrypted=True."""
    if plaintext is None:
        return ""
    key = _decode_master_key()
    if key is None:
        raise RuntimeError(
            "CONFIG_MASTER_KEY is not set — cannot encrypt. "
            "Provision a 32-byte key in /opt/zymtech_innovation/.env "
            "(base64url or hex) and restart zymtech.service."
        )
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    nonce = os.urandom(_NONCE_LEN)
    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    blob = bytes([_VERSION_BYTE]) + nonce + ct
    return _PREFIX + base64.urlsafe_b64encode(blob).rstrip(b"=").decode("ascii")


def decrypt(token: str) -> str:
    """Reverse of encrypt. Returns plaintext. Raises on tamper/missing master key."""
    if not token or not token.startswith(_PREFIX):
        raise ValueError("Expected an 'enc:v1:' token")
    key = _decode_master_key()
    if key is None:
        raise RuntimeError(
            f"{_MASTER_KEY_ENV} is not set — cannot decrypt stored secret."
        )
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    payload = token[len(_PREFIX):]
    payload += "=" * (-len(payload) % 4)
    blob = base64.urlsafe_b64decode(payload)
    if not blob or blob[0] != _VERSION_BYTE:
        raise ValueError("Unknown ciphertext version")
    nonce = blob[1:1 + _NONCE_LEN]
    ct = blob[1 + _NONCE_LEN:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ct, None).decode("utf-8")


def is_ciphertext(value: str) -> bool:
    return bool(value) and value.startswith(_PREFIX)
