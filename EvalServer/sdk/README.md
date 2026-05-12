# VerifyWise Python SDK

Python SDK for the [VerifyWise](https://verifywise.ai) AI governance platform. Manage LLM evaluations, datasets, reports, arena comparisons, and bias audits programmatically.

## Installation

```bash
pip install verifywise
```

Or install from source:

```bash
cd EvalServer/sdk
pip install -e .
```

## Quick Start

```python
from verifywise import VerifyWiseClient

client = VerifyWiseClient(
    api_url="https://your-instance.com",
    token="your-jwt-token",
)

# List projects
projects = client.projects.list()
for p in projects:
    print(f"{p.id}: {p.name}")
```

## Run an Evaluation

```python
# One-liner: create experiment, poll until done, get results
results = client.experiments.run_and_wait(
    project_id="project_abc123",
    name="Nightly Eval — GPT-4o-mini",
    model_name="gpt-4o-mini",
    model_provider="openai",
    dataset_id="2",
    metrics=["correctness", "completeness", "answerRelevancy"],
    threshold=0.7,
    timeout_minutes=15,
)

print(f"Passed: {results.passed}")
for m in results.metrics:
    status = "PASS" if m.passed else "FAIL"
    print(f"  [{status}] {m.name}: {m.score:.1%} (threshold: {m.threshold:.0%})")
```

Or with more control:

```python
# Create
exp = client.experiments.create(
    project_id="project_abc123",
    name="Manual Eval",
    model_name="gpt-4o-mini",
    model_provider="openai",
    dataset_id="2",
    metrics=["correctness", "hallucination"],
)

# Poll
completed = client.experiments.poll(
    exp.id,
    timeout_minutes=10,
    on_status=lambda s: print(f"Status: {s}"),
)

# Parse
from verifywise import EvalResults
results = EvalResults.from_experiment(completed, default_threshold=0.7)
```

## Datasets

```python
# List user datasets
datasets = client.datasets.list_user()

# Upload a new dataset
client.datasets.upload(
    "my_dataset.json",
    name="Custom QA Pairs",
    dataset_type="chatbot",
    turn_type="single-turn",
)

# Read dataset contents
prompts = client.datasets.read("data/uploads/org1/my_dataset.json")
```

## Reports

```python
# Generate and download in one call
report = client.reports.generate_and_download(
    experiment_ids=["exp_001", "exp_002"],
    output_path="eval_report.pdf",
    project_id="project_abc123",
    title="Monthly Eval Report",
)

# Or step by step
report = client.reports.generate(
    experiment_ids=["exp_001"],
    format="pdf",
)
pdf_bytes = client.reports.download(report.id)

# List saved reports
for r in client.reports.list():
    print(f"{r.title} ({r.format}) — {r.file_size} bytes")
```

## Arena Comparisons

```python
results = client.arena.compare_and_wait(
    contestants=[
        {"name": "GPT-4o-mini", "hyperparameters": {"provider": "openai", "model": "gpt-4o-mini"}},
        {"name": "Claude Haiku", "hyperparameters": {"provider": "anthropic", "model": "claude-3-5-haiku-20241022"}},
    ],
    dataset_id="2",
    judge_model="gpt-4o",
    timeout_minutes=15,
)
```

## Models & Scorers

```python
# Saved model configs
models = client.models.list()
client.models.create("My GPT-4o", provider="openai", model_name="gpt-4o")

# Custom scorers
scorers = client.scorers.list()
result = client.scorers.test(scorer_id=1, input_text="Hello", output_text="Hi there!")
```

## Bias Audits

```python
results = client.bias_audits.run_and_wait(
    csv_file_path="hiring_data.csv",
    config={"preset": "employment", "protected_attributes": ["gender", "race"]},
    timeout_minutes=20,
)
```

## CI/CD Integration

```python
import sys
from verifywise import VerifyWiseClient

client = VerifyWiseClient(api_url=os.environ["VW_API_URL"], token=os.environ["VW_API_TOKEN"])

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
    print("Evaluation FAILED")
    for m in results.metrics:
        if not m.passed:
            print(f"  {m.name}: {m.score:.1%} < {m.threshold:.0%}")
    sys.exit(1)

print("Evaluation PASSED")
```

## Error Handling

```python
from verifywise import VerifyWiseClient, AuthenticationError, NotFoundError, TimeoutError

try:
    results = client.experiments.run_and_wait(...)
except AuthenticationError:
    print("Invalid or expired token")
except NotFoundError:
    print("Resource not found")
except TimeoutError:
    print("Experiment took too long")
```

## API Reference

| Namespace | Methods |
|-----------|---------|
| `client.experiments` | `create`, `list`, `list_all`, `get`, `update`, `delete`, `poll`, `run_and_wait` |
| `client.datasets` | `list_user`, `list_builtin`, `info`, `read`, `upload`, `delete`, `list_uploads` |
| `client.models` | `list`, `create`, `update`, `delete`, `get_latest`, `validate` |
| `client.scorers` | `list`, `create`, `update`, `delete`, `get_latest`, `test` |
| `client.reports` | `generate`, `list`, `download`, `download_to_file`, `delete`, `generate_and_download` |
| `client.arena` | `compare`, `list`, `get`, `get_results`, `delete`, `compare_and_wait` |
| `client.projects` | `list`, `create`, `get`, `update`, `delete`, `stats`, `dashboard` |
| `client.orgs` | `list`, `create`, `update`, `delete`, `list_projects` |
| `client.logs` | `list`, `create` |
| `client.bias_audits` | `presets`, `get_preset`, `run`, `list`, `poll_status`, `get_results`, `delete`, `parse_headers`, `run_and_wait` |
| `client.metrics` | `available`, `aggregates` |
