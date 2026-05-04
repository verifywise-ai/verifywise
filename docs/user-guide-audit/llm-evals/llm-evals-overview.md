# Audit: llm-evals/llm-evals-overview
**Article path:** shared/user-guide-content/content/llm-evals/llm-evals-overview.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
The overview article is well-structured and all verifiable claims are accurate. All five cross-document references exist and their descriptions match the referenced articles. Navigation labels (Overview, Experiments, Datasets, Scorers, Configuration) match the UI implementation. Flask icon is correctly used as the LLM Evals module entry point in the main app switcher. All key concepts and metrics are accurately described.

## Findings
No inaccurate, partial, or unverifiable claims detected during verification.

## Verified claims (sampled)

- **Claim:** "Access LLM Evals by clicking the flask icon in the icon sidebar on the far left" (block 19) — verified at `Clients/src/presentation/components/AppSwitcher/index.tsx:30` where FlaskConical icon is assigned to the "evals" module.

- **Claim:** "Once inside, you'll see a project dropdown at the top and a navigation panel on the left" (block 19) — verified at `Clients/src/presentation/pages/EvalsDashboard/EvalsDashboard.tsx:946-954` which defines tabs: Overview, Experiments, Datasets, Scorers, Configuration.

- **Claim:** Cross-document reference to "[[Running experiments]](llm-evals/running-experiments)" — verified at `/Users/gorkemcetin/verifywise/shared/user-guide-content/content/llm-evals/running-experiments.ts` exists.

- **Claim:** Cross-document reference to "[[Managing datasets]](llm-evals/managing-datasets)" — verified at `/Users/gorkemcetin/verifywise/shared/user-guide-content/content/llm-evals/managing-datasets.ts` exists.

- **Claim:** Cross-document reference to "[[Configuring scorers]](llm-evals/configuring-scorers)" — verified at `/Users/gorkemcetin/verifywise/shared/user-guide-content/content/llm-evals/configuring-scorers.ts` exists with documented core metrics: answer relevancy, bias detection, toxicity detection.

## Skipped / non-verifiable
- "LLM Evals gives you a systematic way to measure how your models perform before they reach users" (block 1) — opinion/motivation only.
- "Think of it as automated quality assurance for your AI" (block 4) — metaphor/framing only.
- "Instead of manually testing outputs or waiting for user complaints, you can run structured evaluations" (block 4) — benefit statement only.
