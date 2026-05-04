# Audit: llm-evals/configuring-scorers
**Article path:** shared/user-guide-content/content/llm-evals/configuring-scorers.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ❌ significant issues (1)

## Summary
The article describes six "built-in scorers" as default, but the codebase enables 13 scorers by default in chatbot mode (7 basic + 6 conversational). This is a significant quantitative mismatch that contradicts user expectations about what "default" means. The article structure and individual scorer descriptions are otherwise accurate.

## Findings
### Finding 1 — Default scorer count does not match implementation
- **Type:** Quantitative
- **Status:** ❌ wrong
- **Doc says:** "LLM Evals ships with six built-in scorers that cover common evaluation needs. These are enabled by default and work well for most applications:" (block 27)
- **Reality:** NewExperimentModal.tsx (lines 80–87) shows that in chatbot mode, 13 scorers are enabled by default: answerRelevancy, correctness, completeness, hallucination, instructionFollowing, toxicity, bias (7 basic) + turnRelevancy, knowledgeRetention, conversationCoherence, conversationHelpfulness, taskCompletion, conversationSafety (6 conversational).
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/presentation/pages/EvalsDashboard/NewExperimentModal.tsx:80–87`
- **Suggested fix:** Revise block 27 to say "LLM Evals enables a core set of scorers by default based on your use case" and explain that chatbots get 7 basic + 6 conversational metrics enabled. Move the six named scorers (Answer relevancy, Bias, Toxicity, Faithfulness, Hallucination, Contextual relevancy) to a "Core scorers" subsection, then clarify that conversational metrics are added when multi-turn datasets are selected.
- **Confidence:** high

## Verified claims (sampled)
- Claim: "Answer relevancy" scorer description matches implementation — verified at `/Users/gorkemcetin/verifywise/Clients/src/presentation/pages/EvalsDashboard/NewExperimentModal.tsx` (answerRelevancy property exists and is enabled by default).
- Claim: "Faithfulness" is a scorer — verified at NewExperimentModal.tsx (faithfulness property exists with enablement conditional on RAG context).
- Claim: "Hallucination detection" catches fabricated facts — verified as a distinct scorer from faithfulness in NewExperimentModal.tsx and deepeval_scorers CRUD schema.
- Claim: "Conversational metrics are automatically enabled when you select a multi-turn dataset" (block 191) — verified at NewExperimentModal.tsx (conversational scorers are in the default config, conditioned on dataset type).
- Claim: Scorers produce scores between 0 and 1 — verified at NewExperimentModal.tsx thresholds (all default thresholds are numeric decimals like 0.5, implying 0–1 range).

## Skipped / non-verifiable
- "This scorer catches that" (block 37, Answer relevancy description) — opinion/motivation only; not verifiable against code without behavior trace.
- "Most well-tuned models score above 0.7 on typical queries" (block 41) — empirical claim without benchmark data in codebase; unverifiable.
- "Lower scores indicate more bias detected" (block 55) — describes scoring direction; implementation detail not exposed in accessible code.
