# Home action queue — design (phase 3)

Date: 2026-11-14. Branch `feature/phase3-home` off develop `f8f25b838`.
Decision owner: the product owner delegated every call in this phase ("go with your recommendation"). Each call below is marked **Call** with its reason, so it can be overruled later.

## Intent

In the new look (phase 1 restyle, default), a user who opens VerifyWise should land on the question "what do I need to do now?", not on thirty charts. Today the things that need a person are scattered: the Approval requests button in the top bar, the bell, the Tasks page, the intake queue on Use cases, review dates buried in policy and vendor records, agent approvals inside AI Gateway. Home gathers them into one queue, routed to the signed-in user, each item one click from the record that needs the decision.

Source: UI Proposal artifact `Wc5fkAqRW7L1q423kBsBzY`, page `home` ("Everything that needs a person today, from every part of the platform, in one queue"). Phase 2 already put a **Home** item at the top of the unified sidebar, pointing at `/start-here`.

## Goals

1. A Home page with a **Today** tab: one "Needs your attention" list of items that need *this user's* action, from every source that can say so truthfully today.
2. A small strip of counts grouped Record / Track / Enforce, each linking to its module.
3. Today's Start here content stays available as a second tab, **Get started**.
4. Exact, server-side "is this mine?" rules, scoped by organization and user, in one endpoint.

## Non-goals (this phase)

- Folding the Dashboard into Home (the proposal's Operations/Executive tabs). Operations/Executive are a toggle inside `IntegratedDashboard` (`Clients/src/presentation/pages/DashboardOverview/IntegratedDashboard.tsx:355-356`) with a per-user widget layout; moving them is a separate merge. Dashboard stays its own sidebar item.
- Changing the post-login landing page. `/` stays the dashboard. (**Call:** changing where every user lands is the most visible behaviour change in the product and belongs with the Dashboard fold, not with a new page.)
- Inline approve/deny/decide buttons on queue items. Items link to the existing page where the decision is made. (**Call:** each decision today has its own rules — approval steps, second-review lanes, gateway `require_admin` — duplicating them is the riskiest part and not needed for the value.)
- The proposal's "AI pipeline" (gate one / gate two), "Ran automatically today", vendor terms watching, and risk feeds matched to your systems. No data source exists for the last three; the pipeline needs lifecycle/intake work first.
- Real-time push. Polling via React Query is enough.
- Any change to the classic look.

## Anti-goals (would make this a failure even if it works)

- An item or count that is not true: shown to someone who can't act on it, missing for someone who can, or a zero shown when a source failed. Truthful-copy is a standing rule.
- Leaking anything across organizations.
- Making Home slow: it must not fetch every risk, vendor, policy and incident in the org to the browser and filter there.
- Losing Start here's onboarding (checklist, videos, LLM-key notice, shortcuts).

## Constraints

- Multi-tenancy: every query filters by `organization_id` (shared schema). See `Servers/CLAUDE.md` and `docs/technical/architecture/multi-tenancy.md`. New org-scoped routes need tenant-isolation coverage.
- Thin controllers; logic in services/utils (`Servers/CLAUDE.md`). Frontend: repository + React Query hook pattern (`Clients/src/application/repository/*`, `Clients/src/application/hooks/*`, see `useUseCaseLifecycle.ts`). House components, tokens only, pixel-string spacing, sentence case, de/fr/es for every new string (i18n strict gate).
- Permission gating by permission key, never by role name (`Clients/CLAUDE.md`), server-side for data and `useCan` for UI.
- `/api/*` contract rules: new endpoint documented in swagger (`npm run generate:swagger`, `generate:endpoints`).
- Classic look (`vw-ui-style=classic`) unchanged.

## Approaches considered

1. **One server aggregate endpoint `GET /api/v1/home/queue`** (chosen). Each source is a small function with its own exact SQL ("mine" + org scope), run in parallel; a source that throws or is unavailable reports `status: "unavailable"` instead of zero items. Pro: exact rules in SQL, no org-wide lists sent to the browser, one place to test tenant isolation and permissions, one request for the page. Con: new backend code per source; the prompts count must call the Python gateway from Node.
2. **Client fetches each existing endpoint and filters.** Pro: no backend work. Con: most list endpoints are org-wide (`/api/projectRisks`, `/api/vendors`, `/api/policies`, `/api/ai-incident-managements` return everything), so Home would download whole registers and filter in the browser — slow on large orgs and easy to get "mine" subtly wrong; failures look like zeros. Rejected.
3. **Build the queue from notifications.** Pro: data already per user. Con: notifications are point-in-time events; read ≠ resolved and they are never removed when the item is handled (`notifications.is_read` only). The queue would show handled items. Rejected.

**Call:** approach 1.

## The design

### Route and navigation
- New page at **`/home`**, tabs **Today** (default) and **Get started**. Tab in the URL (`/home?tab=get-started`) using the existing tab-state pattern of other tabbed pages.
- New look: the unified sidebar's Home item points to `/home` (change `NAV_GROUPS` `home` path in `Clients/src/presentation/components/UnifiedSidebar/navConfig.ts:20` and the navConfig tests/inventory fixture). `/start-here` redirects to `/home?tab=get-started` in the new look only.
- Classic look: unchanged — its sidebar keeps "Start here" → `/start-here`, which renders `StartHere` as today. `/home` is still a valid route in classic (so links work), rendering the same page.
- `App.tsx:144-160` onboarding modal logic currently keys off `/` or `/start-here` and `handleOnboardingDone` navigates to `/start-here`; in the new look it must target `/home?tab=get-started` (and trigger on `/home`). `guideRouteMap.ts` gets a `/home` entry.
- Naming trap: `Clients/src/presentation/pages/Home/1.0Home` is the Use cases page (`VWHome`). The new page lives in a new folder, e.g. `pages/HomeQueue/`, component `HomePage`. **Call.**

### Get started tab
Renders the existing `StartHere` page body (`Clients/src/presentation/pages/StartHere/index.tsx`) unchanged inside the tab (onboarding checklist with its progress/dismiss/confetti state, LLM-key notice, videos, shortcuts, experts, What's new). Extract the body into a component if the page wrapper (title/breadcrumb) would otherwise double up; no behaviour change.

### Today tab
```
Good afternoon, <first name>
Everything that needs you today, in one list.

Needs your attention   12                         [filter: All ▾]
● Approval: "Deploy CV screener" — step 2 of 3     Approval workflows · waiting 2 days   [Open]
● Task overdue: Update DPIA for chatbot           Tasks · due 10 Nov                   [Open]
● Intake: "Summarise supplier contracts"          Intake · submitted by Legal          [Review]
...
(empty: "Nothing needs you right now." + link to Get started)

Record                    Track                     Enforce
Intake waiting      2     Untreated risks     4     Policy reviews due   1
Agents to review    3     Vendor reviews due  2     Agent approvals      1
AI on the record   30                               Prompts blocked/masked (24 h) 10
```
- Each item: part-colour dot (Record/Track/Enforce token, wayfinding only, as in the sidebar), title, one context line (module · reason · age/due), one link button to the record or page. Overdue items get a status pill using the existing status tokens.
- Order: overdue first, then due soonest, then oldest waiting. Grouping filter: All / per source (house dropdown pattern).
- A source with `status: "unavailable"` shows one muted line ("Agent approvals couldn't be loaded") instead of silently showing nothing; counts from it show "—".
- Refresh: React Query, `staleTime` 60 s, refetch on window focus; no polling beyond that.

### Queue sources (v1)
All rules are exact and server-side; every query filters `organization_id` and, where stated, the user. "Due soon" window = 14 days (**Call:** matches a two-week planning horizon and is longer than the existing 6/7-day notification windows so Home warns earlier than the bell).

| # | Source | Part | "Needs me" rule | Who sees it | Facts (file:line) |
|---|---|---|---|---|---|
| 1 | Approval requests | Enforce | Pending step approval where approver = me, step = request's `current_step`, request Pending | anyone (as today) | `getPendingApprovalsQuery` `Servers/utils/approvalRequest.utils.ts:425`; do NOT reuse the top-bar badge count, which adds my own requests (`DashboardActionButtons.tsx:132-145`) |
| 2 | My tasks | (none — top group) | assignee = me, status Open or In Progress (and not Deleted); overdue = `due_date < today`, due soon = within 14 days | anyone | `task.utils.ts:206,283` (assignee filter); statuses `task-status.enum.ts`; overdue status can lag, derive from `due_date` |
| 3 | Intake submissions | Record | Mirror the oversight rule (`Servers/.../oversight.ts:368-372`): (a) `status = pending` AND (I'm in the lane's reviewers, OR the submission has no lane, OR routing is off, OR the lane has no named reviewers and I can decide it via `canDecideLane`) AND I hold `intakeForm.edit`; OR (b) a second review is open or missed (it is opened on approval, `intakeForm.ctrl.ts:2564-2577`, so the submission is already approved) AND I'm in `secondReviewerIds`, excluding the first approver. Known limit: the decision endpoint re-derives the lane at decision time (`decisionGate.ts:29-48`), so in short-lived cases (routing on but no lane stored yet, or a standard lane raised to senior) an item can reach someone who then gets a 403; accepted. **Call:** an Admin sees only lanes where they are named, not every lane they could override via `canDecideLane` (`routingRules.ts:115-124`) — otherwise every Admin gets every submission; the override stays available on the Intake page | holders of `intakeForm.edit` | `intakeForm.ctrl.ts:1601`; `getEligibleReviewersQuery` `intakeForm.utils.ts:1405`; `laneReviewerIdsFor` returns `[]` for a null lane |
| 4 | ~~Advisor AI approvals~~ | — | **Deferred** (see below) | — | — |
| 5 | My risks | Track | `risk_owner = me`, not deleted, AND (`mitigation_status` in Not Started / Requires review, OR `deadline < today` and status not Completed/Canceled) | any org member (reads are open) | `risk.model.ts`; `getAllRisksQuery` `Servers/utils/risk.utils.ts`; `mitigation_status` has no default — treat NULL as Not Started, verify live values |
| 6 | Policy reviews | Enforce | I'm an assigned reviewer (join table `policy_manager__assigned_reviewer_ids`) or I'm `policy_owner_id`, AND `next_review_date <= today+14` (includes overdue) | any org member (reads are open) | `policy.model.ts` (`next_review_date`, `policy_owner_id`); reviewers aggregated in `getAllPoliciesQuery` `policyManager.utils.ts:53-60`; the existing due-soon sweep never reports overdue |
| 7 | Vendor reviews | Track | **Call:** excludes a vendor only when `review_status` = 'Reviewed' **and** `review_date` is before today (product decision 2026-11-13: the normal workflow marks it Reviewed and sets the next cycle's date in one save, so that upcoming review must show; NULL and other statuses stay in); recipient = `reviewer`, or `assignee` when there is no reviewer (as the `vendor_review_due` sweep reads it); window `review_date <= today+14` including overdue. | any org member (reads are open) | `vendor.model.ts` |
| 8 | My incidents | (top group) | `assignee_id = me` AND status not Closed | any org member (reads are open) | `ai-incident-management.enum.ts`, `incidemtManagement.model.ts` |
| 9 | MRM findings | Record | `owner_id = me` AND stage not resolved/closed | any finding owner (**Call:** no MRM enable flag or permission key exists; the MRM tab is always shown, `ModelInventory/index.tsx:2283-2288`) | `mrm_findings`; `mrm.route.ts:55` |

Deferred: **Advisor AI approvals** — no client page lists or decides them (`/api/ai-approvals` has no caller; the bell links to the rules editor `/settings/ai-approval-rules`), they auto-reject after 10 minutes (`timeoutHandler.ts:22-60`), and ones bridged to an `ai_action` approval workflow already reach their step approvers through source 1. Add once a page exists. **Agent (MCP) approvals** — no permission key means "may decide an agent approval"; the gateway lists them to anyone (`mcp_approvals.py:21-27`) and decides by role name (`AIGateway/src/utils/auth.py:44-48`). **Call:** add them once a key exists (new key + gateway permission check is its own change); no role-name exception. Also deferred (no truthful per-user source today): evidence expiry (owner is only `uploaded_by`), AI Detection / Shadow AI decisions (no owner), training acknowledgements, PMM cycles, FRIA, framework control assignments, model revalidation. Listed so the next phase can add owners where it makes sense.

### Counts strip (v1)
Org-wide counts the user is allowed to see, each a link: Record — intake waiting (only for `intakeForm.edit`), agents to review (`/api/agent-discovery/stats` `.unreviewed`), AI on the record (use cases + models + AI apps + agents); Track — untreated risks (org-wide, same rule as source 5 without the owner), vendor reviews due (org-wide); Enforce — policy reviews due (org-wide), prompts blocked + masked in the last 24 h (gateway guardrail stats with **`period=24h`** — `get_date_range` in `AIGateway/src/routers/guardrails_crud.py:40-54` accepts `24h|7d|30d|90d` and silently falls back to 30 days for anything else; `summary.blocked + summary.masked`; label says "last 24 hours", not "today"). Node reaches the gateway with `aiGatewayRequest` (`Servers/utils/aiGatewayInternal.utils.ts:44`), not through the HTTP proxy; any error or timeout maps to `null` (shown as "—"). A count the user may not see is omitted, not zeroed.

### API
`GET /api/v1/home/queue` → `{ items: QueueItem[], sources: { [sourceId]: { status: "ok" | "unavailable", count } }, counts: { [countId]: number | null } }`, where `QueueItem = { id, source, part, title, context, entityType, entityId, url, dueDate?, waitingSince?, overdue }`. Titles/context are built on the client from structured fields + i18n, not as English strings from the server (**Call:** keeps de/fr/es correct). Controller thin; service `homeQueue.service.ts` runs the sources with `Promise.allSettled`; one util/query per source. Swagger documented. Add the route to the API docs and to tenant-isolation tests (the integration isolation matrix) proving another org's items never appear.

## Left to the builder
- Exact query shapes and indexes (check EXPLAIN on the larger sources; add no migration unless an index is clearly needed — if so, stop and flag it).
- The timeout for the gateway call (`aiGatewayRequest`) so a slow gateway can't stall the whole response.
- Component breakdown, test file layout, i18n keys.
- User guide: a new "Home" article under `shared/user-guide-content/content/getting-started/`, mirrored to the website (never committed there); `Clients/CLAUDE.md` note that a new "needs action" source belongs in the Home queue service.
