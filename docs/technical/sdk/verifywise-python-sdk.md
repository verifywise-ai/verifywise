# VerifyWise Python SDK

> **Version:** 0.1.0 | **Python:** >=3.9 | **License:** Apache-2.0

The VerifyWise Python SDK provides programmatic access to the VerifyWise AI governance platform. It covers LLM evaluations, datasets, reports, model-vs-model arena comparisons, bias audits, and project management. The package also ships a `verifywise` CLI for terminal-based workflows and CI/CD integration.

---

## Table of Contents

- [Installation](#installation)
- [Authentication](#authentication)
- [Client Initialization](#client-initialization)
- [API Namespaces](#api-namespaces)
  - [Experiments](#experiments)
  - [Datasets](#datasets)
  - [Reports](#reports)
  - [Arena](#arena)
  - [Projects](#projects)
  - [Organizations](#organizations)
  - [Models](#models)
  - [Scorers](#scorers)
  - [Logs](#logs)
  - [Metrics](#metrics)
  - [Bias Audits](#bias-audits)
- [Data Models](#data-models)
- [Error Handling](#error-handling)
- [Inverted Metrics](#inverted-metrics)
- [CLI Reference](#cli-reference)
  - [Global Options](#global-options)
  - [Commands](#commands)
- [CI/CD Integration](#cicd-integration)
  - [Python Script](#python-script)
  - [GitHub Actions Workflow](#github-actions-workflow)
  - [Standalone CI Runner](#standalone-ci-runner)
- [Testing](#testing)
- [Architecture](#architecture)

---

## Installation

From PyPI (when published):

```bash
pip install verifywise
```

From source:

```bash
cd EvalServer/sdk
pip install -e .
```

The only runtime dependency is `requests>=2.28`.

After installation the `verifywise` command is available on `PATH`.

---

## Authentication

Every API call requires two values:

| Value | Description |
|-------|-------------|
| **API URL** | Base URL of the VerifyWise instance (e.g. `https://app.verifywise.ai`) |
| **Token** | A JWT token or API key obtained from the platform |

These can be provided in three ways, in order of precedence:

1. **Constructor arguments** — `api_url` and `token` parameters to `VerifyWiseClient`
2. **CLI flags** — `--api-url` and `--token`
3. **Environment variables** — `VW_API_URL` and `VW_API_TOKEN`

---

## Client Initialization

```python
from verifywise import VerifyWiseClient

client = VerifyWiseClient(
    api_url="https://your-instance.com",
    token="your-jwt-token",
    timeout=30,  # default request timeout in seconds
)
```

### Constructor Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `api_url` | `str` | *(required)* | Base URL of the VerifyWise instance. Trailing slash is stripped automatically. |
| `token` | `str` | *(required)* | JWT token or API key. Sent as `Authorization: Bearer <token>` on every request. |
| `timeout` | `int` | `30` | Default request timeout in seconds. Individual methods may override this. |

All API paths are prefixed with `/api/deepeval/` internally.

---

## API Namespaces

The client exposes 11 namespace objects, each grouping related operations:

| Namespace | Accessor | Description |
|-----------|----------|-------------|
| Experiments | `client.experiments` | Create, poll, and manage LLM evaluations |
| Datasets | `client.datasets` | Upload, list, read, and delete evaluation datasets |
| Reports | `client.reports` | Generate, list, download, and delete PDF/HTML reports |
| Arena | `client.arena` | Run model-vs-model comparisons |
| Projects | `client.projects` | Manage evaluation projects |
| Organizations | `client.orgs` | Manage organizations and their projects |
| Models | `client.models` | Save, list, and validate model configurations |
| Scorers | `client.scorers` | Create and test custom LLM-as-judge scoring functions |
| Logs | `client.logs` | Query per-prompt evaluation log entries |
| Metrics | `client.metrics` | List available metrics and query aggregated stats |
| Bias Audits | `client.bias_audits` | Run fairness and bias evaluations on CSV data |

---

### Experiments

The core namespace for running LLM evaluations.

#### `client.experiments.create(...) -> Experiment`

Create and start an evaluation experiment.

```python
exp = client.experiments.create(
    project_id="proj_abc",
    name="Nightly Eval — GPT-4o-mini",
    model_name="gpt-4o-mini",
    model_provider="openai",
    dataset_id="2",                          # resolves path automatically
    metrics=["correctness", "faithfulness"],
    threshold=0.7,
    judge_model="gpt-4o",                    # default
    judge_provider="openai",                 # default
    description="Automated nightly run",
    config_overrides=None,                   # optional dict merged into config
)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `project_id` | `str` | *(required)* | Project to run under |
| `name` | `str` | *(required)* | Experiment display name |
| `model_name` | `str` | *(required)* | Model identifier (e.g. `gpt-4o-mini`, `claude-3-5-sonnet`) |
| `model_provider` | `str` | *(required)* | One of: `openai`, `anthropic`, `google`, `mistral`, `xai`, `self-hosted` |
| `dataset_id` | `str` | `None` | Dataset ID — the SDK resolves its file path via `datasets/user` |
| `dataset_path` | `str` | `None` | Direct dataset file path (alternative to `dataset_id`) |
| `metrics` | `List[str]` | `None` | Metric names to evaluate |
| `threshold` | `float` | `0.7` | Pass/fail threshold (0–1) |
| `judge_model` | `str` | `"gpt-4o"` | LLM used to judge responses |
| `judge_provider` | `str` | `"openai"` | Provider for the judge LLM |
| `description` | `str` | `""` | Optional description |
| `config_overrides` | `Dict` | `None` | Arbitrary keys merged into the experiment config |

Either `dataset_id` or `dataset_path` must be provided.

#### `client.experiments.list(...) -> List[Experiment]`

```python
experiments = client.experiments.list(
    project_id="proj_abc",   # optional filter
    status="completed",      # optional: pending, running, completed, failed
    limit=100,               # default
    offset=0,                # default
)
```

#### `client.experiments.list_all(project_id=None) -> List[Experiment]`

Returns all experiments without pagination.

#### `client.experiments.get(experiment_id) -> Experiment`

Fetch a single experiment by ID, including its full config and results.

#### `client.experiments.update(experiment_id, *, name=None, description=None) -> Experiment`

Update the name or description of an experiment.

#### `client.experiments.delete(experiment_id) -> None`

Delete an experiment and all its associated logs.

#### `client.experiments.poll(...) -> Experiment`

Block until an experiment reaches `completed` or `failed` status.

```python
completed = client.experiments.poll(
    "exp_123",
    timeout_minutes=30,    # default
    poll_interval=10,      # seconds between checks, default
    on_status=lambda s: print(f"Status: {s}"),  # optional callback
)
```

Raises `TimeoutError` if the experiment does not finish within `timeout_minutes`.

#### `client.experiments.run_and_wait(...) -> EvalResults`

High-level convenience method that chains `create` -> `poll` -> `EvalResults.from_experiment`. This is the primary method for CI/CD use.

```python
results = client.experiments.run_and_wait(
    project_id="proj_abc",
    name="CI Eval",
    model_name="gpt-4o-mini",
    model_provider="openai",
    dataset_id="2",
    metrics=["correctness", "completeness", "hallucination"],
    threshold=0.7,
    timeout_minutes=30,
    poll_interval=10,
    on_status=lambda s: print(f"Status: {s}"),
)

assert results.passed
for m in results.metrics:
    print(f"  {m.name}: {m.score:.1%}")
```

Returns an `EvalResults` dataclass (see [Data Models](#data-models)).

---

### Datasets

#### `client.datasets.list_user(org_id=None) -> List[Dataset]`

List user-uploaded datasets. Returns typed `Dataset` objects.

#### `client.datasets.list_builtin(use_case=None) -> List[Dict]`

List built-in preset datasets. Optional `use_case` filter: `"chatbot"`, `"rag"`, `"agent"`.

#### `client.datasets.info() -> Dict`

Get metadata about built-in datasets (prompt counts, categories, difficulties).

#### `client.datasets.read(path) -> List[Dict]`

Read the contents of a dataset file by its server-side path.

```python
prompts = client.datasets.read("data/uploads/org1/my_dataset.json")
for p in prompts:
    print(p["input"], "->", p.get("expected_output"))
```

#### `client.datasets.upload(file_path, name, *, dataset_type="chatbot", turn_type="single-turn") -> Dict`

Upload a local JSON dataset file.

```python
client.datasets.upload(
    "my_dataset.json",
    name="Custom QA Pairs",
    dataset_type="chatbot",    # chatbot | rag | agent
    turn_type="single-turn",   # single-turn | multi-turn
)
```

#### `client.datasets.delete(paths) -> None`

Delete uploaded datasets by their server-side file paths.

```python
client.datasets.delete(["data/uploads/org1/old_dataset.json"])
```

#### `client.datasets.list_uploads() -> List[Dict]`

List uploaded dataset files with file metadata.

---

### Reports

#### `client.reports.generate(...) -> Report`

Generate a PDF or HTML report from one or more experiments.

```python
report = client.reports.generate(
    experiment_ids=["exp_001", "exp_002"],
    project_id="proj_abc",
    title="Monthly Eval Report",
    format="pdf",                        # pdf | html
    sections=None,                       # optional list of section names
    include_detailed_samples=False,
    include_arena=False,
    org_name="",
)
```

The request has a 180-second timeout to allow for report generation.

#### `client.reports.list(project_id=None) -> List[Report]`

List stored reports, optionally filtered by project.

#### `client.reports.download(report_id) -> bytes`

Download a report's file content as raw bytes. Has a 60-second timeout.

#### `client.reports.download_to_file(report_id, output_path) -> str`

Download a report and write it to disk. Returns the output path.

```python
client.reports.download_to_file("r_001", "eval_report.pdf")
```

#### `client.reports.delete(report_id) -> None`

Delete a stored report.

#### `client.reports.generate_and_download(experiment_ids, output_path, **kwargs) -> Report`

Generate and download in one call.

```python
report = client.reports.generate_and_download(
    ["exp_001", "exp_002"],
    "eval_report.pdf",
    project_id="proj_abc",
    title="Monthly Report",
)
```

---

### Arena

Run model-vs-model comparisons where a judge LLM picks a winner.

#### `client.arena.compare(...) -> ArenaComparison`

Start an arena comparison.

```python
comp = client.arena.compare(
    contestants=[
        {"name": "GPT-4o-mini", "hyperparameters": {"provider": "openai", "model": "gpt-4o-mini"}},
        {"name": "Claude Haiku", "hyperparameters": {"provider": "anthropic", "model": "claude-3-5-haiku-20241022"}},
    ],
    dataset_id="2",
    judge_model="gpt-4o",
    metric="overall_quality",
    num_samples=10,
)
```

#### `client.arena.list(org_id=None) -> List[ArenaComparison]`

List arena comparisons.

#### `client.arena.get(comparison_id) -> ArenaComparison`

Get current status of a comparison.

#### `client.arena.get_results(comparison_id) -> Dict`

Get detailed results (winner, per-prompt scores, etc.).

#### `client.arena.delete(comparison_id) -> None`

Delete a comparison.

#### `client.arena.compare_and_wait(...) -> Dict`

Start, poll until done, and return results.

```python
results = client.arena.compare_and_wait(
    contestants=[...],
    dataset_id="2",
    timeout_minutes=30,
    poll_interval=10,
)
print(results["winner"])
```

Raises `TimeoutError` on timeout, `RuntimeError` if the comparison fails.

---

### Projects

#### `client.projects.list() -> List[Project]`

List all evaluation projects.

#### `client.projects.create(name, *, description="", use_case="") -> Project`

Create a new project. `use_case` can be `"chatbot"`, `"rag"`, `"agent"`, etc.

#### `client.projects.get(project_id) -> Project`

Get a project by ID.

#### `client.projects.update(project_id, **fields) -> Project`

Update project fields.

#### `client.projects.delete(project_id) -> None`

Delete a project and all its experiments.

#### `client.projects.stats(project_id) -> Dict`

Get project statistics (experiment counts, average metrics).

#### `client.projects.dashboard(project_id) -> Dict`

Get monitoring dashboard data (recent metrics, logs, experiments).

---

### Organizations

#### `client.orgs.list() -> List[Org]`

List all organizations.

#### `client.orgs.create(name) -> Org`

Create an organization.

#### `client.orgs.update(org_id, **fields) -> Org`

Update an organization.

#### `client.orgs.delete(org_id) -> None`

Delete an organization.

#### `client.orgs.list_projects(org_id) -> List[Project]`

List projects belonging to a specific organization.

---

### Models

Manage saved model configurations that can be reused across experiments.

#### `client.models.list(org_id=None) -> List[ModelConfig]`

List saved model configurations.

#### `client.models.create(name, provider, model_name, *, endpoint_url="", config=None) -> ModelConfig`

```python
client.models.create("My GPT-4o", provider="openai", model_name="gpt-4o")
```

#### `client.models.update(model_id, **fields) -> ModelConfig`

Update a model configuration.

#### `client.models.delete(model_id) -> None`

Delete a model configuration.

#### `client.models.get_latest() -> Optional[ModelConfig]`

Get the most recently used model configuration. Returns `None` if none exist.

#### `client.models.validate(provider, api_key, model_name="") -> Dict`

Validate an API key against a provider.

```python
result = client.models.validate("openai", "sk-...", "gpt-4o")
print(result["valid"])
```

---

### Scorers

Manage custom LLM-as-judge scoring functions.

#### `client.scorers.list(org_id=None) -> List[Scorer]`

List saved scorers.

#### `client.scorers.create(name, provider, model, prompt_template, *, config=None) -> Scorer`

Create a custom scorer with a prompt template.

#### `client.scorers.update(scorer_id, **fields) -> Scorer`

Update a scorer.

#### `client.scorers.delete(scorer_id) -> None`

Delete a scorer.

#### `client.scorers.get_latest() -> Optional[Scorer]`

Get the most recently used scorer.

#### `client.scorers.test(scorer_id, input_text, output_text) -> Dict`

Test a scorer with sample input/output.

```python
result = client.scorers.test(1, input_text="What is 2+2?", output_text="4")
print(result["score"])  # e.g. 0.95
```

---

### Logs

Query per-prompt evaluation log entries.

#### `client.logs.list(*, project_id=None, experiment_id=None, status=None, limit=100, offset=0) -> List[Dict]`

List evaluation log entries with optional filters.

#### `client.logs.create(log_data) -> Dict`

Create a log entry. `log_data` is a free-form dictionary.

---

### Metrics

#### `client.metrics.available() -> List[Dict]`

List all available DeepEval metrics and their requirements.

```python
for m in client.metrics.available():
    ctx = " (requires context)" if m.get("requires_context") else ""
    print(f"  {m['name']}{ctx}")
```

#### `client.metrics.aggregates(project_id, *, metric_name=None, start_date=None, end_date=None) -> Dict`

Get aggregated metric statistics for a project. Dates are ISO 8601 strings.

---

### Bias Audits

Run fairness and bias evaluations on tabular CSV data.

#### `client.bias_audits.presets() -> List[Dict]`

List available bias audit presets (e.g. employment, lending, healthcare).

#### `client.bias_audits.get_preset(preset_id) -> Dict`

Get a specific preset configuration.

#### `client.bias_audits.run(csv_file_path, config, *, org_id=None, project_id=None) -> BiasAudit`

Start a bias audit by uploading a CSV file.

```python
audit = client.bias_audits.run(
    "hiring_data.csv",
    config={"preset": "employment", "protected_attributes": ["gender", "race"]},
)
```

#### `client.bias_audits.list(org_id=None, project_id=None) -> List[BiasAudit]`

List bias audits.

#### `client.bias_audits.poll_status(audit_id) -> BiasAudit`

Check the current status of a bias audit.

#### `client.bias_audits.get_results(audit_id) -> Dict`

Get the results of a completed bias audit.

#### `client.bias_audits.delete(audit_id) -> None`

Delete a bias audit.

#### `client.bias_audits.parse_headers(csv_file_path) -> List[str]`

Parse CSV headers for column mapping configuration.

#### `client.bias_audits.run_and_wait(csv_file_path, config, *, timeout_minutes=30, poll_interval=10, **kwargs) -> Dict`

Run a bias audit, poll until completion, and return results.

```python
results = client.bias_audits.run_and_wait(
    "hiring_data.csv",
    config={"preset": "employment", "protected_attributes": ["gender", "race"]},
    timeout_minutes=20,
)
```

---

## Data Models

All models are Python `dataclasses` with a `from_dict(d)` class method for deserialization.

### `Experiment`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `str` | Unique experiment ID |
| `name` | `str` | Display name |
| `status` | `str` | `pending`, `running`, `completed`, or `failed` |
| `project_id` | `str` | Parent project ID |
| `description` | `str` | Optional description |
| `config` | `Dict` | Full experiment configuration (model, dataset, metrics, judge) |
| `results` | `Optional[Dict]` | Raw results including `avg_scores`, `metric_thresholds`, `total_prompts`, `duration` |
| `error_message` | `str` | Error message if status is `failed` |
| `created_at` | `str` | ISO 8601 creation timestamp |
| `completed_at` | `str` | ISO 8601 completion timestamp |
| `created_by` | `Optional[int]` | User ID of the creator |

### `EvalResults`

Parsed evaluation results returned by `run_and_wait`. Created via `EvalResults.from_experiment(exp, default_threshold)`.

| Field | Type | Description |
|-------|------|-------------|
| `experiment_id` | `str` | Source experiment ID |
| `name` | `str` | Experiment name |
| `status` | `str` | Experiment status |
| `model` | `str` | Evaluated model name |
| `passed` | `bool` | `True` if all metrics pass their thresholds |
| `metrics` | `List[MetricResult]` | Per-metric breakdown |
| `total_prompts` | `int` | Number of prompts evaluated |
| `duration_ms` | `Optional[float]` | Evaluation duration in milliseconds |

### `MetricResult`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `str` | Metric name (e.g. `correctness`, `hallucination`) |
| `score` | `float` | Score value (0–1) |
| `threshold` | `float` | Pass/fail threshold |
| `passed` | `bool` | Whether this metric passes |
| `inverted` | `bool` | `True` for metrics where lower is better (see [Inverted Metrics](#inverted-metrics)) |

### `Dataset`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `Any` | Dataset ID |
| `name` | `str` | Display name |
| `path` | `str` | Server-side file path |
| `prompt_count` | `int` | Number of prompts |
| `dataset_type` | `str` | `chatbot`, `rag`, or `agent` |
| `turn_type` | `str` | `single-turn` or `multi-turn` |
| `created_at` | `str` | Creation timestamp |

### `ModelConfig`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `Any` | Config ID |
| `name` | `str` | Display name |
| `provider` | `str` | Provider identifier |
| `model_name` | `str` | Model identifier |
| `endpoint_url` | `str` | Custom endpoint URL (for self-hosted) |
| `config` | `Dict` | Additional configuration |

### `Scorer`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `Any` | Scorer ID |
| `name` | `str` | Display name |
| `provider` | `str` | LLM provider |
| `model` | `str` | LLM model used for scoring |
| `prompt_template` | `str` | Scoring prompt template |
| `config` | `Dict` | Additional configuration |

### `Report`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `str` | Report ID |
| `title` | `str` | Report title |
| `format` | `str` | `pdf` or `html` |
| `file_size` | `int` | Size in bytes |
| `experiment_ids` | `List[str]` | Experiments included |
| `project_id` | `str` | Parent project |
| `created_at` | `str` | Creation timestamp |

### `Project`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `str` | Project ID |
| `name` | `str` | Display name |
| `description` | `str` | Description |
| `use_case` | `str` | `chatbot`, `rag`, `agent`, etc. |
| `created_at` | `str` | Creation timestamp |

### `Org`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `str` | Organization ID |
| `name` | `str` | Organization name |

### `ArenaComparison`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `str` | Comparison ID |
| `status` | `str` | `running`, `completed`, or `failed` |
| `contestants` | `List[Dict]` | Model contestant configurations |
| `results` | `Optional[Dict]` | Raw results (when completed) |
| `created_at` | `str` | Creation timestamp |

### `BiasAudit`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `str` | Audit ID |
| `status` | `str` | `running`, `completed`, or `failed` |
| `config` | `Dict` | Audit configuration (preset, protected attributes, etc.) |
| `results` | `Optional[Dict]` | Raw results (when completed) |
| `created_at` | `str` | Creation timestamp |

---

## Error Handling

All exceptions inherit from `VerifyWiseError` and carry `status_code` and `response_body` attributes.

| Exception | HTTP Status | When |
|-----------|-------------|------|
| `AuthenticationError` | 401, 403, 406 | Invalid, expired, or missing token |
| `NotFoundError` | 404 | Resource does not exist |
| `ValidationError` | 400, 422 | Invalid request body or parameters |
| `ServerError` | 5xx | Server-side failure |
| `TimeoutError` | *(n/a)* | Polling exceeded `timeout_minutes` |
| `VerifyWiseError` | *(any other)* | Catch-all for unexpected HTTP errors |

```python
from verifywise import VerifyWiseClient, AuthenticationError, NotFoundError, TimeoutError

try:
    results = client.experiments.run_and_wait(...)
except AuthenticationError:
    print("Invalid or expired token")
except NotFoundError:
    print("Project or dataset not found")
except TimeoutError:
    print("Evaluation took too long")
```

---

## Inverted Metrics

Metrics whose name contains `bias`, `toxicity`, or `hallucination` (case-insensitive) are treated as **inverted**: lower scores are better.

For inverted metrics:
- A score **passes** if `score <= threshold`
- A score **fails** if `score > threshold`

For normal metrics:
- A score **passes** if `score >= threshold`
- A score **fails** if `score < threshold`

The `MetricResult.inverted` field indicates which behavior applies.

---

## CLI Reference

After installation, the `verifywise` command is available globally.

```
verifywise [--api-url URL] [--token TOKEN] [--json] <command> <subcommand> [options]
```

### Global Options

| Flag | Environment Variable | Description |
|------|---------------------|-------------|
| `--api-url URL` | `VW_API_URL` | VerifyWise API base URL |
| `--token TOKEN` | `VW_API_TOKEN` | JWT or API key |
| `--json` | — | Output machine-readable JSON instead of tables |
| `-V`, `--version` | — | Print SDK version |

### Commands

#### `verifywise config`

Display the current API URL, masked token, and SDK version. Does not require authentication.

#### `verifywise projects`

| Subcommand | Description |
|------------|-------------|
| `list` | List all projects |
| `get <project_id>` | Show project details |
| `create --name NAME [--description D] [--use-case U]` | Create a project |
| `delete <project_id>` | Delete a project |
| `stats <project_id>` | Show project statistics |

#### `verifywise experiments`

| Subcommand | Description |
|------------|-------------|
| `list [--project-id P] [--status S] [--limit N]` | List experiments |
| `get <experiment_id>` | Show experiment details and scores |
| `delete <experiment_id>` | Delete an experiment |
| `run --project-id P --name N --model-name M --model-provider P --metrics M [opts]` | Full evaluation workflow |

The `run` subcommand creates an experiment, polls until completion, prints a pass/fail report, and **exits with code 1** if any metric fails its threshold. This makes it suitable for CI gating.

`run` options:

| Flag | Default | Description |
|------|---------|-------------|
| `--project-id` | *(required)* | Project ID |
| `--name` | *(required)* | Experiment name |
| `--model-name` | *(required)* | Model to evaluate |
| `--model-provider` | *(required)* | Provider name |
| `--dataset-id` | — | Dataset ID |
| `--dataset-path` | — | Direct dataset file path |
| `--metrics` | *(required)* | Comma-separated metric names |
| `--threshold` | `0.7` | Pass threshold (0–1) |
| `--judge-model` | `gpt-4o` | Judge LLM model |
| `--judge-provider` | `openai` | Judge LLM provider |
| `--timeout` | `30` | Timeout in minutes |
| `--poll-interval` | `10` | Poll interval in seconds |

#### `verifywise datasets`

| Subcommand | Description |
|------------|-------------|
| `list` | List uploaded datasets |
| `list-builtin [--use-case U]` | List built-in preset datasets |
| `upload <file> --name N [--type T] [--turn-type T]` | Upload a JSON dataset |
| `read <path>` | Read dataset contents |

#### `verifywise reports`

| Subcommand | Description |
|------------|-------------|
| `list [--project-id P]` | List stored reports |
| `generate --experiments E1,E2 [--project-id P] [--title T] [--format pdf\|html]` | Generate a report |
| `download <report_id> --output PATH` | Download a report file |

#### `verifywise metrics`

| Subcommand | Description |
|------------|-------------|
| `list` | List all available evaluation metrics |
| `aggregates <project_id> [--metric M]` | Get aggregated metric stats |

#### `verifywise models`

| Subcommand | Description |
|------------|-------------|
| `list` | List saved model configurations |
| `create --name N --provider P --model-name M` | Create a model configuration |
| `delete <model_id>` | Delete a model configuration |
| `validate --provider P --api-key K [--model-name M]` | Validate an API key |

#### `verifywise scorers`

| Subcommand | Description |
|------------|-------------|
| `list` | List saved scorers |

#### `verifywise logs`

| Subcommand | Description |
|------------|-------------|
| `list [--project-id P] [--experiment-id E] [--limit N]` | List evaluation logs |

---

## CI/CD Integration

Four integration methods are available, from simplest to most flexible.

### 1. GitHub Actions — Composite Action (Recommended)

The composite action at `.github/actions/eval/` is the recommended way to integrate VerifyWise evaluations into GitHub Actions. It bundles the runner script, handles Python setup, threshold checking, and artifact uploads in a single step.

```yaml
steps:
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
      vw_api_token: ${{ secrets.VW_API_TOKEN }}
      llm_api_key: ${{ secrets.LLM_API_KEY }}

  - name: Use outputs
    if: always()
    run: |
      echo "Passed: ${{ steps.eval.outputs.passed }}"
      echo "Experiment: ${{ steps.eval.outputs.experiment_id }}"
```

#### Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api_url` | **yes** | — | VerifyWise instance URL |
| `project_id` | **yes** | — | Project ID |
| `dataset_id` | **yes** | — | Dataset ID |
| `metrics` | **yes** | — | Comma-separated metric names |
| `model_name` | **yes** | — | Model to evaluate |
| `model_provider` | **yes** | — | Provider: `openai`, `anthropic`, `google`, `mistral`, `xai`, `self-hosted` |
| `vw_api_token` | **yes** | — | VerifyWise JWT token or API key |
| `llm_api_key` | **yes** | — | API key for the LLM provider |
| `judge_model` | no | `gpt-4o` | Judge LLM model |
| `judge_provider` | no | `openai` | Judge LLM provider |
| `threshold` | no | `0.7` | Pass threshold (0–1) |
| `timeout_minutes` | no | `30` | Max wait time |
| `poll_interval_seconds` | no | `15` | Seconds between polls |
| `experiment_name` | no | *(auto)* | Custom experiment name |
| `fail_on_threshold` | no | `true` | Fail the step when thresholds are not met |

#### Action Outputs

| Output | Description |
|--------|-------------|
| `passed` | `true` if all metrics passed, `false` otherwise |
| `results_path` | Path to the JSON results file |
| `summary_path` | Path to the Markdown summary file |
| `experiment_id` | ID of the created experiment |

#### Action Behavior

1. Sets up Python 3.11 and installs `requests`
2. Runs the bundled `ci_eval_runner.py` against the VerifyWise API
3. Writes structured JSON results and a Markdown summary to temp files
4. Checks each metric against its threshold
5. Fails the step if `fail_on_threshold` is `true` and any metric is below threshold
6. Uploads `verifywise-eval-results` artifact (retained 30 days)

### 2. GitHub Actions — Reusable Workflow

A reusable workflow at `.github/workflows/verifywise-eval.yml` wraps the composite action and adds PR comment posting. Use this when you want a complete job rather than a step.

```yaml
jobs:
  eval:
    uses: verifywise-ai/verifywise/.github/workflows/verifywise-eval.yml@main
    with:
      api_url: https://your-verifywise-instance.com
      project_id: "proj_abc"
      dataset_id: "2"
      metrics: "correctness,faithfulness,hallucination"
      model_name: gpt-4o-mini
      model_provider: openai
      threshold: "0.7"
    secrets:
      VW_API_TOKEN: ${{ secrets.VW_API_TOKEN }}
      LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
```

The workflow accepts all the same inputs as the composite action, plus:

| Extra Input | Default | Description |
|-------------|---------|-------------|
| `post_pr_comment` | `true` | Automatically post a Markdown results table as a PR comment |

### 3. Python Script

Use the SDK directly in any CI script (GitHub Actions, GitLab CI, Jenkins, etc.):

```python
import os, sys
from verifywise import VerifyWiseClient

client = VerifyWiseClient(
    api_url=os.environ["VW_API_URL"],
    token=os.environ["VW_API_TOKEN"],
)

results = client.experiments.run_and_wait(
    project_id=os.environ["VW_PROJECT_ID"],
    name=f"CI Eval — {os.environ.get('GITHUB_SHA', 'local')[:8]}",
    model_name="gpt-4o-mini",
    model_provider="openai",
    dataset_id=os.environ["VW_DATASET_ID"],
    metrics=["correctness", "completeness", "hallucination"],
    threshold=0.7,
)

if not results.passed:
    for m in results.metrics:
        if not m.passed:
            print(f"  FAIL: {m.name}: {m.score:.1%} (threshold: {m.threshold:.0%})")
    sys.exit(1)

print("All metrics passed!")
```

### 4. Standalone CI Runner

For environments without the SDK, use the standalone script directly. It requires only `requests`:

```bash
python EvalServer/scripts/ci_eval_runner.py \
  --api-url "$VW_API_URL" \
  --token "$VW_API_TOKEN" \
  --project-id "$VW_PROJECT_ID" \
  --dataset-id "$VW_DATASET_ID" \
  --metrics "correctness,faithfulness" \
  --model-name "gpt-4o-mini" \
  --model-provider "openai" \
  --threshold 0.7 \
  --output results.json \
  --markdown-output summary.md
```

All flags can also be set via environment variables (prefix `VW_`). No SDK installation needed.

**Exit codes:**

| Code | Meaning |
|------|---------|
| `0` | All metrics passed |
| `1` | One or more metrics below threshold |
| `2` | Error (timeout, API failure, missing arguments) |

---

## Testing

Run the full test suite:

```bash
cd EvalServer/sdk
pip install -e .
python -m pytest tests/ -v
```

The test suite contains 93 tests across two files:

| File | Tests | Coverage |
|------|-------|----------|
| `tests/test_sdk.py` | 58 | Client core, all 11 API namespaces, data models, end-to-end CI workflow |
| `tests/test_cli.py` | 35 | Help output, auth errors, config masking, table formatting, all command handlers, JSON output, exit codes, parser structure |

All tests mock the HTTP layer — no running server is needed.

---

## Architecture

```
EvalServer/sdk/
├── pyproject.toml              # Package metadata, entry point, dependencies
├── README.md                   # Quick-start guide
├── src/verifywise/
│   ├── __init__.py             # Public API exports, __version__
│   ├── client.py               # VerifyWiseClient, _BaseAPI, HTTP layer
│   ├── cli.py                  # CLI (argparse, all commands)
│   ├── exceptions.py           # Exception hierarchy
│   ├── models.py               # Dataclasses (Experiment, EvalResults, Dataset, etc.)
│   ├── experiments.py          # ExperimentsAPI (create, poll, run_and_wait)
│   ├── datasets.py             # DatasetsAPI
│   ├── reports.py              # ReportsAPI
│   ├── arena.py                # ArenaAPI
│   ├── projects.py             # ProjectsAPI
│   ├── orgs.py                 # OrgsAPI
│   ├── model_configs.py        # ModelsAPI
│   ├── scorers.py              # ScorersAPI
│   ├── logs.py                 # LogsAPI
│   ├── metrics.py              # MetricsAPI
│   └── bias_audits.py          # BiasAuditsAPI
└── tests/
    ├── test_sdk.py             # SDK unit tests (58 tests)
    └── test_cli.py             # CLI unit tests (35 tests)
```

All API modules inherit from `_BaseAPI` which delegates HTTP calls to `VerifyWiseClient._request()`. The client uses `requests.Session` for connection pooling and persistent auth headers. Every API path is prefixed with `/api/deepeval/`.
