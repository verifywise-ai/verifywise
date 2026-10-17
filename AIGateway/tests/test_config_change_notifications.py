"""Config-change notifications and user references.

The backend's notifyConfigChange reads camelCase fields (entityType,
entityName, actionUrl, actionLabel). Gateway routers used to send snake_case
dicts, bare event strings or keyword arguments, which made the backend throw
and drop the notification. These tests pin the shape and make sure every
router builds its event with config_event().
"""

import ast
import asyncio
import importlib.util
import re
from pathlib import Path

import sys

import pytest

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from utils import notifications  # noqa: E402
from utils.notifications import _CONFIG_ENTITIES, _EMAIL_EVENTS, config_event  # noqa: E402
ROUTERS = sorted((SRC / "routers").glob("*.py"))
MIGRATIONS = SRC / "database" / "migrations" / "versions"

# Builders that return a config_event() dict, possibly with extra fields.
EVENT_BUILDERS = {"config_event", "_mode_change_event"}


class TestConfigEvent:
    def test_shape_matches_what_the_backend_reads(self):
        event = config_event("mcp_agent_key", "created", "build-bot", 12, detail="Mode: monitor")

        assert event == {
            "entityType": "Agent key",
            "entityName": "build-bot",
            "action": "created",
            "actionUrl": "/ai-gateway/mcp/agent-keys",
            "actionLabel": "View agent keys",
            "email": False,
            "detail": "Mode: monitor",
        }

    def test_id_stands_in_for_a_missing_name(self):
        event = config_event("virtual_key", "revoked", entity_id=4)

        assert event["entityName"] == "#4"
        assert "detail" not in event

    def test_no_name_and_no_id(self):
        event = config_event("guardrail_settings", "updated")

        assert event["entityName"] == ""

    @pytest.mark.parametrize("entity,action,email", [
        ("mcp_agent_key", "revoked", True),
        ("mcp_agent_key", "enforcement_mode_changed", True),
        ("api_key", "created", True),
        ("guardrail", "disabled", True),
        ("mcp_agent_key", "updated", False),
        ("mcp_approval", "approved", False),
        ("prompt", "published", False),
        ("guardrail_logs", "purged", False),
    ])
    def test_only_security_relevant_changes_email(self, entity, action, email):
        assert config_event(entity, action, "x")["email"] is email

    def test_email_rules_name_real_entities(self):
        assert {entity for entity, _ in _EMAIL_EVENTS} <= set(_CONFIG_ENTITIES)

    def test_unknown_entity_is_rejected(self):
        with pytest.raises(KeyError):
            config_event("not_an_entity", "created")

    @pytest.mark.parametrize("entity", sorted(_CONFIG_ENTITIES))
    def test_every_entity_links_to_a_frontend_path(self, entity):
        label, path, button = _CONFIG_ENTITIES[entity]

        assert label and button
        # A path, never a hard-coded host: the backend adds FRONTEND_URL.
        assert path.startswith("/ai-gateway")


class TestNotifyConfigChange:
    async def test_posts_the_event_unchanged(self, monkeypatch):
        sent = []

        async def capture(payload):
            sent.append(payload)

        monkeypatch.setattr(notifications, "_send_notification", capture)
        event = config_event("endpoint", "deleted", "prod-gpt4o", 3)

        await notifications.notify_config_change(1, 7, event)
        # Sent in the background; the caller does not wait for it.
        assert sent == []
        await asyncio.gather(*notifications._background)

        assert sent == [{
            "type": "config_change",
            "organization_id": 1,
            "changed_by_user_id": 7,
            "event": event,
        }]


def _notify_calls():
    for path in ROUTERS:
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "notify_config_change"
            ):
                yield path.name, node


def _event_arg(call: ast.Call):
    for kw in call.keywords:
        if kw.arg == "event":
            return kw.value
    return call.args[2] if len(call.args) >= 3 else None


class TestRouterCallSites:
    def test_call_sites_exist(self):
        assert len(list(_notify_calls())) >= 20

    @pytest.mark.parametrize(
        "where,call",
        [(f"{name}:{call.lineno}", call) for name, call in _notify_calls()],
        ids=lambda v: v if isinstance(v, str) else "",
    )
    def test_event_is_built_with_config_event(self, where, call):
        event = _event_arg(call)

        assert isinstance(event, ast.Call), f"{where}: event must be built with config_event()"
        assert isinstance(event.func, ast.Name) and event.func.id in EVENT_BUILDERS, where
        assert not [kw.arg for kw in call.keywords if kw.arg not in
                    ("organization_id", "changed_by_user_id", "event")], where
        if event.func.id == "config_event":
            entity = event.args[0]
            assert isinstance(entity, ast.Constant) and entity.value in _CONFIG_ENTITIES, where


def _load_migration(name: str):
    spec = importlib.util.spec_from_file_location(name, MIGRATIONS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestUserReferenceMigration:
    def test_follows_a0015(self):
        migration = _load_migration("a0016_user_fks_on_delete_set_null")

        assert migration.revision == "a0016"
        assert migration.down_revision == "a0015"

    def test_covers_every_user_reference_without_an_on_delete_rule(self):
        """Any column created with a bare REFERENCES users(id) blocks deleting
        a user; a0016 must recreate each one. Covers CREATE TABLE bodies and
        ALTER TABLE ... ADD COLUMN, including SQL split over Python string
        literals."""
        bare = _bare_user_references(MIGRATIONS.glob("a00*.py"))

        migration = _load_migration("a0016_user_fks_on_delete_set_null")

        assert bare, "the scan found no references; the regex no longer matches"
        assert bare == set(migration.USER_REFERENCES)

    def test_scan_catches_added_columns(self, tmp_path):
        sample = tmp_path / "a0099_sample.py"
        sample.write_text(
            'op.execute(\n'
            '    "ALTER TABLE ai_gateway_x "\n'
            '    "ADD COLUMN IF NOT EXISTS reviewed_by BIGINT NULL "\n'
            '    "REFERENCES users(id)"\n'
            ')\n'
            'op.execute("ALTER TABLE ai_gateway_y ADD COLUMN ok_by INTEGER '
            'REFERENCES users(id) ON DELETE SET NULL")\n'
        )

        assert _bare_user_references([sample]) == {("ai_gateway_x", "reviewed_by")}


_INT = r"(?:BIG)?INT(?:EGER)?\b"
_BARE_REF = r"REFERENCES users\s*\(id\)(?!\s*ON DELETE)"


def _bare_user_references(paths) -> set[tuple[str, str]]:
    found = set()
    for path in paths:
        # Join adjacent string literals ("ALTER TABLE x " "ADD COLUMN ...").
        text = re.sub(r'"\s*\n\s*"', "", Path(path).read_text())
        for table, body in re.findall(
            r"CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\((.*?)\n\s*\)", text, re.S
        ):
            for column in re.findall(rf"(\w+)\s+{_INT}[^,]*?{_BARE_REF}", body):
                found.add((table, column))
        for table, column in re.findall(
            rf"ALTER TABLE (\w+)\s+ADD COLUMN (?:IF NOT EXISTS )?(\w+)\s+{_INT}[^;\"]*?{_BARE_REF}",
            text,
        ):
            found.add((table, column))
    return found
