# VerifyWise LLM Evaluation Action

Run LLM quality and safety evaluations against a [VerifyWise](https://verifywise.ai) instance directly in your CI/CD pipeline.

## Features

- Evaluate any LLM against standard metrics (correctness, faithfulness, hallucination, etc.)
- Automatic pass/fail checks with configurable thresholds
- Markdown summary posted to GitHub Actions job summary
- JSON + Markdown result files for further processing
- Supports all major LLM providers (OpenAI, Anthropic, Google, Mistral, xAI, self-hosted)

## Quick Start

```yaml
name: LLM Evaluation

on:
  pull_request:
    branches: [main]

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: verifywise/verifywise-eval-action@v1
        with:
          api_url: https://your-verifywise-instance.com
          project_id: project_abc123
          dataset_id: ds_456
          metrics: "correctness,faithfulness,hallucination"
          model_name: gpt-4o
          model_provider: openai
          vw_api_token: ${{ secrets.VW_API_TOKEN }}
          llm_api_key: ${{ secrets.OPENAI_API_KEY }}
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api_url` | Yes | — | Base URL of your VerifyWise instance |
| `project_id` | Yes | — | VerifyWise project ID |
| `dataset_id` | Yes | — | Dataset to evaluate against |
| `metrics` | Yes | — | Comma-separated metric names |
| `model_name` | Yes | — | Model to evaluate (e.g. `gpt-4o`) |
| `model_provider` | Yes | — | Provider: `openai`, `anthropic`, `google`, `mistral`, `xai`, `self-hosted` |
| `vw_api_token` | Yes | — | VerifyWise JWT token |
| `llm_api_key` | Yes | — | API key for the LLM provider |
| `judge_model` | No | `gpt-4o` | Judge model for metric scoring |
| `judge_provider` | No | `openai` | Judge model provider |
| `threshold` | No | `0.7` | Pass threshold (0.0–1.0) |
| `timeout_minutes` | No | `30` | Max wait time for evaluation |
| `poll_interval_seconds` | No | `15` | Seconds between status polls |
| `experiment_name` | No | auto | Custom experiment name |
| `fail_on_threshold` | No | `true` | Fail the CI check if thresholds are not met |

## Outputs

| Output | Description |
|--------|-------------|
| `passed` | `true` if all metrics passed, `false` otherwise |
| `results_file` | Path to the JSON results file |
| `summary_file` | Path to the markdown summary file |

## Metrics

VerifyWise supports these built-in metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `correctness` | Higher is better | Accuracy of answers |
| `faithfulness` | Higher is better | Groundedness in provided context |
| `answerRelevancy` | Higher is better | Relevance to the question |
| `contextualRelevancy` | Higher is better | Relevance of retrieved context |
| `contextualPrecision` | Higher is better | Precision of context retrieval |
| `contextualRecall` | Higher is better | Recall of relevant context |
| `hallucination` | Lower is better | Rate of fabricated information |
| `toxicity` | Lower is better | Harmful content detection |
| `bias` | Lower is better | Bias detection |
| `conversationSafety` | Lower is better | Safety of conversational outputs |
| `completeness` | Higher is better | Coverage of expected content |
| `coherence` | Higher is better | Logical consistency |

*Lower-is-better metrics are automatically detected: the check passes when the score is below the threshold.*

## Advanced Usage

### Using outputs in subsequent steps

```yaml
- uses: verifywise/verifywise-eval-action@v1
  id: eval
  with:
    api_url: ${{ vars.VW_URL }}
    project_id: ${{ vars.VW_PROJECT_ID }}
    dataset_id: ${{ vars.VW_DATASET_ID }}
    metrics: "correctness,faithfulness"
    model_name: gpt-4o
    model_provider: openai
    vw_api_token: ${{ secrets.VW_API_TOKEN }}
    llm_api_key: ${{ secrets.OPENAI_API_KEY }}
    fail_on_threshold: "false"

- name: Upload results
  uses: actions/upload-artifact@v4
  with:
    name: eval-results
    path: ${{ steps.eval.outputs.results_file }}

- name: Gate deployment
  if: steps.eval.outputs.passed != 'true'
  run: |
    echo "Eval did not pass — blocking deployment"
    exit 1
```

### PR comment via the reusable workflow

If you prefer automatic PR comments, use the **reusable workflow** variant instead:

```yaml
jobs:
  eval:
    uses: verifywise/verifywise/.github/workflows/verifywise-eval.yml@main
    with:
      api_url: https://your-verifywise-instance.com
      project_id: project_abc123
      dataset_id: ds_456
      metrics: "correctness,faithfulness"
      model_name: gpt-4o
      model_provider: openai
    secrets:
      VW_API_TOKEN: ${{ secrets.VW_API_TOKEN }}
      LLM_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## How It Works

1. The action installs Python 3.11 and the `requests` library.
2. `eval_runner.py` calls the VerifyWise API to create an evaluation experiment.
3. It polls the experiment status until completion (or timeout).
4. Results are parsed, checked against thresholds, and written to JSON and Markdown.
5. The Markdown summary is appended to the GitHub Actions **Job Summary**.
6. If `fail_on_threshold` is `true` and any metric fails, the step exits with code 1.

## License

Apache 2.0 — see [LICENSE](../LICENSE) for details.
