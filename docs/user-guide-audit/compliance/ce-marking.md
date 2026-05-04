# Audit: compliance/ce-marking
**Article path:** shared/user-guide-content/content/compliance/ce-marking.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary
The CE Marking article describes VerifyWise's 7-step conformity assessment workflow with good fidelity to the backend implementation. However, two field-level claims about enumerated status values contradict the actual database/code implementation. The article uses human-friendly Title Case formatting (e.g., "Ready for signature") where the code stores lowercase enum values (e.g., "draft"). These are presentation-layer discrepancies, not logic errors.

## Findings
### Finding 1 — Declaration status enum mismatch: article lists Title Case, code uses lowercase
- **Type:** Quantitative (enum values)
- **Status:** ⚠️ partial
- **Doc says:** "Draft, Ready for signature, Signed, or Archived" (block index 98, table rows[0].description)
- **Reality:** The backend stores declaration status as lowercase string literals. Default inserted value is `'draft'`. No enum exists; status is stored as `VARCHAR` and can hold any string. The code at line 74 of ceMarking.ctrl.ts inserts `'draft'` (not "Draft"). No evidence found for "Ready for signature", "Signed", or "Archived" as actual stored values.
- **Evidence:** `/Users/gorkemcetin/verifywise/Servers/controllers/ceMarking.ctrl.ts:74` shows default is `declaration_status: "draft"`. Frontend type `/Users/gorkemcetin/verifywise/Clients/src/domain/types/ceMarking.ts:40` defines `declarationStatus: string` (no enum). The UI likely displays these as Title Case for readability, but the article conflates the UI presentation with the actual enum values.
- **Suggested fix:** Either (a) clarify that these are the *display* labels shown in the UI, not the database enum values, or (b) verify with product what the actual declaration status values should be and align code to match. Current mismatch creates maintenance risk if code references the doc as source of truth.
- **Confidence:** high

### Finding 2 — Registration status enum mismatch: article lists specific values, code stores lowercase
- **Type:** Quantitative (enum values)
- **Status:** ⚠️ partial
- **Doc says:** "Not registered, Pending, Registered, or Rejected" (block index 121, table rows[0].description)
- **Reality:** The backend stores registration status as lowercase. Default inserted value is `'not_registered'` (line 74 of ceMarking.ctrl.ts). No "Pending", "Registered", or "Rejected" enum is defined; status is a plain VARCHAR. Same issue as declaration status: article lists what the UI *displays*, not what the code stores.
- **Evidence:** `/Users/gorkemcetin/verifywise/Servers/controllers/ceMarking.ctrl.ts:74` shows default is `registration_status: "not_registered"`. No enum found; status field is `VARCHAR`. /Users/gorkemcetin/verifywise/Clients/src/domain/types/ceMarking.ts:46 defines `registrationStatus: string` (no enum).
- **Suggested fix:** Align with Finding 1 — clarify UI display labels vs. database values, or standardize both to use Title Case throughout code and docs.
- **Confidence:** high

## Verified claims (sampled)
- Claim: "7 conformity steps" (block 63) — verified at `/Users/gorkemcetin/verifywise/Servers/controllers/ceMarking.ctrl.ts:12-20`, DEFAULT_CONFORMITY_STEPS array has exactly 7 entries.
- Claim: "Not started, In progress, Completed or Not needed" for conformity step statuses (block 63) — verified at `/Users/gorkemcetin/verifywise/Clients/src/domain/types/ceMarking.ts:5-10`, ConformityStepStatus enum defines these exact 4 values with correct Title Case.
- Claim: "default record is created with all 7 conformity steps set to 'Not started'" (block 30) — verified at `/Users/gorkemcetin/verifywise/Servers/controllers/ceMarking.ctrl.ts:94` inserts each step with `status: 'Not started'`.
- Claim: "links policies, evidence and incidents" (block 17) — verified at `/Users/gorkemcetin/verifywise/Servers/controllers/ceMarking.ctrl.ts:145-172` queries ce_marking_policies, ce_marking_evidences, and ce_marking_incidents tables.
- Claim: "role permissions: Any authenticated user can View CE Marking; Admin or Editor can update" (block 162, table) — feature is implemented but role checks are enforced by middleware/controllers, not audited against article here.

## Skipped / non-verifiable
- "CE Marking is the EU's conformity certification for high-risk AI systems" (block 13) — regulatory definition; skipped per audit method.
- "Before you can market or deploy a high-risk AI system in the EU, you need to classify it..." (block 13) — regulatory process overview; skipped.
- "It tracks progress and links the policies, evidence and incidents that support your compliance claim" (block 17) — motivational framing; skipped (feature linking is verified separately).
- "A progress bar at the top shows how many steps are completed" (block 79) — UI rendering behavior; would require browser test to verify visually. Not audited without browser escalation.
- "Linking policies, evidence, and incidents" section (blocks 131–147) — describes feature purpose and benefit; not a verifiable claim.
