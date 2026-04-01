"""
Custom Scorer Executor - Runs LLM judge scorers from database configs

This module connects the scorer configs stored in the database (via web UI)
to actual execution using OpenAI or other LLM providers.

Supports multiple providers: OpenAI, Anthropic, Mistral, xAI, Google (Gemini), etc.
"""

import re
import os
import json
from typing import Dict, Any, List, Optional, Tuple, Union
from dataclasses import dataclass

# OpenAI client (used for OpenAI-compatible APIs)
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


@dataclass
class ScorerResult:
    """Result from running a custom scorer."""
    scorer_id: str
    scorer_name: str
    label: str
    score: float
    raw_response: str
    passed: bool
    reason: Optional[str] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None


_PLACEHOLDER_PATTERN = re.compile(r"{{\s*([a-zA-Z0-9_]+)\s*}}")


# Provider detection and configuration
PROVIDER_CONFIG = {
    "openai": {
        "env_var": "OPENAI_API_KEY",
        "base_url": None,  # Use default
    },
    "anthropic": {
        "env_var": "ANTHROPIC_API_KEY",
        "base_url": "https://api.anthropic.com/v1",
    },
    "mistral": {
        "env_var": "MISTRAL_API_KEY",
        "base_url": "https://api.mistral.ai/v1",
    },
    "xai": {
        "env_var": "XAI_API_KEY",
        "base_url": "https://api.x.ai/v1",
    },
    "google": {
        "env_var": "GEMINI_API_KEY",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
    },
    "gemini": {
        "env_var": "GEMINI_API_KEY",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
    },
    "huggingface": {
        "env_var": "HF_API_KEY",
        "base_url": "https://api-inference.huggingface.co/v1",
    },
    "self-hosted": {
        "env_var": None,
        "base_url": None,
    },
}

def get_provider_from_config(judge_model_config: Any) -> Tuple[str, Optional[str], Optional[str]]:
    """
    Get the provider, endpoint URL, and API key from the judge model configuration.

    The user explicitly selects both provider and model in the UI,
    so we use the provider from the config directly.

    Args:
        judge_model_config: The judgeModel config - can be dict or string

    Returns:
        Tuple of (provider, endpoint_url, api_key)
    """
    if isinstance(judge_model_config, dict):
        provider = (judge_model_config.get("provider") or "openai").lower()
        endpoint_url = judge_model_config.get("endpointUrl")
        api_key = judge_model_config.get("apiKey")
        return provider, endpoint_url, api_key

    return "openai", None, None


def get_provider_client(
    provider: str,
    endpoint_url: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Tuple[Any, str]:
    """
    Get the appropriate API client and key for a provider.

    Args:
        provider: Provider name (e.g., "openai", "mistral", "self-hosted")
        endpoint_url: Optional base URL override (required for self-hosted)
        api_key: Optional API key override from config

    Returns:
        Tuple of (OpenAI client, api_key)

    Raises:
        RuntimeError: If API key is not set for the provider
    """
    if OpenAI is None:
        raise RuntimeError("OpenAI package not installed")

    if provider == "self-hosted":
        if not endpoint_url:
            raise RuntimeError("Self-hosted provider requires 'endpointUrl' in judgeModel config")
        # Ensure the base URL ends with /v1 for OpenAI-compatible APIs (e.g. Ollama)
        base = endpoint_url.rstrip("/")
        if not base.endswith("/v1"):
            base += "/v1"
        resolved_key = api_key or "not-needed"
        client = OpenAI(api_key=resolved_key, base_url=base)
        return client, resolved_key

    config = PROVIDER_CONFIG.get(provider, PROVIDER_CONFIG["openai"])
    env_var = config["env_var"]
    base_url = config["base_url"]

    resolved_key = api_key or os.getenv(env_var)
    if not resolved_key:
        raise RuntimeError(
            f"No API key found for provider '{provider}' (expected env var: {env_var}). "
            f"Please save your {provider.upper()} API key in LLM Evals Settings."
        )

    if base_url:
        client = OpenAI(api_key=resolved_key, base_url=base_url)
    else:
        client = OpenAI(api_key=resolved_key)

    return client, resolved_key


def render_template(template: str, values: Dict[str, str]) -> str:
    """
    Replace {{placeholder}} occurrences with values[placeholder].
    If a placeholder is missing in `values`, it is replaced with an empty string.
    """
    def _sub(match: re.Match) -> str:
        key = match.group(1)
        return values.get(key, "")
    return _PLACEHOLDER_PATTERN.sub(_sub, template)


def render_messages(
    messages: List[Dict[str, str]],
    values: Dict[str, str],
) -> List[Dict[str, str]]:
    """
    Render message templates with placeholder values.
    
    Messages from DB have format: [{"role": "system", "content": "..."}]
    """
    rendered = []
    for msg in messages:
        # Support both 'content' (from frontend) and 'template' (from YAML)
        template = msg.get("content") or msg.get("template", "")
        rendered.append({
            "role": msg.get("role", "user"),
            "content": render_template(template, values),
        })
    return rendered


def extract_label(raw_text: str, choice_scores: Optional[List[Dict[str, Any]]] = None) -> str:
    """
    Extract the label from the judge model's response using the configured choice labels.

    Strategy:
    1. If choice labels are provided, search for them in the response
       (first line first, then full text).
    2. Fall back to extracting the first alphabetic word.

    Handles responses like:
    - "PASS" or "FAIL"
    - "PASS: The summary is good..."
    - "**PASS**"
    - "The answer is correct. PASS"
    - "<think>reasoning</think>\nPASS"
    """
    if not raw_text:
        return "UNKNOWN"

    cleaned = raw_text.strip()

    # Strip <think>...</think> blocks (e.g. deepseek-r1 chain-of-thought)
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", cleaned).strip()

    if not cleaned:
        return "UNKNOWN"

    # If we know the valid choice labels, search for them explicitly
    if choice_scores:
        known_labels = [cs.get("label", "").upper() for cs in choice_scores if cs.get("label", "").strip()]
        if known_labels:
            # Sort longest-first to match "NOT_PASS" before "PASS"
            known_labels.sort(key=len, reverse=True)
            pattern = "|".join(re.escape(lbl) for lbl in known_labels)

            # Search the first non-empty line first
            first_line = cleaned.splitlines()[0].strip() if cleaned.splitlines() else ""
            m = re.search(pattern, first_line.upper())
            if m:
                return m.group(0)

            # Search the entire (cleaned) response
            m = re.search(pattern, cleaned.upper())
            if m:
                return m.group(0)

    # Fallback: first alphabetic word from the (cleaned) first line
    first_line = cleaned.splitlines()[0] if cleaned.splitlines() else ""
    first_token = first_line.split()[0] if first_line.split() else ""
    label = "".join(ch for ch in first_token.upper() if ch.isalpha())
    return label or "UNKNOWN"


def label_to_score(label: str, choice_scores: List[Dict[str, Any]]) -> float:
    """
    Map a label (e.g. "PASS") to its numeric score from the config.
    If label not found, default to 0.0.
    """
    for choice in choice_scores:
        if choice.get("label", "").upper() == label.upper():
            return float(choice.get("score", 0.0))
    return 0.0


async def run_custom_scorer(
    scorer_config: Dict[str, Any],
    input_text: str,
    output_text: str,
    expected_text: str = "",
    metadata: Optional[Dict[str, Any]] = None,
) -> ScorerResult:
    """
    Execute a custom LLM judge scorer.
    
    Args:
        scorer_config: Scorer configuration from database, including:
            - id, name, metricKey
            - config.judgeModel: model config object with name/params/provider
            - config.messages: list of message templates
            - config.choiceScores: list of {label, score} mappings
            - defaultThreshold: pass/fail threshold
        input_text: The input/prompt given to the model
        output_text: The model's actual output to evaluate
        expected_text: Optional expected/reference output
        metadata: Optional additional context
        
    Returns:
        ScorerResult with label, score, and pass/fail status
    """
    if OpenAI is None:
        raise RuntimeError("OpenAI package not installed")
    
    scorer_id = scorer_config.get("id", "unknown")
    scorer_name = scorer_config.get("name", "Custom Scorer")
    config = scorer_config.get("config", {})
    
    # Get judge model settings - handle both object and string formats
    judge_model_config = config.get("judgeModel", {})
    if isinstance(judge_model_config, dict):
        model_name = judge_model_config.get("name")
        model_params = judge_model_config.get("params", {})
    else:
        # Legacy: judgeModel is just a string
        model_name = judge_model_config
        model_params = {}
    
    if not model_name:
        raise ValueError(f"Scorer {scorer_name} has no judge model configured")
    
    # Get the provider from config (user explicitly selects provider + model)
    provider, endpoint_url, config_api_key = get_provider_from_config(judge_model_config)
    print(f"   🔍 Using provider: {provider} for model: {model_name}")
    
    # Get temperature and max_tokens from params, with defaults
    temperature = model_params.get("temperature", 0.0)
    max_tokens = model_params.get("max_tokens", 256)
    
    messages_templates = config.get("messages", [])
    choice_scores = config.get("choiceScores", [])
    threshold = scorer_config.get("defaultThreshold", 0.5)
    
    if not messages_templates:
        raise ValueError(f"Scorer {scorer_name} has no message templates configured")

    has_output_placeholder = any(
        "{{output}}" in (msg.get("content") or msg.get("template", ""))
        for msg in messages_templates
    )
    if not has_output_placeholder:
        print(
            f"⚠️  Warning: Scorer '{scorer_name}' has no {{{{output}}}} placeholder in its "
            f"messages. The model response will not be sent to the judge LLM."
        )

    # Render message templates with actual values
    values = {
        "input": input_text,
        "output": output_text,
        "expected": expected_text,
        **(metadata or {}),
    }
    
    rendered_messages = render_messages(messages_templates, values)
    
    # Get the appropriate client for this provider
    try:
        client, api_key = get_provider_client(provider, endpoint_url=endpoint_url, api_key=config_api_key)
        print(f"   ✅ Using {provider.upper()} API client")
    except RuntimeError as e:
        return ScorerResult(
            scorer_id=scorer_id,
            scorer_name=scorer_name,
            label="ERROR",
            score=0.0,
            raw_response=f"Failed to initialize model: {str(e)}",
            passed=False,
        )
    
    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=rendered_messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        
        raw_response = response.choices[0].message.content.strip()
        usage = response.usage

        # Try to parse a JSON response of the form {"verdict": "PASS", "reason": "..."}
        extracted_reason: Optional[str] = None
        json_label: Optional[str] = None
        try:
            json_text = re.sub(r"^```(?:json)?\s*", "", raw_response, flags=re.IGNORECASE)
            json_text = re.sub(r"```\s*$", "", json_text).strip()
            parsed = json.loads(json_text)
            verdict = str(parsed.get("verdict") or parsed.get("label") or "").strip().upper()
            known_labels = {c.get("label", "").upper() for c in choice_scores}
            if verdict in known_labels:
                json_label = verdict
            extracted_reason = str(parsed.get("reason", "")).strip() or None
        except (json.JSONDecodeError, AttributeError, ValueError, TypeError):
            pass

        # Extract label and map to score
        label = json_label if json_label else extract_label(raw_response, choice_scores)
        score = label_to_score(label, choice_scores)
        passed = score >= threshold if threshold is not None else True

        return ScorerResult(
            scorer_id=scorer_id,
            scorer_name=scorer_name,
            label=label,
            score=score,
            raw_response=raw_response,
            passed=passed,
            reason=extracted_reason,
            prompt_tokens=getattr(usage, "prompt_tokens", None),
            completion_tokens=getattr(usage, "completion_tokens", None),
            total_tokens=getattr(usage, "total_tokens", None),
        )
        
    except Exception as e:
        # Return a failed result on error
        return ScorerResult(
            scorer_id=scorer_id,
            scorer_name=scorer_name,
            label="ERROR",
            score=0.0,
            raw_response=f"Error calling judge model ({provider}): {str(e)}",
            passed=False,
        )


async def run_custom_scorers_batch(
    scorer_configs: List[Dict[str, Any]],
    input_text: str,
    output_text: str,
    expected_text: str = "",
    metadata: Optional[Dict[str, Any]] = None,
) -> List[ScorerResult]:
    """
    Run multiple custom scorers on a single input/output pair.
    
    Args:
        scorer_configs: List of scorer configurations from database
        input_text: The input/prompt given to the model
        output_text: The model's actual output to evaluate
        expected_text: Optional expected/reference output
        metadata: Optional additional context
        
    Returns:
        List of ScorerResult for each scorer
    """
    results = []
    for config in scorer_configs:
        result = await run_custom_scorer(
            scorer_config=config,
            input_text=input_text,
            output_text=output_text,
            expected_text=expected_text,
            metadata=metadata,
        )
        results.append(result)
    return results

