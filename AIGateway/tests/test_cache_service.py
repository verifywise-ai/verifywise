import sys
import os

# Add src to path so imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from services.cache_service import generate_cache_key


def test_same_input_same_hash():
    key1 = generate_cache_key("gpt-4o", [{"role": "user", "content": "hello"}], 0.7, 1000)
    key2 = generate_cache_key("gpt-4o", [{"role": "user", "content": "hello"}], 0.7, 1000)
    assert key1 == key2


def test_different_model_different_hash():
    key1 = generate_cache_key("gpt-4o", [{"role": "user", "content": "hello"}], 0.7, 1000)
    key2 = generate_cache_key("claude-sonnet-4-20250514", [{"role": "user", "content": "hello"}], 0.7, 1000)
    assert key1 != key2


def test_different_messages_different_hash():
    key1 = generate_cache_key("gpt-4o", [{"role": "user", "content": "hello"}], 0.7, 1000)
    key2 = generate_cache_key("gpt-4o", [{"role": "user", "content": "world"}], 0.7, 1000)
    assert key1 != key2


def test_different_temperature_different_hash():
    key1 = generate_cache_key("gpt-4o", [{"role": "user", "content": "hello"}], 0.7, 1000)
    key2 = generate_cache_key("gpt-4o", [{"role": "user", "content": "hello"}], 0.0, 1000)
    assert key1 != key2


def test_none_temperature_uses_default():
    key1 = generate_cache_key("gpt-4o", [{"role": "user", "content": "hello"}], None, 1000)
    key2 = generate_cache_key("gpt-4o", [{"role": "user", "content": "hello"}], None, 1000)
    assert key1 == key2


def test_hash_is_64_char_hex():
    key = generate_cache_key("gpt-4o", [{"role": "user", "content": "hello"}], 0.7, 1000)
    assert len(key) == 64
    assert all(c in "0123456789abcdef" for c in key)


def test_system_prompt_included_in_hash():
    msgs1 = [{"role": "system", "content": "You are helpful"}, {"role": "user", "content": "hello"}]
    msgs2 = [{"role": "system", "content": "You are rude"}, {"role": "user", "content": "hello"}]
    assert generate_cache_key("gpt-4o", msgs1, 0.7, 1000) != generate_cache_key("gpt-4o", msgs2, 0.7, 1000)


def test_different_max_tokens_different_hash():
    key1 = generate_cache_key("gpt-4o", [{"role": "user", "content": "hello"}], 0.7, 1000)
    key2 = generate_cache_key("gpt-4o", [{"role": "user", "content": "hello"}], 0.7, 4096)
    assert key1 != key2
