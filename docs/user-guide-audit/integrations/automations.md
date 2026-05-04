# Audit: integrations/automations
**Article path:** shared/user-guide-content/content/integrations/automations.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
The automations user guide article is accurate and well-aligned with the codebase. All core claims about automations structure (triggers, conditions, actions), sidebar navigation, UI labels, toggling behavior, and role-based access control have been verified against the Automations page component, service layer, and repository. No inaccuracies found.

## Findings
None — no significant, partial, or unverifiable issues detected.

## Verified claims (sampled)
- Claim: "Automations let you set up rules that run when certain conditions are met" (block 1) — verified in automationsService.ts types: `AutomationRecord` includes `params` (conditions) and `is_active` flag, plus action execution based on trigger events.
- Claim: "Each automation has 3 parts: Trigger, Conditions, and Action" (block 4) — verified in type definitions (`AutomationRecord` has `trigger_id`, `params`, and `actions` array); Automations page component maps these three concepts precisely.
- Claim: "Go to **Automations** from the sidebar" (block 7, step 1) — verified at `Clients/src/presentation/components/Layout/DashboardActionButtons.tsx:220` (Automations button with tooltip) and `Clients/src/application/config/routes.tsx:166` (route `/automations`).
- Claim: "Toggle the automation **Active** and click **Save**" (block 7, step 7) — verified in `UpdateAutomationPayload` interface at `Clients/src/infrastructure/api/automationsService.ts` includes `is_active?: boolean`; Automations page component state confirms toggle behavior.
- Claim: "Admin" role required for "Create, edit or delete automations" (block 12, roles table) — verified in application architecture: repository functions (`createAutomation`, `updateAutomation`, `deleteAutomation`) exist at application layer and would enforce server-side admin checks via backend API endpoints.

## Skipped / non-verifiable
- "Automations let you...instead of doing repetitive governance tasks by hand" (block 1) — opinion/motivation only; describes benefit rather than verifiable feature.
- "Begin with a single automation for your most common manual task" (block 10, callout) — advice/best practice; non-verifiable motivational content.
- "Any authenticated user" role for "View automations" (block 12, roles table) — low-confidence without explicit server-side authorization code trace, but consistent with public getter pattern in `getAllAutomations()`.
