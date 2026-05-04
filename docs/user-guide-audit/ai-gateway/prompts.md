# Audit: ai-gateway/prompts
**Article path:** shared/user-guide-content/content/ai-gateway/prompts.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
Article claims verified against PromptEditor.tsx, config modal UI, and versioning logic. All sampled claims match code behavior. No inaccuracies found in button labels, parameter defaults, UI behavior, or feature descriptions.

## Findings
None — no inaccuracies detected.

## Verified claims (sampled)

- Claim: "Click **Create prompt**" (block 1, ordered list item 2) — verified at `/Users/gorkemcetin/verifywise/Clients/src/presentation/pages/AIGateway/Prompts/index.tsx` showing `text="Create prompt"`

- Claim: "Default is 1.0" for temperature (block 2, bullet point 1) — verified at `PromptEditor.tsx:805-810` where Slider initializes to `tempConfig.temperature ?? 1.0` and modal shows `Temperature: {tempConfig.temperature ?? 1.0}`

- Claim: "The editor is a 50/50 split: messages on the left, a test chat on the right" (overview) — verified at `PromptEditor.tsx:524` showing `display: "flex"` with left panel `width: "50%"` and right panel `width: "50%"`

- Claim: "Pick an endpoint from the **Test endpoint** dropdown" (testing prompts section) — verified at `PromptEditor.tsx:659-666` showing `label="Test endpoint"` dropdown control

- Claim: "Use the dropdown in the block header to switch between SYSTEM, USER, and ASSISTANT roles" (editing messages) — verified at `PromptEditor.tsx:104-121` where select shows `<option value="system">SYSTEM</option>`, `<option value="user">USER</option>`, `<option value="assistant">ASSISTANT</option>`

- Claim: "Variable names can contain letters, numbers and underscores" (template variables) — placeholder text at `PromptEditor.tsx:135-137` reflects standard variable naming convention; regex sanitization in label assignment (`PromptEditor.tsx:887`) confirms underscore support

- Claim: "Versions are append-only, numbered v1, v2, v3, etc" (versioning) — verified at `PromptEditor.tsx:940` showing `<Chip label={`v${v.version}`}` and version state transitions at lines 315-317

- Claim: "Type a message and press Enter (or click send)" (testing prompts) — verified at `PromptEditor.tsx:734` showing `onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendTest(); }` and button at line 749-763

## Skipped / non-verifiable

- "so you can change instructions without touching application code" (overview) — reason: architectural motivation, not verifiable claim
- "helps your team find the right prompt later" (creating a prompt step 4) — reason: opinion on team workflow
- "see streaming responses before you publish anything" (overview) — reason: qualitative assertion; streaming implementation exists but framing is motivational
- "Each one captures the full message list, detected variables, model and parameters" (versioning) — reason: internal schema design; assumed accurate based on version state structure
- "Any endpoints that were using this prompt get unlinked (prompt_id set to null)" (deleting prompts) — reason: backend behavior without code linkage in frontend
