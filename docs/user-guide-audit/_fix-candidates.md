# FIX-candidate list — high-confidence ❌ wrong findings

Pre-sorted bulk-approval list. **35 ❌ wrong findings across 28 articles.**

## How to use

1. Read each finding (they are sorted by collection, then by article).
2. Edit this file: replace the `**[ ]**` checkbox at the start of each Finding line with **`[FIX]`**, **`[PRODUCT]`**, or **`[SKIP]`**.
   - `[FIX]` = doc edit per the suggested fix.
   - `[PRODUCT]` = the app should change instead. Logged for separate triage; doc not edited.
   - `[SKIP]` = leave the doc as is despite the literal mismatch (you accept the framing).
3. Save. The parent thread will read this file, apply edits per `[FIX]`, and log `[PRODUCT]` items separately.
4. Unmarked items default to **SKIP**.

## Default recommendation

All 35 findings are **high or medium confidence**. Default expectation is **most should be FIX**. Specific exceptions:
- Items relating to **"Controls hub"** are confirmed `[FIX]` already (already in `_fix-decisions.md`).
- Items where the doc describes a future-planned feature: candidate for `[SKIP]` if you want the docs to lead the implementation.
- Items describing a permission model that's intentionally being changed in the app: `[PRODUCT]`.

---

## ai-detection

### `scanning.md`

Full report: [scanning.md](./ai-detection/scanning.md)

**[ ]** Finding 1 — Pattern count overstated

- **Type:** Quantitative
- **Doc says:** "against 100+ AI/ML patterns (OpenAI, TensorFlow, PyTorch, LangChain, etc.)" (block index 2)
- **Reality:** Code contains 83 total patterns: 45 in cloud-providers.ts, 17 in frameworks.ts, 21 in local-ml.ts
- **Suggested fix:** Change "100+" to "80+" or "over 80" to match current pattern inventory
- **Confidence:** high


## ai-gateway

### `guardrails.md`

Full report: [guardrails.md](./ai-gateway/guardrails.md)

**[ ]** Finding 1 — HTTP status code is 400, not 422

- **Type:** Quantitative
- **Doc says:** "Rejects the request immediately with HTTP 422." (block 124, table row "Block")
- **Reality:** When guardrails block a request, the code raises `HTTPException(status_code=400)`, not 422.
- **Suggested fix:** Change "HTTP 422" to "HTTP 400" in block 124. (Note: HTTP 422 IS used elsewhere — for invalid regex on rule save — which may be where Phase 1 confused itself.)
- **Confidence:** high

**[ ]** Finding 2 — Turkish TCKN example "12345678901" fails the checksum

- **Type:** Example
- **Doc says:** "Turkish TCKN 
 12345678901 
 11-digit national ID" (block 4, table row)
- **Reality:** TCKN has two checksum digits. "12345678901" fails both: position-10 should be 1 (actual 0), position-11 should be 9 (actual 1). Presidio's regex is permissive (`[1-9]\d{10}`) and would match the format, but the value is not a valid TCKN.


### `logs.md`

Full report: [logs.md](./ai-gateway/logs.md)

**[ ]** Finding 1 — Log row missing latency column

- **Type:** UI claim
- **Doc says:** "Each row shows the endpoint, model, cost, tokens, latency, status and who sent it" (block index 2)
- **Reality:** Log rows render endpoint, model, cost (USD), tokens, status code, and user name/virtual key name. Latency is not displayed in the collapsed row view; it appears only in the expanded request detail panel.
- **Suggested fix:** Either add latency_ms to the log row template, or revise the claim to state "Each row shows endpoint, model, cost, tokens, status and who sent it; click to view latency and full request/response."
- **Confidence:** high


## ai-governance

### `ai-trust-center.md`

Full report: [ai-trust-center.md](./ai-governance/ai-trust-center.md)

**[ ]** Finding 1 — Compliance badges exclude NIST AI RMF

- **Type:** Quantitative
- **Doc says:** "Display certifications like EU AI Act, ISO 42001, ISO 27001 and NIST AI RMF" (block index 8, bullet 2)
- **Reality:** Code constants define only 8 badges: SOC2 Type I, SOC2 Type II, ISO 27001, ISO 42001, CCPA, GDPR, HIPAA, EU AI Act. NIST AI RMF is not in the enum and cannot be displayed.
- **Suggested fix:** Remove "NIST AI RMF" from the list or add it to the compliance badges enum if support is planned.
- **Confidence:** high


### `approval-workflows.md`

Full report: [approval-workflows.md](./ai-governance/approval-workflows.md)

**[ ]** Finding 1 — "Expired" status listed but not implemented in code

- **Type:** Quantitative (enum values)
- **Doc says:** "Expired — The request passed its deadline without a decision" (block 6, table rows[4])
- **Reality:** Backend defines only four statuses in `ApprovalRequestStatus` enum: `PENDING`, `APPROVED`, `REJECTED`, `WITHDRAWN`. No `EXPIRED` value exists. The enum is strict (line 11-16 of approval-workflow.enum.ts); only these four are valid. Database schema enforces this via `ENUM(...)` constraint on `approval_requests.status` column (approvalRequest.model.ts line 64).
- **Suggested fix:** Remove "Expired" row from the status table, or implement expiration logic (background job to mark requests as expired after deadline passes).
- **Confidence:** high


### `project-overview.md`

Full report: [project-overview.md](./ai-governance/project-overview.md)

**[ ]** Finding 1 — Risk severity enum mismatch

- **Type:** Quantitative
- **Doc says:** "Counts of risks by severity: very high, high, medium, low, very low." (block 3)
- **Reality:** Risk severity enum defines five levels: Negligible, Minor, Moderate, Major, Critical
- **Suggested fix:** Update block 3 to read "Counts of risks by severity: Critical, Major, Moderate, Minor, Negligible."
- **Confidence:** high


### `share-links.md`

Full report: [share-links.md](./ai-governance/share-links.md)

**[ ]** Finding 1 — Missing default setting in article

- **Type:** Quantitative
- **Doc says:** "Choose what fields to include in the shared view. Set an expiration date (how long the link stays active). Optionally allow data export from the shared view." (block index 3)
- **Reality:** Four default settings are configured: `shareAllFields: false`, `allowDataExport: true`, `allowViewersToOpenRecords: false`, `displayToolbar: true`
- **Suggested fix:** Add "Display toolbar in shared view" or similar as a fifth configurable option in the creation step.
- **Confidence:** high

**[ ]** Finding 2 — Role requirement for revoke is wrong

- **Type:** Compliance
- **Doc says:** "Revoke share links" requires "Admin" role (block index 10, table row 3)
- **Reality:** Any user can revoke a share link they created, regardless of role. The controller checks `shareLink.created_by !== req.userId` (line 438 in shareLink.ctrl.ts), not role. An Editor can revoke their own link; an Admin cannot revoke another user's link without being its creator.
- **Suggested fix:** Change "Admin" to "Creator (any role)" or clarify as "Anyone (for links they created)"
- **Confidence:** high


### `watchtower.md`

Full report: [watchtower.md](./ai-governance/watchtower.md)

**[ ]** Finding 1 — Events tab table columns do not match documented specification

- **Type:** UI
- **Doc says:** "Each row shows: **Event type**, **User**, **Timestamp**, **Details**" (block index 6)
- **Reality:** The EventsTable component (Clients/src/presentation/components/Table/EventsTable/index.tsx:42–48) defines five columns: ID, EVENT TYPE, DESCRIPTION, USER (ID), TIMESTAMP. The article lists four columns and omits ID and DESCRIPTION entirely.
- **Suggested fix:** Update block 6 to list the actual columns: "Each row shows: **ID**, **Event type**, **Description**, **User**, **Timestamp**."
- **Confidence:** high


## getting-started

### `dashboard.md`

Full report: [dashboard.md](./getting-started/dashboard.md)

**[ ]** Finding 1 — "Controls hub" missing from sidebar

- **Type:** Reference claim / UI claim
- **Doc says:** "The Assurance section contains Risk management, Controls hub, Training registry, Evidence, Reporting, and AI trust center." (block index 16, describing sidebar; this wording appears in context of bullet point "Assurance" description)
- **Reality:** The ASSURANCE sidebar section in actual code contains only: Risk management, Training registry, Evidence, Reporting, and AI trust center. No "Controls hub" menu item exists.
- **Suggested fix:** Remove "Controls hub" from the article's Assurance section description, or confirm if it should be added to the codebase.
- **Confidence:** high


### `quick-start.md`

Full report: [quick-start.md](./getting-started/quick-start.md)

**[ ]** Finding 1 — References non-existent "Controls hub" sidebar menu item

- **Type:** UI 
 Reference
- **Doc says:** "You can also see controls across all use cases from the sidebar: Assurance → Controls hub. This gives you a cross-cutting view of your entire control landscape." (block index 10)
- **Reality:** The sidebar has a "CONTROLS" section with "Evidence" menu item at path `/file-manager`. There is no "Controls hub" menu item in the ASSURANCE group. The ASSURANCE group contains: Risk management, Training registry, Evidence, Reporting, and AI trust center.
- **Suggested fix:** Replace "Assurance → Controls hub" with "Assurance → Evidence" or verify if a Controls hub feature is planned for future release.


## integrations

### `plugins.md`

Full report: [plugins.md](./integrations/plugins.md)

**[ ]** Finding 1 — Non-Admin users can access Plugins page (role gate enforcement missing)

- **Type:** UI / Behavior
- **Doc says:** "Only users with the Admin role can..." install, manage, or browse (block 12, table, role-permission rows)
- **Reality:** Code line 238-240 redirects non-Admin users to "/" on render, but the page routes to `/plugins` without upstream auth gate. No middleware blocks non-Admins from navigating to the page; they only see a redirect after page mounts. Article implies browsing is allowed for all users ("Browse marketplace" requires "Any authenticated user" per block 12, table row 1).
- **Suggested fix:** Clarify that the Marketplace tab is visible to all authenticated users on initial page load, but Admin-only features (Install, Manage) are gated client-side. OR add upstream route-level authorization to prevent non-Admins from reaching the page at all.
- **Confidence:** high


### `slack-integration.md`

Full report: [slack-integration.md](./integrations/slack-integration.md)

**[ ]** Finding 1 — Notification types list does not match code enum

- **Type:** Quantitative / Reference
- **Doc says:** "You can route these notification types to specific channels: Model updates, Risk alerts, Compliance updates, Policy changes, Vendor updates, Training notifications" (block 156–157)
- **Reality:** Code enum `SlackNotificationRoutingType` defines exactly 5 routing types: `MEMBERSHIP_AND_ROLES`, `PROJECTS_AND_ORGANIZATIONS`, `POLICY_REMINDERS_AND_STATUS`, `EVIDENCE_AND_TASK_ALERTS`, `CONTROL_OR_POLICY_CHANGES`
- **Suggested fix:** Update the article's notification types list to match the enum: Membership and roles, Projects and organizations, Policy reminders and status, Evidence and task alerts, Control or policy changes
- **Confidence:** high


## llm-evals

### `ci-cd-integration.md`

Full report: [ci-cd-integration.md](./llm-evals/ci-cd-integration.md)

**[ ]** Finding 1 — Unsupported metric "correctness" in examples

- **Type:** Quantitative claim / Example
- **Doc says:** "An LLM judge scores each response on the metrics you chose (correctness, hallucination, faithfulness, etc.)" (block 3); GitHub Actions example includes `metrics: correctness,faithfulness,hallucination`; Python SDK example uses `metrics=["correctness", "faithfulness", "hallucination"]` (block 13)
- **Reality:** EvalServer's `/evaluate` endpoint schema documents available metrics as `answer_relevancy`, `bias`, `toxicity`, `faithfulness`, `hallucination`, and `contextual_relevancy` — NOT `correctness`. The schema at `EvalServer/src/routers/deepeval.py:76` shows the config includes only these six metrics. Internal mapping in `run_evaluation.py` converts client names (e.g., `answerRelevancy`) to metric names (`answer_relevancy`), but "correctness" is never defined.
- **Suggested fix:** Replace "correctness" with "answer_relevancy" in all examples and explanatory text. Update the Overview section (block 2) to list actual metrics.
- **Confidence:** high


### `configuring-scorers.md`

Full report: [configuring-scorers.md](./llm-evals/configuring-scorers.md)

**[ ]** Finding 1 — Default scorer count does not match implementation

- **Type:** Quantitative
- **Doc says:** "LLM Evals ships with six built-in scorers that cover common evaluation needs. These are enabled by default and work well for most applications:" (block 27)
- **Reality:** NewExperimentModal.tsx (lines 80–87) shows that in chatbot mode, 13 scorers are enabled by default: answerRelevancy, correctness, completeness, hallucination, instructionFollowing, toxicity, bias (7 basic) + turnRelevancy, knowledgeRetention, conversationCoherence, conversationHelpfulness, taskCompletion, conversationSafety (6 conversational).
- **Suggested fix:** Revise block 27 to say "LLM Evals enables a core set of scorers by default based on your use case" and explain that chatbots get 7 basic + 6 conversational metrics enabled. Move the six named scorers (Answer relevancy, Bias, Toxicity, Faithfulness, Hallucination, Contextual relevancy) to a "Core scorers" subsection, then clarify that conversational metrics are added when multi-turn datasets are selected.
- **Confidence:** high


### `models.md`

Full report: [models.md](./llm-evals/models.md)

**[ ]** Finding 1 — OpenRouter provider missing from documentation

- **Type:** Reference 
 Negative
- **Doc says:** Lists 8 providers: OpenAI, Anthropic, Google Gemini, xAI, Mistral, HuggingFace, Ollama, Local/Custom API (block 6, bullet-list items)
- **Reality:** The code implements 7 providers in `PROVIDERS` registry: openai, anthropic, google, mistral, xai, openrouter, self-hosted. OpenRouter is actively imported and exported.
- **Suggested fix:** Add "OpenRouter" to the bullet-list with description of supported models (currently has 600+ models via aggregated API).


### `reports.md`

Full report: [reports.md](./llm-evals/reports.md)

**[ ]** Finding 1 — History table columns mismatch

- **Type:** UI
- **Doc says:** "The table shows the report title, format, number of experiments included, file size and creation date." (block index 24)
- **Reality:** ReportTable component implements columns: REPORT NAME, TYPE OF REPORT, PROJECT/ORGANIZATION, DATE GENERATED, GENERATED BY, ACTION. "Number of experiments included" and "file size" fields are not in the table.
- **Suggested fix:** Update block 24 to list the actual columns: report name, type of report, project/organization, date generated, generated by.
- **Confidence:** high


### `settings.md`

Full report: [settings.md](./llm-evals/settings.md)

**[ ]** Finding 1 — Unsupported providers listed in "Supported providers" section

- **Type:** Reference
- **Doc says:** "You can add API keys for these providers: OpenRouter, OpenAI, Anthropic, Google, Gemini models, xAI, Mistral, Hugging Face, Custom" (block index 4, bullet-list items)
- **Reality:** Code supports only 4 providers: Anthropic, OpenAI, OpenRouter, Custom. The UI component `OrgSettings.tsx` line 20-28 defines `LLM_PROVIDERS` with only these 4 entries. No validation patterns or API endpoints exist for Google, xAI, Mistral, or Hugging Face.
- **Suggested fix:** Replace block 4 to list only "OpenRouter, OpenAI, Anthropic, and Custom" and remove Google, xAI, Mistral, and Hugging Face entries.
- **Confidence:** high


## policies

### `policy-management.md`

Full report: [policy-management.md](./policies/policy-management.md)

**[ ]** Finding 1 — Policy templates tab icon is wrong

- **Type:** UI
- **Doc says:** "icon: 'FileText'" (block index 59)
- **Reality:** The actual code uses `icon: "ShieldHalf"` for the Policy templates tab. The Organizational policies tab correctly uses Shield.
- **Suggested fix:** Change block 59 icon from 'FileText' to 'ShieldHalf'
- **Confidence:** high


### `policy-templates.md`

Full report: [policy-templates.md](./policies/policy-templates.md)

**[ ]** Finding 1 — Article claims "five categories" but code has six

- **Type:** Quantitative
- **Doc says:** "Templates are organized into five categories" (block 74)
- **Reality:** `PolicyTemplateCategory` enum defines 6 values: Core_AI_Governance, Model_Lifecycle_Policies, Data_and_Security, Legal_and_Compliance, People_and_Organization, Industry_Packs.
- **Suggested fix:** Change "five categories" to "six categories" in block 74.
- **Confidence:** high


## reporting

### `dashboard-analytics.md`

Full report: [dashboard-analytics.md](./reporting/dashboard-analytics.md)

**[ ]** Finding 1 — Missing edit mode lock icon and customization UI

- **Type:** Behavior
- **Doc says:** "Click the lock icon in the top right corner of the dashboard... The icon changes to an unlocked state, meaning edit mode is active... A 'Show/hide cards' selector appears next to the lock icon" (block 2)
- **Reality:** The IntegratedDashboard component does not contain any lock icon, edit mode toggle, or Show/hide cards dropdown. The dashboard header contains only a ButtonToggle for switching between Operations and Executive views. All customization logic described in blocks 3–6 is absent from the implementation.
- **Suggested fix:** Remove or rewrite the entire "Entering edit mode" subsection (blocks 3–6), or implement the documented lock icon and edit mode UI if it is planned for a future release.
- **Confidence:** high

**[ ]** Finding 2 — Missing widget drag-and-drop rearrangement feature

- **Type:** Behavior
- **Doc says:** "Click and hold the widget header (a grip icon appears when in edit mode)... Drag the widget to your desired position... Other widgets rearrange automatically to make room" (block 8)
- **Reality:** The dashboard does not support dragging widgets. Widgets are rendered using CSS Grid with fixed gridTemplateColumns; they do not respond to drag events and cannot be reordered by the user. The only layout variation is the Operations vs. Executive view toggle.
- **Suggested fix:** Remove the "Rearranging widgets" section (block 8), or implement drag-and-drop using react-grid-layout or a similar library.
- **Confidence:** high

**[ ]** Finding 3 — Missing widget resizing capability

- **Type:** Behavior
- **Doc says:** "Drag any edge or corner of a widget to resize it... Widgets snap to a grid for consistent alignment... Some widgets have fixed sizes and can't be resized" (block 9)
- **Reality:** The dashboard does not support widget resizing. All widgets are rendered in fixed CSS Grid cells with no resize handles, ResizeObserver hooks, or resize event listeners. The statement about widgets having fixed vs. variable sizes is moot because none can be resized.
- **Suggested fix:** Remove the "Resizing widgets" section (block 9), or implement resizing with a grid library.
- **Confidence:** high


### `generating-reports.md`

Full report: [generating-reports.md](./reporting/generating-reports.md)

**[ ]** Finding 1 — "Generate use case report" and "Generate organization report" buttons don't exist

- **Type:** UI
- **Doc says:** "Click 'Generate use case report'" (block 123) and "Click 'Generate organization report'" (block 157)
- **Reality:** The UI has a single "Generate report" button that opens a dropdown menu with options labeled "Use case report" and "Organization report"
- **Suggested fix:** Change block 123 from "Click 'Generate use case report'" to "Click 'Generate report'" and select the use case report type from the dropdown. Same for block 157 with organization report.
- **Confidence:** high


## risk-management

### `risk-mitigation.md`

Full report: [risk-mitigation.md](./risk-management/risk-mitigation.md)

**[ ]** Finding 1 — Mitigation status enum mismatch: article shows 5, code has 7 with label errors

- **Type:** UI
- **Doc says:** "Not started, In progress, Complete, Paused, Requires review" (block 9)
- **Reality:** MitigationStatus enum has 7 members: NotStarted = "Not Started", InProgress = "In Progress", Completed = "Completed", OnHold = "On Hold", Deferred = "Deferred", Canceled = "Canceled", RequiresReview = "Requires Review"
- **Suggested fix:** Update block 9 to list all 7 status values with correct capitalization and names. Replace "Complete" with "Completed" and "Paused" with "On Hold". Add "Deferred" and "Canceled" to the list.
- **Confidence:** high


### `vendor-risks.md`

Full report: [vendor-risks.md](./risk-management/vendor-risks.md)

**[ ]** Finding 1 — Data sensitivity level descriptions do not match code enum labels

- **Type:** UI claim + Behavior claim
- **Doc says:** "Classify the most sensitive data shared with the vendor: None (No sensitive data (lowest risk)), Internal only (Internal business data), PII (Personally identifiable information), Financial (Financial data or records), Health (Health-related information), Model weights (Proprietary model parameters (highest risk))" (block index 6)
- **Reality:** Code enum shows: None, "Internal only", "Personally identifiable information (PII)", "Financial data", "Health data (e.g. HIPAA)", "Model weights or AI assets". The article simplifies labels (e.g., "Internal business data" vs. enum "Internal only"; "Financial data or records" vs. enum "Financial data"; "Health-related information" vs. enum "Health data (e.g. HIPAA)"; "Proprietary model parameters" vs. enum "Model weights or AI assets")
- **Suggested fix:** Update article block 6 to use exact enum values: "Internal only", "Personally identifiable information (PII)", "Financial data", "Health data (e.g. HIPAA)", "Model weights or AI assets"
- **Confidence:** high

**[ ]** Finding 2 — Business criticality descriptions do not match code enum labels

- **Type:** UI claim + Behavior claim
- **Doc says:** "Evaluate how dependent your operations are on this vendor: Low (Non-essential services; alternatives readily available), Medium (Important but not critical; disruption would be manageable), High (Critical to operations; disruption would significantly impact business)" (block index 10)
- **Reality:** Code enum shows: "Low (vendor supports non-core functions)", "Medium (affects operations but is replaceable)", "High (critical to core services or products)". The article text descriptions differ materially from the parenthetical labels in the enum.
- **Suggested fix:** Update article block 10 to state: "Low (vendor supports non-core functions), Medium (affects operations but is replaceable), High (critical to core services or products)"
- **Confidence:** high


## settings

### `organization-settings.md`

Full report: [organization-settings.md](./settings/organization-settings.md)

**[ ]** Finding 1 — Organization name character limit mismatch

- **Type:** Quantitative claim
- **Doc says:** "The organization name must be between 2 and 100 characters" (block 10, bullet-list item 1)
- **Reality:** Code enforces maximum of 50 characters: `if (this.name.trim().length > 50) { return { accepted: false, message: 'Organization name must be less than 50 characters' }; }`
- **Suggested fix:** Update claim to "The organization name must be between 2 and 50 characters"
- **Confidence:** high

**[ ]** Finding 2 — Editor role listed as able to edit organization settings

- **Type:** Permission/capability claim
- **Doc says:** "Only users with Admin or Editor roles can modify organization settings. Reviewers and Auditors can see the settings but can't make changes." (block 5, callout)
- **Reality:** Code restricts organization edit permission to Admin only: `organizations: { view: ["Admin", "Editor", "Auditor"], create: ["Admin"], edit: ["Admin"], }`
- **Suggested fix:** Update claim to "Only users with Admin role can modify organization settings. Editors, Reviewers, and Auditors can see the settings but can't make changes."
- **Confidence:** high


### `user-management.md`

Full report: [user-management.md](./settings/user-management.md)

**[ ]** Finding 1 — Missing Super Admin role from role list

- **Type:** Verifiable; Missing functionality in documentation
- **Doc says:** "The user's assigned role (Admin, Reviewer, Editor or Auditor)" (block 32, team table row)
- **Reality:** ROLES enum in codebase includes 5 roles: Admin, Reviewer, Editor, Auditor, **Super Admin**
- **Suggested fix:** Add Super Admin to all role enumeration lists in the article (appears in 2+ places: team table, invite modal)
- **Confidence:** high

**[ ]** Finding 2 — Team tab access: Editors cannot manage users

- **Type:** Verifiable; Permission error
- **Doc says:** "The Team tab lets admins and editors manage users in your organization." (block 29)
- **Reality:** Only Admin role has editTeamMembers permission. Editors have NO team management access.
- **Suggested fix:** Change "admins and editors" to "admins only"
- **Confidence:** high


## shadow-ai

### `insights.md`

Full report: [insights.md](./shadow-ai/insights.md)

**[ ]** Finding 1 — Risk score calculation weights incorrect

- **Type:** Quantitative
- **Doc says:** "Risk scores range from 0 to 100 and are recalculated nightly. They factor in approval status (40%), data and compliance policies (25%), usage volume (15%) and department sensitivity (20%)." (block 9, callout)
- **Reality:** Risk scores do use the four factors with correct percentages (40%, 25%, 20%), but usage volume is calculated as `Math.min(volumeRatio * 50, 100)` where `volumeRatio = toolEvents / orgAvgEvents`, then multiplied by 15% weight. This is not a direct "15% of the event volume" but rather a normalized/capped linear scaling. Usage volume weight caps at 100 and is capped again during normalization.
- **Suggested fix:** Update the callout to clarify that usage volume is normalized: "...usage volume (15%, normalized to event ratio against org average)..." or expand the callout with a data policy scoring table (like lines 28-35 of the risk scoring service).
- **Confidence:** high


### `settings.md`

Full report: [settings.md](./shadow-ai/settings.md)

**[ ]** Finding 1 — REST API endpoint path incorrect

- **Type:** Reference
- **Doc says:** "Send events via `POST /api/v1/shadow-ai/events`" (block 3, code block)
- **Reality:** Endpoint is defined as `POST /v1/shadow-ai/events` (no `/api` prefix)
- **Suggested fix:** Change documentation to `POST /v1/shadow-ai/events`
- **Confidence:** high


## training

### `training-tracking.md`

Full report: [training-tracking.md](./training/training-tracking.md)

**[ ]** Finding 1 — Button label mismatch: "Add training" vs "New training"

- **Type:** UI
- **Doc says:** "Click \"Add training\" in the toolbar" (block index 113)
- **Reality:** The button in `/Clients/src/presentation/pages/TrainingRegistar/index.tsx:617` is labeled `text="New training"`, not "Add training"
- **Suggested fix:** Change block 113 to read: "Click \"New training\" in the toolbar"
- **Confidence:** high

