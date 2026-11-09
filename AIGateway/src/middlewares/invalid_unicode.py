"""Reject request bodies that cannot be represented as UTF-8.

JSON lets a string carry a lone UTF-16 surrogate escape such as "\\ud83d".
``json.loads`` accepts it, but the resulting Python string cannot be encoded
as UTF-8, so the request later fails with UnicodeEncodeError (a 500) when a
route echoes it in a response, stores it in Postgres or logs it. A body that
is not valid UTF-8 at all fails the same way inside ``request.json()``.

Gateway routes call ``request.json()`` whatever the content type says, so
this middleware checks every request body except known binary types, once,
before any route runs, and answers 400 instead. It is plain ASGI (not
BaseHTTPMiddleware) so responses, streamed ones included, pass through
untouched; only the request body is buffered and replayed, which every JSON
route does anyway when it parses the body.
"""

import json
import re

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

INVALID_CHARACTER_DETAIL = "Request contains an invalid character"

# json.loads, as a module name the tests can watch without patching the stdlib.
_loads = json.loads

# Any \uXXXX escape in the surrogate range (D800–DFFF): the cheap first gate.
_SURROGATE_ESCAPE = re.compile(r"\\u[dD][89a-fA-F][0-9a-fA-F]{2}")

# Escaped backslashes and valid high+low escape pairs. Stripped left to right
# in one C-level pass, so a backslash pair is consumed before the "u" after
# it can be read as an escape ("\\\\ud83d\\udc00" is text plus a lone low
# surrogate, not a pair). A surrogate escape left after this is lone, or a
# false positive outside a string, and is confirmed with json.loads.
_ESCAPED_BACKSLASH_OR_PAIR = re.compile(
    r"\\\\|\\u[dD][89abAB][0-9a-fA-F]{2}\\u[dD][c-fC-F][0-9a-fA-F]{2}"
)

# Binary types no route parses as JSON. Every other body is checked, because
# the gateway's routes call request.json() whatever the content type says.
_BINARY_MEDIA_PREFIXES = (
    b"multipart/",
    b"application/octet-stream",
    b"application/gzip",
    b"application/x-gzip",
    b"application/zip",
    b"application/x-tar",
    b"application/pdf",
    b"application/protobuf",
    b"application/x-protobuf",
    b"application/grpc",
    b"application/msgpack",
    b"application/cbor",
    b"image/",
    b"audio/",
    b"video/",
    b"font/",
)

# The MCP JSON-RPC endpoint reports malformed input as a JSON-RPC parse error
# with HTTP 200 (routers/mcp_proxy.py); keep that contract for its clients.
_JSONRPC_PATHS = frozenset({"/v1/mcp"})

_BODY_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def _should_check_body(scope: Scope) -> bool:
    """Every body a route may parse with request.json(): all but known binary
    types, which pass through untouched."""
    if scope.get("method") not in _BODY_METHODS:
        return False
    for name, value in scope.get("headers", []):
        if name == b"content-type":
            media_type = value.split(b";", 1)[0].strip().lower()
            # gRPC frames even +json messages with a binary prefix, so every
            # application/grpc* type is skipped.
            return not media_type.startswith(_BINARY_MEDIA_PREFIXES)
    return True


def has_invalid_unicode(body: bytes) -> bool:
    """True when a body cannot be decoded in the encoding json.loads
    detects for it (UTF-8, or UTF-16/32 by its byte pattern), or decodes to a
    string that cannot be encoded as UTF-8 (a lone surrogate). A body that
    decodes but is not valid JSON is left for the route to reject in its own
    format, so a lone surrogate escape in it is not caught here."""
    if not body:
        return False
    try:
        text = body.decode(json.detect_encoding(body))
    except UnicodeDecodeError:
        return True
    if not _SURROGATE_ESCAPE.search(text):
        return False
    if not _SURROGATE_ESCAPE.search(_ESCAPED_BACKSLASH_OR_PAIR.sub("", text)):
        return False
    try:
        parsed = _loads(text)
    except (ValueError, RecursionError):
        # Not JSON this module can read: the route rejects it in its own format.
        return False
    try:
        json.dumps(parsed, ensure_ascii=False).encode("utf-8")
    except UnicodeEncodeError:
        return True
    return False


def _error_response(path: str) -> JSONResponse:
    if path in _JSONRPC_PATHS:
        return JSONResponse(
            content={
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": INVALID_CHARACTER_DETAIL},
            },
            status_code=200,
        )
    return JSONResponse(content={"detail": INVALID_CHARACTER_DETAIL}, status_code=400)


class InvalidUnicodeMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not _should_check_body(scope):
            await self.app(scope, receive, send)
            return

        chunks: list[bytes] = []
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return  # client went away before sending the whole body
            chunks.append(message.get("body", b""))
            if not message.get("more_body", False):
                break
        body = b"".join(chunks)
        del chunks

        if has_invalid_unicode(body):
            await _error_response(scope.get("path", ""))(scope, receive, send)
            return

        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
