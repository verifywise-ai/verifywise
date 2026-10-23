# NIST AI RMF Advisor — Reproduction Report

**Issue:** #4820 (item 1)
**Date:** 2026-10-20 · Branch: `chore/debora-one-fix-to-all`
**Scope:** End-to-end trace of the NIST AI RMF advisor path — framework
selection → advisor controller/service → LLM call → response mapping → UI
rendering. **No code was changed** (docs-only pod).

---

## 1. Architecture trace (verified)

```
Clients/src/presentation/components/AdvisorChat/
  useAdvisorRuntime.ts        DefaultChatTransport → POST /api/advisor/chat
  advisorConfig.ts            domain configs ("frameworks" domain, path /framework)
  CustomThread/CustomMessage  render UIMessage parts (text + tool-* approval cards)
        │  Authorization: Bearer <token>
        ▼
Servers/routes/advisor.route.ts:35   router.post("/chat", authenticateJWT,
                                     validateStreamAdvisorV2, streamAdvisorV2)
        ▼
Servers/controllers/advisor.ctrl.ts  streamAdvisorV2 (l.769) → getStreamTextResult
                                     (or orchestrator() when body.parallel=true)
        ▼
Servers/advisor/aiSdkAgent.ts        streamText loop; tool calling against
                                     availableTools + toolsDefinition
        ▼
Servers/advisor/tools/nistAiRmfTools.ts        8 tool schemas (OpenAI function format)
Servers/advisor/functions/nistAiRmfFunctions.ts  8 executors (read + 1 write)
        ▼ SQL via Servers/utils/nistAiRmfCorrect.utils.ts
   nist_ai_rmf_functions/categories/subcategories(_struct) tables
```

NIST tool surface (all verified in `nistAiRmfTools.ts` / `nistAiRmfFunctions.ts`):
`get_nist_functions`, `get_nist_categories_by_function`,
`get_nist_subcategory_detail`, `get_nist_progress`,
`get_nist_progress_by_function`, `get_nist_status_breakdown`,
`get_nist_org_progress`, `agent_update_nist_subcategory` (write, behind the
XState approval gateway via `createWriteToolFn`).

## 2. Suspected issues (with evidence)

### Finding 1 — `agent_update_nist_subcategory` never validates `project_id` ( MEDIUM )

- **Schema promises validation:** `Servers/advisor/tools/nistAiRmfTools.ts:133-136`
  — `project_id` is described as *"The project ID the subcategory belongs to
  (**used for validation**)"* and is a `required` parameter.
- **Executor ignores it:** `Servers/advisor/functions/nistAiRmfFunctions.ts:302-322`
  — `executeFn` reads only `subcategory_id`, `status`, `notes`, `evidence`.
  `params.project_id` is never compared against the subcategory's actual
  project.
- **SQL scope confirms it:** `Servers/utils/nistAiRmfCorrect.utils.ts:442` —
  the `UPDATE` is scoped only by `organization_id` and `id`:
  `UPDATE nist_ai_rmf_subcategories SET … WHERE organization_id = :organizationId AND id = :id`.
- **Impact:** tenant isolation holds (org scoping is correct ✅), but within a
  tenant any confirmed tool call can update **any** NIST subcategory while the
  approval card (`descriptionFn`, nistAiRmfFunctions.ts:300-301) displays the
  *claimed* project. A hallucinating LLM that pairs the wrong `project_id`
  with a valid `subcategory_id` gets a green confirmation for a write to a
  different project than the user asked about.
- **Recommended fix location:** `Servers/advisor/functions/nistAiRmfFunctions.ts`
  `agentUpdateNistSubcategory.executeFn` — before `updateSubcategoryQuery`,
  resolve the subcategory's `projects_frameworks_id` (join via
  `nist_ai_rmf_subcategories → projects_frameworks`) and reject when
  `pf.project_id !== params.project_id`.

### Finding 2 — No-op update reports success; missing row returns `undefined` ( LOW )

- `agentUpdateNistSubcategory` builds `updateData` only from optional fields
  (`nistAiRmfFunctions.ts:306-309`). If the model calls the tool with only the
  two required params, `updateData` is empty → `updateSubcategoryQuery` takes
  its SELECT-only branch (`nistAiRmfCorrect.utils.ts:432-440`) → **zero rows
  written**, yet the tool still returns
  `{ updated: true, message: "NIST AI RMF subcategory updated successfully" }`
  (`nistAiRmfFunctions.ts:313-317`).
- Worse, if `subcategory_id` doesn't exist, `updateSubcategoryQuery` returns
  `undefined` (`nistAiRmfCorrect.utils.ts:486-491`) and the executor returns
  that `undefined` as the tool result — the LLM receives an empty result and
  may tell the user the update succeeded.
- **Recommended fix location:** same `executeFn` — reject when no updatable
  field is present, and check the returned row exists before reporting
  success.

### Finding 3 — Hardcoded `framework_id = 4` magic constant ( LOW / maintainability )

- `getProjectFrameworkId` and `getNistLinkedProjects` embed
  `AND framework_id = 4` in raw SQL (`nistAiRmfFunctions.ts:19` and `:48`).
- The value is correct today — the canonical registry maps
  `4 → NIST AI RMF` (`Servers/types/framework.type.ts:69`,
  `4: createNISTAI_RMFFrameworkQuery`) — but the constant is duplicated
  instead of referenced. If seed IDs ever shift, the advisor would silently
  target the wrong framework (or permanently answer "not linked").
- **Recommended fix location:** `nistAiRmfFunctions.ts` — import the id from
  the framework registry/`framework.type.ts` instead of literal `4`.

## 3. Reproduction steps

The NIST tools are only reachable through the LLM tool-call loop (there is no
direct REST endpoint for them), so reproduction goes through the chat API.

**Prereqs:** running backend + DB, a user JWT, an LLM key configured for the
org, and a project with NIST AI RMF linked.

1. **Observe the broken validation (Finding 1):**
   ```bash
   # Login to obtain $TOKEN, then:
   curl -N -X POST http://localhost:3000/api/advisor/chat \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"messages":[{"id":"m1","role":"user","parts":[{"type":"text","text":"Update NIST AI RMF subcategory <ID-from-project-B> in project <A-id> — set status to Implemented"}]}]}'
   ```
   The LLM calls `agent_update_nist_subcategory` with `project_id=<A>` and
   `subcategory_id=<B's row>`. Approve the confirmation card in the UI.
   **Expected (per schema contract):** rejection because the subcategory does
   not belong to project A. **Observed:** update succeeds
   (`WHERE organization_id AND id` only) and the UI card showed project A.

2. **Observe the no-op success (Finding 2):** ask the advisor
   *"Touch NIST subcategory N in project P so it gets refreshed"* — a phrasing
   that yields a tool call with no `status`/`notes`/`evidence`. The tool
   returns `updated: true`; `SELECT … FROM nist_ai_rmf_subcategories WHERE id=N`
   shows no change. Or call with a nonexistent `subcategory_id`: the tool
   result is `undefined`/empty and no error is surfaced.

3. **UI check (empty/error rendering):** reviewed
   `Clients/src/presentation/components/AdvisorChat/useAdvisorRuntime.ts` —
   empty message parts get a defensive text fallback (l.66-69), transport
   errors surface via `alert` (l.285-293), and in-stream provider errors are
   converted to friendly text by the backend `onError` mapping
   (`advisor.ctrl.ts:868-893`). **No UI crash on empty recommendations was
   found.**

## 4. Observed vs expected

| # | Expected | Observed |
|---|----------|----------|
| 1 | `project_id` enforced as documented in the tool schema | Never read by the executor; org-scoped update succeeds for any subcategory |
| 2 | No-op or missing-row tool call returns an error | `{updated: true}` on no-op; `undefined` result on missing row |
| 3 | Framework id sourced from the registry | Literal `4` duplicated in two SQL strings |

## 5. Severity

| Finding | Severity | Rationale |
|---------|----------|-----------|
| 1 | **Medium** | In-tenant integrity / confused-deputy via LLM; no cross-tenant leak (org scoping verified ✅); human approval gate still applies |
| 2 | **Low** | Misleading advisor feedback, no data corruption |
| 3 | **Low** | Silent drift risk only; correct today |

## 6. What was verified as SOUND

- Function enum mapping `GOVERN / MAP / MEASURE / MANAGE` consistent between
  tool schema enums and SQL filters (`nistAiRmfTools.ts:26`,
  `nistAiRmfCorrect.utils.ts:183-189`).
- `getNistFunctions` passing `projectFrameworkId = 0` is safe — the util
  ignores that parameter by design (`nistAiRmfCorrect.utils.ts:74-78`).
- Read tools are org-scoped; `get_nist_org_progress` handles the
  `not_configured` case and excludes demo projects correctly
  (`nistAiRmfFunctions.ts:211-293`).
- `streamAdvisorV2` guards: last-message-must-be-user, empty renderable
  messages, no-LLM-keys → clean 400s (`advisor.ctrl.ts:779-813`).
- Frontend rendering defends against empty parts and surfaces errors.
