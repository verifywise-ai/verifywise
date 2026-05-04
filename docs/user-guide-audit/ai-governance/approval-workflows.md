# Audit: ai-governance/approval-workflows
**Article path:** shared/user-guide-content/content/ai-governance/approval-workflows.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (1)

## Summary
Article covers the approval workflow feature clearly with accurate statuses, role-based access, and multi-step process. One status ("Expired") is documented but not implemented in the backend code. All other claims verified against enums, models, and controllers.

## Findings
### Finding 1 — "Expired" status listed but not implemented in code
- **Type:** Quantitative (enum values)
- **Status:** ❌ wrong
- **Doc says:** "Expired — The request passed its deadline without a decision" (block 6, table rows[4])
- **Reality:** Backend defines only four statuses in `ApprovalRequestStatus` enum: `PENDING`, `APPROVED`, `REJECTED`, `WITHDRAWN`. No `EXPIRED` value exists. The enum is strict (line 11-16 of approval-workflow.enum.ts); only these four are valid. Database schema enforces this via `ENUM(...)` constraint on `approval_requests.status` column (approvalRequest.model.ts line 64).
- **Evidence:** `/Users/gorkemcetin/verifywise/Servers/domain.layer/enums/approval-workflow.enum.ts:11-16` defines `ApprovalRequestStatus` with `PENDING | APPROVED | REJECTED | WITHDRAWN` only. `/Users/gorkemcetin/verifywise/Servers/domain.layer/models/approvalWorkflow/approvalRequest.model.ts:64` enforces enum on column. No job, cron, or handler exists to transition requests to `EXPIRED` status.
- **Suggested fix:** Remove "Expired" row from the status table, or implement expiration logic (background job to mark requests as expired after deadline passes).
- **Confidence:** high

## Verified claims (sampled)
- Claim: "You define who needs to approve, whether all approvers or just one must agree and set an optional deadline" (block 1) — verified at `Servers/controllers/approvalRequest.ctrl.ts:366-373` (approveRequest uses `ApprovalResult.APPROVED`); workflow creation allows deadline via `expiration_period` parameter; enum `ApprovalRequestStatus` matches documented states (except Expired).
- Claim: "Pending — Waiting for approver action" (block 6, rows[0]) — verified at `Servers/domain.layer/enums/approval-workflow.enum.ts:12` `PENDING = "Pending"` and controller creates requests with `status: "Pending"` (line 114 of approvalRequest.ctrl.ts).
- Claim: "Approved — All required approvers have approved" (block 6, rows[1]) — verified at `Servers/domain.layer/enums/approval-workflow.enum.ts:13` `APPROVED = "Approved"`; controller logic updates status to Approved when final approver approves (processApprovalQuery in approvalRequest.utils.ts).
- Claim: "Rejected — One or more approvers rejected the request" (block 6, rows[2]) — verified at `Servers/domain.layer/enums/approval-workflow.enum.ts:14` `REJECTED = "Rejected"` and controller rejectRequest (line 500-615 of approvalRequest.ctrl.ts) updates to Rejected.
- Claim: "Withdrawn — The requestor cancelled the request" (block 6, rows[3]) — verified at `Servers/domain.layer/enums/approval-workflow.enum.ts:15` `WITHDRAWN = "Withdrawn"` and withdrawRequest handler (line 622-685 of approvalRequest.ctrl.ts) exists and sets status to Withdrawn.

## Skipped / non-verifiable
- "Set an optional deadline" (block 1) — opinion/feature design only; implementation confirmed but specific deadline enforcement mechanism not audited (backend accepts deadline, no UI/expiration handler verified).
- "All designated approvers receive a notification" (block 5) — behavior/outcome; notification services exist (notifyApprovalRequested in controllers) but email/in-app delivery not verified in detail.
