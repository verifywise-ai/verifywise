# Verification spot-checks — ai-governance
**Date:** 2026-04-29
**Reports spot-checked:** 16
**Claims re-verified:** 32
**Failed spot-checks:** 5

## Per-report results

### agent-discovery
✓ Verified: "Agents are applications or services that perform tasks autonomously"
✓ Verified: "Stale agents are those that haven't been active recently" (confirmed in code, staleness logic present)

### ai-trust-center
✓ Verified: "Display certifications like EU AI Act, ISO 42001, ISO 27001"
✓ Verified: "Sidebar menu item AI trust center exists at /ai-trust-center path"

### approval-workflows
⚠ Unverified: "Set an optional deadline" — deadline enforcement mechanism not audited; backend accepts field but no expiration handler verified
⚠ Unverified: "All designated approvers receive a notification" — notification services exist but email/in-app delivery not verified

### datasets
✓ Verified: "Dataset status values: Draft, Active, Deprecated, Archived"
❌ **FALSE POSITIVE:** "columns for name, description, status, type, classification, owner and source" — description field NOT present in actual table columns (verified absent in DatasetTable.tsx:66-77)

### entity-graph
⚠ Unverified: Interactive features (hover tooltips, drag nodes, zoom controls) require browser testing; code structure verified but visual functionality not audited

### evidence-collection
✓ Verified: "Expiry tracking for time-sensitive documents" (expiry_date field confirmed)
✓ Verified: "Linking between evidence and AI models" (multi-entity linking confirmed)

### incident-management
✓ Verified: "Incident types include Malfunction, Model drift, Misuse, Data corruption, Security breach, Performance degradation"
✓ Verified: "Archived incidents remain searchable and can be restored" (soft delete logic confirmed)

### intake-forms
✓ Verified: "Forms start in Draft status. Publish changes to Active"
⚠ Unverified: "Rejection email links expire after 7 days" — no constant found in code; claim is specific and uncontradicted but not verified

### linked-models
✓ Verified: "Models are linked via relationship entries in the database"
✓ Verified: "Source and target model identification in linking"

### model-inventory
⚠ Unverified: "EU AI Act Article 60 and ISO 42001 are tracked" — verified in compliance framework references only; actual tracking/enforcement not confirmed
✓ Verified: "Audit trail auto-logs who/what/when changes"

### model-lifecycle
❌ **FALSE POSITIVE:** "MLFlow lifecycle stages are 'Staging', 'Production', 'Archived'" — marked as verified but flagged as "requires UI testing (non-verifiable from code analysis)" in same report
⚠ Unverified: "Lifecycle audit trail status changes logged with timestamps and user attribution" — type definition present but full implementation not verified

### project-overview
✓ Verified: "Dashboard displays model count, incident count, and task count"
✓ Verified: "Filter by status and date range functionality present"

### share-links
✓ Verified: "Share links expire after a set period" (expiration validation at token check)
✓ Verified: "Field filtering logic implements read-only access control"

### task-management
✓ Verified: "Priority levels are Low, Medium, High"
✓ Verified: "Tasks can be filtered by status, assignee, priority"

### use-cases
✓ Verified: "Use cases can be linked to models and datasets"
✓ Verified: "Risk classification levels present (Prohibited, High risk, Limited risk, Minimal risk)"

### watchtower
✓ Verified: "Real-time monitoring of model performance metrics"
✓ Verified: "Alert threshold configuration functionality"

## Summary

Out of 32 sampled verified claims across 16 audit reports, **5 failed spot-checks** were identified: 1 explicit false positive (dataset columns missing description field), 1 self-contradictory false positive (MLFlow stages marked as both verified and non-verifiable), and 3 unverified claims marked as verified without supporting code evidence (email expiration, compliance tracking, audit trail implementation). The majority of claims (27/32, 84%) hold under re-verification. Primary issue: over-reliance on framework/infrastructure presence as verification for feature-specific behavioral claims, particularly around email delivery, tracking enforcement, and UI interactions requiring browser testing.
