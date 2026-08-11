# LLM key gating for AI Advisor and Evidence Analyzer

**Date:** 2026-07-10
**Status:** Approved by user, ready for implementation plan

## Problem

Two AI features in the app behave inconsistently when an organization has no
LLM key configured:

- **AI Advisor chat** (`Clients/src/presentation/components/AdvisorChat/index.tsx:154`)
  already has a hard gate: when `hasLLMKeys === false`, the component returns
  an "AI advisor not configured" empty state instead of its normal render.
  But this early return happens **before** `AdvisorHeader` and
  `AdvisorChatInner` ever mount (line 245-254), so it hides the conversation
  header and history too — not just the ability to send a new message. The
  backend (`Servers/controllers/advisor.ctrl.ts`, `runAdvisor`/
  `streamAdvisor`/`streamAdvisorV2`) already only blocks *sending* (`clients
  .length === 0` → `400`); `listConversations`/`getConversationById` have no
  such check. The frontend is stricter than the backend needs it to be.

- **Evidence Analyzer** (`Servers/controllers/evidenceAi.ctrl.ts:194-198`,
  `analyzeFile`) has no gate at all. When no LLM key exists, it silently
  falls back to `buildHeuristicResult()` — a deterministic, no-grade
  heuristic summary — and the request still returns `200`. The frontend
  ("Run AI analysis" in `EvidenceAnalysisPanel/index.tsx`, the per-row
  Sparkles button and bulk "Analyze with AI" action in
  `FileBasicTable.tsx`) has no key-awareness at all; the buttons are always
  clickable.

Goal: make both features consistent — **locked when no key, but reading
anything already generated while a key existed keeps working** — matching
the pattern the Advisor backend already half-implements.

## Scope

Both AI Advisor and Evidence Analyzer, per user decision. Reuses the
existing `useLLMKeyStatus` hook (`Clients/src/application/hooks/
useLLMKeyStatus.ts`) — no new Context/Provider. That hook is a plain
`useState`/`useEffect` wrapper around `getLLMKeyStatus()`
(`Clients/src/application/repository/llmKeys.repository.ts`), fires once
per mount, returns `{ data, loading, error }` where `data.hasKeys` is the
flag we need. It's already used the same way in `Reporting/GenerateReport`.

## Design

### 1. AI Advisor — fix the frontend over-gating

`AdvisorChat/index.tsx`'s `hasLLMKeys === false` branch (currently an early
`return` before anything else renders) moves so it only replaces the
**compose/send surface** — the part of the tree that would trigger
`runAdvisor`/`streamAdvisor`. `AdvisorHeader` and the conversation
history/thread render unconditionally (as they do today in the
`hasLLMKeys !== false` path), matching the backend's existing
read-vs-write split. The existing "AI advisor not configured" copy
(Settings icon, title, admin/non-admin messaging with a settings link)
moves into this narrower slot instead of replacing the whole panel.
Exact placement (e.g. swapping `AdvisorChatInner`'s compose box for the
locked message, vs. disabling the compose input in place) is an
implementation-plan detail — the constraint is: header + history must
render every time `isLoadingLLMKeys` is done, regardless of `hasLLMKeys`.

No backend change needed here — `advisor.ctrl.ts` already returns `400
"No LLM keys configured for this organization."` from `runAdvisor`/
`streamAdvisor`/`streamAdvisorV2`, and already leaves conversation reads
ungated.

### 2. Evidence Analyzer — add the gate (backend + frontend)

**Backend** (`Servers/controllers/evidenceAi.ctrl.ts`, `analyzeFile`):
the `if (clients.length === 0)` branch (line 196-198) currently sets
`usedFallback = true` and falls through to `buildHeuristicResult()`.
Change this specific branch to return immediately:

```ts
if (clients.length === 0) {
  return res.status(400).json(
    STATUS_CODE[400]("No LLM keys configured for this organization."),
  );
}
```

matching the Advisor's exact message, for consistency. The **other**
`usedFallback` path — the `catch` block around the `analyzeEvidence()`
call (line 219-223), which fires when a key exists but the LLM call itself
fails (rate limit, network error, etc.) — is untouched. That's resilience
for a different failure mode than "no key configured" and is out of scope;
removing it would be a regression, not the fix asked for.

No change to `getAnalysisByFileIdQuery` or any read path — viewing a
file's already-stored `analysis` (the modal opened from a graded row) is
just a DB read today and stays that way.

**Frontend**: `FileBasicTable.tsx` calls `useLLMKeyStatus()` once,
computing `hasKeys = data?.hasKeys ?? false` (loading treated as "not
enabled yet", consistent with how `isLoadingLLMKeys` is already handled in
Advisor). This gates:

- The per-row Sparkles/"Analyze with AI" `MUIIconButton` (`disabled={
  triggerAnalysis.isPending || !hasKeys}`), with the wrapping `Tooltip`
  title changing to explain why when locked (e.g. "Configure an LLM key to
  enable AI analysis") instead of "Analyze with AI" / "Re-analyze with AI".
- The bulk `analyze_ai` action entry in the `bulkActions` array
  (`disabled: triggerAnalysis.isPending || !hasKeys`), same pattern as its
  sibling entries already do for `bulkMutation.isPending`.
- The `EvidenceAnalysisPanel`'s empty-state "Run AI analysis"
  `CustomizableButton`. `EvidenceAnalysisPanel` doesn't call the hook
  itself (it's a controlled component driven by props from
  `FileBasicTable`); `hasKeys` is threaded down as a new prop instead of
  calling `useLLMKeyStatus` a second time (the hook has no caching, so a
  second mount would double the network call). `isDisabled={isAnalyzing ||
  !hasKeys}`, wrapped in a `Tooltip` with the same explanatory text when
  locked — consistent with the Tooltip conventions already established in
  this file from the recent design-compliance passes.

No banner (per user decision — disabled + tooltip only, no
`AIKeyBanner`-style box on the Evidence page).

Viewing an **already-analyzed** row (clicking its grade badge to open the
modal) is unaffected either way — that only reads `analysisByFileId` data
already loaded into the table, never calls `triggerAnalysis`.

## Error handling

- Backend: the new `400` follows the existing `STATUS_CODE[400](...)`
  convention used everywhere else in this controller and mirrors
  `advisor.ctrl.ts`'s exact message text.
- Frontend: buttons are disabled (not hidden) when locked, so the feature
  stays discoverable; the tooltip is the only new user-facing copy.
  `triggerAnalysis`'s existing mutation error handling (toast on failure)
  is unchanged — a disabled button can't be clicked, so this 400 becomes
  purely a defense-in-depth backend guard for direct API calls, not
  something the normal UI flow will ever surface as a mutation error.

## Testing

- Backend: new test file for `evidenceAi.ctrl.ts` `analyzeFile` — no
  existing test file exists for this controller. Cases: no keys configured
  → `400` with the exact message, `upsertAnalysisQuery` never called; keys
  configured → existing behavior unchanged (not currently covered, but
  in-scope to add a smoke case so the 400 branch's sibling path has
  coverage too).
- Frontend:
  - `FileBasicTable` test: per-row button and bulk action disabled +
    correct tooltip when `useLLMKeyStatus` mock returns `hasKeys: false`;
    enabled when `true`. Existing "already-analyzed row still opens modal"
    test path stays green with `hasKeys: false` (proves history reading is
    unaffected).
  - `EvidenceAnalysisPanel` test: "Run AI analysis" button disabled +
    tooltip when `hasKeys` prop is `false`.
  - `AdvisorChat` test: conversation header/history still renders when
    `hasLLMKeys={false}`; only the compose surface shows the locked
    message.

## Out of scope

- No new Context/Provider for LLM key status (reuse per-component hook
  calls, as `Reporting/GenerateReport` already does).
- No change to the Advisor backend (already correct).
- No change to the `catch`-block heuristic fallback for genuine LLM call
  failures (only the "no key" branch changes).
- No banner/CTA box added to the Evidence page.
- No change to `AdvisorHeader`'s own key-fetching mechanism in
  `UserGuide/` — only how `AdvisorChat/index.tsx` reacts to the
  `hasLLMKeys`/`isLoadingLLMKeys` props it's already given.
