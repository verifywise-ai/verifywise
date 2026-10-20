"""
Custom Scorer Executor - Runs LLM judge scorers from database configs

This module connects the scorer configs stored in the database (via web UI)
to actual execution using OpenAI or other LLM providers.

Supports multiple providers: OpenAI, Anthropic, Mistral, xAI, Google (Gemini), etc.
"""

import math
import re
import os
import json
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple, Union
from dataclasses import dataclass

from utils.error_detection import redact_secrets

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
    # The pass line `passed` is decided against. Without a threshold every score passes,
    # and this is the lowest score the scorer can return (0, or below on such a scale).
    threshold: Optional[float] = None
    reason: Optional[str] = None
    # Set when the judge could not be called; label, score and passed are placeholders then.
    error: Optional[str] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    # LiteLLM's price for the judge call (gateway mode only)
    cost_usd: Optional[float] = None


_PLACEHOLDER_PATTERN = re.compile(r"{{\s*([a-zA-Z0-9_]+)\s*}}")


# Env var holding each provider's key when the scorer config carries none. Cloud
# providers run through the AI Gateway; only self-hosted calls its endpoint directly.
PROVIDER_CONFIG = {
    "openai": {"env_var": "OPENAI_API_KEY"},
    "anthropic": {"env_var": "ANTHROPIC_API_KEY"},
    "mistral": {"env_var": "MISTRAL_API_KEY"},
    "xai": {"env_var": "XAI_API_KEY"},
    # run_evaluation writes the org's Google key to GOOGLE_API_KEY
    "google": {"env_var": "GOOGLE_API_KEY"},
    "gemini": {"env_var": "GOOGLE_API_KEY"},
    "openrouter": {"env_var": "OPENROUTER_API_KEY"},
    "huggingface": {"env_var": "HF_API_KEY"},
    "self-hosted": {"env_var": None},
    "ollama": {"env_var": None},
}

# Providers whose judge is the user's own server, called directly (never the gateway)
SELF_HOSTED_PROVIDERS = ("self-hosted", "ollama")

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
    env_fallback: bool = True,
) -> Tuple[Any, str]:
    """
    The client and key for a scorer's judge.

    Self-hosted gets an OpenAI-compatible client for its endpoint. A cloud provider gets
    no client (None): it runs through the AI Gateway, which must be configured.

    Raises:
        RuntimeError: missing endpoint, missing key, or no AI Gateway for a cloud provider
    """
    if provider in SELF_HOSTED_PROVIDERS:
        if OpenAI is None:
            raise RuntimeError("OpenAI package not installed")
        if not endpoint_url and provider == "ollama":
            endpoint_url = "http://localhost:11434"
        if not endpoint_url:
            raise RuntimeError("Self-hosted provider requires 'endpointUrl' in judgeModel config")
        from utils.safe_outbound_url import (
            UnsafeOutboundUrlError,
            openai_base_url,
            openai_compatible_client,
        )

        try:
            base = openai_base_url(endpoint_url)
        except UnsafeOutboundUrlError as e:
            raise RuntimeError(f"Self-hosted endpoint refused: {e}") from None
        resolved_key = api_key or "not-needed"
        return openai_compatible_client(base, resolved_key), resolved_key

    from utils.gateway_litellm_client import gateway_mode_enabled

    if not gateway_mode_enabled():
        raise RuntimeError(f"Provider '{provider}' runs through the AI Gateway; set AI_GATEWAY_INTERNAL_KEY")
    env_var = PROVIDER_CONFIG.get(provider, PROVIDER_CONFIG["openai"])["env_var"]
    # Inside a run the env holds that run's own keys; in the server process it must not be read
    resolved_key = api_key or (os.getenv(env_var) if env_fallback else None)
    if not resolved_key:
        if not env_fallback:
            raise RuntimeError(
                f"No saved API key for provider '{provider}'. "
                f"Please save your {provider.upper()} API key in LLM Evals Settings."
            )
        raise RuntimeError(
            f"No API key found for provider '{provider}' (expected env var: {env_var}). "
            f"Please save your {provider.upper()} API key in LLM Evals Settings."
        )
    return None, resolved_key


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


def _lowest_score(choice_scores: List[Dict[str, Any]]) -> float:
    """The lowest score label_to_score can return for these choices."""
    lowest = 0.0
    for choice in choice_scores:
        try:
            lowest = min(lowest, float(choice.get("score", 0.0)))
        except (TypeError, ValueError, OverflowError):
            continue
    return lowest


def _parse_threshold(value: Any, scorer_name: str) -> Optional[float]:
    """A scorer's defaultThreshold as a float, or None when it has none.

    Numeric strings are accepted. Any other value falls back to 0.5 with a warning, so
    the row is still judged instead of failing as a judge-model error.
    """
    if value is None:
        return None
    if isinstance(value, (int, float, str)) and not isinstance(value, bool):
        try:
            number = float(value)
            if math.isfinite(number):  # rejects NaN and infinity
                return number
        except (ValueError, OverflowError):
            pass
    print(f"⚠️  Scorer {str(scorer_name)[:80]} has an invalid threshold {repr(value)[:80]}; using 0.5")
    return 0.5



# The UI's modelParams are camelCase; judgeModel.params and the runner use snake_case
_PARAM_ALIASES = {"maxTokens": "max_tokens", "topP": "top_p"}


def _judge_params(*sources: Any) -> Dict[str, Any]:
    """Judge sampling params from each source in turn, later ones winning."""
    params: Dict[str, Any] = {}
    for source in sources:
        if isinstance(source, dict):
            for key, value in source.items():
                if value is not None:
                    params[_PARAM_ALIASES.get(key, key)] = value
    return params

async def run_custom_scorer(
    scorer_config: Dict[str, Any],
    input_text: str,
    output_text: str,
    expected_text: str = "",
    metadata: Optional[Dict[str, Any]] = None,
    key_resolver: Optional[Callable[[str], Awaitable[Optional[str]]]] = None,
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
        key_resolver: For callers in the server process: returns the org's saved key for a
            provider. When given, the server environment is never read for a key.
        
    Returns:
        ScorerResult with label, score, and pass/fail status
    """
    if OpenAI is None:
        raise RuntimeError("OpenAI package not installed")
    
    scorer_id = scorer_config.get("id", "unknown")
    scorer_name = scorer_config.get("name", "Custom Scorer")
    config = scorer_config.get("config", {})

    # Normalize judge-model shape. Scorers may be persisted in any of three shapes
    # depending on which write path created them:
    #   1. Nested (Scorers page / _upsert_judge_scorer):
    #        config = {"provider": ..., "judgeModel": {"name", "provider", ...}, ...}
    #   2. Legacy string (very old records):
    #        config = {"judgeModel": "<model name>"}
    #   3. Flat (older useModelPreferences.savePreferences output — see PR fix):
    #        config = {"provider": ..., "model": ..., ...}  # no judgeModel key
    # We merge them into one canonical nested dict, with nested values taking
    # precedence over flat ones, so downstream code only has to deal with shape #1.
    raw_judge_model = config.get("judgeModel")
    if isinstance(raw_judge_model, dict):
        judge_model_config: Dict[str, Any] = {
            "name": raw_judge_model.get("name") or config.get("model"),
            "provider": raw_judge_model.get("provider") or config.get("provider"),
            # The UI saved only top_p under judgeModel.params; temperature and max
            # tokens live in modelParams, so merge both (nested wins)
            "params": _judge_params(config.get("modelParams"), raw_judge_model.get("params")),
            "endpointUrl": raw_judge_model.get("endpointUrl") or config.get("endpointUrl"),
            "apiKey": raw_judge_model.get("apiKey") or config.get("apiKey"),
        }
    elif isinstance(raw_judge_model, str):
        judge_model_config = {
            "name": raw_judge_model,
            "provider": config.get("provider"),
            "params": _judge_params(config.get("modelParams")),
            "endpointUrl": config.get("endpointUrl"),
            "apiKey": config.get("apiKey"),
        }
    else:
        judge_model_config = {
            "name": config.get("model"),
            "provider": config.get("provider"),
            "params": _judge_params(config.get("modelParams")),
            "endpointUrl": config.get("endpointUrl"),
            "apiKey": config.get("apiKey"),
        }

    model_name = judge_model_config.get("name")
    model_params = judge_model_config.get("params") or {}

    if not model_name:
        raise ValueError(
            f"Scorer {scorer_name} has no judge model configured "
            "(checked config.judgeModel.name, config.judgeModel (str), and config.model)"
        )

    # Get the provider from config (user explicitly selects provider + model)
    provider, endpoint_url, config_api_key = get_provider_from_config(judge_model_config)
    print(f"   🔍 Using provider: {provider} for model: {model_name}")
    
    # Get temperature, max_tokens and top_p from params, with defaults
    temperature = model_params.get("temperature", 0.0)
    max_tokens = model_params.get("max_tokens", 256)
    top_p = model_params.get("top_p")
    
    messages_templates = config.get("messages", [])
    choice_scores = config.get("choiceScores", [])
    threshold = _parse_threshold(scorer_config.get("defaultThreshold", 0.5), scorer_name)
    # The pass line stored with every result. Without a threshold every score passes, so
    # store the lowest score possible (unknown labels and errors score 0).
    pass_line = threshold if threshold is not None else _lowest_score(choice_scores)
    
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
        if key_resolver is not None and not config_api_key and provider not in SELF_HOSTED_PROVIDERS:
            config_api_key = await key_resolver(provider)
        client, api_key = get_provider_client(
            provider, endpoint_url=endpoint_url, api_key=config_api_key, env_fallback=key_resolver is None
        )
        print(f"   ✅ Judge provider ready: {provider}")
    except RuntimeError as e:
        # Stored in the experiment's results, shown to the organization.
        init_error = f"Failed to initialize model: {redact_secrets(str(e))}"
        return ScorerResult(
            scorer_id=scorer_id,
            scorer_name=scorer_name,
            label="ERROR",
            score=0.0,
            raw_response=init_error,
            passed=False,
            threshold=pass_line,
            error=init_error,
        )
    
    try:
        from utils.gateway_litellm_client import gateway_completion_sync, to_litellm_model, top_p_to_send

        if provider not in SELF_HOSTED_PROVIDERS:
            litellm_model = to_litellm_model(provider, model_name)
            completion = gateway_completion_sync(
                litellm_model,
                rendered_messages,
                api_key,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
            )
            raw_response = completion.text.strip()
            # Same token attributes as the OpenAI SDK's usage object, plus LiteLLM's cost
            usage = completion
        else:
            response = client.chat.completions.create(
                model=model_name,
                messages=rendered_messages,
                temperature=temperature,
                max_tokens=max_tokens,
                **({"top_p": top_p} if top_p_to_send(top_p) is not None else {}),
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
            threshold=pass_line,
            reason=extracted_reason,
            prompt_tokens=getattr(usage, "prompt_tokens", None),
            completion_tokens=getattr(usage, "completion_tokens", None),
            total_tokens=getattr(usage, "total_tokens", None),
            cost_usd=getattr(usage, "cost_usd", None),
        )

    except Exception as e:
        # Return a failed result on error
        call_error = f"Error calling judge model ({provider}): {redact_secrets(str(e))}"
        return ScorerResult(
            scorer_id=scorer_id,
            scorer_name=scorer_name,
            label="ERROR",
            score=0.0,
            raw_response=call_error,
            passed=False,
            threshold=pass_line,
            error=call_error,
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

