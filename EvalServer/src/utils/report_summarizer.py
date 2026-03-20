"""
LLM-powered report summarizer.

Uses the experiment's judge LLM to generate natural language summaries
for individual metrics and an overall executive summary.
"""

import os
import logging
from typing import Any, Dict, List, Optional, Tuple

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

logger = logging.getLogger("uvicorn")

PROVIDER_CONFIG = {
    "openai": {"env_var": "OPENAI_API_KEY", "base_url": None},
    "anthropic": {"env_var": "ANTHROPIC_API_KEY", "base_url": "https://api.anthropic.com/v1"},
    "mistral": {"env_var": "MISTRAL_API_KEY", "base_url": "https://api.mistral.ai/v1"},
    "xai": {"env_var": "XAI_API_KEY", "base_url": "https://api.x.ai/v1"},
    "google": {"env_var": "GEMINI_API_KEY", "base_url": "https://generativelanguage.googleapis.com/v1beta/openai"},
    "gemini": {"env_var": "GEMINI_API_KEY", "base_url": "https://generativelanguage.googleapis.com/v1beta/openai"},
    "openrouter": {"env_var": "OPENROUTER_API_KEY", "base_url": "https://openrouter.ai/api/v1"},
}

from utils.metric_constants import (
    is_safety_metric as _is_safety_metric,
    is_inverted_metric as _is_inverted_metric,
    format_metric_name as _format_metric_name,
)


def _get_client(provider: str, api_key: Optional[str] = None, endpoint_url: Optional[str] = None):
    if OpenAI is None:
        raise RuntimeError("openai package not installed")

    provider = provider.lower()

    if provider in ("self-hosted", "ollama"):
        base = (endpoint_url or "http://localhost:11434").rstrip("/")
        if not base.endswith("/v1"):
            base += "/v1"
        return OpenAI(api_key=api_key or "not-needed", base_url=base)

    cfg = PROVIDER_CONFIG.get(provider, PROVIDER_CONFIG["openai"])
    resolved_key = api_key or os.getenv(cfg["env_var"] or "", "")
    if not resolved_key:
        raise RuntimeError(f"No API key for provider '{provider}'")

    if cfg["base_url"]:
        return OpenAI(api_key=resolved_key, base_url=cfg["base_url"])
    return OpenAI(api_key=resolved_key)


def _call_llm(client, model: str, system_prompt: str, user_prompt: str, max_tokens: int = 512) -> str:
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.4,
        max_tokens=max_tokens,
    )
    return response.choices[0].message.content.strip()


METRIC_SYSTEM_PROMPT = (
    "You are an AI evaluation expert writing a report. "
    "Given a metric result, write a concise 2-3 sentence analysis. "
    "State the score and whether it passed. Explain what the score means "
    "for the model's quality or safety, and briefly note any concern or strength. "
    "Be factual and professional. Do not use markdown formatting."
)

EXECUTIVE_SYSTEM_PROMPT = (
    "You are an AI evaluation expert writing an executive summary for an LLM evaluation report. "
    "Synthesize the overall performance across all experiments and metrics into a clear, "
    "actionable paragraph (4-6 sentences). Highlight key strengths, weaknesses, whether the "
    "model meets requirements, and any recommended actions. "
    "Be factual and professional. Do not use markdown formatting."
)

RECOMMENDATIONS_SYSTEM_PROMPT = (
    "You are an AI evaluation expert writing the Limitations & Recommendations section of an LLM evaluation report. "
    "Based on the evaluation results, write two clearly separated paragraphs:\n"
    "1. LIMITATIONS: Describe the limitations of this evaluation (sample size, dataset scope, "
    "judge model biases, threshold sensitivity, etc.). Be specific to the actual data provided.\n"
    "2. RECOMMENDATIONS: Provide concrete, actionable recommendations for improving the model's "
    "performance on failed metrics, and next steps for deployment readiness.\n"
    "Be factual and professional. Do not use markdown formatting, bullet points, or headers. "
    "Write in plain prose paragraphs."
)


def generate_metric_summary(
    metric_name: str,
    avg_score: float,
    threshold: float,
    passed: bool,
    is_safety: bool,
    total_evaluated: int,
    provider: str,
    model: str,
    api_key: Optional[str] = None,
    endpoint_url: Optional[str] = None,
) -> str:
    client = _get_client(provider, api_key, endpoint_url)
    display_name = _format_metric_name(metric_name)
    category = "safety" if is_safety else "quality"
    status = "PASSED" if passed else "FAILED"

    user_prompt = (
        f"Metric: {display_name} ({category})\n"
        f"Average score: {avg_score * 100:.1f}%\n"
        f"Threshold: {threshold * 100:.0f}%\n"
        f"Status: {status}\n"
        f"Samples evaluated: {total_evaluated}\n"
        f"{'This is an inverted metric (lower is better).' if _is_safety_metric(metric_name) and _is_inverted_metric(metric_name) else ''}"
    )

    return _call_llm(client, model, METRIC_SYSTEM_PROMPT, user_prompt, max_tokens=200)


def generate_executive_summary(
    experiments: List[Dict[str, Any]],
    metric_summaries_text: Dict[str, Dict[str, str]],
    provider: str,
    model: str,
    api_key: Optional[str] = None,
    endpoint_url: Optional[str] = None,
) -> str:
    client = _get_client(provider, api_key, endpoint_url)

    lines = []
    for exp in experiments:
        name = exp.get("name", exp.get("id", "Unknown"))
        model_name = exp.get("model", "Unknown")
        summaries = exp.get("metricSummaries", {})
        thresholds = exp.get("metricThresholds", {})
        total_metrics = len(summaries)
        passing = 0
        for mname, m in summaries.items():
            avg = m.get("averageScore", 0)
            thresh = thresholds.get(mname, 0.5)
            inverted = _is_inverted_metric(mname)
            if (inverted and avg <= thresh) or (not inverted and avg >= thresh):
                passing += 1
        avg_score = (sum(m.get("averageScore", 0) for m in summaries.values()) / total_metrics * 100) if total_metrics else 0

        lines.append(f"Experiment: {name}")
        lines.append(f"  Model: {model_name}")
        lines.append(f"  Overall avg: {avg_score:.1f}%")
        lines.append(f"  Metrics passing: {passing}/{total_metrics}")
        lines.append(f"  Samples: {exp.get('totalSamples', 0)}")

        for mname, text_map in metric_summaries_text.get(name, {}).items():
            lines.append(f"  {_format_metric_name(mname)}: {text_map}")
        lines.append("")

    user_prompt = "Here are the evaluation results:\n\n" + "\n".join(lines)
    return _call_llm(client, model, EXECUTIVE_SYSTEM_PROMPT, user_prompt, max_tokens=400)


def generate_recommendations_summary(
    experiments: List[Dict[str, Any]],
    provider: str,
    model: str,
    api_key: Optional[str] = None,
    endpoint_url: Optional[str] = None,
) -> str:
    client = _get_client(provider, api_key, endpoint_url)

    lines = []
    for exp in experiments:
        name = exp.get("name", exp.get("id", "Unknown"))
        model_name = exp.get("model", "Unknown")
        summaries = exp.get("metricSummaries", {})
        thresholds = exp.get("metricThresholds", {})
        total_samples = exp.get("totalSamples", 0)

        lines.append(f"Experiment: {name}")
        lines.append(f"  Model: {model_name}")
        lines.append(f"  Total samples: {total_samples}")

        for mname, m in summaries.items():
            avg = m.get("averageScore", 0)
            thresh = thresholds.get(mname, 0.5)
            inverted = _is_inverted_metric(mname)
            passed = (avg <= thresh) if inverted else (avg >= thresh)
            status = "PASSED" if passed else "FAILED"
            lines.append(
                f"  {_format_metric_name(mname)}: {avg * 100:.1f}% "
                f"(threshold: {thresh * 100:.0f}%, {status})"
            )
        lines.append("")

    user_prompt = "Here are the evaluation results:\n\n" + "\n".join(lines)
    return _call_llm(client, model, RECOMMENDATIONS_SYSTEM_PROMPT, user_prompt, max_tokens=500)


def generate_all_summaries(
    experiments: List[Dict[str, Any]],
    provider: str,
    model: str,
    api_key: Optional[str] = None,
    endpoint_url: Optional[str] = None,
) -> Tuple[str, Dict[str, Dict[str, str]], str]:
    """
    Generate all summaries for a report.

    Returns:
        (executive_summary, {experiment_name: {metric_name: summary_text}}, recommendations)
    """
    all_metric_summaries: Dict[str, Dict[str, str]] = {}

    for exp in experiments:
        exp_name = exp.get("name", exp.get("id", "Unknown"))
        summaries = exp.get("metricSummaries", {})
        thresholds = exp.get("metricThresholds", {})
        exp_metric_texts: Dict[str, str] = {}

        for metric_name, m in summaries.items():
            avg = m.get("averageScore", 0)
            threshold = thresholds.get(metric_name, 0.5)
            is_safety = _is_safety_metric(metric_name)
            inverted = _is_inverted_metric(metric_name)
            passed = (avg <= threshold) if inverted else (avg >= threshold)
            total = m.get("totalEvaluated", 0)

            try:
                text = generate_metric_summary(
                    metric_name, avg, threshold, passed, is_safety,
                    total, provider, model, api_key, endpoint_url,
                )
                exp_metric_texts[metric_name] = text
            except Exception as e:
                logger.warning(f"Failed to generate summary for {metric_name}: {e}")
                exp_metric_texts[metric_name] = ""

        all_metric_summaries[exp_name] = exp_metric_texts

    executive = ""
    try:
        executive = generate_executive_summary(
            experiments, all_metric_summaries,
            provider, model, api_key, endpoint_url,
        )
    except Exception as e:
        logger.warning(f"Failed to generate executive summary: {e}")

    recommendations = ""
    try:
        recommendations = generate_recommendations_summary(
            experiments, provider, model, api_key, endpoint_url,
        )
    except Exception as e:
        logger.warning(f"Failed to generate recommendations summary: {e}")

    return executive, all_metric_summaries, recommendations
