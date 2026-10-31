"""Non-binary request bodies that are not valid UTF-8 (or UTF-16/32), or are JSON with a lone
surrogate, get a 400 (a JSON-RPC parse error on /v1/mcp), not a 500.

Self-contained: a small FastAPI app with the middleware, no live services."""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient
from pydantic import BaseModel

from middlewares.invalid_unicode import (
    INVALID_CHARACTER_DETAIL,
    InvalidUnicodeMiddleware,
    has_invalid_unicode,
)

LONE_SURROGATE = b'{"messages": [{"role": "user", "content": "hi \\ud83d"}]}'
JSON = {"content-type": "application/json"}


class Body(BaseModel):
    model: str


def _app(with_middleware: bool = True) -> FastAPI:
    app = FastAPI()
    if with_middleware:
        app.add_middleware(InvalidUnicodeMiddleware)

    @app.post("/echo")
    async def echo(request: Request):
        return await request.json()

    @app.post("/v1/chat/completions")
    async def typed(body: Body):
        return {"model": body.model}

    @app.post("/v1/mcp")
    async def mcp(request: Request):
        return await request.json()

    @app.post("/stream")
    async def stream(request: Request):
        payload = await request.json()

        async def gen():
            for i in range(3):
                yield f"data: {payload['n'] + i}\n\n"

        return StreamingResponse(gen(), media_type="text/event-stream")

    @app.get("/stream")
    async def stream_get():
        async def gen():
            for i in range(3):
                yield f"data: {i}\n\n"

        return StreamingResponse(gen(), media_type="text/event-stream")

    return app


@pytest.fixture
def client():
    return TestClient(_app(), raise_server_exceptions=False)


def test_without_middleware_lone_surrogate_is_a_500():
    # The bug this guards against: echoing the string cannot encode to UTF-8.
    bare = TestClient(_app(with_middleware=False), raise_server_exceptions=False)
    assert bare.post("/echo", content=LONE_SURROGATE, headers=JSON).status_code == 500


def test_lone_surrogate_is_400(client):
    res = client.post("/echo", content=LONE_SURROGATE, headers=JSON)
    assert res.status_code == 400
    assert res.json() == {"detail": INVALID_CHARACTER_DETAIL}


def test_lone_surrogate_in_a_key_is_400(client):
    res = client.post("/echo", content=b'{"\\udc00": 1}', headers=JSON)
    assert res.status_code == 400


def test_lone_surrogate_on_typed_v1_route_uses_detail_format(client):
    res = client.post(
        "/v1/chat/completions", content=b'{"model": "gpt\\uDFFF"}', headers=JSON
    )
    assert res.status_code == 400
    assert res.json() == {"detail": INVALID_CHARACTER_DETAIL}


def test_mcp_jsonrpc_gets_a_jsonrpc_parse_error(client):
    res = client.post(
        "/v1/mcp", content=b'{"jsonrpc": "2.0", "id": 1, "method": "\\ud800"}', headers=JSON
    )
    assert res.status_code == 200
    assert res.json() == {
        "jsonrpc": "2.0",
        "id": None,
        "error": {"code": -32700, "message": INVALID_CHARACTER_DETAIL},
    }


def test_invalid_utf8_bytes_are_400(client):
    res = client.post("/echo", content=b'{"a": "\xff\xfe"}', headers=JSON)
    assert res.status_code == 400
    assert res.json() == {"detail": INVALID_CHARACTER_DETAIL}


def test_no_content_type_is_checked(client):
    res = client.post("/echo", content=LONE_SURROGATE)
    assert res.status_code == 400


def test_json_suffix_content_type_is_checked(client):
    res = client.post(
        "/echo", content=LONE_SURROGATE, headers={"content-type": "application/vnd.x+json; charset=utf-8"}
    )
    assert res.status_code == 400


@pytest.mark.parametrize(
    "raw,expected",
    [
        (b'{"a": "\\ud83d\\ude00"}', {"a": "\U0001f600"}),  # valid surrogate pair
        (b'{"a": "\\\\ud83d"}', {"a": "\\ud83d"}),  # escaped backslash, not an escape
        ('{"a": "café 中"}'.encode(), {"a": "café 中"}),
        (b'{"a": "\\u00e9"}', {"a": "é"}),
    ],
)
def test_valid_bodies_pass_through(client, raw, expected):
    res = client.post("/echo", content=raw, headers=JSON)
    assert res.status_code == 200
    assert res.json() == expected


def test_invalid_json_is_left_to_the_route(client):
    # Not our concern: the typed route keeps its own 422 validation error.
    res = client.post("/v1/chat/completions", content=b'{"model": "\\ud83d', headers=JSON)
    assert res.status_code == 422


def test_empty_body_is_not_invalid():
    assert not has_invalid_unicode(b"")


def test_streaming_responses_pass_through(client):
    with client.stream("POST", "/stream", json={"n": 5}) as res:
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("text/event-stream")
        body = "".join(res.iter_text())
    assert body == "data: 5\n\ndata: 6\n\ndata: 7\n\n"

    with client.stream("GET", "/stream") as res:
        assert "".join(res.iter_text()) == "data: 0\n\ndata: 1\n\ndata: 2\n\n"


def _run_asgi(app, chunks):
    """Drive the middleware with a body split across several receive() calls."""
    messages = [
        {"type": "http.request", "body": c, "more_body": i < len(chunks) - 1}
        for i, c in enumerate(chunks)
    ]
    sent = []

    async def receive():
        return messages.pop(0) if messages else {"type": "http.disconnect"}

    async def send(message):
        sent.append(message)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/echo",
        "raw_path": b"/echo",
        "query_string": b"",
        "root_path": "",
        "headers": [(b"content-type", b"application/json")],
        "client": ("test", 1),
        "server": ("test", 80),
    }
    asyncio.run(InvalidUnicodeMiddleware(app)(scope, receive, send))
    status = next(m["status"] for m in sent if m["type"] == "http.response.start")
    body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    return status, body


def test_chunked_body_is_reassembled_and_replayed():
    inner = _app(with_middleware=False)
    # Split inside the escape so a per-chunk check would miss it.
    status, _ = _run_asgi(inner, [LONE_SURROGATE[:30], LONE_SURROGATE[30:]])
    assert status == 400

    good = b'{"a": "\\ud83d\\ude00", "b": 1}'
    status, body = _run_asgi(inner, [good[:10], good[10:20], good[20:]])
    assert status == 200
    assert body == '{"a":"\U0001f600","b":1}'.encode()


def test_gateway_app_registers_the_middleware():
    import app as gateway_app

    classes = [m.cls for m in gateway_app.app.user_middleware]
    assert InvalidUnicodeMiddleware in classes


@pytest.mark.parametrize("encoding", ["utf-16", "utf-16-le", "utf-32"])
def test_utf16_and_utf32_json_pass_through(client, encoding):
    # json.loads(bytes) detects these, so the route accepted them before.
    raw = json.dumps({"a": "é \U0001f600"}, ensure_ascii=False).encode(encoding)
    res = client.post("/echo", content=raw, headers=JSON)
    assert res.status_code == 200
    assert res.json() == {"a": "é \U0001f600"}


def test_utf16_lone_surrogate_is_400(client):
    res = client.post("/echo", content='{"a": "\\ud83d"}'.encode("utf-16"), headers=JSON)
    assert res.status_code == 400


def test_deeply_nested_body_does_not_raise_in_the_check():
    body = b'{"a": "\\ud83d", "b": ' + b"[" * 100000 + b"]" * 100000 + b"}"
    assert has_invalid_unicode(body) is False


@pytest.mark.parametrize(
    "content_type",
    ["text/plain", "application/x-www-form-urlencoded", "application/x-json", "application/xml", "*/*", ""],
)
def test_other_content_types_are_checked(client, content_type):
    # Routes call request.json() whatever the content type says.
    res = client.post("/echo", content=LONE_SURROGATE, headers={"content-type": content_type})
    assert res.status_code == 400


@pytest.mark.parametrize(
    "raw,invalid",
    [
        (b'{"a": "\\ude00"}', True),  # lone low
        (b'{"a": "\\ud83d\\u0041"}', True),  # high followed by a non-low escape
        (b'{"a": "\\ud83dx\\ude00"}', True),  # pair split by a character
        (b'{"a": "\\ud83d\\ude00\\ud83d\\ude01"}', False),  # two pairs
        (b'{"a": "\\\\\\ud83d\\ude00"}', False),  # escaped backslash, then a pair
        (b'{"a": "\\\\ud83d\\udc00"}', True),  # escaped backslash, text "ud83d", then a lone low
        (b'{"a": "\\\\\\\\ud83d\\udc00"}', True),  # two escaped backslashes, same
        (b'{"a": "x\\\\ud800\\udfff y"}', True),  # escaped backslash, text, lone low
    ],
)
def test_surrogate_escape_scan(raw, invalid):
    assert has_invalid_unicode(raw) is invalid


@pytest.mark.parametrize(
    "content_type",
    [
        "application/octet-stream",
        "Image/PNG",
        "multipart/form-data; boundary=x",
        "audio/wav",
        "application/x-gzip",
        "application/msgpack",
        "font/woff2",
        "application/grpc-web+json",
    ],
)
def test_binary_content_types_are_not_inspected(content_type):
    app = FastAPI()
    app.add_middleware(InvalidUnicodeMiddleware)

    @app.post("/raw")
    async def raw(request: Request):
        return {"size": len(await request.body())}

    body = b"\xff\xfe binary"  # odd length: fails every text decode, so a check would 400 it
    assert has_invalid_unicode(body)
    res = TestClient(app).post("/raw", content=body, headers={"content-type": content_type})
    assert res.status_code == 200
    assert res.json() == {"size": len(body)}


def test_escaped_pairs_do_not_need_a_json_parse(monkeypatch):
    import middlewares.invalid_unicode as mod

    calls = []
    real_loads = mod._loads
    monkeypatch.setattr(mod, "_loads", lambda *a, **kw: calls.append(1) or real_loads(*a, **kw))
    assert has_invalid_unicode(b'{"a": "' + b"\\ud83d\\ude00" * 1000 + b'"}') is False
    assert calls == []
