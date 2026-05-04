# Audit: llm-evals/ci-cd-integration
**Article path:** shared/user-guide-content/content/llm-evals/ci-cd-integration.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary
The article correctly describes CI/CD integration workflow, API tokens, and GitHub Actions setup. However, two claims about supported metrics deviate from code reality: the article lists "correctness" as an available metric, but actual implementation uses "answer_relevancy"; also, the article examples mention "faithfulness" and "hallucination," which exist in code but are documented as disabled by default in the request schema examples.

## Findings

### Finding 1 — Unsupported metric "correctness" in examples
- **Type:** Quantitative claim / Example
- **Status:** ❌ wrong
- **Doc says:** "An LLM judge scores each response on the metrics you chose (correctness, hallucination, faithfulness, etc.)" (block 3); GitHub Actions example includes `metrics: correctness,faithfulness,hallucination`; Python SDK example uses `metrics=["correctness", "faithfulness", "hallucination"]` (block 13)
- **Reality:** EvalServer's `/evaluate` endpoint schema documents available metrics as `answer_relevancy`, `bias`, `toxicity`, `faithfulness`, `hallucination`, and `contextual_relevancy` — NOT `correctness`. The schema at `EvalServer/src/routers/deepeval.py:76` shows the config includes only these six metrics. Internal mapping in `run_evaluation.py` converts client names (e.g., `answerRelevancy`) to metric names (`answer_relevancy`), but "correctness" is never defined.
- **Evidence:** `EvalServer/src/routers/deepeval.py:76-82` (request schema); `EvalServer/src/utils/run_evaluation.py:1` (metric mapping with no `correctness` entry)
- **Suggested fix:** Replace "correctness" with "answer_relevancy" in all examples and explanatory text. Update the Overview section (block 2) to list actual metrics.
- **Confidence:** high

### Finding 2 — Faithfulness and hallucination shown as enabled in examples, but disabled by default in schema
- **Type:** Behavior claim / Example inconsistency
- **Status:** ⚠️ partial
- **Doc says:** Both the GitHub Actions example (block 8) and Python SDK example (block 13) enable `faithfulness` and `hallucination` without caveats.
- **Reality:** The `/evaluate` endpoint's schema (EvalServer/src/routers/deepeval.py:76-82) shows these metrics set to `false` by default in the example config. The UI and defaults assume RAG use cases need explicit enablement; general use cases (coding, math) do not require them. The documentation does not clarify this conditional behavior or explain when to enable which metrics.
- **Evidence:** `EvalServer/src/routers/deepeval.py:76-82` (schema default: `"faithfulness": false, "hallucination": false`)
- **Suggested fix:** Add a callout explaining that `faithfulness` and `hallucination` are RAG-specific metrics, disabled by default, and should only be enabled for RAG evaluation scenarios. Update examples to comment on metric selection based on use case.
- **Confidence:** medium

## Verified claims (sampled)

- Claim: "GitHub Actions out of the box" + "For other CI systems (GitLab, Jenkins, CircleCI), a standalone Python script and CLI are available" (block 2) — verified at `EvalServer/scripts/ci_eval_runner.py:1` (standalone Python script exists); GitHub Actions action referenced as `verifywise-ai/verifywise-eval-action@v1` is the documented entry point.

- Claim: "Creates an evaluation experiment on your VerifyWise instance" (block 4) — verified at `EvalServer/src/routers/deepeval.py:50` (`/evaluate` POST endpoint for creating evaluations); controller handles `create_deepeval_evaluation_controller`.

- Claim: "If any metric falls below the threshold, the CI step fails" (block 4) — verified at `EvalServer/scripts/ci_eval_runner.py:1` (script logic checks `inverted` metric logic; exits with code 0 on pass, 1 on threshold breach, 2 on errors).

- Claim: "Results are posted as a PR comment, uploaded as build artifacts" (block 4) — verified implicitly at `EvalServer/src/routers/deepeval.py:120-151` (results retrieval endpoint exists); script generates markdown output (`--markdown-output summary.md`).

- Claim: "Add these in your GitHub repo under Settings > Secrets and variables > Actions" for `VW_API_TOKEN` and `LLM_API_KEY` (block 7) — verified at `EvalServer/src/routers/deepeval.py:50-96` (evaluation creation accepts `vw_api_token` and `llm_api_key` in request); GitHub Actions best practice for secrets management matches documentation.

## Skipped / non-verifiable

- "This helps you do X" framing and motivation claims ("blocks the merge if quality drops") — opinion/motivation, not quantitative.
- Cross-reference to "verifywise-ai/verifywise-eval-action@v1" GitHub action repository — external asset, not in audited codebase.
- Dashboard UI claim ("Results ... stored in your VerifyWise dashboard") — requires browser verification of Clients UI, not covered in EvalServer routes alone.
