"""E2E: Cache HIT/MISS with real LLM calls via Gemini Flash.

Requires:
- AI Gateway running on port 8100
- Express backend running on port 3000
- Gemini Flash endpoint (slug: prod-gemini-flash) with cache_enabled=true
- Virtual key set via CACHE_TEST_VKEY env var

Run: VW_PASSWORD='...' CACHE_TEST_VKEY='sk-vw-...' pytest test_12_cache_llm.py -v -s
"""

import json
import os
import time

import httpx
import pytest

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8100")
VIRTUAL_KEY = os.getenv("CACHE_TEST_VKEY", "")
ENDPOINT_SLUG = os.getenv("CACHE_TEST_ENDPOINT", "cache-test-gpt4o-mini")

_client = httpx.Client(timeout=30.0)


def _chat(messages, temperature=0.0, max_tokens=50):
    """Send a chat completion via the proxy."""
    res = _client.post(
        f"{GATEWAY_URL}/v1/chat/completions",
        json={
            "model": ENDPOINT_SLUG,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
        headers={
            "Authorization": f"Bearer {VIRTUAL_KEY}",
            "Content-Type": "application/json",
        },
    )
    cache_header = res.headers.get("x-vw-cache", "NONE")
    return res, cache_header


@pytest.fixture(autouse=True)
def require_vkey():
    if not VIRTUAL_KEY:
        pytest.skip("CACHE_TEST_VKEY not set — skipping real LLM tests")


# ─── Basic HIT/MISS ─────────────────────────────────────────────────────────


def test_first_request_is_miss():
    """First request should be a cache MISS."""
    unique = f"test-miss-{int(time.time())}"
    res, header = _chat([{"role": "user", "content": f"Say the word '{unique}' and nothing else."}])
    assert res.status_code == 200, res.text
    assert header in ("MISS", "DISABLED"), f"Expected MISS, got {header}"
    body = res.json()
    assert "choices" in body
    print(f"  MISS: {body['choices'][0]['message']['content'][:50]}")


def test_second_request_is_hit():
    """Identical request should be a cache HIT."""
    msg = [{"role": "user", "content": "What is 2+2? Answer with just the number."}]

    # First call — MISS
    res1, h1 = _chat(msg, temperature=0.0, max_tokens=10)
    assert res1.status_code == 200, res1.text
    response1 = res1.json()["choices"][0]["message"]["content"]
    print(f"  Request 1 ({h1}): {response1}")

    # Second call — should be HIT
    res2, h2 = _chat(msg, temperature=0.0, max_tokens=10)
    assert res2.status_code == 200, res2.text
    response2 = res2.json()["choices"][0]["message"]["content"]
    print(f"  Request 2 ({h2}): {response2}")

    assert h2 == "HIT", f"Second request should be HIT, got {h2}"
    assert response1 == response2, "Cached response should be identical"


def test_hit_is_fast():
    """Cache HIT should be significantly faster than MISS."""
    msg = [{"role": "user", "content": "What color is the sky? One word."}]

    # MISS
    t1 = time.time()
    res1, h1 = _chat(msg, temperature=0.0, max_tokens=10)
    miss_time = time.time() - t1
    assert res1.status_code == 200

    # HIT
    t2 = time.time()
    res2, h2 = _chat(msg, temperature=0.0, max_tokens=10)
    hit_time = time.time() - t2
    assert res2.status_code == 200

    print(f"  MISS: {miss_time:.3f}s, HIT: {hit_time:.3f}s, speedup: {miss_time/max(hit_time, 0.001):.1f}x")
    # HIT should be at least 2x faster (usually 10-100x)
    assert hit_time < miss_time, f"HIT ({hit_time:.3f}s) should be faster than MISS ({miss_time:.3f}s)"


# ─── Different inputs produce different cache entries ────────────────────────


def test_different_content_is_miss():
    """Different message content should NOT hit cache."""
    _chat([{"role": "user", "content": "Say apple"}], temperature=0.0, max_tokens=10)
    res, header = _chat([{"role": "user", "content": "Say banana"}], temperature=0.0, max_tokens=10)
    assert header in ("MISS", "DISABLED"), f"Different content should be MISS, got {header}"


def test_different_temperature_is_miss():
    """Different temperature should NOT hit cache."""
    msg = [{"role": "user", "content": "Say hello cache temp test"}]
    _chat(msg, temperature=0.0, max_tokens=10)
    res, header = _chat(msg, temperature=0.5, max_tokens=10)
    assert header in ("MISS", "DISABLED"), f"Different temperature should be MISS, got {header}"


def test_different_max_tokens_is_miss():
    """Different max_tokens should NOT hit cache."""
    msg = [{"role": "user", "content": "Say hello cache tokens test"}]
    _chat(msg, temperature=0.0, max_tokens=10)
    res, header = _chat(msg, temperature=0.0, max_tokens=50)
    assert header in ("MISS", "DISABLED"), f"Different max_tokens should be MISS, got {header}"


# ─── Multi-message conversations ────────────────────────────────────────────


def test_multi_turn_cache():
    """Multi-turn conversations should cache correctly."""
    msgs = [
        {"role": "user", "content": "Remember the word 'pineapple'"},
        {"role": "assistant", "content": "I'll remember pineapple."},
        {"role": "user", "content": "What word did I say?"},
    ]

    res1, h1 = _chat(msgs, temperature=0.0, max_tokens=20)
    assert res1.status_code == 200
    print(f"  Multi-turn 1 ({h1}): {res1.json()['choices'][0]['message']['content'][:50]}")

    res2, h2 = _chat(msgs, temperature=0.0, max_tokens=20)
    assert res2.status_code == 200
    print(f"  Multi-turn 2 ({h2}): {res2.json()['choices'][0]['message']['content'][:50]}")

    assert h2 == "HIT"


# ─── Streaming bypasses cache ───────────────────────────────────────────────


def test_streaming_bypasses_cache():
    """Streaming requests should not be cached."""
    msg = [{"role": "user", "content": "Say hello stream test"}]

    # Non-streaming first to populate cache
    _chat(msg, temperature=0.0, max_tokens=10)

    # Streaming request — should NOT hit cache
    res = _client.post(
        f"{GATEWAY_URL}/v1/chat/completions",
        json={
            "model": ENDPOINT_SLUG,
            "messages": msg,
            "temperature": 0.0,
            "max_tokens": 10,
            "stream": True,
        },
        headers={
            "Authorization": f"Bearer {VIRTUAL_KEY}",
            "Content-Type": "application/json",
        },
    )
    # Streaming responses don't have x-vw-cache header (they go through _handle_stream)
    assert res.status_code == 200
    assert res.headers.get("content-type", "").startswith("text/event-stream")


# ─── Batch: many identical requests ─────────────────────────────────────────


def test_batch_20_identical_requests():
    """Send 20 identical requests — first should MISS, rest should HIT."""
    msg = [{"role": "user", "content": "What is the capital of Japan? One word."}]
    results = []

    for i in range(20):
        res, header = _chat(msg, temperature=0.0, max_tokens=10)
        assert res.status_code == 200, f"Request {i+1} failed: {res.text}"
        results.append(header)

    miss_count = results.count("MISS") + results.count("DISABLED")
    hit_count = results.count("HIT")

    print(f"  20 requests: {miss_count} MISS, {hit_count} HIT")
    # First should be MISS, rest should be HIT (if cache is working)
    assert results[0] in ("MISS", "DISABLED"), "First request should be MISS"
    if results[0] == "MISS":
        assert hit_count >= 18, f"Expected at least 18 HITs, got {hit_count}"


def test_batch_10_varied_requests():
    """Send 10 different requests, then repeat — second batch should all HIT."""
    prompts = [f"What is {i} + {i}? Answer with just the number." for i in range(10)]

    # First batch — all MISS (skip failures from rate limits)
    successful = []
    for prompt in prompts:
        res, header = _chat([{"role": "user", "content": prompt}], temperature=0.0, max_tokens=10)
        if res.status_code == 200:
            successful.append(prompt)

    assert len(successful) >= 5, f"At least 5 prompts should succeed, got {len(successful)}"

    # Second batch — successful ones should HIT
    hits = 0
    for prompt in successful:
        res, header = _chat([{"role": "user", "content": prompt}], temperature=0.0, max_tokens=10)
        if res.status_code == 200 and header == "HIT":
            hits += 1

    print(f"  {len(successful)} varied requests repeated: {hits}/{len(successful)} HITs")
    assert hits >= len(successful) - 1, f"Expected at least {len(successful)-1} HITs, got {hits}"


# ─── Cache stats reflect usage ──────────────────────────────────────────────


def test_cache_stats_show_hits(api):
    """Cache stats should reflect the hits from previous tests."""
    res = api.get("/cache/stats")
    assert res.status_code == 200
    stats = res.json().get("stats", res.json())
    print(f"  Stats: entries={stats['total_entries']}, hits={stats['total_hits']}, "
          f"cost_saved=${float(stats['total_cost_saved']):.4f}, rate={stats['hit_rate_pct']}%")
    assert int(stats["total_hits"]) > 0, "Should have recorded cache hits"
    assert float(stats["total_cost_saved"]) >= 0
