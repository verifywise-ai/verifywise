"""MCP server credentials: the stored shape of ``auth_config``.

Stored shape (secrets encrypted with utils.encryption, AES-256-GCM):
  none    -> {}
  bearer  -> {"token_enc": "<iv:tag:ct>"}
  api_key -> {"header": "X-API-Key", "key_enc": "<iv:tag:ct>"}
  oauth   -> {"client_id", "client_secret_enc", "token_url",
              "token_url_source": "manual" | "discovered", "scope"?, "resource"?,
              "auth_method": "client_secret_basic" | "client_secret_post"}
  aws_iam -> {"region", "access_key_id", "secret_access_key_enc",
              "resource": "aws-mcp.amazonaws.com"}

Rows written before migration a0013 hold plaintext ``token``, ``key`` or
``api_key`` and ``header`` or ``header_name``; every reader accepts both.
"""

import hashlib
import json
import re
from typing import Optional
from urllib.parse import urlsplit

from utils.encryption import decrypt, encrypt, mask_api_key
from utils.safe_outbound_url import UnsafeOutboundUrlError, assert_safe_outbound_url

DEFAULT_API_KEY_HEADER = "X-API-Key"
DEFAULT_AWS_MCP_RESOURCE = "aws-mcp.amazonaws.com"
SUPPORTED_AUTH_TYPES = ("none", "bearer", "api_key", "oauth", "aws_iam")
# Types whose headers come from a fetched token (async builder), not a static secret.
TOKEN_AUTH_TYPES = ("oauth", "aws_iam")

_AUTH_METHODS = ("client_secret_basic", "client_secret_post")
_TOKEN_URL_SOURCES = ("manual", "discovered")
_AWS_REGION = re.compile(r"^[a-z]{2}(-[a-z]+)+-\d+$")

_SECRET_FIELD = {"bearer": "token", "api_key": "key"}
_TOKEN_SECRET_FIELD = {"oauth": "client_secret_enc", "aws_iam": "secret_access_key_enc"}
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


def token_secret(auth_type: str, cfg: Optional[dict]) -> str:
    """The decrypted OAuth client secret or AWS secret access key; "" when none."""
    field = _TOKEN_SECRET_FIELD.get(auth_type)
    encrypted = (cfg or {}).get(field) if field else None
    return decrypt(encrypted) if encrypted else ""


def config_fingerprint(auth_type: str, cfg: Optional[dict]) -> str:
    """Stable hash of a stored config; a changed credential never reuses a cached token."""
    payload = auth_type + json.dumps(cfg or {}, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _origin(url: str) -> tuple:
    parts = urlsplit(url)
    scheme = parts.scheme.lower()
    try:
        port = parts.port or {"https": 443, "http": 80}.get(scheme)
    except ValueError:
        port = None
    return (scheme, (parts.hostname or "").lower(), port)


def same_origin(url_a: str, url_b: str) -> bool:
    """Same scheme, host and port (default ports normalised)."""
    return _origin(url_a or "") == _origin(url_b or "")


def supplies_token_secret(auth_type: str, incoming) -> bool:
    """True when ``incoming`` carries a non-blank new client secret / secret access key."""
    if auth_type not in TOKEN_AUTH_TYPES or not isinstance(incoming, dict):
        return False
    return bool(_clean(incoming.get(_TOKEN_SECRET_FIELD[auth_type][:-4])))


def _normalize_token_type(auth_type: str, incoming: dict, stored: dict) -> dict:
    secret_field = _TOKEN_SECRET_FIELD[auth_type]

    def pick(name: str) -> str:
        return _clean(incoming.get(name)) or _clean(stored.get(name))

    def pick_clearable(name: str) -> str:
        # A key present in the request wins even when empty (clears the value);
        # an absent key keeps the stored one.
        if name in incoming:
            return _clean(incoming.get(name))
        return _clean(stored.get(name))

    new_secret = _clean(incoming.get(secret_field[:-4]))
    secret = new_secret or token_secret(auth_type, stored)
    # No new secret: keep the stored ciphertext as is. Re-encrypting would use a
    # fresh GCM nonce and change the config fingerprint (dropping the cached token).
    def secret_enc() -> str:
        return encrypt(new_secret) if new_secret else stored.get(secret_field) or encrypt(secret)

    if auth_type == "aws_iam":
        region = pick("region")
        if not _AWS_REGION.match(region):
            raise CredentialError("Enter an AWS region such as us-east-1")
        access_key_id = pick("access_key_id")
        if not access_key_id or not secret:
            raise CredentialError("Enter the access key ID and secret access key")
        return {
            "region": region,
            "access_key_id": access_key_id,
            "secret_access_key_enc": secret_enc(),
            "resource": pick_clearable("resource") or DEFAULT_AWS_MCP_RESOURCE,
        }

    client_id = pick("client_id")
    if not client_id or not secret:
        raise CredentialError("Enter the client ID and client secret")
    token_url = _clean(incoming.get("token_url")) or _clean(stored.get("token_url"))
    if not token_url:
        raise CredentialError("Enter the token URL, or use Find token URL")
    try:
        token_url = assert_safe_outbound_url(token_url)
    except UnsafeOutboundUrlError as exc:
        raise CredentialError(str(exc)) from exc
    stored_url = _clean(stored.get("token_url"))
    if stored_url and token_url != stored_url:
        if not new_secret and _origin(token_url) != _origin(stored_url):
            # Never send a stored secret to a host the admin cannot read it back from.
            raise CredentialError(
                "Enter the client secret again: the token URL now points to a different host"
            )
        source = _clean(incoming.get("token_url_source"))
    else:
        source = _clean(incoming.get("token_url_source")) or _clean(stored.get("token_url_source"))
    method = _clean(incoming.get("auth_method")) or _clean(stored.get("auth_method"))
    cfg = {
        "client_id": client_id,
        "client_secret_enc": secret_enc(),
        "token_url": token_url,
        "token_url_source": source if source in _TOKEN_URL_SOURCES else "manual",
        "auth_method": method if method in _AUTH_METHODS else "client_secret_basic",
    }
    for optional in ("scope", "resource"):
        value = pick_clearable(optional)
        if value:
            cfg[optional] = value
    return cfg


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
    if auth_type in TOKEN_AUTH_TYPES:
        return _normalize_token_type(auth_type, incoming, stored)
    new_secret = _incoming_secret(auth_type, incoming)
    secret = new_secret or get_secret(auth_type, stored)
    if not secret:
        raise CredentialError("Enter the credentials for the new auth type")
    header = _header(incoming) or _header(stored)
    shape = _stored_shape(auth_type, secret, header)
    kept = stored.get(f"{_SECRET_FIELD[auth_type]}_enc")
    if not new_secret and kept:
        shape[f"{_SECRET_FIELD[auth_type]}_enc"] = kept  # same ciphertext: nothing changed
    return shape


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
    if not is_admin:
        return {}
    cfg = cfg or {}
    if auth_type in TOKEN_AUTH_TYPES:
        return _public_token_fields(auth_type, cfg)
    if auth_type not in _SECRET_FIELD:
        return {}
    fields = {}
    if auth_type == "api_key":
        fields["auth_header"] = _header(cfg or {}) or DEFAULT_API_KEY_HEADER
    secret = get_secret(auth_type, cfg)
    if secret:
        fields["auth_secret_hint"] = _hint(secret)
    return fields


def _public_token_fields(auth_type: str, cfg: dict) -> dict:
    if auth_type == "aws_iam":
        fields = {
            "aws_region": cfg.get("region", ""),
            "aws_access_key_id": cfg.get("access_key_id", ""),
        }
    else:
        fields = {
            "oauth_client_id": cfg.get("client_id", ""),
            "oauth_token_url": cfg.get("token_url", ""),
            "oauth_token_url_source": cfg.get("token_url_source", "manual"),
            "oauth_scope": cfg.get("scope", ""),
            "oauth_resource": cfg.get("resource", ""),
        }
    secret = token_secret(auth_type, cfg)
    if secret:
        fields["auth_secret_hint"] = _hint(secret)
    return fields
