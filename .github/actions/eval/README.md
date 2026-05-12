# VerifyWise LLM Evaluation Action

Run LLM evaluations against a [VerifyWise](https://verifywise.ai) instance directly in your CI/CD pipeline. The action creates an experiment, polls until completion, and gates your build on quality thresholds.

## Features

- Evaluate any LLM (OpenAI, Anthropic, Google, Mistral, xAI, self-hosted) against curated datasets
- Gate CI on metrics like correctness, faithfulness, hallucination, toxicity, and more
- Outputs structured JSON results and a Markdown summary
- Uploads results as build artifacts for later inspection
- Configurable thresholds, timeouts, and judge models

## Usage

```yaml
- uses: verifywise-ai/verifywise/.github/actions/eval@main
  with:
    api_url: https://app.verifywise.ai
    project_id: proj_abc
    dataset_id: '2'
    metrics: 'correctness,faithfulness,hallucination'
    model_name: gpt-4o-mini
    model_provider: openai
    vw_api_token: ${{ secrets.VW_API_TOKEN }}
    llm_api_key: ${{ secrets.LLM_API_KEY }}
```

### Full example workflow

```yaml
name: LLM Quality Gate
on:
  pull_request:
    branches: [main, develop]

jobs:
  eval:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Run VerifyWise evaluation
        id: eval
        uses: verifywise-ai/verifywise/.github/actions/eval@main
        with:
          api_url: https://app.verifywise.ai
          project_id: proj_abc
          dataset_id: '2'
          metrics: 'correctness,faithfulness,hallucination'
          model_name: gpt-4o-mini
          model_provider: openai
          threshold: '0.7'
          fail_on_threshold: 'true'
          vw_api_token: ${{ secrets.VW_API_TOKEN }}
          llm_api_key: ${{ secrets.LLM_API_KEY }}

      - name: Post results as PR comment
        if: github.event_name == 'pull_request' && always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const summaryPath = '${{ steps.eval.outputs.summary_path }}';
            if (!fs.existsSync(summaryPath)) return;
            const body = fs.readFileSync(summaryPath, 'utf8');
            const marker = '<!-- verifywise-eval-results -->';
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });
            const existing = comments.find(c => c.body.includes(marker));
            const fullBody = `${marker}\n${body}`;
            if (existing) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner, repo: context.repo.repo,
                comment_id: existing.id, body: fullBody,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner, repo: context.repo.repo,
                issue_number: context.issue.number, body: fullBody,
              });
            }

      - name: Use outputs in later steps
        if: always()
        run: |
          echo "Passed: ${{ steps.eval.outputs.passed }}"
          echo "Experiment: ${{ steps.eval.outputs.experiment_id }}"
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api_url` | **yes** | — | Base URL of the VerifyWise instance |
| `project_id` | **yes** | — | VerifyWise project ID |
| `dataset_id` | **yes** | — | Dataset ID to evaluate against |
| `metrics` | **yes** | — | Comma-separated metric names |
| `model_name` | **yes** | — | Model to evaluate (e.g. `gpt-4o-mini`) |
| `model_provider` | **yes** | — | Provider: `openai`, `anthropic`, `google`, `mistral`, `xai`, `self-hosted` |
| `vw_api_token` | **yes** | — | VerifyWise JWT token or API key |
| `llm_api_key` | **yes** | — | API key for the LLM provider |
| `judge_model` | no | `gpt-4o` | Judge LLM model name |
| `judge_provider` | no | `openai` | Judge LLM provider |
| `threshold` | no | `0.7` | Pass threshold (0–1) |
| `timeout_minutes` | no | `30` | Max minutes to wait |
| `poll_interval_seconds` | no | `15` | Seconds between polls |
| `experiment_name` | no | *(auto)* | Custom experiment name |
| `fail_on_threshold` | no | `true` | Fail the step when thresholds are not met |

## Outputs

| Output | Description |
|--------|-------------|
| `passed` | `true` if all metrics passed, `false` otherwise |
| `results_path` | Path to the JSON results file |
| `summary_path` | Path to the Markdown summary file |
| `experiment_id` | ID of the created experiment on VerifyWise |

## Available Metrics

The exact set of metrics depends on your VerifyWise instance configuration. Common metrics include:

| Metric | Type | Description |
|--------|------|-------------|
| `correctness` | Normal | Factual accuracy of responses |
| `completeness` | Normal | Coverage of the expected answer |
| `answerRelevancy` | Normal | Relevance to the input prompt |
| `faithfulness` | Normal | Grounding in provided context |
| `contextualPrecision` | Normal | Precision of retrieved context |
| `contextualRecall` | Normal | Recall of relevant context |
| `hallucination` | **Inverted** | Lower is better — presence of fabricated content |
| `toxicity` | **Inverted** | Lower is better — harmful or offensive content |
| `bias` | **Inverted** | Lower is better — unfair bias in responses |

**Inverted metrics** pass when the score is at or below the threshold. Normal metrics pass when the score is at or above the threshold.

## Artifacts

The action uploads a `verifywise-eval-results` artifact containing:

- `verifywise-results.json` — Structured results with per-metric scores
- `verifywise-summary.md` — Human-readable Markdown summary

Artifacts are retained for 30 days.

## How It Works

1. Installs Python 3.11 and the `requests` library
2. Runs `ci_eval_runner.py` which calls the VerifyWise API to create an experiment
3. Polls the experiment status until completion or timeout
4. Parses results and writes JSON + Markdown output files
5. Checks each metric against its threshold
6. Fails the step if `fail_on_threshold` is `true` and any metric is below threshold
7. Uploads results as a build artifact

## Combining with the Reusable Workflow

This action can also be invoked via the reusable workflow at `.github/workflows/verifywise-eval.yml`, which wraps this action with PR comment posting built in:

```yaml
jobs:
  eval:
    uses: verifywise-ai/verifywise/.github/workflows/verifywise-eval.yml@main
    with:
      api_url: https://app.verifywise.ai
      project_id: proj_abc
      dataset_id: '2'
      metrics: 'correctness,faithfulness'
      model_name: gpt-4o-mini
      model_provider: openai
    secrets:
      VW_API_TOKEN: ${{ secrets.VW_API_TOKEN }}
      LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
```
