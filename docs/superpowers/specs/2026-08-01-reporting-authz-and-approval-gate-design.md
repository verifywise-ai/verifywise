# Reporting authorization and the workflow approval gate

**Date:** 2026-08-01
**Branch:** `hp-apr-16-add-tasks-agent` (PR #4389)
**Status:** design approved, ready for implementation planning

Two findings were raised during the PR #4389 bug sweep, documented in the PR body, and
deliberately left unfixed at the time because each changes product behaviour rather than
correcting a mistake. This spec settles both.

---

## Background

### Finding 1 — membership authorization exists on reading a report, not on producing one

`canViewRunQuery` / `listRunsQuery` (`Servers/utils/reportRun.utils.ts`) apply a
project-membership rule to report *reads*: Admin and SuperAdmin see everything, everyone
else sees a project's report only if they own the project or are a member of it.

No equivalent rule exists on the paths that *generate* or *deliver* a report.
`grep -rn "projects_members\|canUserAccess" Servers/services/reporting/` returns nothing
outside tests.

Two consequences:

1. **The email channel is ungated.** An Editor creates a project-scoped schedule with
   `deliveryConfig: { attachFile: true, recipients: [...] }` for any project in the org,
   then runs it. The API download path *denies* that Editor — `canViewRunQuery` requires
   membership and returns 404 — but the email has *already delivered the same bytes as an
   attachment*, on a recurring schedule. Two paths to identical content, one gated, one
   not.

2. **Organization-scope runs are unclassifiable by the read gate.** An `"organization"`
   scope run is recorded with no project, so `viewerVisibilitySql`'s NULL branch treats it
   as visible to everyone — while its content is the union of every project in the org
   (`resolveFrameworkTargets` applies no project predicate, and `orgWide` unfilters
   `collectVendorsList`, `collectModelsList`, `collectVendorRisks`, `collectModelRisks`,
   `collectIncidentManagement`). Any authenticated user, including a read-only Auditor,
   can list and download it.

   `POST /api/reporting/templates/:id/run` amplifies this: `reportTemplate.ctrl.ts:304,351`
   default `scope` to `"organization"` when the body omits it, and an absent
   `sectionsConfig` resolves `reportType` to the `"all"` sentinel.

Cross-*organization* isolation is clean and covered by the tenant-isolation matrix. This is
strictly intra-org, cross-project.

### Finding 2 — the workflow approval gate cannot complete a cycle

No workflow definition anywhere produces an `approvalId`. Every gated step returns a bare
`{ type: "pause" }`:

- `incidentResponse.workflow.ts:97-100` and `:115-119`
- `vendorOnboarding.workflow.ts:116-122`
- `auditPreparation.workflow.ts:65-70`
- `modelDeployment.workflow.ts:161-163`

The engine then persists `awaiting_approval_id = NULL` (`engine.ts:279-287`), and the sole
resume path matches on that column (`approvalGateway.ts:611-621`), so `resumeWorkflow` is
never invoked. There is no controller or route for the engine — `cancelRun` and `listRuns`
are exported with zero callers — so there is no operator escape hatch either. Result:
`audit_preparation` (quarterly, all orgs), `vendor_onboarding` (every high-severity vendor)
and `incident_response` (every critical incident) park in `awaiting_approval` permanently.

Exploration during this design surfaced that the problem is deeper than "the definitions
forgot to pass an id":

- `submitForApprovalImpl` **auto-rejects** any submission whose `toolName` has no registered
  executor (`approvalGateway.ts:186-189, 231-233`). Workflow gates have no executor — the
  workflow step performs its own write on resume.
- `approveActionImpl` **bails with "No executor"** (`:468-482`) *before* it ever reaches
  `resumePausedWorkflowForApproval`.

So naively calling `submitForApproval` from a definition would auto-reject at creation, and
even a hand-inserted approval row could not be approved.

Two companion defects must land in the same change:

- **`ctx.resumedApprovalId` is never cleared.** It is set once in `resumeWorkflow`
  (`engine.ts:422`) and persists for the remainder of `executeStepLoop`. `incident_response`
  has two gated write steps; approving the first would silently authorize the second, so
  one human decision would permit two gated writes. This defect is *latent today* and
  becomes live the moment gating works.
- **`rejectActionImpl` has no workflow path** (`:648-697`). Only `approveActionImpl` calls
  `resumePausedWorkflowForApproval`. A rejected approval leaves its run in
  `awaiting_approval` with `awaiting_approval_id` still pointing at an approval that can
  never return to `pending_approval` (guard at `:666`), so no future approve can recover it.

### A bypass that would make the fix meaningless

There are two routes into the same `approveAction` function:

| Route | Guard |
|---|---|
| `POST /api/ai-approvals/:id/approve` | `authenticateJWT, authorize(["Admin"])` |
| `POST /api/ai-confirmations/approve/:id` | `authenticateJWT` only |

`aiConfirmation.ctrl.ts:28` calls `approveAction(organizationId, id, userId)` with no role
check, for any approval id in the caller's organization. Both files are develop-authored,
not from this branch. Building an Admin-only workflow gate on top of an endpoint any
authenticated user can call would be security theatre — and the same hole already applies
to every existing AI action approval, not only workflow gates.

---

## Decisions

Settled with the requester before design:

| # | Decision |
|---|---|
| 1 | Organization-scope reports are **Admin only**. Non-Admins may create project-scoped reports only, and only for projects they own or belong to. |
| 2 | A **rejected** workflow approval transitions its run to terminal **`cancelled`** — distinct from `failed`, so the audit trail separates "a person declined" from "a step errored". |
| 3 | Schedules that predate this rule **keep running**; the scheduler logs a warning naming them. Nothing silently stops working on deploy. |
| 4 | Workflow gates are resolvable by **Admin only**. |
| 5 | The `aiConfirmation` bypass **is fixed on this PR**, despite being develop-authored, because the gate is not honest without it. |

Approach choices:

| # | Choice |
|---|---|
| 6 | Reporting authorization is enforced by a **shared helper called from the controllers**, not by a service-layer choke point (the scheduler has no user and would need an escape hatch that reopens the hole) and not by route-level guards (scope lives in the request body). |
| 7 | Workflow gates get a **first-class path through the approval gateway**, not a synthetic tool executor (whose no-op return value would be recorded as the action taken) and not a separate approval system. |
| 8 | `resumedApprovalId` is cleared **engine-side**, not by each definition comparing a step id — one location, and a definition that forgets cannot silently reopen the bug. |

---

## Design

### 1. Reporting authorization

**New module:** `Servers/services/reporting/reportAuthorization.ts`

```ts
export interface ReportScopeCheck {
  role: string | null;
  scope: string | undefined;
  projectId: number | null | undefined;
  isMember: boolean;
}

/** Pure rule. Returns [] when permitted. */
export function reportScopeErrors(input: ReportScopeCheck): string[];

/** Does the membership lookup, then delegates. Returns [] when permitted. */
export async function assertReportScopeAllowed(input: {
  role: string | null;
  userId: number;
  organizationId: number;
  scope: string | undefined;
  projectId: number | null | undefined;
}): Promise<string[]>;
```

**Rules, in order:**

1. `role === "Admin" || role === "SuperAdmin"` → `[]`. Unrestricted, matching every other
   membership rule in the codebase.
2. `scope === "organization"` → `["organization-scope reports require the Admin role"]`.
3. `scope === "project"` and `!projectId` → `["project scope requires projectId"]`.
   (`validateScheduledReportInput` already says this; the helper repeats it so it is
   correct when called from paths that do not run that validator.)
4. `scope === "project"` and not a member → `["you are not a member of this project"]`.

Membership predicate, copied from `project.utils.ts:57` and org-scoped:

```sql
SELECT 1 FROM projects p
LEFT JOIN projects_members pm
  ON pm.project_id = p.id AND pm.organization_id = :organizationId
WHERE p.id = :projectId
  AND p.organization_id = :organizationId
  AND (p.owner = :userId OR pm.user_id = :userId)
LIMIT 1
```

A project that does not exist in the caller's organization produces no row and therefore
the same "not a member" message. The endpoint never confirms whether another tenant's
project id exists.

**Call sites (4), all in controllers where `req.role` and `req.userId` are available:**

| Controller function | Scope evaluated |
|---|---|
| `createScheduledReport` | `body.scope`, `body.projectId` |
| `updateScheduledReport` | the **effective post-patch** scope and projectId already computed there for the scope-invariant check |
| `runTemplateNow` | the resolved scope — note it defaults to `"organization"` |
| `runScheduledReportNow` | the stored schedule's `scope` and `project_id` |

**Response code: 403**, not 400. These are authorization failures, and the existing 400s on
these endpoints mean malformed input. The client needs to tell them apart.

`generateReportsV2` needs no change: `POST /api/reporting/v2/generate-report` is already
`authorize(["Admin"])`, and Admins bypass rule 4 anyway.

**Scheduler:** unchanged behaviour per decision 3. `reportSchedulerJobs` calls
`assertReportScopeAllowed` for each due schedule using its `owner_id`, and on a non-empty
result logs a warning naming the schedule id, its owner and the reason — then runs it
anyway. This produces a cleanup list without breaking delivery on deploy.

### 2. Workflow approval gate

#### 2a. Creating an approval

**New export in `Servers/advisor/approval/approvalGateway.ts`:**

```ts
export const WORKFLOW_GATE_TOOL = "workflow_gate";

export async function submitWorkflowGate(config: {
  organizationId: number;
  userId: number | undefined;
  workflowId: string;
  workflowRunId: number;
  stepId: string;
  description: string;
  inputParams?: Record<string, unknown>;
}): Promise<string>; // returns the approvalId
```

Inserts an `ai_action_approvals` row directly at `state = "pending_approval"` with
`tool_name = WORKFLOW_GATE_TOOL`, `action_type = "workflow_gate"`,
`risk_level = "warning"`, and a state history of `[idle, pending_approval]`.

`userId` is optional because most gated runs are started by a trigger, not a person —
`runFrameworkGapScan` and the incident/vendor triggers pass no user. `requested_by` is
nullable in `ai_action_approvals`, so a system-triggered gate stores NULL there rather than
inventing a synthetic user id. `inputParams` carries `{ workflowId, workflowRunId, stepId }`
so the approval is self-describing in the queue even before the run is looked up.

It deliberately skips both the rule engine and the executor pre-check. Both exist to decide
whether a *tool* should run and who should run it; a workflow gate has no tool. See
"Consequences" for what this gives up.

Notification reuses the existing `notifyPendingApproval` path so workflow gates appear in
the same Admin queue as AI action approvals.

**Definition-facing helper:** `Servers/services/workflows/approvalGate.ts`

```ts
export async function requestGateApproval(
  ctx: WorkflowContext,
  stepId: string,
  description: string,
): Promise<StepResult>; // { type: "pause", reason: description, approvalId }
```

so a gated step is one call rather than hand-rolled plumbing repeated five times.

#### 2b. Resolving an approval

**`approveActionImpl`** gains one branch before the executor lookup: when
`record.tool_name === WORKFLOW_GATE_TOOL`, the *execution is the resume*.

1. Transition `pending_approval → approved → executing` exactly as the tool path does.
2. Call `resumePausedWorkflowForApproval(organizationId, id)`.
3. If a linked run was found and resumed → mark the approval `completed`, recording the
   resulting run state.
4. If **no** linked run was found → mark the approval `failed` with
   `"no workflow run linked to this gate"`. It must never report success for a gate that
   resumed nothing.

**`rejectActionImpl`** gains the missing workflow path. After the approval is marked
rejected, look up the run by `awaiting_approval_id` and, when found:

- transition it to terminal **`cancelled`**,
- clear `awaiting_approval_id` (`persistRun` already does this for any non-pausing state),
- write an audit row `workflow.<workflowId>.rejected` recording the rejecting user id and
  the supplied reason.

A rejection with no linked run is a no-op, as it is for AI action approvals today.

#### 2c. Clearing `resumedApprovalId`

In `executeStepLoop`, `ctx.resumedApprovalId` is cleared once the step at the resume index
has completed, whatever its outcome. Concretely: the loop records its entry index and, at
the end of the first iteration, sets `ctx.resumedApprovalId = undefined`.

A second gated step later in the same run therefore sees it falsy, pauses, and mints its
own approval — so `incident_response`'s two gated writes require two human decisions.

#### 2d. Definitions

Five gated sites across four files replace their bare pause with `requestGateApproval`:

| File | Sites |
|---|---|
| `incidentResponse.workflow.ts` | 2 |
| `vendorOnboarding.workflow.ts` | 1 |
| `auditPreparation.workflow.ts` | 1 |
| `modelDeployment.workflow.ts` | 1 |

`modelDeployment`'s gate is additionally unreachable in production today — it is
conditioned on `trigger.requireApproval`, which the only production trigger
(`triggers.ts:21-37`) never sets. That is a separate product question and is **out of scope
here**; this spec only changes how the gate creates its approval, not when it fires.

#### 2e. Closing the bypass

`Servers/routes/aiConfirmation.route.ts`: add `authorize(["Admin"])` to `approve/:id` and
`reject/:id`, matching `aiApproval.route.ts`. `getPendingConfirmations` is a read and is
left as-is.

---

## Testing

Both suites are integration tests against the real database, added to the
"Run reporting and workflow regression suites" step in `.github/workflows/backend-checks.yml`.

**`Servers/tests/integration/report-scope-authorization.test.ts`**

- Editor is refused org-scope on create, on patch, and on run-now (403 each).
- Editor is refused a project-scoped schedule for a project they do not belong to.
- A project member is allowed; the row is written.
- Admin is allowed in both scopes.
- `POST /templates/:id/run` with no `scope` in the body — which defaults to
  `"organization"` — is refused for an Editor.
- A pre-existing schedule that violates the rule still runs when due, and the scheduler
  logs a warning naming it (decision 3).

**`Servers/tests/integration/workflow-approval-gate.test.ts`**

- A gated run pauses with a real `approvalId` persisted to
  `ai_workflow_runs.awaiting_approval_id`, and a `pending_approval` row exists.
- Approving resumes the run to `completed` and marks the approval `completed`.
- Rejecting transitions the run to `cancelled`, clears `awaiting_approval_id`, and writes
  the rejection audit row.
- **A second gated step in the same run pauses again with its own distinct approval id** —
  the 2c trap.
- A non-Admin is refused through **both** `/api/ai-approvals/:id/approve` and
  `/api/ai-confirmations/approve/:id`.
- Approving a `workflow_gate` approval whose run has vanished marks it `failed`, not
  `completed`.

**Unit**

- `reportScopeErrors` — table-driven over role × scope × membership.
- `approveActionImpl` / `rejectActionImpl` workflow branches with a mocked database,
  asserting the executor is never looked up for a `workflow_gate` record.

**Discipline:** every test must fail on the current HEAD, verified by stashing the fix and
re-running. This is the same standard applied to the preceding bug-sweep commits, and it
matters here specifically because the existing unit suite mocks `sequelize.query` and could
not observe any of these defects.

---

## Consequences

**Tests that encode the current behaviour will break.** Any existing test asserting that an
Editor can create an org-scope template or schedule is asserting the bug. Those are updated
with a comment stating why, not quietly relaxed.

**Workflow gates bypass the rule engine**, so an organization's auto-approve rules do not
apply to them. This is deliberate — the rule engine derives facts from a tool name and its
input params, and has nothing meaningful to say about a workflow step — but it means an org
cannot configure "auto-approve vendor onboarding gates" the way it can for AI tool calls. If
that is wanted later, it is an additive change to `submitWorkflowGate`.

**Admins become the bottleneck** for gated workflows and for org-scope reports (decisions 1
and 4). This is the intended trade and is worth revisiting if it bites operationally; the
role list is a single constant in each place.

**The `aiConfirmation` route change affects develop-authored behaviour.** Any client calling
`POST /api/ai-confirmations/approve/:id` as a non-Admin stops working. That path currently
lets any authenticated user resolve any approval in their org, so anything relying on it is
relying on the hole.

---

## Out of scope

Recorded here so the boundary is explicit — these were found in the same sweep and remain
open:

- `modelDeployment`'s gate never fires in production (`trigger.requireApproval` is never set).
- No reaper for runs stuck in `running` after a worker dies mid-step.
- No HTTP surface for the workflow engine at all (`cancelRun`, `listRuns` have no callers).
- The 13 lower-priority findings listed in the PR #4389 description.
