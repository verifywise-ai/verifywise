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
    config_fingerprint,
    get_secret,
    legacy_config,
    migrate_stored_config,
    normalize_auth_config,
    public_auth_fields,
    token_secret,
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
            normalize_auth_config("saml", {}, None)


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


OAUTH_IN = {
    "client_id": " app ",
    "client_secret": " s3cret\n",
    "token_url": "https://auth.example.com/oauth2/token",
    "scope": "mcp",
}


class TestTokenTypes:
    def test_oauth_encrypts_secret_and_keeps_fields(self):
        cfg = normalize_auth_config("oauth", OAUTH_IN, None)
        assert cfg["client_id"] == "app"
        assert decrypt(cfg["client_secret_enc"]) == "s3cret"
        assert cfg["token_url_source"] == "manual"
        assert cfg["auth_method"] == "client_secret_basic"
        assert cfg["scope"] == "mcp"
        assert "client_secret" not in cfg
        assert token_secret("oauth", cfg) == "s3cret"

    def test_oauth_requires_token_url(self):
        with pytest.raises(CredentialError, match="Enter the token URL, or use Find token URL"):
            normalize_auth_config("oauth", {"client_id": "a", "client_secret": "b"}, None)

    def test_oauth_rejects_internal_token_url(self):
        incoming = {**OAUTH_IN, "token_url": "http://169.254.169.254/latest"}
        with pytest.raises(CredentialError):
            normalize_auth_config("oauth", incoming, None)

    def test_oauth_auth_method_only_two_values(self):
        cfg = normalize_auth_config("oauth", {**OAUTH_IN, "auth_method": "client_secret_post"}, None)
        assert cfg["auth_method"] == "client_secret_post"
        cfg = normalize_auth_config("oauth", {**OAUTH_IN, "auth_method": "private_key_jwt"}, None)
        assert cfg["auth_method"] == "client_secret_basic"

    def test_oauth_edit_keeps_secret_when_blank(self):
        stored = normalize_auth_config("oauth", OAUTH_IN, None)
        edited = normalize_auth_config(
            "oauth",
            {"client_id": "app", "token_url": "https://auth.example.com/v2/token"},
            stored,
        )
        assert decrypt(edited["client_secret_enc"]) == "s3cret"
        assert edited["token_url"] == "https://auth.example.com/v2/token"
        assert config_fingerprint("oauth", edited) != config_fingerprint("oauth", stored)

    def test_oauth_requires_secret_on_create(self):
        with pytest.raises(CredentialError):
            normalize_auth_config("oauth", {"client_id": "a", "token_url": "https://a.example.com/t"}, None)

    def test_aws_iam_shape(self):
        cfg = normalize_auth_config(
            "aws_iam",
            {"region": "us-east-1", "access_key_id": "AKIAEXAMPLE", "secret_access_key": " abc/def+ghi \n"},
            None,
        )
        assert set(cfg) == {"region", "access_key_id", "secret_access_key_enc", "resource"}
        assert cfg["region"] == "us-east-1"
        assert cfg["access_key_id"] == "AKIAEXAMPLE"
        assert cfg["resource"] == "aws-mcp.amazonaws.com"
        assert decrypt(cfg["secret_access_key_enc"]) == "abc/def+ghi"
        assert token_secret("aws_iam", cfg) == "abc/def+ghi"

    @pytest.mark.parametrize("region", ["US East", "", "useast1", "us-east-"])
    def test_aws_iam_rejects_bad_region(self, region):
        with pytest.raises(CredentialError, match="Enter an AWS region such as us-east-1"):
            normalize_auth_config(
                "aws_iam", {"region": region, "access_key_id": "AKIA", "secret_access_key": "s"}, None
            )

    @pytest.mark.parametrize(
        "incoming",
        [
            {"region": "us-east-1", "secret_access_key": "s"},
            {"region": "us-east-1", "access_key_id": "AKIA"},
        ],
    )
    def test_aws_iam_requires_both_keys(self, incoming):
        with pytest.raises(CredentialError, match="Enter the access key ID and secret access key"):
            normalize_auth_config("aws_iam", incoming, None)

    def test_aws_iam_edit_keeps_secret(self):
        stored = normalize_auth_config(
            "aws_iam", {"region": "us-east-1", "access_key_id": "AKIA", "secret_access_key": "s"}, None
        )
        edited = normalize_auth_config("aws_iam", {"region": "eu-west-2"}, stored)
        assert edited["region"] == "eu-west-2"
        assert edited["access_key_id"] == "AKIA"
        assert decrypt(edited["secret_access_key_enc"]) == "s"

    def test_public_fields_token_types(self):
        oauth = normalize_auth_config("oauth", OAUTH_IN, None)
        fields = public_auth_fields("oauth", oauth, True)
        assert fields["oauth_client_id"] == "app"
        assert fields["oauth_token_url"] == "https://auth.example.com/oauth2/token"
        assert fields["oauth_token_url_source"] == "manual"
        assert fields["oauth_scope"] == "mcp"
        assert fields["auth_secret_hint"] and "s3cret" not in fields["auth_secret_hint"]
        assert public_auth_fields("oauth", oauth, False) == {}

        aws = normalize_auth_config(
            "aws_iam",
            {"region": "us-east-1", "access_key_id": "AKIAEXAMPLE", "secret_access_key": "abc/def+ghi"},
            None,
        )
        fields = public_auth_fields("aws_iam", aws, True)
        assert fields["aws_region"] == "us-east-1"
        assert fields["aws_access_key_id"] == "AKIAEXAMPLE"
        assert "abc/def+ghi" not in fields["auth_secret_hint"]
        assert public_auth_fields("aws_iam", aws, False) == {}

    def test_build_auth_headers_token_types_empty(self):
        cfg = normalize_auth_config("oauth", OAUTH_IN, None)
        assert build_auth_headers("oauth", cfg) == {}
        assert build_auth_headers("aws_iam", {}) == {}

    def test_legacy_and_migrate_return_empty(self):
        cfg = normalize_auth_config("oauth", OAUTH_IN, None)
        assert migrate_stored_config("oauth", cfg) == {}
        assert legacy_config("aws_iam", cfg) == {}

    def test_fingerprint_is_stable_and_type_sensitive(self):
        cfg = {"a": 1}
        assert config_fingerprint("oauth", cfg) == config_fingerprint("oauth", {"a": 1})
        assert config_fingerprint("oauth", cfg) != config_fingerprint("aws_iam", cfg)


class TestOauthOriginChange:
    def _stored(self, **extra):
        return normalize_auth_config("oauth", {**OAUTH_IN, **extra}, None)

    def test_oauth_origin_change_requires_secret(self):
        stored = self._stored()
        with pytest.raises(CredentialError, match="different host"):
            normalize_auth_config(
                "oauth",
                {"client_id": "app", "token_url": "https://evil.example.net/token"},
                stored,
            )

    def test_oauth_same_origin_path_change_keeps_secret(self):
        stored = self._stored(token_url="https://auth.example.com:443/oauth2/token")
        edited = normalize_auth_config(
            "oauth",
            {"client_id": "app", "token_url": "https://auth.example.com/v2/token?x=1"},
            stored,
        )
        assert decrypt(edited["client_secret_enc"]) == "s3cret"

    def test_oauth_origin_change_with_new_secret_ok(self):
        stored = self._stored()
        edited = normalize_auth_config(
            "oauth",
            {
                "client_id": "app",
                "client_secret": "new-secret",
                "token_url": "https://other.example.org/token",
            },
            stored,
        )
        assert decrypt(edited["client_secret_enc"]) == "new-secret"

    def test_token_url_edit_without_source_becomes_manual(self):
        stored = self._stored(token_url_source="discovered")
        assert stored["token_url_source"] == "discovered"
        edited = normalize_auth_config(
            "oauth",
            {"client_id": "app", "token_url": "https://auth.example.com/v2/token"},
            stored,
        )
        assert edited["token_url_source"] == "manual"
        same = normalize_auth_config("oauth", {"client_id": "app"}, stored)
        assert same["token_url_source"] == "discovered"
