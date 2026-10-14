"""MCP server credentials: the stored shape of ``auth_config``.

Stored shape (secrets encrypted with utils.encryption, AES-256-GCM):
  none    -> {}
  bearer  -> {"token_enc": "<iv:tag:ct>"}
  api_key -> {"header": "X-API-Key", "key_enc": "<iv:tag:ct>"}

Rows written before migration a0013 hold plaintext ``token``, ``key`` or
``api_key`` and ``header`` or ``header_name``; every reader accepts both.
"""

from typing import Optional

from utils.encryption import decrypt, encrypt, mask_api_key

DEFAULT_API_KEY_HEADER = "X-API-Key"
SUPPORTED_AUTH_TYPES = ("none", "bearer", "api_key")

_SECRET_FIELD = {"bearer": "token", "api_key": "key"}
_LEGACY_SECRET_FIELDS = {"bearer": ("token",), "api_key": ("key", "api_key")}


class CredentialError(ValueError):
    """A credential problem the admin can fix; the message is shown to them."""


def _clean(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def _incoming_secret(auth_type: str, incoming: dict) -> str:
    for field in _LEGACY_SECRET_FIELDS[auth_type]:
        secret = _clean(incoming.get(field))
        if secret:
            return secret
    return ""


def _header(cfg: dict) -> str:
    return _clean(cfg.get("header")) or _clean(cfg.get("header_name"))


def get_secret(auth_type: str, cfg: Optional[dict]) -> str:
    """The decrypted secret, or "" when none is stored."""
    if auth_type not in _SECRET_FIELD or not cfg:
        return ""
    encrypted = cfg.get(f"{_SECRET_FIELD[auth_type]}_enc")
    if encrypted:
        return decrypt(encrypted)
    return _incoming_secret(auth_type, cfg)


def _stored_shape(auth_type: str, secret: str, header: str) -> dict:
    if auth_type == "bearer":
        return {"token_enc": encrypt(secret)} if secret else {}
    shape = {"header": header or DEFAULT_API_KEY_HEADER}
    if secret:
        shape["key_enc"] = encrypt(secret)
    return shape


def normalize_auth_config(
    auth_type: str, incoming: Optional[dict], stored: Optional[dict]
) -> dict:
    """Build the stored shape from a request body in either field spelling.

    ``stored`` is the row's current config when the auth type is unchanged
    (its secret is kept if ``incoming`` has none), else None.
    """
    if auth_type not in SUPPORTED_AUTH_TYPES:
        raise CredentialError(f"Unsupported auth type: {auth_type}")
    if auth_type == "none":
        return {}
    incoming = incoming or {}
    stored = stored or {}
    secret = _incoming_secret(auth_type, incoming) or get_secret(auth_type, stored)
    if not secret:
        raise CredentialError("Enter the credentials for the new auth type")
    header = _header(incoming) or _header(stored)
    return _stored_shape(auth_type, secret, header)


def migrate_stored_config(auth_type: str, cfg: Optional[dict]) -> dict:
    """Rewrite any stored config into the stored shape; never raises on a missing secret."""
    if auth_type not in _SECRET_FIELD:
        return {}
    cfg = cfg or {}
    encrypted_field = f"{_SECRET_FIELD[auth_type]}_enc"
    if cfg.get(encrypted_field):
        # Already in the stored shape: keep the ciphertext. Re-encrypting would
        # change it (GCM uses a fresh nonce), so migrating twice would not be a no-op.
        kept = {encrypted_field: cfg[encrypted_field]}
        if auth_type == "api_key":
            kept["header"] = _header(cfg) or DEFAULT_API_KEY_HEADER
        return kept
    return _stored_shape(auth_type, get_secret(auth_type, cfg), _header(cfg))


def legacy_config(auth_type: str, cfg: Optional[dict]) -> dict:
    """Decrypt back to the pre-a0013 plaintext shape (migration downgrade)."""
    if auth_type not in _SECRET_FIELD:
        return {}
    cfg = cfg or {}
    secret = get_secret(auth_type, cfg)
    if auth_type == "bearer":
        return {"token": secret} if secret else {}
    legacy = {"header": _header(cfg) or DEFAULT_API_KEY_HEADER}
    if secret:
        legacy["key"] = secret
    return legacy


def build_auth_headers(auth_type: str, cfg: Optional[dict]) -> dict:
    """Headers for a request to the MCP server. The only place secrets are decrypted for use."""
    secret = get_secret(auth_type, cfg)
    if auth_type == "bearer":
        return {"Authorization": f"Bearer {secret}"}
    if auth_type == "api_key":
        return {(_header(cfg or {}) or DEFAULT_API_KEY_HEADER): secret}
    return {}


def _hint(secret: str) -> str:
    # mask_api_key shows first and last 4; on a short token that is most of it.
    if len(secret) < 24:
        return f"...{secret[-4:]}" if len(secret) > 8 else "***"
    return mask_api_key(secret)


def public_auth_fields(auth_type: str, cfg: Optional[dict], is_admin: bool) -> dict:
    """What an API response may say about credentials: a masked hint, Admins only."""
    if not is_admin or auth_type not in _SECRET_FIELD:
        return {}
    fields = {}
    if auth_type == "api_key":
        fields["auth_header"] = _header(cfg or {}) or DEFAULT_API_KEY_HEADER
    secret = get_secret(auth_type, cfg)
    if secret:
        fields["auth_secret_hint"] = _hint(secret)
    return fields
