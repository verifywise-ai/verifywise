# Audit: llm-evals/models
**Article path:** shared/user-guide-content/content/llm-evals/models.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary
The article describes provider support accurately for most vendors (OpenAI, Anthropic, Google, xAI, Mistral, Ollama, HuggingFace). However, two issues were found: (1) OpenRouter is actively supported in the codebase but omitted from the user guide, and (2) specific model names listed for Anthropic don't match current registry. The claim about automatic model addition is verifiable behavior.

## Findings
### Finding 1 — OpenRouter provider missing from documentation
- **Type:** Reference | Negative
- **Status:** ❌ wrong
- **Doc says:** Lists 8 providers: OpenAI, Anthropic, Google Gemini, xAI, Mistral, HuggingFace, Ollama, Local/Custom API (block 6, bullet-list items)
- **Reality:** The code implements 7 providers in `PROVIDERS` registry: openai, anthropic, google, mistral, xai, openrouter, self-hosted. OpenRouter is actively imported and exported.
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/presentation/utils/providers/index.ts:1-67` (imports openrouter/models.json; defines openrouter in PROVIDERS)
- **Suggested fix:** Add "OpenRouter" to the bullet-list with description of supported models (currently has 600+ models via aggregated API).
- **Confidence:** high

### Finding 2 — Anthropic model names incomplete/outdated
- **Type:** Quantitative | Example
- **Status:** ⚠️ partial
- **Doc says:** "Claude 3 Opus, Sonnet and Haiku" (block 6, second bullet)
- **Reality:** Current Anthropic models.json shows Claude 3 Opus, Claude 3 Sonnet, Claude 3 Haiku, but also includes Claude 3.5 Sonnet (released Oct 2024). The article lists only the base Claude 3 family, omitting the newer 3.5 variant.
- **Evidence:** `/Users/gorkemcetin/verifywise/Clients/src/presentation/utils/providers/anthropic/models.json` (contains claude-3-5-sonnet-20241022)
- **Suggested fix:** Update to "Claude 3.5 Sonnet, Claude 3 Opus, Sonnet and Haiku" or "Claude 3 and 3.5 family models" to future-proof against model additions.
- **Confidence:** high

## Verified claims (sampled)
- Claim: "Models are automatically added to this list when they're used in experiments. You don't need to manually register models before running evaluations." (block 3) — verified at `/Users/gorkemcetin/verifywise/EvalServer/src/crud/deepeval_models.py:create_model()` (automatic insertion into llm_evals_models table on experiment run)
- Claim: "VerifyWise supports... OpenAI" (block 6, first bullet) — verified at `/Users/gorkemcetin/verifywise/Clients/src/presentation/utils/providers/index.ts:38-40` (openai provider with GPT models)
- Claim: "VerifyWise supports... Ollama. Locally-hosted models running on your own hardware." (block 6) — verified at `/Users/gorkemcetin/verifywise/Clients/src/presentation/pages/EvalsDashboard/NewExperimentModal.tsx:33, 1163` (Ollama logo imported and configured as self-hosted provider)
- Claim: "For local models (Ollama), no API key is needed." (block 9, callout) — verified at `/Users/gorkemcetin/verifywise/Clients/src/presentation/pages/EvalsDashboard/NewExperimentModal.tsx:1163` (needsApiKey: false for ollama)
- Claim: "API keys for cloud providers are configured in the Settings tab of your evals project." (block 8) — partially verified; code shows keys stored in llm_evals_models table with endpoint_url and provider fields; Settings tab UI not fully inspected

## Skipped / non-verifiable
- "Keys are stored securely and shared across all experiments in the project" (block 8) — Motivation/trust claim; code shows shared storage but encryption strategy not inspected (architecture/infrastructure concern)
- "How they've been accessed (via API, locally through Ollama or through HuggingFace)" (block 1) — Motivation framing; three access methods are factually correct but "how" they're accessed is architectural context
