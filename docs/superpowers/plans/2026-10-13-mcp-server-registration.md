# MCP server registration: make it work — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registering an MCP server discovers its tools during save, reports a clear result, stores credentials encrypted and masked, and hides disabled servers' tools from agents.

**Architecture:** A new credentials module owns the stored shape (encrypt, normalize both field spellings, mask, build auth headers). Discovery is split into a bounded network fetch and an uncancelled database store, wrapped by `run_discovery`, which records health and a friendly error. The servers router calls `run_discovery` on create, on relevant edits and from the Discover button, and never returns `auth_config`.

**Tech Stack:** FastAPI, SQLAlchemy `text()` SQL, Alembic, httpx, pytest + pytest-asyncio (gateway); React 19, MUI, Vitest (client).

**Spec:** `docs/superpowers/specs/2026-10-13-mcp-server-registration-design.md`

## Global Constraints

- Branch `fix/mcp-server-registration`; commit format `type(scope): description` with a body.
- On-save discovery budget **10 seconds**; Discover-button budget **30 seconds**. The budget bounds only the network phase.
- `tools/list` paging cap: **20 pages**.
- `last_discovery_error`: max **500** characters; never contains secrets, URLs or raw exception text (JSON-RPC error messages truncated to 200 characters are allowed).
- Stored `auth_config`: `{}` | `{"token_enc"}` | `{"header", "key_enc"}`. Default API-key header **`X-API-Key`**.
- List and get responses never include `auth_config`. Admins get `auth_header` (api_key only) and `auth_secret_hint`; everyone gets `last_discovery_error` and `tool_count`.
- Every tenant query filters on `organization_id`.
- UI: sentence case; house components (`CustomizableButton`, `StandardModal`, `Field`, `Select`, `Chip`, `Alert`); pixel spacing strings (`gap: "8px"`), never MUI numeric spacing; theme palette, no hardcoded colours.
- New user-facing strings need de/fr/es in `Clients/src/i18n/translations.ts` (`npm run i18n:audit:strict`).
- No `console.log`. Gateway logging via `logging.getLogger`.
- Gateway CI runs only the test files listed in `.github/workflows/aigateway-checks.yml`; new self-contained test files must be added there.

## Review Focus

1. **A server that offers zero tools.** Discovery succeeds with 0 tools, deactivates any old ones, and the UI says "The server offered no tools" rather than "0 tools found" or an error. (Task 4 test `test_zero_tools_is_success`; Task 6 test "zero tools message".)
2. **Re-enabling a disabled server from the row toggle.** Discovery runs and the admin sees the result; today the toggle swallows the response. (Task 3 test `test_patch_enabling_runs_discovery`; Task 6 test "toggle on shows discovery result".)
3. **A failure message leaking a secret.** A server URL with `?token=...` or an HTTP error must never put the URL or exception text in `last_discovery_error`. (Task 4 test `test_error_messages_never_echo_url`.)
4. **Saving an edit with untouched credential fields.** The stored secret survives and discovery does not re-run unless URL or auth type changed. (Task 3 tests `test_patch_without_auth_config_keeps_credentials`, `test_patch_name_only_skips_discovery`.)
5. **Rows the migration has not reached yet** (gateway deployed before `alembic upgrade`). Legacy plaintext `{header_name, api_key}` and `{token}` still produce correct headers. (Task 1 test `test_build_headers_from_legacy_plaintext`.)

---

## File Structure

| File | Responsibility |
|---|---|
| Create `AIGateway/src/utils/mcp_credentials.py` | Stored credential shape: normalize, encrypt, decrypt, mask, build headers |
| Create `AIGateway/src/database/migrations/versions/a0013_mcp_server_credentials.py` | Encrypt existing credentials; add `last_discovery_error` |
| Modify `AIGateway/src/services/mcp_proxy_service.py` | Discovery split (fetch/store/run), error mapper; headers via credentials module |
| Modify `AIGateway/src/crud/mcp_servers.py` | Select `last_discovery_error` + `tool_count`; `record_discovery_result` replaces `update_server_health` |
| Modify `AIGateway/src/routers/mcp_servers.py` | Credential normalization on write, response shaping, discovery triggers |
| Modify `AIGateway/src/crud/mcp_tools.py` | `get_all_tools(..., active_servers_only=False)` |
| Modify `AIGateway/src/routers/mcp_proxy.py` | `tools/list` passes `active_servers_only=True` |
| Create `AIGateway/tests/test_18_mcp_credentials.py` | Task 1 tests |
| Create `AIGateway/tests/test_19_mcp_discovery.py` | Task 4 tests |
| Create `AIGateway/tests/test_20_mcp_servers_router.py` | Tasks 3 and 5 tests |
| Modify `.github/workflows/aigateway-checks.yml` | Run the three new test files in CI |
| Modify `Clients/src/presentation/pages/AIGateway/MCPServers/index.tsx` + `index.test.tsx` | Button, result messages, tooltip, credential hints, copy |
| Modify `Clients/src/i18n/translations.ts` | de/fr/es for new strings |
| Modify `shared/user-guide-content/content/ai-gateway/mcp-overview.ts`, `mcp-servers.ts`, `mcp-tools.ts`; `docs/technical/domains/agent-control.md` | Truthful docs |

Run gateway tests from `AIGateway/` with the venv: `cd AIGateway && ENCRYPTION_KEY=test-encryption-key-32-chars-long!! venv/bin/python -m pytest tests/<file> -v`. Never start `uvicorn` or write temp `.py` files inside `AIGateway/src` during tests.

---

### Task 1: Credentials module

**Files:**
- Create: `AIGateway/src/utils/mcp_credentials.py`
- Modify: `AIGateway/src/services/mcp_proxy_service.py:134-141` (`_build_auth_headers` delegates)
- Test: `AIGateway/tests/test_18_mcp_credentials.py`

**Interfaces:**
- Produces:
  - `DEFAULT_API_KEY_HEADER = "X-API-Key"`
  - `class CredentialError(ValueError)` — message is user-facing.
  - `normalize_auth_config(auth_type: str, incoming: dict | None, stored: dict | None) -> dict` — returns the stored shape, encrypting new secrets. `stored` is the row's current `auth_config` when the auth type is unchanged, else `None`. Raises `CredentialError("Enter the credentials for the new auth type")` when a secret is required and neither `incoming` nor `stored` has one.
  - `migrate_stored_config(auth_type: str, cfg: dict | None) -> dict` — never raises on missing secrets; used by the migration.
  - `legacy_config(auth_type: str, cfg: dict | None) -> dict` — decrypts back to `{token}` / `{header, key}`; used by the migration downgrade.
  - `get_secret(auth_type: str, cfg: dict | None) -> str` — decrypted secret or `""`.
  - `build_auth_headers(auth_type: str, cfg: dict | None) -> dict`
  - `public_auth_fields(auth_type: str, cfg: dict | None, is_admin: bool) -> dict` — `{"auth_header"?, "auth_secret_hint"?}` for admins, `{}` otherwise.

- [ ] **Step 1: Write the failing tests**

```python
"""MCP server credentials: stored shape, both field spellings, masking, headers.

No live services."""

import os
import sys
from pathlib import Path

os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-32-chars-long!!")
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import pytest

from utils.encryption import decrypt, encrypt
from utils.mcp_credentials import (
    CredentialError,
    build_auth_headers,
    get_secret,
    legacy_config,
    migrate_stored_config,
    normalize_auth_config,
    public_auth_fields,
)


class TestNormalize:
    def test_none_clears(self):
        assert normalize_auth_config("none", {"token": "x"}, {"token_enc": encrypt("y")}) == {}

    def test_bearer_encrypts_token(self):
        cfg = normalize_auth_config("bearer", {"token": "tok-123"}, None)
        assert set(cfg) == {"token_enc"}
        assert decrypt(cfg["token_enc"]) == "tok-123"

    @pytest.mark.parametrize(
        "incoming",
        [
            {"header": "X-Key", "key": "k-1"},
            {"header_name": "X-Key", "api_key": "k-1"},
        ],
    )
    def test_api_key_accepts_both_spellings(self, incoming):
        cfg = normalize_auth_config("api_key", incoming, None)
        assert cfg["header"] == "X-Key"
        assert decrypt(cfg["key_enc"]) == "k-1"
        assert "key" not in cfg and "api_key" not in cfg and "header_name" not in cfg

    def test_api_key_defaults_header(self):
        cfg = normalize_auth_config("api_key", {"key": "k-1"}, None)
        assert cfg["header"] == "X-API-Key"

    def test_keep_stored_secret_when_incoming_has_none(self):
        stored = {"header": "X-Old", "key_enc": encrypt("old-key")}
        cfg = normalize_auth_config("api_key", {"header": "X-New"}, stored)
        assert cfg["header"] == "X-New"
        assert decrypt(cfg["key_enc"]) == "old-key"

    def test_keep_stored_legacy_plaintext_and_encrypt_it(self):
        stored = {"header_name": "X-Old", "api_key": "old-key"}
        cfg = normalize_auth_config("api_key", {}, stored)
        assert cfg["header"] == "X-Old"
        assert decrypt(cfg["key_enc"]) == "old-key"

    def test_secret_required_when_nothing_to_keep(self):
        with pytest.raises(CredentialError, match="Enter the credentials"):
            normalize_auth_config("bearer", {}, None)

    def test_blank_strings_count_as_missing(self):
        with pytest.raises(CredentialError):
            normalize_auth_config("api_key", {"key": "   "}, None)

    def test_unknown_auth_type_rejected(self):
        with pytest.raises(CredentialError, match="Unsupported"):
            normalize_auth_config("oauth", {}, None)


class TestMigrationHelpers:
    def test_migrate_legacy_api_key(self):
        cfg = migrate_stored_config("api_key", {"header_name": "X-K", "api_key": "s"})
        assert cfg["header"] == "X-K" and decrypt(cfg["key_enc"]) == "s"

    def test_migrate_is_idempotent(self):
        once = migrate_stored_config("bearer", {"token": "t"})
        assert migrate_stored_config("bearer", once) == once

    def test_migrate_without_secret_does_not_raise(self):
        assert migrate_stored_config("bearer", {}) == {}
        assert migrate_stored_config("api_key", {}) == {"header": "X-API-Key"}

    def test_legacy_round_trip(self):
        new = migrate_stored_config("api_key", {"header": "X-K", "key": "s"})
        assert legacy_config("api_key", new) == {"header": "X-K", "key": "s"}
        assert legacy_config("bearer", migrate_stored_config("bearer", {"token": "t"})) == {"token": "t"}


class TestUse:
    def test_build_headers_from_encrypted(self):
        bearer = normalize_auth_config("bearer", {"token": "t"}, None)
        assert build_auth_headers("bearer", bearer) == {"Authorization": "Bearer t"}
        api = normalize_auth_config("api_key", {"header": "X-K", "key": "s"}, None)
        assert build_auth_headers("api_key", api) == {"X-K": "s"}

    def test_build_headers_from_legacy_plaintext(self):
        assert build_auth_headers("api_key", {"header_name": "X-K", "api_key": "s"}) == {"X-K": "s"}
        assert build_auth_headers("api_key", {"header": "X-K", "key": "s"}) == {"X-K": "s"}
        assert build_auth_headers("bearer", {"token": "t"}) == {"Authorization": "Bearer t"}

    def test_build_headers_none(self):
        assert build_auth_headers("none", {}) == {}

    def test_get_secret_missing_is_empty(self):
        assert get_secret("bearer", {}) == ""

    def test_public_fields_admin(self):
        cfg = normalize_auth_config("api_key", {"header": "X-K", "key": "abcd1234wxyz"}, None)
        assert public_auth_fields("api_key", cfg, True) == {
            "auth_header": "X-K",
            "auth_secret_hint": "abcd...wxyz",
        }

    def test_public_fields_non_admin_is_empty(self):
        cfg = normalize_auth_config("bearer", {"token": "abcd1234wxyz"}, None)
        assert public_auth_fields("bearer", cfg, False) == {}

    def test_public_fields_never_include_ciphertext(self):
        cfg = normalize_auth_config("bearer", {"token": "abcd1234wxyz"}, None)
        out = public_auth_fields("bearer", cfg, True)
        assert cfg["token_enc"] not in str(out)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd AIGateway && ENCRYPTION_KEY=test-encryption-key-32-chars-long!! venv/bin/python -m pytest tests/test_18_mcp_credentials.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'utils.mcp_credentials'`

- [ ] **Step 3: Write the module**

```python
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


def public_auth_fields(auth_type: str, cfg: Optional[dict], is_admin: bool) -> dict:
    """What an API response may say about credentials: a masked hint, Admins only."""
    if not is_admin or auth_type not in _SECRET_FIELD:
        return {}
    fields = {}
    if auth_type == "api_key":
        fields["auth_header"] = _header(cfg or {}) or DEFAULT_API_KEY_HEADER
    secret = get_secret(auth_type, cfg)
    if secret:
        fields["auth_secret_hint"] = mask_api_key(secret)
    return fields
```

- [ ] **Step 4: Point the service at the module**

In `AIGateway/src/services/mcp_proxy_service.py`, add `from utils.mcp_credentials import build_auth_headers` to the imports and replace the body of `_build_auth_headers` (lines 134-141) with a delegate, keeping the name so the two call sites stay unchanged:

```python
def _build_auth_headers(auth_type: str, auth_config: dict) -> dict:
    """Build authentication headers for backend MCP server requests."""
    return build_auth_headers(auth_type, auth_config)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd AIGateway && ENCRYPTION_KEY=test-encryption-key-32-chars-long!! venv/bin/python -m pytest tests/test_18_mcp_credentials.py tests/test_encryption.py -v`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add AIGateway/src/utils/mcp_credentials.py AIGateway/src/services/mcp_proxy_service.py AIGateway/tests/test_18_mcp_credentials.py
git commit -m "feat(mcp): encrypted credential shape for MCP servers" -m "Adds utils/mcp_credentials: normalize either field spelling (fixes api_key servers being called with a blank key), encrypt secrets, mask for display and build auth headers. Legacy plaintext rows still work."
```

---

### Task 2: Migration a0013

**Files:**
- Create: `AIGateway/src/database/migrations/versions/a0013_mcp_server_credentials.py`

**Interfaces:**
- Consumes: `migrate_stored_config`, `legacy_config` (Task 1).
- Produces: column `ai_gateway_mcp_servers.last_discovery_error TEXT NULL`; all `auth_config` rows in the stored shape.

- [ ] **Step 1: Write the migration**

```python
"""mcp server credentials encrypted; last discovery error

Encrypts the secrets in every MCP server's auth_config (bearer token, API
key) and renames header_name to header, using the same AES-256-GCM helper
as provider API keys. Adds last_discovery_error so a failed discovery can
say why. Idempotent: rows already in the new shape are rewritten to the
same shape.

Revision ID: a0013
Revises: a0012
Create Date: 2026-10-13
"""

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from utils.mcp_credentials import legacy_config, migrate_stored_config

revision: str = "a0013"
down_revision: Union[str, None] = "a0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _rewrite(transform) -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, auth_type, auth_config FROM ai_gateway_mcp_servers "
            "WHERE auth_type IN ('bearer', 'api_key')"
        )
    ).mappings().all()
    for row in rows:
        cfg = row["auth_config"]
        if isinstance(cfg, str):
            cfg = json.loads(cfg or "{}")
        try:
            new_cfg = transform(row["auth_type"], cfg or {})
        except ValueError as exc:
            raise RuntimeError(
                "a0013 needs ENCRYPTION_KEY set in the AI Gateway environment to "
                f"encrypt MCP server credentials (server id {row['id']}): {exc}"
            ) from exc
        conn.execute(
            sa.text(
                "UPDATE ai_gateway_mcp_servers SET auth_config = CAST(:cfg AS jsonb) "
                "WHERE id = :id"
            ),
            {"cfg": json.dumps(new_cfg), "id": row["id"]},
        )


def upgrade() -> None:
    op.execute("SET search_path TO verifywise")
    op.execute(
        "ALTER TABLE ai_gateway_mcp_servers "
        "ADD COLUMN IF NOT EXISTS last_discovery_error TEXT NULL"
    )
    _rewrite(migrate_stored_config)


def downgrade() -> None:
    op.execute("SET search_path TO verifywise")
    _rewrite(legacy_config)
    op.execute(
        "ALTER TABLE ai_gateway_mcp_servers DROP COLUMN IF EXISTS last_discovery_error"
    )
```

- [ ] **Step 2: Seed two legacy rows in the local dev DB**

Run (dev DB is PostgreSQL 16 on :5432; credentials in `AIGateway/.env` or `Servers/.env`; org 1 exists locally):

```bash
psql -h localhost -U "$DB_USER" -d verifywise -c "SET search_path TO verifywise;
INSERT INTO ai_gateway_mcp_servers (organization_id, name, slug, url, auth_type, auth_config)
VALUES (1, 'a0013 api key', 'a0013-api-key', 'http://localhost:3001/mcp', 'api_key', '{\"header_name\":\"X-K\",\"api_key\":\"legacy-key-123\"}'),
       (1, 'a0013 bearer', 'a0013-bearer', 'http://localhost:3001/mcp', 'bearer', '{\"token\":\"legacy-token-456\"}');"
```

- [ ] **Step 3: Upgrade, downgrade, upgrade, checking each state**

```bash
cd AIGateway/src && ../venv/bin/alembic upgrade head
psql ... -c "SELECT slug, auth_config, last_discovery_error FROM verifywise.ai_gateway_mcp_servers WHERE slug LIKE 'a0013-%';"
```
Expected: `{"header": "X-K", "key_enc": "<hex>:<hex>:<hex>"}` and `{"token_enc": "..."}`; column present (NULL). No plaintext.

```bash
../venv/bin/alembic downgrade -1   # expect {"header":"X-K","key":"legacy-key-123"} and {"token":"legacy-token-456"}; column gone
../venv/bin/alembic upgrade head   # encrypted again
```

- [ ] **Step 4: Remove the seed rows**

```bash
psql ... -c "DELETE FROM verifywise.ai_gateway_mcp_servers WHERE slug LIKE 'a0013-%';"
```

- [ ] **Step 5: Commit**

```bash
git add AIGateway/src/database/migrations/versions/a0013_mcp_server_credentials.py
git commit -m "feat(mcp): migration a0013 encrypts MCP server credentials" -m "Rewrites every bearer/api_key server's auth_config into the encrypted shape and adds last_discovery_error. Fails loudly without ENCRYPTION_KEY. Downgrade restores the plaintext shape. Verified up/down/up on the local DB."
```

---

### Task 3: Discovery service

**Files:**
- Modify: `AIGateway/src/services/mcp_proxy_service.py` (replace `discover_server_tools`, lines 165-299)
- Modify: `AIGateway/src/crud/mcp_servers.py` (replace `update_server_health`, lines 292-301)
- Test: `AIGateway/tests/test_19_mcp_discovery.py`

**Interfaces:**
- Consumes: `_build_auth_headers` (Task 1 delegate).
- Produces (in `services/mcp_proxy_service.py`):
  - `ON_SAVE_DISCOVERY_SECONDS = 10`, `MANUAL_DISCOVERY_SECONDS = 30`, `MAX_TOOL_PAGES = 20`
  - `class McpRpcError(Exception)` — `.message: str`
  - `async def fetch_server_tools(server_url: str, auth_type: str, auth_config: dict, transport: httpx.AsyncBaseTransport | None = None) -> list[dict]`
  - `async def store_discovered_tools(org_id: int, server_id: int, tools: list[dict]) -> list[dict]` (the existing DB block, unchanged in behaviour; returns `[{tool_name, description, input_schema}]`)
  - `def describe_discovery_error(exc: BaseException, budget_seconds: int) -> str`
  - `async def run_discovery(org_id: int, server: dict, budget_seconds: int, transport: httpx.AsyncBaseTransport | None = None) -> dict` → `{"status": "success" | "failed", "tools_discovered": int, "error": str | None}`
- Produces (in `crud/mcp_servers.py`): `async def record_discovery_result(org_id: int, server_id: int, error: str | None) -> None` — `error is None` means healthy.

- [ ] **Step 1: Write the failing tests**

```python
"""MCP tool discovery: protocol, paging, budget, friendly errors.

No live services: httpx.MockTransport stands in for the MCP server and the
database writes are replaced with fakes."""

import asyncio
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-32-chars-long!!")
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import httpx
import pytest

import services.mcp_proxy_service as svc


def _server(**over):
    base = {"id": 5, "url": "https://mcp.example.com/mcp?token=supersecret", "auth_type": "none", "auth_config": {}}
    base.update(over)
    return base


def _rpc(result, session=None):
    headers = {"content-type": "application/json"}
    if session:
        headers["mcp-session-id"] = session
    return lambda req_id: httpx.Response(200, headers=headers, json={"jsonrpc": "2.0", "id": req_id, "result": result})


def _transport(pages, seen, session="sess-1"):
    """MCP server: initialize, accept initialized, serve tools/list pages."""
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        seen.append((body.get("method"), body.get("params"), dict(request.headers)))
        method = body.get("method")
        if method == "initialize":
            return _rpc({"protocolVersion": "2025-03-26", "capabilities": {"tools": {}}}, session)(body["id"])
        if method == "notifications/initialized":
            return httpx.Response(202)
        if method == "tools/list":
            cursor = (body.get("params") or {}).get("cursor")
            index = int(cursor) if cursor else 0
            page = {"tools": pages[index]}
            if index + 1 < len(pages):
                page["nextCursor"] = str(index + 1)
            return _rpc(page)(body["id"])
        return httpx.Response(400)
    return httpx.MockTransport(handler)


@pytest.fixture
def recorded(monkeypatch):
    calls = {"store": [], "result": []}

    async def store(org_id, server_id, tools):
        calls["store"].append((org_id, server_id, tools))
        return [{"tool_name": t["name"]} for t in tools]

    async def record(org_id, server_id, error):
        calls["result"].append((org_id, server_id, error))

    monkeypatch.setattr(svc, "store_discovered_tools", store)
    monkeypatch.setattr(svc.mcp_servers_crud, "record_discovery_result", record)
    return calls


class TestProtocol:
    async def test_sends_initialized_before_tools_list(self):
        seen = []
        await svc.fetch_server_tools("https://x/mcp", "none", {}, transport=_transport([[{"name": "a"}]], seen))
        methods = [m for m, _, _ in seen]
        assert methods == ["initialize", "notifications/initialized", "tools/list"]
        assert seen[1][2].get("mcp-session-id") == "sess-1"
        assert seen[2][2].get("mcp-session-id") == "sess-1"

    async def test_follows_next_cursor(self):
        seen = []
        tools = await svc.fetch_server_tools(
            "https://x/mcp", "none", {},
            transport=_transport([[{"name": "a"}], [{"name": "b"}], [{"name": "c"}]], seen),
        )
        assert [t["name"] for t in tools] == ["a", "b", "c"]
        assert [p for m, p, _ in seen if m == "tools/list"][1] == {"cursor": "1"}

    async def test_page_cap(self):
        seen = []
        pages = [[{"name": f"t{i}"}] for i in range(svc.MAX_TOOL_PAGES + 5)]
        tools = await svc.fetch_server_tools("https://x/mcp", "none", {}, transport=_transport(pages, seen))
        assert len(tools) == svc.MAX_TOOL_PAGES

    async def test_sends_api_key_header(self):
        from utils.mcp_credentials import normalize_auth_config
        seen = []
        cfg = normalize_auth_config("api_key", {"header_name": "X-K", "api_key": "k-1"}, None)
        await svc.fetch_server_tools("https://x/mcp", "api_key", cfg, transport=_transport([[]], seen))
        assert seen[0][2].get("x-k") == "k-1"


class TestRunDiscovery:
    async def test_success_records_healthy(self, recorded):
        out = await svc.run_discovery(1, _server(), 10, transport=_transport([[{"name": "a"}, {"name": "b"}]], []))
        assert out == {"status": "success", "tools_discovered": 2, "error": None}
        assert recorded["result"] == [(1, 5, None)]

    async def test_zero_tools_is_success(self, recorded):
        out = await svc.run_discovery(1, _server(), 10, transport=_transport([[]], []))
        assert out == {"status": "success", "tools_discovered": 0, "error": None}
        assert recorded["store"] == [(1, 5, [])]

    async def test_budget_exceeded_fails_without_storing(self, recorded):
        async def slow(request):
            await asyncio.sleep(5)
            return httpx.Response(200)
        out = await svc.run_discovery(1, _server(), 0.05, transport=httpx.MockTransport(slow))
        assert out["status"] == "failed"
        assert out["error"] == "The server did not respond within 0.05 seconds"
        assert recorded["store"] == []
        assert recorded["result"] == [(1, 5, out["error"])]

    async def test_401_message(self, recorded):
        t = httpx.MockTransport(lambda r: httpx.Response(401))
        out = await svc.run_discovery(1, _server(), 10, transport=t)
        assert out["error"] == "The server rejected the credentials (HTTP 401)"


class TestErrorMessages:
    def _status_error(self, code):
        req = httpx.Request("POST", "https://mcp.example.com/mcp?token=supersecret")
        return httpx.HTTPStatusError("boom", request=req, response=httpx.Response(code, request=req))

    @pytest.mark.parametrize(
        "exc, expected",
        [
            ("403", "The server rejected the credentials (HTTP 403)"),
            ("500", "The server returned HTTP 500"),
            ("404", "The server returned HTTP 404"),
        ],
    )
    def test_http_status(self, exc, expected):
        assert svc.describe_discovery_error(self._status_error(int(exc)), 10) == expected

    def test_connect_error(self):
        exc = httpx.ConnectError("dns fail https://mcp.example.com/mcp?token=supersecret")
        assert svc.describe_discovery_error(exc, 10) == "Could not connect to the server address"

    def test_timeouts(self):
        assert svc.describe_discovery_error(asyncio.TimeoutError(), 10) == "The server did not respond within 10 seconds"
        assert svc.describe_discovery_error(httpx.ReadTimeout("t"), 10) == "The server did not respond within 10 seconds"

    def test_rpc_error_truncated(self):
        msg = svc.describe_discovery_error(svc.McpRpcError("x" * 500), 10)
        assert msg.startswith("The server returned an error: ")
        assert len(msg) <= len("The server returned an error: ") + 200

    def test_bad_body(self):
        assert svc.describe_discovery_error(ValueError("no json"), 10) == "The server's reply was not a valid MCP response"

    def test_error_messages_never_echo_url(self):
        for exc in (self._status_error(401), self._status_error(500), httpx.ConnectError("https://mcp.example.com/mcp?token=supersecret"), ValueError("token=supersecret")):
            assert "supersecret" not in svc.describe_discovery_error(exc, 10)

    def test_max_length(self):
        assert len(svc.describe_discovery_error(svc.McpRpcError("y" * 5000), 10)) <= 500
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd AIGateway && ENCRYPTION_KEY=test-encryption-key-32-chars-long!! venv/bin/python -m pytest tests/test_19_mcp_discovery.py -v`
Expected: FAIL with `AttributeError: module 'services.mcp_proxy_service' has no attribute 'fetch_server_tools'`

- [ ] **Step 3: Add `record_discovery_result` to `crud/mcp_servers.py`** (delete `update_server_health`; its only caller is the router, changed in Task 4)

```python
async def record_discovery_result(
    org_id: int, server_id: int, error: Optional[str]
) -> None:
    """Store the outcome of a discovery run: healthy when error is None."""
    async with get_db() as db:
        await db.execute(
            text("""
                UPDATE ai_gateway_mcp_servers
                SET health_status = :status,
                    last_discovery_error = :error,
                    last_health_check_at = NOW()
                WHERE organization_id = :org_id
                  AND id = :server_id
            """),
            {
                "org_id": org_id,
                "server_id": server_id,
                "status": "healthy" if error is None else "unhealthy",
                "error": error,
            },
        )
        await db.commit()
```

- [ ] **Step 4: Replace `discover_server_tools` in `services/mcp_proxy_service.py`**

Add `import asyncio` and `import crud.mcp_servers as mcp_servers_crud` to the imports. Replace the whole `discover_server_tools` function (lines 165-299) with:

```python
ON_SAVE_DISCOVERY_SECONDS = 10
MANUAL_DISCOVERY_SECONDS = 30
MAX_TOOL_PAGES = 20
MAX_DISCOVERY_ERROR_CHARS = 500
_PROTOCOL_VERSION = "2025-03-26"


class McpRpcError(Exception):
    """A JSON-RPC error object returned by an MCP server."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _rpc_result(resp: httpx.Response) -> dict:
    resp.raise_for_status()
    data = _parse_response(resp)
    if "error" in data:
        error = data["error"]
        message = error.get("message") if isinstance(error, dict) else str(error)
        raise McpRpcError(str(message or "Unknown error"))
    return data.get("result") or {}


async def fetch_server_tools(
    server_url: str,
    auth_type: str,
    auth_config: dict,
    transport: Optional[httpx.AsyncBaseTransport] = None,
) -> list[dict]:
    """Network phase of discovery: initialize, initialized, every tools/list page."""
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        **_build_auth_headers(auth_type, auth_config),
    }
    tools: list[dict] = []
    async with httpx.AsyncClient(timeout=MANUAL_DISCOVERY_SECONDS, transport=transport) as client:
        init_resp = await client.post(
            server_url,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": _PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": {"name": "VerifyWise MCP Gateway", "version": "1.0.0"},
                },
            },
            headers=headers,
        )
        _rpc_result(init_resp)
        session_id = init_resp.headers.get("mcp-session-id")
        if session_id:
            headers["Mcp-Session-Id"] = session_id

        await client.post(
            server_url,
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            headers=headers,
        )

        cursor: Optional[str] = None
        for page in range(MAX_TOOL_PAGES):
            params = {"cursor": cursor} if cursor else {}
            result = _rpc_result(
                await client.post(
                    server_url,
                    json={"jsonrpc": "2.0", "id": 2 + page, "method": "tools/list", "params": params},
                    headers=headers,
                )
            )
            tools.extend(result.get("tools") or [])
            cursor = result.get("nextCursor")
            if not cursor:
                break
    return tools


async def store_discovered_tools(org_id: int, server_id: int, tools: list[dict]) -> list[dict]:
    """Database phase of discovery: upsert advertised tools, deactivate the rest."""
    discovered_tool_names = set()
    discovered_tools = []

    async with get_db() as db:
        for tool in tools:
            tool_name = tool.get("name", "")
            description = tool.get("description", "")
            input_schema = tool.get("inputSchema", {})
            discovered_tool_names.add(tool_name)

            await db.execute(
                text("""
                    INSERT INTO ai_gateway_mcp_tools
                        (organization_id, server_id, tool_name, description,
                         input_schema, is_active)
                    VALUES
                        (:org_id, :server_id, :tool_name, :description,
                         CAST(:input_schema AS jsonb), true)
                    ON CONFLICT (organization_id, server_id, tool_name)
                    DO UPDATE SET
                        description = EXCLUDED.description,
                        input_schema = EXCLUDED.input_schema,
                        is_active = true,
                        updated_at = NOW()
                """),
                {
                    "org_id": org_id,
                    "server_id": server_id,
                    "tool_name": tool_name,
                    "description": description,
                    "input_schema": json.dumps(input_schema),
                },
            )
            discovered_tools.append({
                "tool_name": tool_name,
                "description": description,
                "input_schema": input_schema,
            })

        if discovered_tool_names:
            await db.execute(
                text("""
                    UPDATE ai_gateway_mcp_tools
                    SET is_active = false, updated_at = NOW()
                    WHERE organization_id = :org_id
                      AND server_id = :server_id
                      AND is_active = true
                      AND tool_name != ALL(:tool_names)
                """),
                {
                    "org_id": org_id,
                    "server_id": server_id,
                    "tool_names": list(discovered_tool_names),
                },
            )
        else:
            await db.execute(
                text("""
                    UPDATE ai_gateway_mcp_tools
                    SET is_active = false, updated_at = NOW()
                    WHERE organization_id = :org_id
                      AND server_id = :server_id
                      AND is_active = true
                """),
                {"org_id": org_id, "server_id": server_id},
            )

        await db.commit()

    logger.info(
        "Discovered %d tools from server %s for org %s",
        len(discovered_tools), server_id, org_id,
    )
    return discovered_tools


def describe_discovery_error(exc: BaseException, budget_seconds) -> str:
    """A message the admin can act on. Never includes URLs or raw exception text."""
    if isinstance(exc, (asyncio.TimeoutError, httpx.TimeoutException)):
        message = f"The server did not respond within {budget_seconds:g} seconds"
    elif isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        message = (
            f"The server rejected the credentials (HTTP {code})"
            if code in (401, 403)
            else f"The server returned HTTP {code}"
        )
    elif isinstance(exc, httpx.RequestError):
        message = "Could not connect to the server address"
    elif isinstance(exc, McpRpcError):
        message = f"The server returned an error: {exc.message[:200]}"
    elif isinstance(exc, (ValueError, KeyError, TypeError)):
        message = "The server's reply was not a valid MCP response"
    else:
        message = "Discovery failed unexpectedly"
    return message[:MAX_DISCOVERY_ERROR_CHARS]


async def run_discovery(
    org_id: int,
    server: dict,
    budget_seconds,
    transport: Optional[httpx.AsyncBaseTransport] = None,
) -> dict:
    """Discover a server's tools within a budget and record the outcome.

    Only the network phase is bounded, so a timeout never leaves a half-written
    tool list. Never raises: failures come back as status "failed".
    """
    try:
        tools = await asyncio.wait_for(
            fetch_server_tools(
                server["url"],
                server.get("auth_type") or "none",
                server.get("auth_config") or {},
                transport=transport,
            ),
            timeout=budget_seconds,
        )
    except Exception as exc:  # noqa: BLE001 — every failure becomes a stored message
        error = describe_discovery_error(exc, budget_seconds)
        logger.warning("MCP discovery failed for server %s: %s", server.get("id"), error)
        await mcp_servers_crud.record_discovery_result(org_id, server["id"], error)
        return {"status": "failed", "tools_discovered": 0, "error": error}

    stored = await store_discovered_tools(org_id, server["id"], tools)
    await mcp_servers_crud.record_discovery_result(org_id, server["id"], None)
    return {"status": "success", "tools_discovered": len(stored), "error": None}
```

`store_discovered_tools` is the old DB block unchanged, iterating `tools` from `fetch_server_tools` instead of `list_data[...]`. Check `asyncio.TimeoutError` is caught on Python 3.12, where it is an alias of `TimeoutError`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd AIGateway && ENCRYPTION_KEY=test-encryption-key-32-chars-long!! venv/bin/python -m pytest tests/test_19_mcp_discovery.py tests/test_18_mcp_credentials.py -v`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add AIGateway/src/services/mcp_proxy_service.py AIGateway/src/crud/mcp_servers.py AIGateway/tests/test_19_mcp_discovery.py
git commit -m "feat(mcp): bounded discovery with friendly, stored failure reasons" -m "Splits discovery into a network fetch (bounded by a budget) and a database store (never cancelled). Sends notifications/initialized, follows nextCursor up to 20 pages, and records health plus a secret-free failure message per organization."
```

---

### Task 4: Servers router — credentials, responses, discovery triggers

**Files:**
- Modify: `AIGateway/src/crud/mcp_servers.py` (three SELECTs: add columns)
- Modify: `AIGateway/src/routers/mcp_servers.py`
- Test: `AIGateway/tests/test_20_mcp_servers_router.py`

**Interfaces:**
- Consumes: `normalize_auth_config`, `public_auth_fields`, `CredentialError` (Task 1); `run_discovery`, `ON_SAVE_DISCOVERY_SECONDS`, `MANUAL_DISCOVERY_SECONDS` (Task 3).
- Produces: create/PATCH responses `{"server": {...}, "discovery": {"status", "tools_discovered", "error"}}`; list/get servers carry `tool_count`, `last_discovery_error`, admin-only `auth_header`/`auth_secret_hint`, never `auth_config`.

- [ ] **Step 1: Add the columns to the three server SELECTs** in `crud/mcp_servers.py` (`get_all_mcp_servers`, `get_mcp_server`, `get_mcp_server_by_slug`), after `s.last_health_check_at,`:

```sql
                    s.last_discovery_error,
                    (
                        SELECT COUNT(*)
                        FROM ai_gateway_mcp_tools t
                        WHERE t.organization_id = s.organization_id
                          AND t.server_id = s.id
                          AND t.is_active = true
                    ) AS tool_count,
```

Keep `s.auth_config` in the SELECTs: the router needs it to build headers and hints and strips it before responding.

- [ ] **Step 2: Write the failing tests**

```python
"""MCP servers router: credential handling, response shape, discovery triggers.

No live services: CRUD, discovery and notifications are replaced with fakes."""

import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-32-chars-long!!")
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import pytest
from fastapi import HTTPException

import routers.mcp_servers as router
from utils.encryption import decrypt
from utils.mcp_credentials import normalize_auth_config

OK = {"status": "success", "tools_discovered": 3, "error": None}


def _request(body=None, role="Admin"):
    return SimpleNamespace(
        state=SimpleNamespace(organization_id=1, user_id=7, role=role),
        json=AsyncMock(return_value=body or {}),
    )


def _row(**over):
    base = {
        "id": 9, "name": "S", "slug": "s", "url": "https://a/mcp", "auth_type": "api_key",
        "auth_config": normalize_auth_config("api_key", {"header": "X-K", "key": "abcd1234wxyz"}, None),
        "is_active": True, "health_status": "unknown", "tool_count": 0, "last_discovery_error": None,
    }
    base.update(over)
    return base


@pytest.fixture
def fakes(monkeypatch):
    state = {"row": _row(), "saved": None, "discovery": []}

    async def get_one(org_id, server_id):
        return dict(state["row"])

    async def get_all(org_id):
        return [dict(state["row"])]

    async def create(org_id, data):
        state["saved"] = data
        return {**_row(), **data, "id": 9}

    async def update(org_id, server_id, data):
        state["saved"] = data
        merged = {**state["row"], **data}
        state["row"] = merged
        return dict(merged)

    async def discover(org_id, server, budget):
        state["discovery"].append((server["id"], budget))
        return OK

    monkeypatch.setattr(router.mcp_servers_crud, "get_mcp_server", get_one)
    monkeypatch.setattr(router.mcp_servers_crud, "get_all_mcp_servers", get_all)
    monkeypatch.setattr(router.mcp_servers_crud, "create_mcp_server", create)
    monkeypatch.setattr(router.mcp_servers_crud, "update_mcp_server", update)
    monkeypatch.setattr(router, "run_discovery", discover)
    monkeypatch.setattr(router, "notify_config_change", AsyncMock())
    return state


class TestResponses:
    async def test_list_hides_auth_config_and_masks_for_admin(self, fakes):
        out = await router.list_mcp_servers(_request())
        srv = out["servers"][0]
        assert "auth_config" not in srv
        assert srv["auth_header"] == "X-K"
        assert srv["auth_secret_hint"] == "abcd...wxyz"

    async def test_non_admin_gets_no_credential_fields(self, fakes):
        out = await router.get_mcp_server(9, _request(role="Editor"))
        srv = out["server"]
        assert "auth_config" not in srv and "auth_secret_hint" not in srv and "auth_header" not in srv
        assert "last_discovery_error" in srv and "tool_count" in srv


class TestCreate:
    async def test_create_encrypts_both_spellings_and_discovers(self, fakes):
        body = {"name": "S", "slug": "s", "url": "https://a/mcp", "auth_type": "api_key",
                "auth_config": {"header_name": "X-K", "api_key": "k-1"}}
        out = await router.create_mcp_server(_request(body))
        saved = fakes["saved"]["auth_config"]
        assert saved["header"] == "X-K" and decrypt(saved["key_enc"]) == "k-1"
        assert out["discovery"] == OK
        assert fakes["discovery"] == [(9, router.ON_SAVE_DISCOVERY_SECONDS)]
        assert "auth_config" not in out["server"]

    async def test_create_inactive_skips_discovery(self, fakes):
        body = {"name": "S", "slug": "s", "url": "https://a/mcp", "auth_type": "none", "is_active": False}
        out = await router.create_mcp_server(_request(body))
        assert out["discovery"] == {"status": "skipped", "tools_discovered": 0, "error": None}
        assert fakes["discovery"] == []

    async def test_create_missing_secret_is_400(self, fakes):
        body = {"name": "S", "slug": "s", "url": "https://a/mcp", "auth_type": "bearer"}
        with pytest.raises(HTTPException) as e:
            await router.create_mcp_server(_request(body))
        assert e.value.status_code == 400
        assert fakes["saved"] is None


class TestPatch:
    async def test_patch_without_auth_config_keeps_credentials(self, fakes):
        await router.update_mcp_server(9, _request({"name": "Renamed", "auth_type": "api_key"}))
        assert "auth_config" not in fakes["saved"]

    async def test_patch_name_only_skips_discovery(self, fakes):
        out = await router.update_mcp_server(9, _request({"name": "Renamed", "auth_type": "api_key"}))
        assert out["discovery"]["status"] == "skipped"
        assert fakes["discovery"] == []

    async def test_patch_url_change_discovers(self, fakes):
        out = await router.update_mcp_server(9, _request({"url": "https://b/mcp"}))
        assert out["discovery"] == OK

    async def test_patch_header_only_keeps_key(self, fakes):
        await router.update_mcp_server(9, _request({"auth_type": "api_key", "auth_config": {"header": "X-New"}}))
        saved = fakes["saved"]["auth_config"]
        assert saved["header"] == "X-New" and decrypt(saved["key_enc"]) == "abcd1234wxyz"
        assert fakes["discovery"] == [(9, router.ON_SAVE_DISCOVERY_SECONDS)]

    async def test_patch_auth_type_change_requires_secret(self, fakes):
        with pytest.raises(HTTPException) as e:
            await router.update_mcp_server(9, _request({"auth_type": "bearer"}))
        assert e.value.status_code == 400
        assert "Enter the credentials" in e.value.detail

    async def test_patch_to_none_clears(self, fakes):
        await router.update_mcp_server(9, _request({"auth_type": "none"}))
        assert fakes["saved"]["auth_config"] == {}

    async def test_patch_enabling_runs_discovery(self, fakes):
        fakes["row"] = _row(is_active=False)
        out = await router.update_mcp_server(9, _request({"is_active": True}))
        assert out["discovery"] == OK

    async def test_patch_disabling_skips_discovery(self, fakes):
        out = await router.update_mcp_server(9, _request({"is_active": False, "url": "https://b/mcp"}))
        assert out["discovery"]["status"] == "skipped"


class TestDiscoverEndpoint:
    async def test_manual_discovery_uses_30s_budget(self, fakes):
        out = await router.discover_server_tools(9, _request())
        assert out == {"status": "success", "tools_discovered": 3}
        assert fakes["discovery"] == [(9, router.MANUAL_DISCOVERY_SECONDS)]

    async def test_manual_failure_is_502_with_message(self, fakes, monkeypatch):
        async def fail(org_id, server, budget):
            return {"status": "failed", "tools_discovered": 0, "error": "Could not connect to the server address"}
        monkeypatch.setattr(router, "run_discovery", fail)
        with pytest.raises(HTTPException) as e:
            await router.discover_server_tools(9, _request())
        assert e.value.status_code == 502
        assert e.value.detail == "Could not connect to the server address"

    async def test_non_admin_forbidden(self, fakes):
        with pytest.raises(HTTPException) as e:
            await router.discover_server_tools(9, _request(role="Editor"))
        assert e.value.status_code == 403
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd AIGateway && ENCRYPTION_KEY=test-encryption-key-32-chars-long!! venv/bin/python -m pytest tests/test_20_mcp_servers_router.py -v`
Expected: FAIL (`AttributeError: ... has no attribute 'run_discovery'` / assertion errors on `auth_config` present)

- [ ] **Step 4: Implement the router changes** in `routers/mcp_servers.py`

Imports:

```python
from utils.auth import get_org_id, get_role, get_user_id, require_admin
from utils.mcp_credentials import CredentialError, normalize_auth_config, public_auth_fields
from services.mcp_proxy_service import (
    MANUAL_DISCOVERY_SECONDS,
    ON_SAVE_DISCOVERY_SECONDS,
    run_discovery,
)
```

Helpers (below `_validate_slug`):

```python
SKIPPED = {"status": "skipped", "tools_discovered": 0, "error": None}


def _present(server: dict, request: Request) -> dict:
    """Response shape: never auth_config; a masked hint for Admins only."""
    out = {k: v for k, v in server.items() if k != "auth_config"}
    out.update(
        public_auth_fields(
            server.get("auth_type") or "none",
            server.get("auth_config") or {},
            get_role(request) == "Admin",
        )
    )
    return out


def _normalized(auth_type: str, incoming, stored) -> dict:
    try:
        return normalize_auth_config(auth_type, incoming, stored)
    except CredentialError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

List and get return `{"servers": [_present(s, request) for s in servers]}` and `{"server": _present(server, request)}`.

Create — after the url check and before `body["created_by"]`:

```python
    auth_type = body.get("auth_type") or "none"
    body["auth_type"] = auth_type
    body["auth_config"] = _normalized(auth_type, body.get("auth_config"), None)
```

and replace the final `return {"server": server}` with:

```python
    discovery = SKIPPED
    if server.get("is_active", True):
        discovery = await run_discovery(org_id, server, ON_SAVE_DISCOVERY_SECONDS)
        server = await mcp_servers_crud.get_mcp_server(org_id, server["id"]) or server
    return {"server": _present(server, request), "discovery": discovery}
```

PATCH — after the `existing` 404 check:

```python
    old_type = existing.get("auth_type") or "none"
    new_type = body.get("auth_type") or old_type
    if "auth_config" in body or new_type != old_type:
        stored = existing.get("auth_config") if new_type == old_type else None
        body["auth_type"] = new_type
        body["auth_config"] = _normalized(new_type, body.get("auth_config"), stored)

    connection_changed = (
        ("url" in body and body["url"] != existing.get("url"))
        or new_type != old_type
        or "auth_config" in body
    )
    enabling = body.get("is_active") is True and not existing.get("is_active")
```

then after `updated` and `notify_config_change`:

```python
    discovery = SKIPPED
    if updated.get("is_active") and (connection_changed or enabling):
        discovery = await run_discovery(org_id, updated, ON_SAVE_DISCOVERY_SECONDS)
        updated = await mcp_servers_crud.get_mcp_server(org_id, server_id) or updated
    return {"server": _present(updated, request), "discovery": discovery}
```

Discover endpoint — replace its body after the 404 check:

```python
    result = await run_discovery(org_id, server, MANUAL_DISCOVERY_SECONDS)
    if result["status"] != "success":
        raise HTTPException(status_code=502, detail=result["error"])
    return {"status": "success", "tools_discovered": result["tools_discovered"]}
```

Note: the discover endpoint no longer returns the `tools` array; grep `Clients/src` for `/discover` to confirm nothing reads it (the only caller is added in Task 6).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd AIGateway && ENCRYPTION_KEY=test-encryption-key-32-chars-long!! venv/bin/python -m pytest tests/test_18_mcp_credentials.py tests/test_19_mcp_discovery.py tests/test_20_mcp_servers_router.py -v`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add AIGateway/src/routers/mcp_servers.py AIGateway/src/crud/mcp_servers.py AIGateway/tests/test_20_mcp_servers_router.py
git commit -m "fix(mcp): discover on save; never return server credentials" -m "Create and relevant edits run discovery within 10 s and return its result; the Discover endpoint uses 30 s. List/get drop auth_config and give Admins a masked hint only. Responses now carry tool_count (the Tools column was always empty) and last_discovery_error."
```

---

### Task 5: Hide disabled servers' tools from agents; CI test list

**Files:**
- Modify: `AIGateway/src/crud/mcp_tools.py` (`get_all_tools`)
- Modify: `AIGateway/src/routers/mcp_proxy.py:96`
- Modify: `.github/workflows/aigateway-checks.yml` (self-contained test list)
- Test: append to `AIGateway/tests/test_20_mcp_servers_router.py`

**Interfaces:**
- Produces: `async def get_all_tools(org_id: int, active_servers_only: bool = False) -> list[dict]`

- [ ] **Step 1: Write the failing test** (append to `test_20_mcp_servers_router.py`)

```python
from contextlib import asynccontextmanager
from unittest.mock import MagicMock

import crud.mcp_tools as tools_crud


def _capture_db(monkeypatch):
    seen = []
    db = MagicMock()

    async def execute(stmt, params=None):
        seen.append(str(stmt))
        result = MagicMock()
        result.mappings.return_value.all.return_value = []
        return result

    db.execute = execute

    @asynccontextmanager
    async def get_db():
        yield db

    monkeypatch.setattr(tools_crud, "get_db", get_db)
    return seen


class TestToolList:
    async def test_agents_see_only_active_servers(self, monkeypatch):
        seen = _capture_db(monkeypatch)
        await tools_crud.get_all_tools(1, active_servers_only=True)
        assert "s.is_active = true" in seen[0]

    async def test_catalog_keeps_every_server(self, monkeypatch):
        seen = _capture_db(monkeypatch)
        await tools_crud.get_all_tools(1)
        assert "s.is_active" not in seen[0]
```

- [ ] **Step 2: Run to verify failure**

Run: `cd AIGateway && ENCRYPTION_KEY=test-encryption-key-32-chars-long!! venv/bin/python -m pytest tests/test_20_mcp_servers_router.py -k ToolList -v`
Expected: FAIL with `TypeError: get_all_tools() got an unexpected keyword argument 'active_servers_only'`

- [ ] **Step 3: Implement**

In `crud/mcp_tools.py`, change the signature to `async def get_all_tools(org_id: int, active_servers_only: bool = False) -> list[dict]:` and build the WHERE clause:

```python
    server_filter = "AND s.is_active = true" if active_servers_only else ""
```

inserting `{server_filter}` after `AND t.is_active = true` in the SQL (turn the string into an f-string; `server_filter` is one of two fixed literals, never user input). In `routers/mcp_proxy.py:96`: `all_tools = await get_all_tools(org_id, active_servers_only=True)`.

In `.github/workflows/aigateway-checks.yml`, add to the "Run self-contained AIGateway tests" pytest list:

```yaml
            tests/test_18_mcp_credentials.py \
            tests/test_19_mcp_discovery.py \
            tests/test_20_mcp_servers_router.py \
```

(Insert before the last entry so every line keeps its trailing ` \` except the final one.)

- [ ] **Step 4: Run all new gateway tests**

Run: `cd AIGateway && ENCRYPTION_KEY=test-encryption-key-32-chars-long!! venv/bin/python -m pytest tests/test_18_mcp_credentials.py tests/test_19_mcp_discovery.py tests/test_20_mcp_servers_router.py tests/test_encryption.py tests/test_agent_control_retention.py tests/test_retention.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add AIGateway/src/crud/mcp_tools.py AIGateway/src/routers/mcp_proxy.py AIGateway/tests/test_20_mcp_servers_router.py .github/workflows/aigateway-checks.yml
git commit -m "fix(mcp): agents no longer see tools of disabled servers" -m "tools/list on the MCP proxy filters out inactive servers; the admin tool catalog still lists them. Adds the new MCP test files to the gateway CI run."
```

---

### Task 6: MCP servers page

**Files:**
- Modify: `Clients/src/presentation/pages/AIGateway/MCPServers/index.tsx`
- Modify: `Clients/src/presentation/pages/AIGateway/MCPServers/index.test.tsx`
- Modify: `Clients/src/i18n/translations.ts`

**Interfaces:**
- Consumes: create/PATCH `{server, discovery: {status, tools_discovered, error}}`; `POST /ai-gateway/mcp/servers/{id}/discover` → `{status, tools_discovered}` or 502 `{detail}`; server fields `tool_count`, `last_discovery_error`, `auth_header?`, `auth_secret_hint?`.

- [ ] **Step 1: Write the failing tests** — in `index.test.tsx`, delete the test `"disables the discover-tools action with a 'Coming soon' tooltip"` and add:

```tsx
  it("runs discovery from the row and reports the tool count", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer()] } });
    mockPost.mockResolvedValue({ data: { status: "success", tools_discovered: 7 } });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Discover tools" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/ai-gateway/mcp/servers/1/discover");
      expect(screen.getByText("7 tools found")).toBeInTheDocument();
    });
  });

  it("shows the gateway's reason when row discovery fails", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer()] } });
    mockPost.mockRejectedValue({ response: { data: { detail: "Could not connect to the server address" } } });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Discover tools" }));

    await waitFor(() => {
      expect(screen.getByText("Could not connect to the server address")).toBeInTheDocument();
    });
  });

  it("reports the discovery result after saving a new server", async () => {
    mockGet.mockResolvedValue({ data: { servers: [] } });
    mockPost.mockResolvedValue({
      data: { server: makeServer(), discovery: { status: "failed", tools_discovered: 0, error: "The server rejected the credentials (HTTP 401)" } },
    });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Add server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Add server" }));
    fireEvent.change(screen.getByPlaceholderText("e.g., Production Search Server"), { target: { value: "Search Server" } });
    fireEvent.change(screen.getByPlaceholderText("e.g., https://mcp-server.example.com"), { target: { value: "https://mcp.example.com" } });
    const submitButtons = screen.getAllByRole("button", { name: "Add server" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("Server saved, but discovery failed: The server rejected the credentials (HTTP 401)")).toBeInTheDocument();
    });
  });

  it("says the server offered no tools when discovery finds none", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer()] } });
    mockPost.mockResolvedValue({ data: { status: "success", tools_discovered: 0 } });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Discover tools" }));

    await waitFor(() => expect(screen.getByText("The server offered no tools")).toBeInTheDocument());
  });

  it("shows the discovery result when a server is switched on", async () => {
    mockGet.mockResolvedValue({ data: { servers: [makeServer({ is_active: false })] } });
    mockPatch.mockResolvedValue({ data: { server: makeServer(), discovery: { status: "success", tools_discovered: 2, error: null } } });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(screen.getByText("Server switched on. 2 tools found")).toBeInTheDocument());
  });

  it("explains an unhealthy status on hover", async () => {
    mockGet.mockResolvedValue({
      data: { servers: [makeServer({ health_status: "unhealthy", last_discovery_error: "The server returned HTTP 500" })] },
    });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Unhealthy")).toBeInTheDocument());

    fireEvent.mouseOver(screen.getByText("Unhealthy"));

    await waitFor(() => expect(screen.getByText("The server returned HTTP 500")).toBeInTheDocument());
  });

  it("keeps the stored key when editing with the key left blank", async () => {
    mockGet.mockResolvedValue({
      data: { servers: [makeServer({ auth_type: "api_key", auth_header: "X-K", auth_secret_hint: "abcd...wxyz" })] },
    });
    mockPatch.mockResolvedValue({ data: { server: makeServer(), discovery: { status: "skipped", tools_discovered: 0, error: null } } });
    renderWithProviders(<MCPServersPage />, { route: "/ai-gateway/mcp/servers" });
    await waitFor(() => expect(screen.getByText("Search Server")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Edit server" }));
    expect(screen.getByText("Current key: abcd...wxyz. Leave blank to keep it.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      const payload = mockPatch.mock.calls[0][1];
      expect(payload.auth_config).toBeUndefined();
    });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd Clients && npx vitest run src/presentation/pages/AIGateway/MCPServers/index.test.tsx`
Expected: the new tests FAIL (button disabled; messages absent)

- [ ] **Step 3: Implement the page changes** in `index.tsx`

1. Imports: add `import Alert from "../../../components/Alert";`.
2. `MCPServer` interface: add `last_discovery_error?: string | null; auth_header?: string; auth_secret_hint?: string;`.
3. State: `const [alert, setAlert] = useState<{ variant: "success" | "warning" | "error"; body: string } | null>(null);` and `const [discoveringId, setDiscoveringId] = useState<number | null>(null);`, plus

```tsx
  const showAlert = (variant: "success" | "warning" | "error", body: string) => {
    setAlert({ variant, body });
    setTimeout(() => setAlert(null), 6000);
  };

  type Discovery = { status: "success" | "failed" | "skipped"; tools_discovered: number; error: string | null };

  const toolsFound = (n: number) =>
    n === 0 ? "The server offered no tools" : n === 1 ? "1 tool found" : `${n} tools found`;

  const reportDiscovery = (prefix: string, discovery?: Discovery) => {
    if (!discovery || discovery.status === "skipped") {
      showAlert("success", prefix);
    } else if (discovery.status === "success") {
      showAlert("success", `${prefix}. ${toolsFound(discovery.tools_discovered)}`);
    } else {
      showAlert("warning", `${prefix}, but discovery failed: ${discovery.error}`);
    }
  };
```

4. `handleSubmit`: build `auth_config` as

```tsx
    const isEdit = editingId !== null;
    if (form.auth_type === "bearer" && form.auth_token.trim()) {
      payload.auth_config = { token: form.auth_token.trim() };
    } else if (form.auth_type === "api_key") {
      const header = form.auth_header_name.trim();
      const key = form.auth_api_key.trim();
      if (key) {
        payload.auth_config = { header: header || "X-API-Key", key };
      } else if (isEdit && header) {
        payload.auth_config = { header };
      }
    }
```

   capture the response (`const res = await apiServices.post(...)` / `patch(...)`), and after closing the modal call `reportDiscovery("Server saved", res?.data?.discovery)`.
5. `openEditModal`: set `auth_header_name: srv.auth_header || ""`.
6. `handleDiscover`:

```tsx
  const handleDiscover = async (id: number) => {
    setDiscoveringId(id);
    try {
      const res = await apiServices.post<Record<string, any>>(`/ai-gateway/mcp/servers/${id}/discover`);
      showAlert("success", toolsFound(res?.data?.tools_discovered ?? 0));
    } catch (err: any) {
      showAlert("error", err?.response?.data?.detail || "Discovery failed");
    } finally {
      setDiscoveringId(null);
      await loadData();
    }
  };
```

7. `handleToggleActive`: capture `res`; when switching on (`!isActive`), call `reportDiscovery("Server switched on", res?.data?.discovery)`; when switching off, no alert.
8. Row button — replace the disabled Tooltip block:

```tsx
                <Tooltip title="Discover tools" arrow>
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => handleDiscover(srv.id)}
                      disabled={discoveringId === srv.id}
                      sx={{ p: 0.5 }}
                      aria-label="Discover tools"
                    >
                      <Search size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                    </IconButton>
                  </span>
                </Tooltip>
```

9. Health cell — wrap the Chip: `<Tooltip title={srv.health_status === "unhealthy" && srv.last_discovery_error ? srv.last_discovery_error : ""} arrow><span><Chip ... /></span></Tooltip>`.
10. Credential fields in the modal: `isRequired={!isEditing}` on the token and API key fields; under each, when editing and `auth_secret_hint` exists for the server being edited, render

```tsx
            <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>
              {`Current key: ${editingServer.auth_secret_hint}. Leave blank to keep it.`}
            </Typography>
```

   (use `Current token: ... Leave blank to keep it.` for bearer), where `const editingServer = servers.find((s) => s.id === editingId);`.
11. Empty-state tip: title `"Tool discovery"`, description `"Tools are discovered when you save a server, and you can run discovery again at any time from the server list."`. Main message unchanged.
12. Render `{alert && <Alert variant={alert.variant} body={alert.body} isToast onClick={() => setAlert(null)} />}` as the first child inside `PageHeaderExtended`.

- [ ] **Step 4: Run tests, then add translations**

Run: `cd Clients && npx vitest run src/presentation/pages/AIGateway/MCPServers/index.test.tsx` — expected all PASS.
Run: `cd Clients && npm run i18n:audit:strict` — for each new string it reports, add de/fr/es entries to `src/i18n/translations.ts` in the same format as neighbouring entries, then rerun until it passes.

- [ ] **Step 5: Gates for this task**

```bash
cd Clients && npm run typecheck && npm run lint -- --quiet && npx prettier --check src/presentation/pages/AIGateway/MCPServers/index.tsx src/presentation/pages/AIGateway/MCPServers/index.test.tsx src/i18n/translations.ts
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add Clients/src/presentation/pages/AIGateway/MCPServers/index.tsx Clients/src/presentation/pages/AIGateway/MCPServers/index.test.tsx Clients/src/i18n/translations.ts
git commit -m "feat(mcp): discover tools from the servers page and report the result" -m "Enables the Discover tools button, shows the discovery result after save, edit and switching a server on, explains Unhealthy on hover, and keeps stored credentials when their fields are left blank. Empty-state copy no longer promises periodic health checks."
```

---

### Task 7: Docs

**Files:**
- Modify: `shared/user-guide-content/content/ai-gateway/mcp-overview.ts`, `mcp-servers.ts`, `mcp-tools.ts`
- Modify: `docs/technical/domains/agent-control.md` (MCP server registration / proxy section)

- [ ] **Step 1: Find every overpromise**

Run: `grep -n -i "periodic\|health\|bypass\|once available\|first routes\|automatic\|discover\|stay in the catalog\|remain" shared/user-guide-content/content/ai-gateway/mcp-overview.ts shared/user-guide-content/content/ai-gateway/mcp-servers.ts shared/user-guide-content/content/ai-gateway/mcp-tools.ts`

- [ ] **Step 2: Rewrite each hit to match the behaviour** (sentence case, plain language):
  - Discovery runs when a server is saved (create, or an edit to its address, authentication or credentials, or switching it on), with a 10-second limit, and from the Discover tools button (30 seconds).
  - Health shows the result of the last discovery. Hovering "Unhealthy" shows why. There are no periodic health checks yet, and unhealthy servers are not bypassed.
  - Tools a server stops offering are deactivated on the next discovery; their risk and approval settings are kept if the tool returns.
  - Agents do not see tools from a disabled server.
  - Credentials are encrypted and shown only as a masked hint to Admins; leave the field blank when editing to keep them.
  - Supported authentication: none, bearer token, API key (OAuth is not supported yet).
  - Remove the "trigger it manually once available" wording from the setup steps.

- [ ] **Step 3: Update `agent-control.md`** — in the MCP proxy/registration description, state the discovery triggers and budgets, the stored credential shape (`token_enc` / `header` + `key_enc`, migration a0013), `last_discovery_error`, and that `tools/list` excludes inactive servers. Update its "Last updated" line if it has one.

- [ ] **Step 4: Mirror the guide pages** (uncommitted in the website repo, by design)

```bash
for f in mcp-overview.ts mcp-servers.ts mcp-tools.ts; do cp shared/user-guide-content/content/ai-gateway/$f ~/website/verifywise/content/user-guide/content/ai-gateway/$f; done
```

Check the destination folder exists first (`ls ~/website/verifywise/content/user-guide/content/ai-gateway/`); if the layout differs, find the matching files with `find ~/website/verifywise/content/user-guide -name 'mcp-servers.ts'`.

- [ ] **Step 5: Commit**

```bash
git add shared/user-guide-content/content/ai-gateway/ docs/technical/domains/agent-control.md
git commit -m "docs(mcp): describe server registration as it actually works" -m "Discovery on save and on demand, health from the last discovery, no periodic checks or bypass yet, encrypted masked credentials, disabled servers hidden from agents."
```

---

### Task 8: End-to-end check and full gates

**Files:** none (verification only; fix-forward commits if something fails)

- [ ] **Step 1: Start services** — Postgres :5432 must be up. Run the dev MCP server: `cd AIGateway && venv/bin/python test_mcp_server.py` (port 3001). Start the gateway (`cd AIGateway/src && ../venv/bin/uvicorn app:app --port 8100`), backend (`cd Servers && npm run watch`) and frontend (`cd Clients && npm run dev`) in the background. Health: backend :3000 → 400, gateway :8100 and frontend :5173 → 200 (real HTTP curl).

- [ ] **Step 2: Browser run** (log in as the local dev user from memory notes): on AI Gateway → MCP servers,
  1. Add `http://localhost:3001/mcp`, auth none → "Server saved. 4 tools found"; Health Healthy; Tools 4.
  2. Add the same URL with auth API key `X-K` / `k-1` → saved and discovered (the dev server ignores auth; header delivery is covered by `test_sends_api_key_header`).
  3. Edit that server with the key left blank → hint "Current key: ..."; save; DB still has `key_enc`.
  4. Add `http://localhost:3999/mcp` → warning "Server saved, but discovery failed: Could not connect to the server address"; Health Unhealthy; hover shows the reason.
  5. Switch server 1 off and on → "Server switched on. 4 tools found".
  6. Log in as a non-admin (or call `GET /api/ai-gateway/mcp/servers` with a non-admin token) → no `auth_secret_hint`, no `auth_config`.

- [ ] **Step 3: Proxy call** — create an agent key on Agent keys, then:

```bash
curl -s http://localhost:8100/v1/mcp -H "Authorization: Bearer <sk-mcp-key>" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
curl -s http://localhost:8100/v1/mcp -H "Authorization: Bearer <sk-mcp-key>" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"greet","arguments":{"name":"VerifyWise"}}}'
```

Expected: the four dev tools listed; `Hello, VerifyWise!`. Disable the server, rerun `tools/list` → its tools are gone.

- [ ] **Step 4: One public MCP server** — register a public no-auth Streamable HTTP MCP server (try `https://mcp.deepwiki.com/mcp`); record the result. If unreachable from this machine, record that and do not block on it.

- [ ] **Step 5: Clean up** — delete the test servers and agent key; stop the dev MCP server. Stop every service you started.

- [ ] **Step 6: Full gates**

```bash
cd AIGateway && ENCRYPTION_KEY=default-key-change-this-in-production-32chars!! venv/bin/python -m pytest tests/test_cache_service.py tests/test_spend_by_day_sql.py tests/test_model_catalog_contract.py tests/test_agent_policy_scope.py tests/test_retention.py tests/test_agent_control_retention.py tests/test_encryption.py tests/test_internal_key.py tests/test_18_mcp_credentials.py tests/test_19_mcp_discovery.py tests/test_20_mcp_servers_router.py
cd Servers && npm run build && npm run format-check
cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run lint -- --quiet && npx vitest run
```

Expected: all pass. Known flakes under load: AITrustCenterOverview, MCPAgentKeys, AIGateway Endpoints time out in the full vitest run and pass alone; rerun those files individually before calling it a failure. `Clients` `format-check` fails on the untracked `Clients/dist-analyze/`; use `npx prettier --check` on changed files instead.

- [ ] **Step 7: Commit any fixes** with their own messages; then report results (pass counts, anything skipped) before /code-review.
