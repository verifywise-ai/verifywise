# AI Advisor — Write Tools (agent_create_risk)

**Last Updated:** 2026-04-09

End-to-end walkthrough of how the AI advisor creates a new risk, from
the user typing a prompt to the new row appearing in the Risk Management
table. Cross-cutting, so it touches backend, frontend, and the advisor
layer.

Use this doc when:

- You're adding a new AI write tool (`agent_create_<thing>`) and want to
  understand the pattern.
- A write tool "works but nothing shows up" and you need to know where
  to put a breakpoint.
- The approval transaction needs to run more post-commit side effects
  (notifications, snapshots) for AI-created entities.

---

## Design principles

1. **Approval-gated writes.** The LLM never writes to the DB directly.
   It files an `approval_request` row, a human Admin approves, and the
   actual write happens server-side inside the approve transaction. A
   hallucinated tool call cannot create a real entity without a real
   human clicking Approve.
2. **Schema mirrors the UI form.** The Zod schema for each write tool
   matches the corresponding `AddNew*Form` on the frontend — same
   required fields, same length caps, same enums. AI-created entities
   are indistinguishable from hand-created ones.
3. **LLM-driven "ask for missing fields".** The "please fill in these
   fields" step is not a custom protocol — it's a system-prompt
   instruction plus a strict Zod schema as a safety net. The LLM parses
   the user's first prompt, lists any missing required fields in one
   message, waits for the reply, then calls the tool exactly once.
4. **Per-entity modules.** Each write tool lives in
   `Servers/advisor/aiActions/<actionName>/` with its own
   `schema.ts`, `definition.ts`, `file.ts`, `execute.ts`, `preview.ts`,
   and `index.ts`. The generic dispatcher in `executor.ts` looks up
   handlers via a registry — no switch statements when adding new tools.
5. **Frontend refresh via window events.** After approval, the modal
   dispatches a `CustomEvent`. Any entity page in the background listens
   and refetches. No prop drilling, no global state, no polling.

---

## Layer map

```
Browser ── AI advisor panel (assistant-ui)
   │
   │     Clients/src/presentation/components/AdvisorChat/
   │     Clients/src/application/contexts/AdvisorConversation.context.tsx
   │     Clients/src/application/repository/advisor.repository.ts
   │
   ▼
Express ── /api/advisor/chat (streaming)
   │
   │     Servers/controllers/advisor.ctrl.ts
   │     Servers/advisor/aiSdkAgent.ts
   │     Servers/advisor/prompts.ts
   │
   ▼
LLM ── Vercel AI SDK streamText + tools
   │
   │     Tool surface composed from:
   │       read tools   → Servers/advisor/functions/*.ts
   │                    + Servers/advisor/tools/*.ts
   │       write tools  → Servers/advisor/aiActions/*/
   │
   ▼
fileCreateRisk (file phase)
   │
   │     Servers/advisor/aiActions/createRisk/file.ts
   │     → validate, open tx, ensure workflow, insert approval_request
   │
   ▼
User clicks Approve in RequestorApprovalModal
   │
   │     Clients/src/presentation/components/Modals/RequestorApprovalModal/
   │     Servers/controllers/approvalRequest.ctrl.ts
   │
   ▼
executeAiAction dispatcher (approve phase)
   │
   │     Servers/advisor/aiActions/executor.ts
   │     Servers/advisor/aiActions/registry.ts
   │     → lookup handler by tool_name
   │
   ▼
executeCreateRisk
   │
   │     Servers/advisor/aiActions/createRisk/execute.ts
   │     Servers/services/risk.service.ts
   │     Servers/utils/risk.utils.ts (createRiskQuery)
   │     Servers/utils/projectRiskChangeHistory.utils.ts
   │     Servers/utils/auditLedger.utils.ts
   │
   ▼
Frontend notified
   │
   │     Clients/src/application/events/aiActionEvents.ts
   │     Clients/src/presentation/pages/RiskManagement/index.tsx
   │
   ▼
Table refetches → new risk visible
```

---

## Stage 1 — User sends a message in the advisor panel

### Frontend

- `Clients/src/presentation/components/AdvisorChat/index.tsx`
  is the panel. It mounts `AdvisorHeader` (new chat / past chats
  buttons) and `AdvisorChatInner`, which is keyed by
  ``${pageContext}:${activeId ?? 'new'}`` so switching past
  conversations forces a clean runtime remount.
- `useAdvisorRuntime.ts` creates the assistant-ui `useChatRuntime` with a
  `DefaultChatTransport` pointed at `/api/advisor/chat` and attaches an
  `onFinish` callback that persists new messages once the turn settles.
- The transport POSTs the UIMessage history to
  `POST /api/advisor/chat` with the JWT in `Authorization`.

### Backend entry

- `Servers/controllers/advisor.ctrl.ts` receives the request. It selects
  the user's LLM key, composes the full tool surface (read + aiAction +
  visualization), calls `streamAdvisorAiSdk` in
  `Servers/advisor/aiSdkAgent.ts`.
- `aiSdkAgent.ts` wraps the Vercel AI SDK `streamText` with
  `system: getAdvisorPrompt()` (from `Servers/advisor/prompts.ts`), the
  full tool list, and the message history (multi-turn — uses
  `convertToModelMessages`).
- The response SSE-streams back to the browser through `assistant-ui`.

---

## Stage 2 — LLM decides to call `agent_create_risk`

### The system prompt carve-out

`Servers/advisor/prompts.ts` has two behavior rules:

- **Read tools** (`fetch_*`, `get_*_analytics`, `list_users`, etc.):
  execute immediately, never ask clarifying questions, use reasonable
  defaults.
- **Write tools** (`agent_*`): opposite — parse the user's first
  prompt for all required fields, ask in ONE batch for anything
  missing, use `list_users` to resolve names to numeric ids for
  user-id fields (`approver`, `risk_owner`), call exactly once.

### The tool definition

`Servers/advisor/aiActions/createRisk/definition.ts` mirrors
`Clients/src/presentation/components/AddNewRiskForm/` validation rules.
Required fields (matching the UI form):

| Field                     | Type            | Validation                      |
|---------------------------|-----------------|---------------------------------|
| `risk_name`               | string          | 3..255                          |
| `risk_description`        | string          | 1..256                          |
| `ai_lifecycle_phase`      | enum (7)        | required                        |
| `risk_category`           | enum[] (15)     | min 1                           |
| `impact`                  | string          | 1..256                          |
| `mitigation_status`       | enum (7)        | required                        |
| `mitigation_plan`         | string          | 1..1024                         |
| `current_risk_level`      | enum (5)        | required (DB form, not "Critical") |
| `implementation_strategy` | string          | 1..1024                         |
| `deadline`                | ISO date string | required                        |
| `approver`                | user id         | required, resolve via list_users |
| `approval_status`         | enum (7)        | required                        |
| `date_of_assessment`      | ISO date string | required                        |

Optional: `severity`, `likelihood`, `review_notes`, `risk_owner`,
`project_ids`, `framework_ids`.

### The Zod schema (safety net)

`Servers/advisor/aiActions/createRisk/schema.ts` is the runtime
enforcer. If the LLM cheats and calls the tool with missing fields,
`.strict()` rejects, the file handler returns `validation_failed` with
per-field error messages, and the LLM is told to ask the user for the
specific failing fields.

### `list_users` for name → id resolution

`Servers/advisor/tools/userTools.ts` + `functions/userFunctions.ts` is a
read tool that returns `{id, name, surname, email, role}` for the org,
with an optional `search` substring filter (SQL `ILIKE` against
name/surname/email). When the user says "make Sarah the approver", the
LLM calls `list_users` with `search: "Sarah"`, picks the matching id,
then uses it as `approver` in `agent_create_risk`.

---

## Stage 3 — File phase (filing the approval request)

`Servers/advisor/aiActions/createRisk/file.ts` — `fileCreateRisk` runs
when the LLM invokes the tool. It does NOT create the risk.

```
1. Strict validate params against AgentCreateRiskSchema.
   Fail → return { status: "validation_failed", errors: [...] }
2. Open a DB transaction.
3. Ensure the per-org "AI Action Approval" workflow exists
   (lazy-create via ensureAiActionWorkflow).
4. Load its workflow steps.
5. Render a human preview string
   ("Create a Catastrophic/likely risk 'Model drift' (current level
    High risk; mitigation Not Started; deadline 2026-05-15)").
6. INSERT an approval_request row with:
     entity_type = 'ai_action'
     entity_data = {
       tool_name: 'agent_create_risk',
       input_params: parsed.data,
       preview,
       requested_via: 'ai_advisor',
     }
     status = PENDING
     requested_by = userId
7. Commit.
8. Return { status: "pending_approval", approvalRequestId, preview,
            message: "Tell the user to open Pending Approvals..." }
```

The LLM sees `pending_approval` and tells the user something like
"I've filed approval request #5 for 'Model drift' — head to Pending
Approvals to approve or reject".

---

## Stage 4 — User approves

### The modal

`Clients/src/presentation/components/Modals/RequestorApprovalModal/` —
when the user clicks Approve:

```
handleApprove:
  POST /api/approval-requests/:id/approve { comments }
  → backend runs the approve transaction (next step)
  if requestDetails.entityType === 'file'
    dispatchFileApprovalChanged({ status: 'approved' })
  if requestDetails.entityType === 'ai_action'
    dispatchAiActionCompleted({
      toolName: requestDetails.aiToolName,  // 'agent_create_risk'
      status: 'approved',
    })
  onClose()
```

`requestDetails` is built by
`entityTypeConfig.tsx` which handles `case 'ai_action'` by pulling
`tool_name`, `preview`, `input_params`, etc. out of `entity_data`.

### Backend approve controller

`Servers/controllers/approvalRequest.ctrl.ts` — the approve controller:

```
1. Open transaction.
2. Mark the approval_request approved (or advance to next step).
3. If fully approved AND entity_type = 'ai_action':
     call executeAiAction(entity_data, { transaction, requesterId,
                                          organizationId })
4. Commit (or rollback on failure — no half-created risks).
5. notifyApprovalComplete → in-app notification to the requester.
```

Critical: the risk insert happens **inside the same transaction** as
the approval state change. Any failure rolls back both.

---

## Stage 5 — `executeAiAction` dispatch + `executeCreateRisk`

### The generic dispatcher

`Servers/advisor/aiActions/executor.ts`:

```
executeAiAction(entityData, ctx):
  handler = getAiActionHandler(entityData.tool_name)  // registry lookup
  return handler.execute({
    inputParams: entityData.input_params,
    requesterId: ctx.requesterId,
    organizationId: ctx.organizationId,
    transaction: ctx.transaction,
  })
```

No switch statement. Adding a new write tool is just registering a new
handler in `Servers/advisor/aiActions/registry.ts`.

### The handler

`Servers/advisor/aiActions/createRisk/execute.ts` — `executeCreateRisk`:

```
1. Read input from ctx.inputParams (Zod-parsed shape).
2. Default severity to 'Negligible' and likelihood to 'Rare' if not
   provided (mirrors the UI form's silent defaults).
3. Compute risk_level_autocalculated via the shared server util
   calculateRiskLevel(severity, likelihood). Without this, the "Risk
   Level" column on the risks table is always blank for AI-created
   risks. Formula:
     score = likelihood_value * 1 + severity_value * 3
     ≤4 → Very low risk, ≤8 → Low risk, ≤12 → Medium risk,
     ≤16 → High risk, else Very high risk
4. Call createRiskService(payload, { userId, organizationId }, tx)
   with all Tab 1 + Tab 2 fields. Field remappings:
     input.approver             → risk_approval
     input.framework_ids        → frameworks
     input.project_ids          → projects
     new Date(input.deadline)   → deadline
     new Date(input.date_of_assessment) → date_of_assessment
     input.risk_owner ?? ctx.requesterId → risk_owner
5. createRiskService delegates to:
     - createRiskQuery (INSERT into risks + projects_risks/frameworks_risks)
     - recordProjectRiskCreation → appendToAuditLedger (fire-and-forget
       with retry on SQLSTATE 40001, see audit ledger note below)
6. Return { entityId: newRisk.id } for the approval_request.entity_id
   update.
```

### Audit ledger append (side note)

`Servers/utils/auditLedger.utils.ts` uses `SERIALIZABLE` isolation so
the per-org hash chain stays tamper-evident. Two concurrent appends for
the same org race on reading the last-row hash — Postgres aborts one
with SQLSTATE 40001 ("could not serialize access..."). The
`appendToAuditLedger` function wraps a single attempt in a retry loop
(up to 5 attempts, exponential backoff 15→30→60→120→240ms with jitter)
so the loser just retries.

---

## Stage 6 — Frontend refresh

`Clients/src/application/events/aiActionEvents.ts`:

```
dispatchAiActionCompleted({ toolName, status })
  → window.dispatchEvent(new CustomEvent('aiAction:completed', { detail }))

onAiActionCompleted(callback)
  → window.addEventListener('aiAction:completed', handler)
  → returns cleanup fn for useEffect
```

`Clients/src/presentation/pages/RiskManagement/index.tsx`:

```
useEffect(() => {
  return onAiActionCompleted((detail) => {
    if (detail?.status === 'approved' &&
        detail?.toolName === 'agent_create_risk') {
      setRefreshKey((k) => k + 1);
    }
  });
}, []);
```

The existing fetch effect is already keyed on `refreshKey`, so bumping
it retriggers `fetchProjectRisks()`. The new risk appears in the
table without a page reload.

---

## Chat persistence (orthogonal concern)

Runs throughout, not specific to write tools but worth knowing:

`Clients/src/application/contexts/AdvisorConversation.context.tsx`:

- **Per-domain state:** each advisor domain (risk-management,
  models, vendors, etc.) has its own `{ conversations, activeId,
  activeMessages }`.
- **Synchronous ref mirror:** `stateRef` is updated on every render
  AND inline inside addMessage, so async paths can see committed
  updates without waiting for a React re-render.
- **Create-on-first-turn:** "New chat" is purely local. The backend
  row is created by `ensureActiveConversation` when the first
  `addMessage` fires. Rapid-fire user + assistant calls both await
  the same in-flight creation promise (`creatingPromisesRef`) and
  receive the same conversation id.
- **PUT serialization:** `addMessage` enqueues a PUT behind any
  in-flight PUT for the domain (`putQueuesRef`). Each queued task
  reads the latest snapshot from `stateRef` at run time, so even the
  first queued PUT already contains messages added by subsequent
  calls in the same tick. No race, no lost assistant turns.

Backend-side: 5 REST endpoints in `Servers/routes/advisor.route.ts`:

```
GET    /api/advisor/conversations/:domain          → list
POST   /api/advisor/conversations/:domain          → create empty
GET    /api/advisor/conversations/:domain/:id      → full messages
PUT    /api/advisor/conversations/:domain/:id      → replace messages
DELETE /api/advisor/conversations/:domain/:id      → delete
```

Titles are derived server-side from the first user message. Dates
are `TIMESTAMPTZ` (migration `20260409010003`) so the frontend's
`formatRelativeDate` shows "just now" correctly for freshly-created
chats.

---

## Extension — adding a new AI write tool

To add `agent_create_vendor`:

1. Create `Servers/advisor/aiActions/createVendor/` with:
   - `schema.ts` — strict Zod schema mirroring `AddNewVendorForm`
   - `definition.ts` — LLM-facing JSON schema (same shape, different consumer)
   - `file.ts` — wraps the common file-phase pattern
     (validate → open tx → ensure workflow → insert approval_request)
   - `execute.ts` — delegates to `createVendorService`
   - `preview.ts` — pure function returning a short human-readable string
   - `index.ts` — barrel export as an `AiActionHandler`
2. Register the handler in
   `Servers/advisor/aiActions/registry.ts`. `aiActionToolDefinitions`
   and `aiActionFilers` pick it up automatically.
3. Mention the new tool in the "Write Tools" section of
   `Servers/advisor/prompts.ts` (one line).
4. In `Clients/src/presentation/pages/Vendors/index.tsx` (or wherever
   the vendor table lives), add a `useEffect` with `onAiActionCompleted`
   filtering on `toolName === 'agent_create_vendor'`.

That's it. No schema migration, no controller changes, no routing.
The generic dispatcher picks up the new handler via the registry and
the window-event listener picks up the refresh signal.

---

## Gotchas / design notes

- **Don't bypass the file phase.** `executeCreateRisk` trusts that
  `input_params` was strict-validated at file time. If you ever call
  the executor directly (e.g. from a test), run the Zod schema first
  or you'll see cryptic Sequelize errors when the insert runs.
- **User-id fields require `list_users`.** The LLM has no intrinsic
  knowledge of numeric user ids. The system prompt tells it to call
  `list_users` first whenever the user mentions a person. Without
  that, the LLM will either hallucinate a number or leave the field
  unset — the Zod schema then rejects it.
- **The `current_risk_level` enum is DB-form, not label-form.** The
  UI dropdown shows "Critical/High/Medium/Low/No Risk" labels, but
  the underlying column values are "Very high risk/High risk/
  Medium risk/Low risk/Very Low risk". The Zod schema and tool
  definition use the DB-form values — the frontend's display layer
  maps them to the label form.
- **Risk level is server-computed.** The UI form computes
  `risk_level_autocalculated` client-side via `RiskCalculator` and
  ships the value. The AI executor uses the equivalent server-side
  helper `calculateRiskLevel` in
  `Servers/utils/validations/riskValidation.utils.ts`. Both
  implementations must produce the same output for the same
  severity/likelihood pair or the "Risk Level" column will
  mysteriously differ between UI-created and AI-created risks.
- **Post-commit side effects aren't wired for AI path yet.** The HTTP
  controller path runs `logEvent`, portfolio snapshot, and risk-owner
  notification after creating a risk. The AI path runs only the
  in-transaction steps. Extending the post-approval pipeline to fire
  those side effects is the next slice of work.
- **Approval transaction atomicity.** Everything from "mark approved"
  through `createRiskService` through the audit ledger append runs in
  one transaction. If any step fails, the approval itself rolls back
  and the risk is never created. You can retry by re-approving.
