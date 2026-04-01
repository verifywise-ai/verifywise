from conftest import set_state, get_state
"""E2E: Prompt Management"""

import pytest



def test_create_prompt(api):
    """Create a prompt."""
    import time
    slug = f"e2e-test-prompt-{int(time.time())}"
    set_state("e2e_prompt_slug", slug)
    res = api.post("/prompts", json={
        "name": "E2E Test Prompt",
        "slug": slug,
        "description": "A test prompt for E2E",
    })
    assert res.status_code == 201, res.text
    set_state("e2e_prompt_id", res.json()["data"]["id"])


def test_list_prompts(api):
    """List prompts — should include ours."""
    res = api.get("/prompts")
    assert res.status_code == 200
    slugs = [p["slug"] for p in res.json()["data"]]
    expected_slug = get_state("e2e_prompt_slug", "e2e-test-prompt")
    assert expected_slug in slugs


def test_create_prompt_version(api):
    """Create a version for the prompt."""
    pid = get_state("e2e_prompt_id", None)
    if not pid:
        pytest.skip("No prompt")
    res = api.post(f"/prompts/{pid}/versions", json={
        "content": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello {{name}}!"},
        ],
        "model": "openai/gpt-4o-mini",
        "commit_message": "Initial version",
    })
    assert res.status_code == 201, res.text
    set_state("e2e_version_id", res.json()["data"]["id"])


def test_list_versions(api):
    """List versions — should have version 1."""
    pid = get_state("e2e_prompt_id", None)
    if not pid:
        pytest.skip("No prompt")
    res = api.get(f"/prompts/{pid}/versions")
    assert res.status_code == 200
    versions = res.json()["data"]
    assert len(versions) >= 1
    assert versions[0]["version"] == 1


def test_publish_version(api):
    """Publish a version."""
    pid = get_state("e2e_prompt_id", None)
    vid = get_state("e2e_version_id", None)
    if not pid or not vid:
        pytest.skip("No prompt/version")
    # Get version number
    res = api.get(f"/prompts/{pid}/versions")
    v_num = res.json()["data"][0]["version"]
    res = api.post(f"/prompts/{pid}/versions/{v_num}/publish")
    assert res.status_code == 200


def test_cleanup_prompt(api):
    """Delete test prompt."""
    pid = get_state("e2e_prompt_id", None)
    if pid:
        res = api.delete(f"/prompts/{pid}")
        assert res.status_code == 200
