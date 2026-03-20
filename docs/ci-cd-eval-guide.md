# CI/CD LLM Evaluation Pipeline

Run VerifyWise LLM evaluations automatically on every push or pull request using GitHub Actions.

## Overview

The VerifyWise CI/CD pipeline:

1. Creates an evaluation experiment via the VerifyWise API
2. Polls until the experiment completes
3. Parses metric results and checks against thresholds
4. Posts a summary comment on the PR (if applicable)
5. Fails the CI check if any metric is below its threshold

## Prerequisites

- A running VerifyWise instance (self-hosted or cloud)
- A project with at least one dataset uploaded
- API authentication token (JWT)
- LLM API key for the model provider you're evaluating

## Quick Start

### 1. Add secrets to your repository

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Description |
|--------|-------------|
| `VW_API_TOKEN` | VerifyWise JWT token for authentication |
| `LLM_API_KEY` | API key for the LLM provider (OpenAI, Anthropic, etc.) |

### 2. Create a workflow file

Create `.github/workflows/llm-eval.yml` in your repository:

```yaml
name: LLM Evaluation

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  eval:
    uses: verifywise/verifywise/.github/workflows/verifywise-eval.yml@main
    with:
      api_url: https://your-verifywise-instance.com
      project_id: "your-project-uuid"
      dataset_id: "your-dataset-uuid"
      metrics: "answerRelevancy,faithfulness,hallucination"
      model_name: "gpt-4o"
      model_provider: "openai"
      judge_model: "gpt-4o"
      judge_provider: "openai"
      threshold: "0.7"
    secrets:
      VW_API_TOKEN: ${{ secrets.VW_API_TOKEN }}
      LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
```

### 3. Push and observe

On your next PR, the workflow will run the evaluation and post results as a comment.

## Configuration Reference

### Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api_url` | Yes | — | Base URL of your VerifyWise instance |
| `project_id` | Yes | — | VerifyWise project UUID |
| `dataset_id` | Yes | — | Dataset UUID to evaluate against |
| `metrics` | Yes | — | Comma-separated metric names |
| `model_name` | Yes | — | Model identifier (e.g., `gpt-4o`, `claude-3.5-sonnet`) |
| `model_provider` | Yes | — | Provider: `openai`, `anthropic`, `google`, `mistral`, `xai`, `self-hosted` |
| `judge_model` | No | `gpt-4o` | Judge LLM model name |
| `judge_provider` | No | `openai` | Judge LLM provider |
| `threshold` | No | `0.7` | Global pass threshold (0.0–1.0) |
| `timeout_minutes` | No | `30` | Max minutes to wait for completion |
| `poll_interval_seconds` | No | `15` | Seconds between status polls |
| `experiment_name` | No | Auto-generated | Custom experiment name |
| `fail_on_threshold` | No | `true` | Fail the CI check when thresholds aren't met |
| `post_pr_comment` | No | `true` | Post a summary comment on PRs |

### Available Metrics

**Quality metrics** (higher is better):
- `answerRelevancy` — relevance of the answer to the question
- `faithfulness` — factual consistency with the context
- `contextualRecall` — recall of relevant context
- `contextualPrecision` — precision of retrieved context
- `contextualRelevancy` — relevance of context to the query
- `gEval` — general evaluation via G-Eval

**Safety metrics** (lower is better — inverted threshold):
- `bias` — presence of demographic or stereotypical bias
- `toxicity` — harmful or offensive language
- `hallucination` — fabricated or unsupported information

## Standalone Runner Script

For non-GitHub environments (GitLab CI, Jenkins, etc.), use the standalone Python script directly.

### Installation

```bash
pip install requests
curl -sL https://raw.githubusercontent.com/verifywise/verifywise/main/EvalServer/scripts/ci_eval_runner.py -o ci_eval_runner.py
```

### Usage

```bash
python ci_eval_runner.py \
  --api-url https://your-verifywise-instance.com \
  --token "$VW_API_TOKEN" \
  --project-id "your-project-uuid" \
  --dataset-id "your-dataset-uuid" \
  --metrics "answerRelevancy,faithfulness,hallucination" \
  --model-name "gpt-4o" \
  --model-provider "openai" \
  --threshold 0.7
```

### Environment Variables

All CLI arguments can also be set via environment variables:

| CLI Argument | Environment Variable |
|-------------|---------------------|
| `--api-url` | `VW_API_URL` |
| `--token` | `VW_API_TOKEN` |
| `--project-id` | `VW_PROJECT_ID` |
| `--dataset-id` | `VW_DATASET_ID` |
| `--metrics` | `VW_METRICS` |
| `--model-name` | `VW_MODEL_NAME` |
| `--model-provider` | `VW_MODEL_PROVIDER` |
| `--judge-model` | `VW_JUDGE_MODEL` |
| `--judge-provider` | `VW_JUDGE_PROVIDER` |
| `--threshold` | `VW_THRESHOLD` |
| `--timeout` | `VW_TIMEOUT_MINUTES` |
| `--poll-interval` | `VW_POLL_INTERVAL` |
| `--name` | `VW_EXPERIMENT_NAME` |
| — | `LLM_API_KEY` (model's API key) |

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All metrics passed |
| `1` | One or more metrics failed threshold |
| `2` | Error (timeout, API failure, missing config) |

### Output Files

- `results.json` — structured results with per-metric scores
- `summary.md` — markdown summary suitable for PR comments

## Advanced Examples

### Multiple models in parallel

```yaml
jobs:
  eval-gpt4o:
    uses: verifywise/verifywise/.github/workflows/verifywise-eval.yml@main
    with:
      api_url: https://verifywise.example.com
      project_id: "abc-123"
      dataset_id: "dataset-456"
      metrics: "answerRelevancy,faithfulness"
      model_name: "gpt-4o"
      model_provider: "openai"
      experiment_name: "CI — GPT-4o"
    secrets:
      VW_API_TOKEN: ${{ secrets.VW_API_TOKEN }}
      LLM_API_KEY: ${{ secrets.OPENAI_API_KEY }}

  eval-claude:
    uses: verifywise/verifywise/.github/workflows/verifywise-eval.yml@main
    with:
      api_url: https://verifywise.example.com
      project_id: "abc-123"
      dataset_id: "dataset-456"
      metrics: "answerRelevancy,faithfulness"
      model_name: "claude-3.5-sonnet-20241022"
      model_provider: "anthropic"
      experiment_name: "CI — Claude 3.5 Sonnet"
    secrets:
      VW_API_TOKEN: ${{ secrets.VW_API_TOKEN }}
      LLM_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Non-blocking evaluation (report only)

```yaml
jobs:
  eval:
    uses: verifywise/verifywise/.github/workflows/verifywise-eval.yml@main
    with:
      api_url: https://verifywise.example.com
      project_id: "abc-123"
      dataset_id: "dataset-456"
      metrics: "answerRelevancy,faithfulness,hallucination"
      model_name: "gpt-4o"
      model_provider: "openai"
      fail_on_threshold: false   # Don't fail CI, just report
    secrets:
      VW_API_TOKEN: ${{ secrets.VW_API_TOKEN }}
      LLM_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Self-hosted model evaluation

```yaml
jobs:
  eval:
    uses: verifywise/verifywise/.github/workflows/verifywise-eval.yml@main
    with:
      api_url: https://verifywise.example.com
      project_id: "abc-123"
      dataset_id: "dataset-456"
      metrics: "answerRelevancy,faithfulness"
      model_name: "llama3.1:8b"
      model_provider: "self-hosted"
      judge_model: "gpt-4o"
      judge_provider: "openai"
    secrets:
      VW_API_TOKEN: ${{ secrets.VW_API_TOKEN }}
      LLM_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## GitLab CI Example

```yaml
llm-evaluation:
  stage: test
  image: python:3.11-slim
  script:
    - pip install requests
    - curl -sL https://raw.githubusercontent.com/verifywise/verifywise/main/EvalServer/scripts/ci_eval_runner.py -o ci_eval_runner.py
    - python ci_eval_runner.py
  variables:
    VW_API_URL: https://verifywise.example.com
    VW_PROJECT_ID: "abc-123"
    VW_DATASET_ID: "dataset-456"
    VW_METRICS: "answerRelevancy,faithfulness,hallucination"
    VW_MODEL_NAME: "gpt-4o"
    VW_MODEL_PROVIDER: "openai"
    VW_API_TOKEN: $VW_API_TOKEN
    LLM_API_KEY: $LLM_API_KEY
  artifacts:
    paths:
      - results.json
      - summary.md
    expire_in: 30 days
```

## Troubleshooting

**Experiment stuck in "running"**: Increase `timeout_minutes`. Large datasets can take 20+ minutes.

**Authentication errors**: Verify your `VW_API_TOKEN` is a valid JWT and hasn't expired. Generate a new one from the VerifyWise settings.

**API key errors**: Ensure `LLM_API_KEY` matches the provider specified in `model_provider`. For evaluations, the judge model also needs a valid key.

**Self-hosted models**: Set `model_provider` to `self-hosted`. The VerifyWise instance must have network access to the model's endpoint.
