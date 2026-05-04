# Audit: llm-evals/running-experiments
**Article path:** shared/user-guide-content/content/llm-evals/running-experiments.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
The article accurately describes the experiment wizard configuration flow, provider options, and judge LLM settings. All four step names, provider list, and quantitative claims (temperature default of 0.7) match the implementation in NewExperimentModal.tsx. No inaccuracies found in this audit sample.

## Findings
None — all tested claims verified accurate.

## Verified claims (sampled)

1. **Claim:** "The experiment wizard walks you through four steps: configuring the model you want to test, selecting your dataset, choosing a judge LLM and picking which metrics to measure." (block ~2) — Verified at `Clients/src/presentation/pages/EvalsDashboard/NewExperimentModal.tsx:77` where `const steps = ["Model", "Dataset", "Scorer / Judge", "Metrics"]` exactly matches the four-step sequence.

2. **Claim:** Article lists "OpenAI" provider — Verified at `Clients/src/presentation/pages/EvalsDashboard/NewExperimentModal.tsx:891` where provider grid includes `{ id: "openai", name: "OpenAI", ... }`.

3. **Claim:** Article lists "Anthropic" provider — Verified at `NewExperimentModal.tsx:892` where provider grid includes `{ id: "anthropic", name: "Anthropic", ... }`.

4. **Claim:** Article lists "Google Gemini" provider — Verified at `NewExperimentModal.tsx:893` where provider grid includes `{ id: "google", name: "Gemini", ... }`. Article framing as "Google Gemini" is contextually accurate.

5. **Claim:** Judge temperature "Default is 0.7" — Verified at `NewExperimentModal.tsx` lines 158, 194, 2855 where multiple initialization points set `temperature: 0.7` as the default judge configuration.

## Skipped / non-verifiable
- "Most experiments take just a few minutes to set up and run" (block ~2) — opinion/performance claim; no timing data in code to verify.
- "Great for testing against a different model family" (Anthropic description) — motivation/framing only; not verifiable.
- "Useful if you're considering Google's offerings" (Gemini description) — opinion only.
- "Strong open-weight alternative" (Mistral description) — comparative opinion; skip.
