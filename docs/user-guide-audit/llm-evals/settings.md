# Audit: llm-evals/settings
**Article path:** shared/user-guide-content/content/llm-evals/settings.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ❌ significant issues (1)

## Summary
The article documents 8 supported providers (OpenRouter, OpenAI, Anthropic, Google, xAI, Mistral, Hugging Face, Custom), but the codebase supports only 4 (Anthropic, OpenAI, OpenRouter, Custom). This is a critical discrepancy that will mislead users into expecting providers that do not exist. Claims about encryption, masking, Admin role permission, and single active key per provider are verified and accurate.

## Findings
### Finding 1 — Unsupported providers listed in "Supported providers" section
- **Type:** Reference
- **Status:** ❌ wrong
- **Doc says:** "You can add API keys for these providers: OpenRouter, OpenAI, Anthropic, Google, Gemini models, xAI, Mistral, Hugging Face, Custom" (block index 4, bullet-list items)
- **Reality:** Code supports only 4 providers: Anthropic, OpenAI, OpenRouter, Custom. The UI component `OrgSettings.tsx` line 20-28 defines `LLM_PROVIDERS` with only these 4 entries. No validation patterns or API endpoints exist for Google, xAI, Mistral, or Hugging Face.
- **Evidence:** `Clients/src/domain/models/Common/llmKeys/llmKeys.model.ts:1-4` shows `LLMProviderId = "anthropic" | "openai" | "openrouter" | "custom"` and `PROVIDER_CONFIGS` array (lines 66-95) contains only these 4. `Clients/src/presentation/pages/EvalsDashboard/OrgSettings.tsx:20-28` lists `LLM_PROVIDERS` with same 4 only.
- **Suggested fix:** Replace block 4 to list only "OpenRouter, OpenAI, Anthropic, and Custom" and remove Google, xAI, Mistral, and Hugging Face entries.
- **Confidence:** high

## Verified claims (sampled)
- Claim: "Keys are encrypted before storage" (block 8) — verified at `Clients/src/infrastructure/api/evaluationLlmApiKeysService.ts` (comment: "Keys are encrypted and stored in the database per organization") and `entityTips.ts:368` (UI: "Keys are encrypted at rest and never exposed in logs")
- Claim: "settings page only shows a masked version (e.g., `sk-...abc123`)" (block 8) — verified at `OrgSettings.tsx:129-133` (displays `maskedKey` field, not raw `apiKey`) and `EvalsDashboard.tsx` UI rendering
- Claim: "Each provider can have one active key at a time" (block 10) — verified at `evaluationLlmApiKeysService.ts` type definition showing one key per provider per org
- Claim: "Only users with the **Admin** role can add, edit or delete API keys" (block 13) — verified at `OrgSettings.tsx:91,116-118` (uses `useIsAdmin()` hook and redirects non-admins)
- Claim: "Other roles can see which providers are configured but can't view or modify the keys themselves" (block 13) — partially supported; non-admin access to provider list not explicitly tested, but admin guard prevents modification/deletion

## Skipped / non-verifiable
- "Without at least one key configured, you can't run experiments or arena comparisons" (block 2) — opinion/motivation only; not a testable state claim
- "The format is validated automatically (e.g., OpenAI keys must start with `sk-`)" (block 6 item 4) — vague; actual pattern is `sk-(proj-)?[a-zA-Z0-9_-]{20,}` per `OrgSettings.tsx:35`, which is more permissive than stated
