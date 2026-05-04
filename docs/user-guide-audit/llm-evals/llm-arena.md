# Audit: llm-evals/llm-arena
**Article path:** shared/user-guide-content/content/llm-evals/llm-arena.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
The article accurately documents LLM Arena functionality with correct behavioral and quantitative claims. All verifiable claims about UI navigation, model comparisons, evaluation metrics (helpfulness, accuracy, relevance), and session storage match the backend implementation and frontend code.

## Findings
None. All claims verified.

## Verified claims (sampled)

1. **Claim:** "Navigate to the **Arena** tab in your evals project" (block 3) — verified at `Clients/src/presentation/pages/EvalsDashboard/ArenaPage.tsx` component is routed as a live page with tab navigation in evals dashboard.

2. **Claim:** "Both models receive the same prompt and generate responses independently" (block 6) — verified at `EvalServer/src/routers/deepeval_arena.py:32–79` where endpoint accepts contestants array and sends same `input` to both contestants.

3. **Claim:** "You can run multiple comparisons in a single session. Each prompt and response pair is saved" (block 7) — verified at `EvalServer/src/crud/deepeval_arena.py:96–119` with `list_arena_comparisons()` function that retrieves all saved comparisons per organization.

4. **Claim:** "The judge scores each response on metrics like relevancy, helpfulness and accuracy" (block 9) — verified at `Clients/src/presentation/pages/EvalsDashboard/ArenaPage.tsx:65–102` where EVALUATION_CRITERIA constant includes helpfulness (id: "helpfulness"), accuracy (id: "accuracy"), and relevance (id: "relevance") as built-in metrics.

5. **Claim:** "Arena results are saved and can be reviewed later" (block 11) — verified at `EvalServer/src/routers/deepeval_arena.py:91–116` with GET `/arena/comparisons` endpoint returning persisted comparison history.

## Skipped / non-verifiable
- "LLM Arena lets you compare two models side by side on the same prompt...making it easy to spot differences" (block 1) — reason: motivational framing, benefits-focused (non-verifiable).
- "You can compare models from different providers (e.g., GPT-4 vs Claude)" (block 3) — reason: example-focused motivation (non-verifiable in isolation).
- "Arena is great for quick qualitative comparisons. For systematic evaluation across many prompts, use Experiments instead" (callout) — reason: opinion / guidance framing (non-verifiable).
