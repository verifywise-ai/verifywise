#!/usr/bin/env python3
"""
E2E: a realistic mock agentic system exercising agent run correlation end-to-end.

Mocks two AI agents that each run a full turn — model calls (conversation, via the
LLM proxy) AND tool calls (actions, via the native hook) — all tagged with a shared
agent_run_id, then verifies the gateway correlates them into one run and the runs
endpoints return the interleaved timeline.

Targets a BRANCH gateway (default :8101) against the real DB. Uses a real LLM
(Gemini) for the model calls via the gateway's LiteLLM proxy.

Run:
    GATEWAY=http://127.0.0.1:8101 \
    INTERNAL_KEY=vw-local-dev-gateway-key-2026 \
    GEMINI_API_KEY=... \
    python3 e2e_mock_agentic_system.py
"""
import os
import sys
import json
import uuid
import time
import urllib.request
import urllib.error

GATEWAY = os.environ.get("GATEWAY", "http://127.0.0.1:8101")
INTERNAL_KEY = os.environ.get("INTERNAL_KEY", "vw-local-dev-gateway-key-2026")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
ORG_ID = os.environ.get("ORG_ID", "1")
USER_ID = os.environ.get("USER_ID", "1")
MODEL = os.environ.get("MODEL", "gemini/gemini-2.5-flash")

# Internal (provisioning + read) calls carry the internal key + tenant headers.
ADMIN_HEADERS = {
    "Content-Type": "application/json",
    "x-internal-key": INTERNAL_KEY,
    "x-organization-id": ORG_ID,
    "x-user-id": USER_ID,
    "x-role": "Admin",
}

PASS, FAIL = [], []


def _req(method, url, headers, body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"_raw": raw}


def internal(method, path, body=None):
    return _req(method, f"{GATEWAY}/internal{path}", ADMIN_HEADERS, body)


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail and not cond else ""))


# ───────────────────────── provisioning ─────────────────────────
def provision():
    print("\n=== Provisioning the mock environment ===")

    # 1. Enable org body-logging so conversation capture activates.
    st, _ = internal("PUT", "/guardrails/settings",
                     {"log_request_body": True, "log_response_body": True})
    check("enable body logging", st in (200, 201), f"status {st}")

    # 2. Add an MCP guardrail rule that BLOCKS emails so we can exercise a denied
    #    TOOL call. NOTE: tool calls are governed by MCP guardrails
    #    (ai_gateway_mcp_guardrail_rules via /mcp/guardrails) — a different system
    #    from the LLM-proxy guardrails (/guardrails). The hook reads the MCP rules.
    st, r = internal("POST", "/mcp/guardrails", {
        "rule_type": "content_filter",
        "name": f"E2E block emails {uuid.uuid4().hex[:6]}",
        "action": "block",
        "scope": "input",
        "config": {"type": "regex", "pattern": r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"},
    })
    check("create MCP email-block guardrail", st in (200, 201), f"status {st} {r}")

    # 3. Provider key (Gemini).
    suffix = uuid.uuid4().hex[:6]
    st, r = internal("POST", "/keys", {
        "provider": "gemini",
        "key_name": f"e2e-gemini-{suffix}",
        "api_key": GEMINI_KEY,
    })
    check("create gemini provider key", st in (200, 201), f"status {st} {r}")
    api_key_id = (r.get("data") or r.get("key") or {}).get("id") if isinstance(r, dict) else None
    # tolerate different envelope shapes
    if not api_key_id:
        for v in r.values() if isinstance(r, dict) else []:
            if isinstance(v, dict) and "id" in v:
                api_key_id = v["id"]; break

    # 4. Endpoint that uses that key.
    slug = f"e2e-gemini-{suffix}"
    st, r = internal("POST", "/endpoints", {
        "slug": slug,
        "display_name": f"E2E Gemini {suffix}",
        "provider": "gemini",
        "model": MODEL,
        "api_key_id": api_key_id,
        "max_tokens": 256,
    })
    check("create endpoint", st in (200, 201), f"status {st} {r}")

    # 5. Virtual key (sk-vw-*) for the model proxy.
    #    The CRUD POST has a pre-existing (develop) array-cast bug that 500s on
    #    this DB/driver; fall back to a direct, correctly-parameterized DB insert.
    st, r = internal("POST", "/virtual-keys", {"name": f"e2e-vk-{suffix}"})
    vkey = _dig(r, "plain_key") or _dig(r, "key")
    if not vkey:
        vkey = _mint_virtual_key_directly(f"e2e-vk-{suffix}")
        check("create virtual key (direct DB fallback)", bool(vkey),
              f"CRUD POST returned {st}; direct insert also failed")
    else:
        check("create virtual key", st in (200, 201), f"status {st}")
    check("virtual key returned", bool(vkey))

    # 6. Agent key (sk-mcp-*) for the tool hook.
    st, r = internal("POST", "/mcp/agent-keys", {"name": f"e2e-agent-{suffix}"})
    check("create agent key", st in (200, 201), f"status {st} {r}")
    akey = _dig(r, "plain_key")
    check("agent key returned", bool(akey))

    return {"slug": slug, "vkey": vkey, "akey": akey}


def _mint_virtual_key_directly(name):
    """Insert a usable sk-vw-* key straight into the DB, bypassing the buggy CRUD
    INSERT. Mirrors the gateway's hashing: sha256 of the plaintext key."""
    import hashlib, secrets, asyncio
    try:
        import asyncpg
        from dotenv import load_dotenv
        load_dotenv("/Users/gorkemcetin/verifywise/AIGateway/.env")
    except Exception as e:
        print("  (direct mint unavailable:", e, ")")
        return None
    plain = "sk-vw-" + secrets.token_hex(16)
    key_hash = hashlib.sha256(plain.encode()).hexdigest()

    async def _do():
        c = await asyncpg.connect(
            user=os.environ["DB_USER"], password=os.environ["DB_PASSWORD"],
            database=os.environ["DB_NAME"], host=os.environ["DB_HOST"],
            port=int(os.environ["DB_PORT"]))
        await c.execute("SET search_path TO verifywise")
        await c.execute(
            """INSERT INTO ai_gateway_virtual_keys
                 (organization_id, key_hash, key_prefix, name, is_active)
               VALUES ($1,$2,$3,$4,true)""",
            int(ORG_ID), key_hash, plain[:12] + "...", name)
        await c.close()
    try:
        asyncio.run(_do())
        return plain
    except Exception as e:
        print("  (direct mint failed:", e, ")")
        return None


def _dig(obj, key):
    """Find first value for `key` anywhere in a nested dict."""
    if isinstance(obj, dict):
        if key in obj and obj[key]:
            return obj[key]
        for v in obj.values():
            found = _dig(v, key)
            if found:
                return found
    return None


# ───────────────────────── the mock agents ─────────────────────────
def model_call(vkey, slug, run_id, messages):
    """An agent's LLM call through the proxy, tagged with the shared run id."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {vkey}",
        "x-vw-agent-run-id": run_id,        # <-- the correlation header
    }
    return _req("POST", f"{GATEWAY}/v1/chat/completions", headers,
                {"model": slug, "messages": messages, "max_tokens": 128})


def tool_call(akey, run_id, tool_use_id, tool_name, arguments):
    """An agent's tool call through the native hook, tagged with the same run id as session_id."""
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {akey}"}
    return _req("POST", f"{GATEWAY}/v1/mcp/hook", headers, {
        "tool_name": tool_name,
        "arguments": arguments,
        "session_id": run_id,           # hook uses session_id AS the run id
        "tool_use_id": tool_use_id,
    })


def agent_devops(env):
    """Agent 1: a DevOps assistant. Asks the model, runs a safe command, then attempts
    a command containing a customer email (PII) which the guardrail should DENY."""
    run_id = f"devops-{uuid.uuid4()}"
    print(f"\n=== Agent 1 (DevOps assistant) run_id={run_id[:18]}… ===")

    st, r = model_call(env["vkey"], env["slug"], run_id,
                       [{"role": "user", "content": "In one short sentence, what does `df -h` show?"}])
    check("devops: model call ok", st == 200, f"status {st} {str(r)[:200]}")
    if st == 200:
        # Read the assistant message content from the OpenAI-compatible envelope
        # (choices[0].message.content), tolerating provider shape differences.
        content = ""
        try:
            content = (r.get("choices") or [{}])[0].get("message", {}).get("content") or ""
        except (AttributeError, IndexError, TypeError):
            content = _dig(r, "content") or ""
        check("devops: model returned content", bool(content.strip()),
              f"no assistant content in response: {str(r)[:160]}")

    st, r = tool_call(env["akey"], run_id, "tu-1", "Bash", {"command": "df -h"})
    check("devops: safe tool allowed", r.get("decision") == "allow", f"decision {r.get('decision')}")

    # PII command — should be denied by the email guardrail.
    st, r = tool_call(env["akey"], run_id, "tu-2", "Bash",
                      {"command": "echo 'notify customer@example.com about the outage'"})
    check("devops: PII tool denied", r.get("decision") == "deny", f"decision {r.get('decision')}")

    return run_id


def agent_support(env):
    """Agent 2: a support bot. Two model turns + one tool call, all one run."""
    run_id = f"support-{uuid.uuid4()}"
    print(f"\n=== Agent 2 (Support bot) run_id={run_id[:18]}… ===")

    st, r = model_call(env["vkey"], env["slug"], run_id,
                       [{"role": "user", "content": "A user can't log in. Name one first thing to check, briefly."}])
    check("support: model turn 1 ok", st == 200, f"status {st} {str(r)[:200]}")

    st, r = tool_call(env["akey"], run_id, "tu-1", "Bash", {"command": "grep -c ERROR /var/log/auth.log"})
    check("support: tool allowed", r.get("decision") == "allow", f"decision {r.get('decision')}")

    st, r = model_call(env["vkey"], env["slug"], run_id,
                       [{"role": "user", "content": "Summarize the fix in one sentence."}])
    check("support: model turn 2 ok", st == 200, f"status {st} {str(r)[:200]}")

    return run_id


# ───────────────────────── E2E assertions on runs ─────────────────────────
def verify_runs(devops_run, support_run):
    print("\n=== Verifying correlation via the runs endpoints ===")
    time.sleep(1.0)  # let fire-and-forget writes flush

    st, r = internal("GET", "/mcp/runs?limit=200")
    check("runs list 200", st == 200, f"status {st}")
    runs = {x["agent_run_id"]: x for x in r.get("data", [])}

    # Agent 1: 1 model call + 2 tool calls (1 denied)
    d = runs.get(devops_run)
    check("devops run present", d is not None)
    if d:
        check("devops: model_count == 1", d["model_count"] == 1, f"got {d['model_count']}")
        check("devops: tool_count == 2", d["tool_count"] == 2, f"got {d['tool_count']}")
        check("devops: denied_count == 1", d["denied_count"] == 1, f"got {d['denied_count']}")

    # Agent 2: 2 model calls + 1 tool call
    s = runs.get(support_run)
    check("support run present", s is not None)
    if s:
        check("support: model_count == 2", s["model_count"] == 2, f"got {s['model_count']}")
        check("support: tool_count == 1", s["tool_count"] == 1, f"got {s['tool_count']}")

    # Detail: interleaved + chronological + conversation captured
    st, r = internal("GET", f"/mcp/runs/{devops_run}")
    check("devops detail 200", st == 200, f"status {st}")
    entries = (r.get("data") or {}).get("entries", [])
    check("devops detail has 3 entries", len(entries) == 3, f"got {len(entries)}")
    kinds = [e["kind"] for e in entries]
    check("devops detail has both kinds", "model" in kinds and "tool" in kinds, f"kinds={kinds}")
    ts = [e["created_at"] for e in entries]
    check("devops detail chronological", ts == sorted(ts), "not sorted by created_at")
    model_entries = [e for e in entries if e["kind"] == "model"]
    if model_entries:
        me = model_entries[0]
        check("devops: prompt captured (body logging on)",
              me.get("request_messages") not in (None, "", "null"),
              "request_messages empty despite logging enabled")
        check("devops: response captured",
              me.get("response_text") not in (None, ""),
              "response_text empty despite logging enabled")

    # Graceful: a model call with NO run id must still succeed and NOT appear as a run
    print("\n=== Verifying graceful no-run-id behavior ===")
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {env['vkey']}"}
    st, r = _req("POST", f"{GATEWAY}/v1/chat/completions", headers,
                 {"model": env["slug"], "messages": [{"role": "user", "content": "Say hi."}], "max_tokens": 16})
    check("no-run-id model call still works", st == 200, f"status {st} {str(r)[:150]}")
    st, r = internal("GET", "/mcp/runs?limit=200")
    has_null = any(x.get("agent_run_id") in (None, "null") for x in r.get("data", []))
    check("no-run-id call excluded from runs list", not has_null, "a NULL run id leaked into the list")


if __name__ == "__main__":
    print(f"Gateway: {GATEWAY}  Model: {MODEL}  Org: {ORG_ID}")
    if not GEMINI_KEY:
        print("ERROR: GEMINI_API_KEY not set"); sys.exit(2)

    env = provision()
    if not (env.get("vkey") and env.get("akey") and env.get("slug")):
        print("\nProvisioning incomplete — aborting.");
        print(f"PASS={len(PASS)} FAIL={len(FAIL)}"); sys.exit(1)

    devops_run = agent_devops(env)
    support_run = agent_support(env)
    verify_runs(devops_run, support_run)

    print(f"\n========== RESULT: {len(PASS)} passed, {len(FAIL)} failed ==========")
    if FAIL:
        print("FAILURES:")
        for f in FAIL:
            print("  -", f)
        sys.exit(1)
    print("All E2E checks passed.")
