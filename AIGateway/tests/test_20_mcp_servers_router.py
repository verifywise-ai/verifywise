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

pytestmark = pytest.mark.asyncio

CHANGES = {"added": 1, "removed": 0, "changed": 0, "unchanged": 2}
OK = {"status": "success", "tools_discovered": 3, "changes": CHANGES, "error": None}


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
        row = {**_row(), **data, "id": 9}
        row.pop("tool_count")  # RETURNING * has no computed tool_count
        return row

    async def update(org_id, server_id, data):
        state["saved"] = data
        merged = {**state["row"], **data}
        state["row"] = merged
        merged = dict(merged)
        merged.pop("tool_count", None)  # RETURNING * has no computed tool_count
        return merged

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
        assert srv["auth_secret_hint"] == "...wxyz"

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
        assert out["discovery"] == {"status": "skipped", "tools_discovered": 0, "changes": None, "error": None}
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
    async def test_manual_discovery_uses_25s_budget(self, fakes):
        out = await router.discover_server_tools(9, _request())
        assert out == {"status": "success", "tools_discovered": 3, "changes": CHANGES}
        assert fakes["discovery"] == [(9, router.MANUAL_DISCOVERY_SECONDS)]

    async def test_manual_failure_is_502_with_message(self, fakes, monkeypatch):
        async def fail(org_id, server, budget):
            return {"status": "failed", "tools_discovered": 0, "changes": None, "error": "Could not connect to the server address"}
        monkeypatch.setattr(router, "run_discovery", fail)
        with pytest.raises(HTTPException) as e:
            await router.discover_server_tools(9, _request())
        assert e.value.status_code == 502
        assert e.value.detail == "Could not connect to the server address"

    async def test_non_admin_forbidden(self, fakes):
        with pytest.raises(HTTPException) as e:
            await router.discover_server_tools(9, _request(role="Editor"))
        assert e.value.status_code == 403


class TestUndecryptableSecret:
    async def test_list_survives_bad_ciphertext(self, fakes):
        fakes["row"] = _row(auth_config={"header": "X-K", "key_enc": "not-valid-ciphertext"})
        out = await router.list_mcp_servers(_request())
        srv = out["servers"][0]
        assert srv["id"] == 9
        assert "auth_secret_hint" not in srv
        assert "auth_config" not in srv

    async def test_forced_failure_is_logged_without_secrets(self, fakes, monkeypatch, caplog):
        from cryptography.exceptions import InvalidTag

        def boom(*a, **k):
            raise InvalidTag()

        monkeypatch.setattr(router, "public_auth_fields", boom)
        fakes["row"] = _row(auth_config={"header": "X-K", "key_enc": "SECRET-CIPHERTEXT"})
        with caplog.at_level("WARNING"):
            out = await router.list_mcp_servers(_request())
        srv = out["servers"][0]
        assert srv["id"] == 9
        assert "auth_secret_hint" not in srv and "auth_header" not in srv
        warnings = [
            r for r in caplog.records
            if r.levelname == "WARNING" and r.name == router.logger.name
        ]
        assert [r.getMessage() for r in warnings] == ["Skipped the masked auth hint for MCP server 9: stored value unreadable"]
        for r in caplog.records:
            assert "SECRET-CIPHERTEXT" not in r.getMessage() and "abcd1234wxyz" not in r.getMessage()
        assert "SECRET-CIPHERTEXT" not in caplog.text and "abcd1234wxyz" not in caplog.text


class TestToolCountAlways:
    async def test_create_skipped_has_tool_count(self, fakes):
        body = {"name": "S", "slug": "s", "url": "https://a/mcp", "auth_type": "none", "is_active": False}
        out = await router.create_mcp_server(_request(body))
        assert out["discovery"]["status"] == "skipped"
        assert "tool_count" in out["server"]

    async def test_patch_skipped_has_tool_count(self, fakes):
        out = await router.update_mcp_server(9, _request({"name": "Renamed"}))
        assert out["discovery"]["status"] == "skipped"
        assert "tool_count" in out["server"]


class TestUnsafeUrl:
    async def test_create_metadata_url_is_400_and_nothing_saved(self, fakes):
        body = {"name": "S", "slug": "s", "url": "http://169.254.169.254/", "auth_type": "none"}
        with pytest.raises(HTTPException) as err:
            await router.create_mcp_server(_request(body))
        assert err.value.status_code == 400
        assert "not allowed" in err.value.detail
        assert fakes["saved"] is None
        assert fakes["discovery"] == []

    async def test_create_stores_normalized_url(self, fakes):
        body = {"name": "S", "slug": "s", "url": "HTTPS://A/mcp/", "auth_type": "none"}
        await router.create_mcp_server(_request(body))
        # Scheme and host lowercased; the trailing slash is part of the path and kept.
        assert fakes["saved"]["url"] == "https://a/mcp/"

    async def test_patch_file_url_is_400_and_nothing_saved(self, fakes):
        with pytest.raises(HTTPException) as err:
            await router.update_mcp_server(9, _request({"url": "file:///x"}))
        assert err.value.status_code == 400
        assert "protocol" in err.value.detail
        assert fakes["saved"] is None

    async def test_patch_stores_normalized_url(self, fakes):
        await router.update_mcp_server(9, _request({"url": "HTTPS://B/mcp/"}))
        assert fakes["saved"]["url"] == "https://b/mcp/"

    async def test_patch_without_url_does_not_validate_stored_url(self, fakes):
        fakes["row"]["url"] = "http://0.0.0.0/"
        out = await router.update_mcp_server(9, _request({"name": "Renamed"}))
        assert out["discovery"]["status"] == "skipped"


from contextlib import asynccontextmanager
from unittest.mock import MagicMock

import crud.mcp_tools as tools_crud


def _capture_db(monkeypatch):
    seen = []
    db = MagicMock()

    async def execute(stmt, params=None):
        seen.append((str(stmt), params or {}))
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
    # The filter is a bound flag so the SQL stays a fixed literal.
    async def test_agents_see_only_active_servers(self, monkeypatch):
        seen = _capture_db(monkeypatch)
        await tools_crud.get_all_tools(1, active_servers_only=True)
        sql, params = seen[0]
        assert "(:active_servers_only = false OR s.is_active = true)" in sql
        assert params["active_servers_only"] is True

    async def test_catalog_keeps_every_server(self, monkeypatch):
        seen = _capture_db(monkeypatch)
        await tools_crud.get_all_tools(1)
        assert seen[0][1]["active_servers_only"] is False


import routers.mcp_proxy as proxy_router
import services.mcp_proxy_service as proxy_svc
from utils.safe_outbound_url import UnsafeOutboundUrlError


class TestResolveToolOrdering:
    async def test_prefers_active_server_on_name_collision(self, monkeypatch):
        seen = _capture_db_for(monkeypatch, proxy_svc)
        with pytest.raises(ValueError):
            await proxy_svc.resolve_tool(1, "search")
        assert "organization_id = :org_id" in seen[0]
        assert "ORDER BY s.is_active DESC, s.id ASC" in seen[0]


def _capture_db_for(monkeypatch, module):
    seen = []
    db = MagicMock()

    async def execute(stmt, params=None):
        seen.append(str(stmt))
        result = MagicMock()
        result.mappings.return_value.fetchone.return_value = None
        return result

    db.execute = execute

    @asynccontextmanager
    async def get_db():
        yield db

    monkeypatch.setattr(module, "get_db", get_db)
    return seen


class TestUnsafeServerUrlOnToolCall:
    async def test_reports_clear_error_audits_and_spares_breaker(self, monkeypatch):
        agent_key = {"id": 3, "organization_id": 1, "name": "k"}
        audits, failures = [], []

        async def extract(_request):
            return agent_key

        async def noop(*_a, **_k):
            return None

        async def resolve(_org, _name):
            return {"id": 5, "server_id": 9, "url": "http://169.254.169.254/", "requires_approval": False}

        async def audit(**kwargs):
            audits.append(kwargs)

        async def forward(**_kwargs):
            raise UnsafeOutboundUrlError("URL host is not allowed")

        async def is_open(_server_id):
            return False

        async def record_failure(server_id):
            failures.append(server_id)

        monkeypatch.setattr(proxy_router, "extract_agent_key", extract)
        monkeypatch.setattr(proxy_router, "resolve_tool", resolve)
        monkeypatch.setattr(proxy_router, "enforce_tool_acls", lambda *_a, **_k: None)
        monkeypatch.setattr(proxy_router, "enforce_mcp_rate_limits", noop)
        monkeypatch.setattr(proxy_router, "scan_tool_input", noop)
        monkeypatch.setattr(proxy_router, "check_anomaly", noop)
        monkeypatch.setattr(proxy_router, "log_tool_call", audit)
        monkeypatch.setattr(proxy_router, "forward_tool_call", forward)
        monkeypatch.setattr(proxy_router.CircuitBreaker, "is_open", is_open)
        monkeypatch.setattr(proxy_router.CircuitBreaker, "record_failure", record_failure)

        request = MagicMock()
        request.headers = {}
        request.json = AsyncMock(return_value={
            "jsonrpc": "2.0", "id": 7, "method": "tools/call",
            "params": {"name": "search", "arguments": {}},
        })

        response = await proxy_router.mcp_jsonrpc(request)
        import json as _json
        body = _json.loads(response.body)
        assert body["error"]["code"] == -32603
        assert body["error"]["message"] == "This MCP server's address is not allowed"
        assert failures == []
        assert audits and audits[0]["result_status"] == "error" and audits[0]["is_error"] is True


class TestOauthResubmit:
    @staticmethod
    def _oauth_row():
        cfg = normalize_auth_config(
            "oauth",
            {"client_id": "app", "client_secret": "s3cret", "token_url": "https://auth.example.com/t",
             "scope": "mcp"},
            None,
        )
        return _row(auth_type="oauth", auth_config=cfg)

    @staticmethod
    def _form(**over):
        form = {"client_id": "app", "client_secret": "", "token_url": "https://auth.example.com/t",
                "scope": "mcp"}
        form.update(over)
        return form

    async def test_rename_with_full_config_skips_discovery_and_keeps_ciphertext(self, fakes):
        from utils.mcp_credentials import config_fingerprint

        fakes["row"] = self._oauth_row()
        before = dict(fakes["row"]["auth_config"])
        out = await router.update_mcp_server(
            9, _request({"name": "Renamed", "auth_type": "oauth", "auth_config": self._form()})
        )
        assert out["discovery"]["status"] == "skipped"
        assert fakes["discovery"] == []
        assert fakes["saved"]["auth_config"] == before
        assert config_fingerprint("oauth", fakes["saved"]["auth_config"]) == config_fingerprint("oauth", before)

    async def test_changed_scope_runs_discovery(self, fakes):
        fakes["row"] = self._oauth_row()
        out = await router.update_mcp_server(
            9, _request({"auth_type": "oauth", "auth_config": self._form(scope="other")})
        )
        assert out["discovery"] == OK

    async def test_empty_scope_clears_it(self, fakes):
        fakes["row"] = self._oauth_row()
        out = await router.update_mcp_server(
            9, _request({"auth_type": "oauth", "auth_config": self._form(scope="")})
        )
        assert "scope" not in fakes["saved"]["auth_config"]
        assert out["discovery"] == OK

    async def test_api_key_rename_with_header_resubmitted_skips_discovery(self, fakes):
        await router.update_mcp_server(
            9, _request({"name": "R", "auth_type": "api_key", "auth_config": {"header": "X-K"}})
        )
        assert fakes["discovery"] == []


class TestUrlOriginChange:
    """A token minted for one host must not be sent to another with the old secret."""

    MESSAGE = "Enter the secret again: the server address now points to a different host"

    @staticmethod
    def _oauth_row():
        cfg = normalize_auth_config(
            "oauth",
            {"client_id": "app", "client_secret": "s3cret", "token_url": "https://auth.example.com/t"},
            None,
        )
        return _row(auth_type="oauth", auth_config=cfg, url="https://a.example.com/mcp")

    @staticmethod
    def _aws_row():
        cfg = normalize_auth_config(
            "aws_iam",
            {"region": "us-east-1", "access_key_id": "AKIAEXAMPLE", "secret_access_key": "awssecret"},
            None,
        )
        return _row(auth_type="aws_iam", auth_config=cfg, url="https://aws-mcp.us-east-1.api.aws/mcp")

    @pytest.mark.parametrize("kind", ["oauth", "aws"])
    async def test_other_host_without_a_new_secret_is_400(self, fakes, kind):
        fakes["row"] = self._oauth_row() if kind == "oauth" else self._aws_row()
        with pytest.raises(HTTPException) as e:
            await router.update_mcp_server(9, _request({"url": "https://evil.example.net/mcp"}))
        assert e.value.status_code == 400 and e.value.detail == self.MESSAGE
        assert fakes["saved"] is None

    async def test_other_port_or_scheme_is_a_different_origin(self, fakes):
        fakes["row"] = self._oauth_row()
        for url in ("https://a.example.com:8443/mcp", "http://a.example.com/mcp"):
            with pytest.raises(HTTPException) as e:
                await router.update_mcp_server(9, _request({"url": url}))
            assert e.value.detail == self.MESSAGE

    async def test_blank_secret_in_the_form_still_counts_as_missing(self, fakes):
        fakes["row"] = self._oauth_row()
        form = {"client_id": "app", "client_secret": "  ", "token_url": "https://auth.example.com/t"}
        with pytest.raises(HTTPException) as e:
            await router.update_mcp_server(
                9, _request({"url": "https://evil.example.net/mcp", "auth_type": "oauth", "auth_config": form})
            )
        assert e.value.detail == self.MESSAGE

    async def test_other_host_with_a_new_secret_is_saved(self, fakes):
        fakes["row"] = self._oauth_row()
        form = {"client_id": "app", "client_secret": "fresh", "token_url": "https://auth.example.com/t"}
        await router.update_mcp_server(
            9, _request({"url": "https://b.example.com/mcp", "auth_type": "oauth", "auth_config": form})
        )
        assert decrypt(fakes["saved"]["auth_config"]["client_secret_enc"]) == "fresh"

    async def test_new_aws_secret_allows_a_host_change(self, fakes):
        fakes["row"] = self._aws_row()
        form = {"region": "us-east-1", "access_key_id": "AKIAEXAMPLE", "secret_access_key": "fresh"}
        await router.update_mcp_server(
            9, _request({"url": "https://other.example.com/mcp", "auth_type": "aws_iam", "auth_config": form})
        )
        assert decrypt(fakes["saved"]["auth_config"]["secret_access_key_enc"]) == "fresh"

    async def test_same_origin_path_change_keeps_the_secret(self, fakes):
        fakes["row"] = self._oauth_row()
        await router.update_mcp_server(9, _request({"url": "https://a.example.com/other/path"}))
        assert fakes["saved"]["url"] == "https://a.example.com/other/path"

    async def test_default_port_is_normalised(self, fakes):
        fakes["row"] = self._oauth_row()
        await router.update_mcp_server(9, _request({"url": "https://A.example.com:443/mcp"}))
        assert fakes["saved"] is not None

    async def test_api_key_servers_are_unchanged(self, fakes):
        await router.update_mcp_server(9, _request({"url": "https://b.example.com/mcp"}))
        assert fakes["saved"]["url"] == "https://b.example.com/mcp"
