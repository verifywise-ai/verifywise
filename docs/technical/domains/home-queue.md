# Home queue

## Overview

Home (`/home`) has two tabs. Today lists what needs the signed-in user, from every source that can say so truthfully, plus a strip of org-wide counts. Get started renders the Start here content (`StartHereContent`). The Today data comes from one endpoint:

```
GET /api/v1/home/queue → { items, sources, counts }
```

| Layer | Where |
|-------|-------|
| Route (auth only; each source decides who may see it) | `Servers/routes/v1/homeQueue.route.ts` |
| Controller (token org and user, permissions, `today`) | `Servers/controllers/homeQueue.ctrl.ts` |
| Service (runs sources and counts, sorts) | `Servers/services/homeQueue/index.ts`, `sort.ts` |
| Sources | `Servers/services/homeQueue/sources/*.source.ts` |
| Counts | `Servers/services/homeQueue/counts.ts` |
| Contract | `Servers/domain.layer/interfaces/i.homeQueue.ts`, mirrored in `Clients/src/domain/types/homeQueue.types.ts` |
| Client | `Clients/src/presentation/pages/HomeQueue/`, hook `useHomeQueue` (React Query, `staleTime` 60 s, refetch on window focus) |

The server sends structured fields only (`source`, `name`, `dueDate`, `waitingSince`, `meta`). The client builds titles and context lines in `HomeQueue/queueItemText.ts` through `t()`, so de, fr and es stay correct.

## Sources

Every query filters by `organization_id`. `today` is the UTC date computed in the controller. The due-soon window is 14 days (`DUE_SOON_DAYS` in `sources/dateOnly.ts`); overdue items are always included.

| Source | File | An item is on your list when | Visible to |
|--------|------|------------------------------|------------|
| `approvals` | `approvals.source.ts` | `getPendingApprovalsQuery` returns it: you approve the request's current step, have not answered, request is pending. Requests you raised are not included. | everyone |
| `tasks` | `tasks.source.ts` | You are in `task_assignees` and status is Open, In Progress or Overdue. Overdue is derived from `due_date < today`, because the stored status is not kept current. | everyone |
| `intake` | `intake.source.ts` | Pending submission and you are a named reviewer of its lane, or routing is off or no lane is stored, or the lane has nobody named and `canDecideLane` accepts you. Or an approved submission with a second review open (or missed and unresolved) where you are a senior reviewer (an Admin when none are named) and not the first approver. | `intakeForm.edit` |
| `risks` | `risks.source.ts` | `risk_owner` is you, not deleted, and mitigation status is Not Started (NULL counts), Requires review, or `deadline < today` and status not Completed or Canceled. | everyone |
| `policyReviews` | `policyReviews.source.ts` | You are `policy_owner_id` or an assigned reviewer and `next_review_date <= today + 14`. | everyone |
| `vendorReviews` | `vendorReviews.source.ts` | You are `reviewer` (or `assignee` when no reviewer) and `review_date <= today + 14`. A vendor with status Reviewed is excluded only when its review date is before today. | everyone |
| `incidents` | `incidents.source.ts` | `assignee_id` is you, status is not Closed, not archived. | everyone |
| `mrmFindings` | `mrmFindings.source.ts` | `owner_id` is you and stage is not Resolved or Closed. | everyone |

Order (`sort.ts`): overdue first, then `dueDate` ascending, then `waitingSince` ascending, nulls last, item id as the tie break.

Not in the queue yet, and why: agent (MCP) approvals (no permission key means "may decide an agent approval"), Advisor AI approvals (no page lists or decides them), evidence expiry, training, AI Detection and Shadow AI decisions, post-market monitoring cycles, FRIA, and framework control assignments (no truthful per-user owner today).

## Counts

`counts.ts` returns org-wide counts the user may see: intake waiting (`intakeForm.edit` only), agents to review, AI on the record, untreated risks, vendor reviews due, policy reviews due, and prompts blocked or masked in the last 24 hours. The risk, vendor and policy counts reuse the condition constants exported by their source files, so the list and the count cannot drift apart.

The prompts count calls the AI Gateway (`aiGatewayRequest`, `GET /internal/guardrails/stats?period=24h`, `summary.blocked + summary.masked`) with a 2 s timeout (`GATEWAY_COUNT_TIMEOUT_MS`).

## Failure semantics

| Situation | Response | UI |
|-----------|----------|----|
| A source throws | `sources[id] = { status: "unavailable", count: 0 }`, no items, error logged | "<Source> couldn't be loaded." under the list; never "Nothing needs you" |
| A source the user may not see | absent from `sources` | not offered in the filter |
| A count throws, or the gateway errors or times out | `counts[id] = null` | dash with a tooltip, never 0 |
| A count the user may not see, or the prompts count with no gateway key (`isGatewayInternalKeyConfigured()` false) | key absent from `counts` | row not rendered |
| The whole counts loader fails | `counts = {}` | strip hidden |
| No organization on the token (pure super admin) | empty queue | empty state |

## Tenant isolation

Organization and user come from the token only; the endpoint takes no id parameters. Each source filters `organization_id` in SQL. Integration coverage is in `Servers/tests/integration/tenant-isolation/home-queue.isolation.test.ts` (another org's items and counts never appear) and `Servers/tests/integration/home-queue-sources.test.ts` (source rules against real tables).

## Adding a source

1. Check there is a truthful per-user owner or assignee. If the only rule is "anyone with the role", do not add it.
2. Add the id to `HomeQueueSourceId` in `i.homeQueue.ts` and to `Clients/src/domain/types/homeQueue.types.ts`.
3. Create `Servers/services/homeQueue/sources/<name>.source.ts` exporting a `HomeQueueSource` (`id`, `part`, `isVisible`, `load`). Filter by `ctx.organizationId` and `ctx.userId`, format dates in SQL (see `dateOnly.ts`), and return `url` of the record or the page where it is decided. Export the SQL so a test can pin it.
4. Register it in `HOME_QUEUE_SOURCES` in `services/homeQueue/index.ts`.
5. On the client add its label to `HOME_QUEUE_SOURCE_LABELS` (its key order is the filter order), its module name in `MODULE` and a `case` in `queueItemText.ts`, and de, fr and es strings in `Clients/src/i18n/modules/homeQueue.ts`.
6. If the item has a matching org-wide count, share the condition constant between the source and `counts.ts`.
7. Add unit tests for the rule, a row in the tenant isolation test, and update the Home user guide article (`shared/user-guide-content/content/getting-started/home.ts`, mirrored to the website guide).
8. Run `npm run generate:swagger` and `npm run generate:endpoints` if the response shape changed.
