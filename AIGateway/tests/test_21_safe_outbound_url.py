"""Outbound URL policy for admin-stored MCP server URLs (SSRF hardening)."""

import os
import sys
from pathlib import Path

os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-32-chars-long!!")
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import pytest

from utils.safe_outbound_url import UnsafeOutboundUrlError, assert_safe_outbound_url


@pytest.mark.parametrize("url", [
    "https://mcp.example.com/mcp",
    "http://localhost:3001/mcp",
    "http://10.0.0.5/mcp",
    "http://192.168.1.2:8080/mcp",
    "http://172.16.0.9/mcp",
])
def test_allowed_urls_pass_unchanged(url):
    assert assert_safe_outbound_url(url) == url


def test_query_and_path_preserved():
    assert assert_safe_outbound_url("https://a.example.com/mcp/") == "https://a.example.com/mcp/"
    assert assert_safe_outbound_url("https://a.example.com/mcp/?api-version=v1#f") == "https://a.example.com/mcp/?api-version=v1#f"
    assert assert_safe_outbound_url("HTTPS://A.Example.com:8443/") == "https://a.example.com:8443/"


def test_ipv6_literal_keeps_brackets():
    assert assert_safe_outbound_url("http://[::1]:3001/mcp") == "http://[::1]:3001/mcp"


@pytest.mark.parametrize("url,message", [
    ("ftp://x/", "URL protocol 'ftp:' is not allowed (only http/https)"),
    ("file:///etc/passwd", "URL protocol 'file:' is not allowed (only http/https)"),
    ("https://u:p@x/", "URL must not embed credentials (use the server's authentication fields)"),
    ("http://169.254.169.254/latest", "URL host '169.254.169.254' is not allowed (cloud metadata / wildcard target)"),
    ("http://[fd00:ec2::254]/", "URL host 'fd00:ec2::254' is not allowed (cloud metadata / wildcard target)"),
    ("http://0.0.0.0:3001/", "URL host '0.0.0.0' is not allowed (cloud metadata / wildcard target)"),
    ("http://[::]/", "URL host '::' is not allowed (cloud metadata / wildcard target)"),
    ("", "URL is required"),
    ("not a url", "URL is not parseable"),
    ("http:///path", "URL has no hostname"),
])
def test_rejected_with_exact_message(url, message):
    with pytest.raises(UnsafeOutboundUrlError) as err:
        assert_safe_outbound_url(url)
    assert str(err.value) == message


def test_non_string_is_required_error():
    with pytest.raises(UnsafeOutboundUrlError, match="URL is required"):
        assert_safe_outbound_url(None)  # type: ignore[arg-type]


@pytest.mark.parametrize("url", [
    "http://[::ffff:169.254.169.254]/",
    "http://[0:0:0:0:0:0:0:0]/",
    "http://[FD00:EC2:0:0:0:0:0:254]/",
])
def test_other_spellings_of_blocked_ips_are_rejected(url):
    with pytest.raises(UnsafeOutboundUrlError, match="not allowed"):
        assert_safe_outbound_url(url)


def test_decimal_and_hex_ipv4_spellings_are_rejected():
    # urlsplit keeps these as plain hostnames; they must not slip through as
    # "169.254.169.254" in disguise.
    for url in ("http://2852039166/", "http://0xa9fea9fe/", "http://0/"):
        with pytest.raises(UnsafeOutboundUrlError):
            assert_safe_outbound_url(url)


def test_rejection_never_echoes_query_token():
    for url in ("http://169.254.169.254/?token=supersecret", "ftp://x/?token=supersecret", "not a url?token=supersecret"):
        with pytest.raises(UnsafeOutboundUrlError) as err:
            assert_safe_outbound_url(url)
        assert "supersecret" not in str(err.value)


def test_is_a_value_error():
    assert issubclass(UnsafeOutboundUrlError, ValueError)


@pytest.mark.parametrize("url", [
    "http://169.254.169.254./latest",
    "http://0.0.0.0./",
    "http://[fd00:ec2::254%25eth0]/",
    "http://[fd00:ec2::254%eth0]/",
    "http://[::%25lo]/",
])
def test_trailing_dot_and_zone_id_spellings_are_rejected(url):
    with pytest.raises(UnsafeOutboundUrlError, match="not allowed"):
        assert_safe_outbound_url(url)


def test_trailing_dot_on_ordinary_host_is_allowed():
    assert assert_safe_outbound_url("https://mcp.example.com./mcp") == "https://mcp.example.com./mcp"


@pytest.mark.parametrize("url", [
    "http://169\u3002254\u3002169\u3002254/",  # ideographic full stop
    "http://169\uff0e254\uff0e169\uff0e254/",  # fullwidth full stop
    "http://0\u30020\u30020\u30020/",
])
def test_unicode_dot_spellings_are_rejected(url):
    # httpx IDNA-normalizes these to the ASCII metadata/wildcard address.
    with pytest.raises(UnsafeOutboundUrlError, match="not allowed|not parseable"):
        assert_safe_outbound_url(url)


def test_unicode_hostname_is_allowed():
    assert assert_safe_outbound_url("https://bücher.example/mcp") == "https://bücher.example/mcp"
