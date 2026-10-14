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
            "auth_secret_hint": "...wxyz",
        }

    def test_hint_masks_short_and_long_secrets(self):
        hint = lambda s: public_auth_fields("bearer", normalize_auth_config("bearer", {"token": s}, None), True)["auth_secret_hint"]
        assert hint("12345678") == "***"
        assert hint("abcd12wxyz") == "...wxyz"
        assert hint("a" * 20 + "wxyz") == "aaaa...wxyz"

    def test_public_fields_non_admin_is_empty(self):
        cfg = normalize_auth_config("bearer", {"token": "abcd1234wxyz"}, None)
        assert public_auth_fields("bearer", cfg, False) == {}

    def test_public_fields_never_include_ciphertext(self):
        cfg = normalize_auth_config("bearer", {"token": "abcd1234wxyz"}, None)
        out = public_auth_fields("bearer", cfg, True)
        assert cfg["token_enc"] not in str(out)
