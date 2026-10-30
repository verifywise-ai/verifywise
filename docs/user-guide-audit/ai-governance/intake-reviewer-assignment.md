# Audit: ai-governance/intake-reviewer-assignment
**Article path:** shared/user-guide-content/content/ai-governance/intake-reviewer-assignment.ts
**Audited:** 2026-10-29
**Auditor:** code review of PR #5183 (issue #5170)
**Verdict:** ✅ clean (4 findings fixed before merge)

## Summary
New article on reviewer assignment settings, the assignment rules, decision rights, expert review requests and second reviews. Uses the #5171 names.

## Findings (fixed)

### Finding 1 — "Nothing moves a submission back to regular review"
- **Status:** ✅ fixed
- **Reality:** Saving changed settings reassigns pending submissions (`routingService.ts` `rerouteFormPending`) and can move close-call or above-threshold ones to regular review.
- **Fix:** Article says reviewers can't move it back, but saving changed settings can.

### Finding 2 — "Assigned to me" scope
- **Status:** ✅ fixed
- **Reality:** Matches only rows where the user is on the expert or regular list (`laneFilter.ts`); unassigned rows and Admins not on a list see nothing.
- **Fix:** Article states the exact scope.

### Finding 3 — Second review share applies to "a regular reviewer's approval"
- **Status:** ✅ fixed
- **Reality:** Applies to approvals in regular review by anyone not on the expert list, and never when no review level was stored (`intakeForm.ctrl.ts` approve flow).
- **Fix:** Article updated.

### Finding 4 — Close-call margin read as inclusive
- **Status:** ✅ fixed
- **Reality:** The rule is strict (`routingRules.ts:27`, `|score - threshold| < margin`), but the settings summary and review reason said "within N points of".
- **Fix:** UI now says "less than N points from" (PR #5182); the article quotes it.

## Verified claims (sampled)
- Threshold 1–99 (default 50), margin 0–25 (default 10), second review share 0–100 (default 10) — `RoutingSettingsSection.tsx`, server validation.
- Rule order: prohibited, no score, close call, at or above threshold, otherwise regular — `routingRules.ts`. The worked example (41–59 close call, 60+ at or above with the defaults) follows from that order.
- Escalation reason 1–1000 characters; second review notes up to 2000; approver can't second-review their own approval — `intakeForm.ctrl.ts`.

## Skipped / non-verifiable
- "Former user" behaviour taken from the existing intake forms article, not re-checked.
