# LLM Evals Test Suite

Exhaustive, zero-API-credit test coverage for the LLM Evals stack.

| Suite | Location | Tests | Runner |
|-------|----------|------:|--------|
| EvalServer | `EvalServer/tests/` | 179 | pytest |
| EvaluationModule | `EvaluationModule/tests/` | 80 | pytest |
| Servers (DeepEval proxy + AI gateway util) | `Servers/routes/__tests__/`, `Servers/utils/__tests__/` | 55 | Jest |
| Integration smoke (opt-in) | `EvalServer/tests/test_integration_openrouter.py` | 5 | pytest |
| **Total** | | **319** | |

The Python suites mock LLM APIs, the database, and DeepEval internals so they
finish in seconds, cost nothing, and are fully deterministic. The TypeScript
suites mock Sequelize and the encryption util.

---

## One-time setup

### Python (EvalServer + EvaluationModule)

Each Python service has its own venv. Reuse existing ones if present.

```bash
# EvalServer
cd EvalServer
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt -r requirements-test.txt

# EvaluationModule (separate venv)
cd ../EvaluationModule
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install pytest pytest-asyncio pytest-httpx respx httpx
```

> The EvaluationModule tests reuse the same test deps as EvalServer
> (`pytest`, `pytest-asyncio`, `pytest-httpx`, `respx`, `httpx`). They aren't
> pinned in a `requirements-test.txt` because the module ships as a library;
> install them once into the venv.

### TypeScript (Servers)

```bash
cd Servers
npm install
```

---

## Running the tests

### Python — EvalServer

```bash
cd EvalServer
venv/bin/python -m pytest tests/ -m "not integration"           # all unit tests
venv/bin/python -m pytest tests/ -v -m "not integration"        # verbose
venv/bin/python -m pytest tests/test_api_experiments.py -v      # one file
venv/bin/python -m pytest \
    tests/test_api_experiments.py::test_create_experiment_success -v   # one test
```

Patterns:

```bash
venv/bin/python -m pytest tests/ -k "openrouter"                # name filter
venv/bin/python -m pytest tests/ -x                             # stop on 1st failure
venv/bin/python -m pytest tests/ --lf                           # only last-failed
```

### Python — EvaluationModule

```bash
cd EvaluationModule
venv/bin/python -m pytest tests/
venv/bin/python -m pytest tests/test_model_runner.py -v
```

### TypeScript — Servers

```bash
cd Servers

# All tests (Jest picks up the new files automatically)
npm test

# Just the new LLM Evals tests
npx jest routes/__tests__/deepEvalRoutes.test.ts \
        utils/__tests__/aiGatewayEvalKey.utils.test.ts

# Single test by name
npx jest -t "injects key for cloud model provider"
```

---

## Opt-in integration smoke tests

Five tests in `EvalServer/tests/test_integration_openrouter.py` exercise real
upstream APIs. They're skipped unless **both**:

1. `RUN_INTEGRATION_TESTS=1` is set, **and**
2. The relevant per-provider API key is set.

Each call is capped at `max_tokens=5`, so a full run costs roughly $0.0001.

```bash
cd EvalServer

# All providers
RUN_INTEGRATION_TESTS=1 \
    OPENROUTER_API_KEY=sk-or-v1-... \
    OPENAI_API_KEY=sk-... \
    ANTHROPIC_API_KEY=sk-ant-... \
    venv/bin/python -m pytest tests/test_integration_openrouter.py -v

# Just OpenRouter (cheapest)
RUN_INTEGRATION_TESTS=1 OPENROUTER_API_KEY=sk-or-v1-... \
    venv/bin/python -m pytest \
        tests/test_integration_openrouter.py::test_openrouter_smoke_via_direct_provider -v

# Through the AI Gateway (requires gateway env + downstream keys configured server-side)
RUN_INTEGRATION_TESTS=1 \
    AI_GATEWAY_INTERNAL_KEY=... \
    AI_GATEWAY_URL=http://127.0.0.1:8100 \
    venv/bin/python -m pytest \
        tests/test_integration_openrouter.py::test_gateway_smoke_routing -v
```

Tests without their corresponding key are skipped individually — you don't
need every key to run a partial smoke check.

---

## CI

`.github/workflows/evalserver-checks.yml` runs on every PR that touches
`EvalServer/**` or `EvaluationModule/**`:

- Sets up Python 3.12
- Installs runtime + test deps
- Runs both pytest suites with `-m "not integration"` (so opt-in smoke tests
  stay free)

The Servers Jest suites run via the existing `Backend Checks` workflow when
PRs touch `Servers/**`.

To run the same command CI runs, locally:

```bash
cd EvalServer && python -m pytest tests/ \
    --ignore=tests/test_integration_openrouter.py \
    -m "not integration"

cd EvaluationModule && python -m pytest tests/ -m "not integration"
```

---

## What's covered

### EvalServer — `tests/`

| File | What it tests |
|------|---------------|
| `test_gateway_litellm_client.py` | `to_litellm_model` × all provider/model shapes; `gateway_mode_enabled`; mocked sync/async chat completion |
| `test_dataset_loading.py` | All 5 dataset source types (inline single-turn, multi-turn, builtin presets, custom path, simulated mode) |
| `test_evaluation_modes.py` | `evaluationMode = standard / scorer / both`; `selectedScorers` filtering |
| `test_metrics_and_usecases.py` | All 20 metric mappings; default metric sets per task type (chatbot/rag/agent); RAG context-missing skip; multi-turn fixed metric set; known `metric_thresholds` vs `thresholds` mismatch |
| `test_custom_scorers.py` | Object vs legacy string `judgeModel`; `{{input}}/{{output}}/{{expected}}` template rendering; PASS/FAIL boundary; provider client dispatch (OpenAI / Anthropic / Mistral / self-hosted) |
| `test_run_evaluation_unit.py` | Provider → `runner_provider` mapping (all 10 aliases); `scorerApiKeys` env injection; legacy `scorerApiKey`; judge LLM env injection (`OPENAI_API_BASE` for self-hosted); `_upsert_judge_scorer` |
| `test_api_experiments.py` | FastAPI experiments CRUD via `TestClient`; middleware org-id propagation; model-validation endpoint |
| `test_integration_openrouter.py` | **Opt-in.** Real API smoke per provider |

### EvaluationModule — `tests/`

| File | What it tests |
|------|---------------|
| `test_gateway_litellm_client.py` | Mirror of EvalServer's table — guarantees parity between the two copies of the helper |
| `test_model_runner.py` | All 10 provider dispatch paths (`_generate_*`); gateway mode routing; retry/backoff; `generate_batch`; env-var → API-key resolution |

### Servers — `__tests__/`

| File | What it tests |
|------|---------------|
| `routes/__tests__/deepEvalRoutes.test.ts` | `injectApiKeys` for every request type (experiment/arena/report); `scorerProviders` fan-out; judge-provider reuse with `scorerApiKeys`; arena dedup + judge inference; `toLiteLLMModel` parity with the Python helper |
| `utils/__tests__/aiGatewayEvalKey.utils.test.ts` | DB key lookup; google/gemini alias; missing table (PG `42P01`); decrypt failure; invalid provider short-circuit |

---

## Adding new tests

### Python

Add fixtures to `EvalServer/tests/conftest.py` (shared across all EvalServer
test files). The most useful existing fixtures:

- `inline_prompts_config`, `multiturn_config`, `builtin_*_config`,
  `custom_path_config`, `simulated_config` — covers every dataset source type
- `standard_mode_config`, `scorer_mode_config`, `both_mode_config` — covers
  every evaluation mode
- `mock_db_session` — async SQLAlchemy mock
- `mock_gateway_response_factory` — builds AI Gateway-shaped JSON for
  `respx`/`pytest-httpx` mocks
- `stub_model_runner` — patches `ModelRunner.__init__` and `.generate` so
  tests don't load any HF models

Mark integration tests:

```python
import pytest

@pytest.mark.integration
def test_my_real_api_smoke(): ...
```

…and they'll be excluded from the default CI command.

### TypeScript

Mock at the module boundary with `jest.mock(...)` calls **before** importing
the unit under test (Jest hoists them). See
`Servers/routes/__tests__/deepEvalRoutes.test.ts` for the pattern.
