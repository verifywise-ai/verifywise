"""SSRF hardening for admin-stored outbound URLs (MCP server addresses).

Port of the house policy in ``Servers/utils/safeOutboundUrl.ts``. An org admin
stores a URL and the gateway then calls it (discovery on save, tool calls), so
this is the single choke point that validates it first.

VerifyWise runs on-prem in many deployments, and MCP servers frequently sit on
10.x, 172.16.x, 192.168.x or localhost. Private IP space is therefore NOT
blocked, exactly as in the Express policy. What is refused:

  * non-http(s) schemes (file:, ftp:, gopher:, ...)
  * embedded credentials (``user:pass@host``), which leak into logs
  * cloud metadata endpoints (169.254.169.254, fd00:ec2::254) and kernel
    wildcards (0.0.0.0, ::), in any literal spelling of those addresses
    (decimal, hex, octal, IPv4-mapped, Unicode dots). Hostnames are not
    resolved, so a DNS name pointing at the metadata IP is not caught; this
    matches the Express policy and is an accepted residual risk.

Unlike the Express version, the path is kept exactly as entered: some MCP
servers mount at a slash-terminated path and redirect, and httpx does not
follow redirects.

Unlike the Express version, error messages never echo the raw URL: it may carry
a token in its query string.
"""

import ipaddress
import socket
from typing import Optional, Union
from urllib.parse import urlsplit

import httpx

_BLOCKED_HOSTS = frozenset({"169.254.169.254", "fd00:ec2::254", "0.0.0.0", "::"})
_BLOCKED_IPS = frozenset(ipaddress.ip_address(h) for h in _BLOCKED_HOSTS)


class UnsafeOutboundUrlError(ValueError):
    """The URL violates the outbound policy. The message is safe to show users."""


def _as_ip(host: str) -> Optional[Union[ipaddress.IPv4Address, ipaddress.IPv6Address]]:
    """The IP a hostname denotes, including the legacy IPv4 spellings
    (``2852039166``, ``0xa9fea9fe``, ``0``) that URL parsers normalize."""
    try:
        return ipaddress.ip_address(host)
    except ValueError:
        pass
    if ":" in host:
        return None
    try:
        return ipaddress.IPv4Address(socket.inet_aton(host))
    except (OSError, ValueError):
        return None


def _normalize_host(host: str) -> str:
    """Drop one trailing dot (``169.254.169.254.`` is the same host) and any
    IPv6 zone id (``%eth0``, or ``%25eth0`` as URL-encoded)."""
    if "%" in host:
        host = host.split("%", 1)[0]
    if host.endswith("."):
        host = host[:-1]
    return host


def _is_blocked(host: str) -> bool:
    host = _normalize_host(host)
    if host in _BLOCKED_HOSTS:
        return True
    ip = _as_ip(host)
    if ip is None:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return ip in _BLOCKED_IPS


def assert_safe_outbound_url(raw: str) -> str:
    """Validate ``raw`` and return it normalized (scheme and host lowercased;
    path, query and fragment preserved).

    Raises ``UnsafeOutboundUrlError`` on any violation; callers surface it as a
    400, not a 500.
    """
    if not isinstance(raw, str) or len(raw) == 0:
        raise UnsafeOutboundUrlError("URL is required")

    try:
        parts = urlsplit(raw)
        port = parts.port
        host = parts.hostname
    except ValueError:
        raise UnsafeOutboundUrlError("URL is not parseable") from None
    if not parts.scheme:
        raise UnsafeOutboundUrlError("URL is not parseable")

    if parts.scheme not in ("http", "https"):
        raise UnsafeOutboundUrlError(
            f"URL protocol '{parts.scheme}:' is not allowed (only http/https)"
        )

    if parts.username is not None or parts.password is not None or "@" in parts.netloc:
        raise UnsafeOutboundUrlError(
            "URL must not embed credentials (use the server's authentication fields)"
        )

    if not host:
        raise UnsafeOutboundUrlError("URL has no hostname")
    if _is_blocked(host):
        raise UnsafeOutboundUrlError(
            f"URL host '{host}' is not allowed (cloud metadata / wildcard target)"
        )

    netloc = f"[{host}]" if ":" in host else host
    if port is not None:
        netloc = f"{netloc}:{port}"
    query = f"?{parts.query}" if parts.query else ""
    fragment = f"#{parts.fragment}" if parts.fragment else ""
    normalized = f"{parts.scheme}://{netloc}{parts.path}{query}{fragment}"

    # httpx makes the actual request and parses the host its own way: IDNA
    # turns Unicode dots ("169\u3002254\u3002169\u3002254") into ASCII ones.
    # Check the host it will connect to as well, so the two parsers can't differ.
    try:
        request_host = httpx.URL(normalized).host
    except Exception:
        raise UnsafeOutboundUrlError("URL is not parseable") from None
    if _is_blocked(request_host):
        raise UnsafeOutboundUrlError(
            f"URL host '{request_host}' is not allowed (cloud metadata / wildcard target)"
        )
    return normalized
