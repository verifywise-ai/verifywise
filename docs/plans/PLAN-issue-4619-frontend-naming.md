# Plan — #4619 item 11: Frontend naming typos

- **Branch:** `fix/frontend-naming-typos` (off `develop`)
- **Size:** Small
- **Gate mode:** Interactive — stop for review after every task. Do not auto-advance.
- **Status:** In progress. Tasks 1–3 done.

Pure renames. Exported symbols stay as they are (`useAssessmentTopics`, `CustomException`, and every function in the two AI detection clients). No `.tsx` → `.ts` conversion. No merge or delete of either AI detection client. No backend edits. `routes/aiDetectionRepository.route.ts` is a server route and stays.

`docs/agent/plan-template.md`, `docs/agent/ci-local-parity.md`, and `docs/agent/repo-map.md` are not in this repo. CI below is taken from `.github/workflows/frontend-checks.yml` and `e2e-tests.yml`.

## Decision

Confirmed names:

| Current file | New file |
| --- | --- |
| `Clients/src/application/repository/assesment.repository.ts` | `assessment.repository.ts` |
| `Clients/src/application/hooks/useAssessmentTopcis.tsx` | `useAssessmentTopics.tsx` |
| `Clients/src/infrastructure/exceptions/customeException.tsx` | `customException.tsx` |
| `Clients/src/application/repository/aiDetection.repository.ts` | `aiDetectionScan.repository.ts` |
| `Clients/src/application/repository/aiDetectionRepository.repository.ts` | `aiDetectionRegistry.repository.ts` |

`aiDetectionScan` is the scan-and-results client (`/ai-detection`, `/v1/ai-detection`). `aiDetectionRegistry` is the saved GitHub repo list (`/ai-detection/repositories`). Use `git mv` so history follows the file. There is no barrel and no tsconfig/Vite alias for these paths. `vi.mock("…")` strings are not typechecked — each task’s tests are what prove those strings moved.

## Acceptance criteria

| # | Criterion | Task |
| --- | --- | --- |
| 1 | The three typo filenames are corrected and every import uses the new path | 1, 2 |
| 2 | Both AI detection clients are renamed, both remain, and call sites still reach the same functions | 3 |
| 3 | `npm run typecheck` and the frontend tests pass | 4 |
| 4 | The PR description lists the five renames | 4 (text only; this plan does not open a PR) |

## Wave 1 — Assessment names

### Task 1 — Rename the assessment repository and the topics hook ☒

Done. No deviation. Vitest: 14 files, 137 tests passed.

The hook file both imports the misspelled repository and is itself renamed. Do the repository first, then the hook.

**Rename**

- `Clients/src/application/repository/assesment.repository.ts` → `Clients/src/application/repository/assessment.repository.ts`
- `Clients/src/application/repository/tests/assesment.repository.test.ts` → `Clients/src/application/repository/tests/assessment.repository.test.ts`
- `Clients/src/application/hooks/useAssessmentTopcis.tsx` → `Clients/src/application/hooks/useAssessmentTopics.tsx`

`Clients/src/application/hooks/__tests__/useAssessmentTopics.test.ts` already has the right filename. Update the import inside it. Do not rename it.

**Update `assesment.repository` imports**

- `Clients/src/application/hooks/useAssessmentAnswers.tsx`
- `Clients/src/application/hooks/useAssessmentSubtopics.tsx`
- `Clients/src/application/hooks/useAssessmentTopcis.tsx` (then this file is renamed)
- `Clients/src/application/hooks/useAssessmentProgress.tsx`
- `Clients/src/application/hooks/useAssessmentData.tsx`
- `Clients/src/presentation/components/Drawer/EUAIActQuestionDrawerDialog/index.tsx`
- `Clients/src/application/repository/tests/assesment.repository.test.ts` (then this file is renamed)
- `Clients/src/application/hooks/__tests__/useAssessmentTopics.test.ts`
- `Clients/src/application/hooks/__tests__/useAssessmentProgress.test.ts`
- `Clients/src/application/hooks/__tests__/useAssessmentSubtopics.test.ts`
- `Clients/src/application/hooks/__tests__/useAssessmentAnswers.test.ts`
- `Clients/src/application/hooks/__tests__/useAssessmentData.test.ts`
- `Clients/src/test/drawerTestFactory.tsx`

**Update `useAssessmentTopcis` imports**

- `Clients/src/presentation/pages/Assessment/1.0AssessmentTracker/index.tsx`
- `Clients/src/application/hooks/__tests__/useAssessmentTopics.test.ts`
- `Clients/src/presentation/pages/Assessment/__tests__/Assessment.test.tsx`

**Verify** (from `Clients/`)

```bash
npx vitest run \
  src/application/repository/tests/assessment.repository.test.ts \
  src/application/hooks/__tests__/useAssessmentTopics.test.ts \
  src/application/hooks/__tests__/useAssessmentProgress.test.ts \
  src/application/hooks/__tests__/useAssessmentSubtopics.test.ts \
  src/application/hooks/__tests__/useAssessmentAnswers.test.ts \
  src/application/hooks/__tests__/useAssessmentData.test.ts \
  src/presentation/pages/Assessment/__tests__/Assessment.test.tsx \
  src/presentation/components/Drawer/EUAIActQuestionDrawerDialog/__tests__/EUAIActQuestionDrawerDialog.test.tsx \
  src/presentation/components/Drawer/NISTAIRMFDashboardDrawerDialog/__tests__/NISTAIRMFDrawerDialog.test.tsx \
  src/presentation/components/Drawer/GenericFrameworkDrawer/__tests__/GenericFrameworkDrawer.test.tsx \
  src/presentation/components/Drawer/ISO27001ClauseDrawerDialog/__tests__/ISO27001ClauseDrawerDialog.test.tsx \
  src/presentation/components/Drawer/ISO27001AnnexDrawerDialog/__tests__/ISO27001AnnexDrawerDialog.test.tsx \
  src/presentation/components/Drawer/ClauseDrawerDialog/__tests__/ClauseDrawerDialog.test.tsx \
  src/presentation/components/Drawer/AnnexDrawerDialog/__tests__/AnnexDrawerDialog.test.tsx
```

The last seven tests use `drawerTestFactory.tsx`, which mocks the assessment repository.

## Wave 2 — Exception filename

### Task 2 — Rename `customeException.tsx` ☒

Done. No deviation. Vitest: 33 files, 647 tests passed.

**Rename**

- `Clients/src/infrastructure/exceptions/customeException.tsx` → `Clients/src/infrastructure/exceptions/customException.tsx`

`Clients/src/infrastructure/exceptions/__tests__/customException.test.ts` already has the right filename. Update `import … from "../customeException"` only.

The class stays `CustomException`. Replace the path segment `customeException` with `customException` in these files:

**Production**

- `Clients/src/infrastructure/api/networkServices.ts`
- `Clients/src/application/utils/apiErrorReason.ts`
- `Clients/src/presentation/components/ProtectedRoute/index.tsx`
- `Clients/src/presentation/components/Forms/ProjectForm/index.tsx`
- `Clients/src/presentation/components/Modals/RequestorApprovalModal/index.tsx`
- `Clients/src/presentation/pages/Automations/index.tsx`
- `Clients/src/presentation/pages/Extensions/model-lifecycle/LifecycleItemField.tsx` (`import type`)
- `Clients/src/presentation/pages/IntakeFormBuilder/routing/serverErrorMessage.ts`
- `Clients/src/presentation/pages/ProjectView/RiskAnalysisModal/index.tsx`

**Tests**

- `Clients/src/infrastructure/exceptions/__tests__/customException.test.ts`
- `Clients/src/application/repository/__tests__/vendorResearch.repository.test.ts`
- `Clients/src/application/utils/__tests__/apiErrorReason.test.ts`
- `Clients/src/presentation/components/AddNewRiskForm/hooks/__tests__/useRiskForm.test.ts`
- `Clients/src/presentation/components/Forms/ProjectForm/__tests__/ProjectForm.test.tsx`
- `Clients/src/presentation/components/Modals/AgentDiscovery/__tests__/AgentDiscovery.test.tsx`
- `Clients/src/presentation/components/Modals/InviteUser/__tests__/InviteUser.test.tsx`
- `Clients/src/presentation/pages/AIApps/AIAppDetail/__tests__/AIAppLinkedUseCases.test.tsx`
- `Clients/src/presentation/pages/AIGateway/Endpoints/index.test.tsx`
- `Clients/src/presentation/pages/AIGateway/Guardrails/index.test.tsx`
- `Clients/src/presentation/pages/AIGateway/MCPAgentKeys/index.test.tsx`
- `Clients/src/presentation/pages/AIGateway/MCPGuardrails/index.test.tsx`
- `Clients/src/presentation/pages/AIGateway/MCPServers/index.test.tsx`
- `Clients/src/presentation/pages/AIGateway/MCPToolCatalog/index.test.tsx`
- `Clients/src/presentation/pages/AIGateway/Prompts/index.test.tsx`
- `Clients/src/presentation/pages/AIGateway/Settings/index.test.tsx`
- `Clients/src/presentation/pages/AIGateway/SpendDashboard/OnboardingOverlay.test.tsx`
- `Clients/src/presentation/pages/AIGateway/VirtualKeys/index.test.tsx`
- `Clients/src/presentation/pages/Extensions/__tests__/ExtensionsPage.test.tsx`
- `Clients/src/presentation/pages/Extensions/model-lifecycle/__tests__/LifecycleItemField.test.tsx`
- `Clients/src/presentation/pages/Extensions/risk-import/RiskImportModal.test.tsx`
- `Clients/src/presentation/pages/IncidentManagement/__tests__/IncidentManagement.editFailure.test.tsx`
- `Clients/src/presentation/pages/IntakeFormBuilder/__tests__/IntakeFormBuilder.test.tsx`
- `Clients/src/presentation/pages/IntakeFormBuilder/__tests__/SubmissionPreviewModal.riskStep.test.tsx`
- `Clients/src/presentation/pages/PolicyDashboard/__tests__/PolicyManager.test.tsx`
- `Clients/src/presentation/pages/ProjectView/RiskAnalysisModal/index.test.tsx`
- `Clients/src/presentation/pages/ProjectView/V1.0ProjectView/Overview/__tests__/LinkedAiAppsCard.test.tsx`
- `Clients/src/presentation/pages/ProjectView/V1.0ProjectView/Overview/__tests__/UseCaseLifecyclePanel.test.tsx`
- `Clients/src/presentation/pages/PublicIntakeForm/__tests__/PublicIntakeForm.riskStep.test.tsx`
- `Clients/src/presentation/pages/SettingsPage/DataRetention/__tests__/DataRetention.test.tsx`
- `Clients/src/presentation/pages/SettingsPage/DataRetention/__tests__/EditRetentionModal.agentControl.test.tsx`
- `Clients/src/presentation/pages/SettingsPage/Roles/__tests__/RolesTab.test.tsx`
- `Clients/src/presentation/pages/SettingsPage/SearchKey/__tests__/SearchKey.test.tsx`

**Verify** (from `Clients/`)

```bash
npx vitest run \
  src/infrastructure/exceptions/__tests__/customException.test.ts \
  src/application/repository/__tests__/vendorResearch.repository.test.ts \
  src/application/utils/__tests__/apiErrorReason.test.ts \
  src/presentation/components/AddNewRiskForm/hooks/__tests__/useRiskForm.test.ts \
  src/presentation/components/Forms/ProjectForm/__tests__/ProjectForm.test.tsx \
  src/presentation/components/Modals/AgentDiscovery/__tests__/AgentDiscovery.test.tsx \
  src/presentation/components/Modals/InviteUser/__tests__/InviteUser.test.tsx \
  src/presentation/pages/AIApps/AIAppDetail/__tests__/AIAppLinkedUseCases.test.tsx \
  src/presentation/pages/AIGateway/Endpoints/index.test.tsx \
  src/presentation/pages/AIGateway/Guardrails/index.test.tsx \
  src/presentation/pages/AIGateway/MCPAgentKeys/index.test.tsx \
  src/presentation/pages/AIGateway/MCPGuardrails/index.test.tsx \
  src/presentation/pages/AIGateway/MCPServers/index.test.tsx \
  src/presentation/pages/AIGateway/MCPToolCatalog/index.test.tsx \
  src/presentation/pages/AIGateway/Prompts/index.test.tsx \
  src/presentation/pages/AIGateway/Settings/index.test.tsx \
  src/presentation/pages/AIGateway/SpendDashboard/OnboardingOverlay.test.tsx \
  src/presentation/pages/AIGateway/VirtualKeys/index.test.tsx \
  src/presentation/pages/Extensions/__tests__/ExtensionsPage.test.tsx \
  src/presentation/pages/Extensions/model-lifecycle/__tests__/LifecycleItemField.test.tsx \
  src/presentation/pages/Extensions/risk-import/RiskImportModal.test.tsx \
  src/presentation/pages/IncidentManagement/__tests__/IncidentManagement.editFailure.test.tsx \
  src/presentation/pages/IntakeFormBuilder/__tests__/IntakeFormBuilder.test.tsx \
  src/presentation/pages/IntakeFormBuilder/__tests__/SubmissionPreviewModal.riskStep.test.tsx \
  src/presentation/pages/PolicyDashboard/__tests__/PolicyManager.test.tsx \
  src/presentation/pages/ProjectView/RiskAnalysisModal/index.test.tsx \
  src/presentation/pages/ProjectView/V1.0ProjectView/Overview/__tests__/LinkedAiAppsCard.test.tsx \
  src/presentation/pages/ProjectView/V1.0ProjectView/Overview/__tests__/UseCaseLifecyclePanel.test.tsx \
  src/presentation/pages/PublicIntakeForm/__tests__/PublicIntakeForm.riskStep.test.tsx \
  src/presentation/pages/SettingsPage/DataRetention/__tests__/DataRetention.test.tsx \
  src/presentation/pages/SettingsPage/DataRetention/__tests__/EditRetentionModal.agentControl.test.tsx \
  src/presentation/pages/SettingsPage/Roles/__tests__/RolesTab.test.tsx \
  src/presentation/pages/SettingsPage/SearchKey/__tests__/SearchKey.test.tsx
```

## Wave 3 — AI detection clients

### Task 3 — Rename the two AI detection repository files ☒

Done. No deviation. Vitest: 31 files, 387 tests passed. `routes/aiDetectionRepository.route.ts` was not changed. Task 4's repo-wide search for the old filenames will also match this plan file, which still records the old names.

Update both imports in the same edit where a file references both clients.

**Rename**

- `Clients/src/application/repository/aiDetection.repository.ts` → `Clients/src/application/repository/aiDetectionScan.repository.ts`
- `Clients/src/application/repository/tests/aiDetection.repository.test.ts` → `Clients/src/application/repository/tests/aiDetectionScan.repository.test.ts`
- `Clients/src/application/repository/aiDetectionRepository.repository.ts` → `Clients/src/application/repository/aiDetectionRegistry.repository.ts`
- `Clients/src/application/repository/tests/aiDetectionRepository.repository.test.ts` → `Clients/src/application/repository/tests/aiDetectionRegistry.repository.test.ts`

In the two source files, update the `@module` tag only:

- `@module repository/aiDetection` → `@module repository/aiDetectionScan`
- `@module repository/aiDetectionRepository` → `@module repository/aiDetectionRegistry`

**`aiDetection.repository` → `aiDetectionScan.repository`**

- `Clients/src/application/contexts/AIDetectionSidebar.context.tsx` (also imports the registry client)
- `Clients/src/application/contexts/__tests__/AIDetectionSidebar.context.test.tsx` (mocks both)
- `Clients/src/presentation/components/AIDepGraph/index.tsx`
- `Clients/src/presentation/components/AIDepGraph/__tests__/AIDepGraph.test.tsx`
- `Clients/src/presentation/pages/AIDetection/HistoryPage.tsx`
- `Clients/src/presentation/pages/AIDetection/SettingsPage.tsx`
- `Clients/src/presentation/pages/AIDetection/ScanPage.tsx`
- `Clients/src/presentation/pages/AIDetection/ScanDetails/SuggestedRisksSection.tsx`
- `Clients/src/presentation/pages/AIDetection/ScanDetails/useScanDetails.ts`
- `Clients/src/presentation/pages/AIDetection/ScanDetails/useFindingGovernance.ts`
- `Clients/src/presentation/pages/AIDetection/ScanDetails/useScanFindingsEffects.ts`
- `Clients/src/presentation/pages/AIDetection/components/SuppressionRulesTab.tsx`
- `Clients/src/presentation/pages/AIDetection/components/SuppressFindingDialog.tsx`
- `Clients/src/presentation/pages/AIDetection/__tests__/AIDetection.test.tsx`
- `Clients/src/presentation/pages/AIDetection/__tests__/HistoryPage.test.tsx`
- `Clients/src/presentation/pages/AIDetection/__tests__/SettingsPage.test.tsx`
- `Clients/src/presentation/pages/AIDetection/__tests__/ScanPage.test.tsx`
- `Clients/src/presentation/pages/AIDetection/__tests__/ScanDetailsPage.test.tsx`
- `Clients/src/presentation/pages/AIDetection/ScanDetails/__tests__/SuggestedRisksSection.test.tsx`
- `Clients/src/presentation/pages/AIDetection/ScanDetails/__tests__/FindingRow.test.tsx`
- `Clients/src/presentation/pages/AIDetection/ScanDetails/__tests__/FindingsTabPanel.test.tsx`
- `Clients/src/presentation/pages/AIDetection/ScanDetails/__tests__/VulnerabilitiesTab.test.tsx`
- `Clients/src/presentation/pages/AIDetection/ScanDetails/__tests__/VulnerabilityFindingRow.test.tsx`
- `Clients/src/presentation/pages/AIDetection/components/__tests__/SuppressFindingDialog.test.tsx`
- `Clients/src/presentation/pages/AIDetection/components/__tests__/SuppressionRulesTab.test.tsx`
- `Clients/src/application/repository/tests/aiDetection.repository.test.ts` (then this file is renamed)

**`aiDetectionRepository.repository` → `aiDetectionRegistry.repository`**

- `Clients/src/application/contexts/AIDetectionSidebar.context.tsx`
- `Clients/src/application/contexts/__tests__/AIDetectionSidebar.context.test.tsx`
- `Clients/src/application/hooks/useWebhookConfig.ts`
- `Clients/src/presentation/pages/AIDetection/RepositoriesPage.tsx`
- `Clients/src/presentation/pages/AIDetection/AddRepositoryModal.tsx`
- `Clients/src/presentation/pages/AIDetection/__tests__/RepositoriesPage.test.tsx`
- `Clients/src/presentation/pages/AIDetection/__tests__/AddRepositoryModal.test.tsx`
- `Clients/src/application/repository/tests/aiDetectionRepository.repository.test.ts` (then this file is renamed)

**Doc**

In `docs/technical/domains/ai-detection.md`, change the frontend table row `repository/aiDetection.repository.ts` to `repository/aiDetectionScan.repository.ts`. Leave `routes/aiDetectionRepository.route.ts` unchanged.

**Verify** (from `Clients/`)

```bash
npx vitest run \
  src/application/repository/tests/aiDetectionScan.repository.test.ts \
  src/application/repository/tests/aiDetectionRegistry.repository.test.ts \
  src/application/contexts/__tests__/AIDetectionSidebar.context.test.tsx \
  src/presentation/components/AIDepGraph/__tests__/AIDepGraph.test.tsx \
  src/presentation/pages/AIDetection
```

## Wave 4 — Review

### Task 4 — Prove the old names are gone, then match CI

From the repo root, these searches must return no hits:

- `assesment.repository`
- `useAssessmentTopcis`
- `customeException`
- `aiDetectionRepository.repository`
- `aiDetection.repository` (the new names are `aiDetectionScan.repository` and `aiDetectionRegistry.repository`, so this string must be gone)

Then, from `Clients/`:

```bash
npm run format-check
npm run typecheck
npm run lint -- --quiet
npm run i18n:audit:strict
npx vitest run
npm run build
```

`npm run test` is Vitest watch and must not be used. `npm run build` does not typecheck; CI does not run it, and the PR checklist still requires it.

Change notices do not apply. These are not pages.

When a PR is opened later, its description lists the five renames. Do not open the PR as part of this plan.

## CI checks that apply

| Check | Workflow | Local command |
| --- | --- | --- |
| Format, types, lint, i18n | `frontend-checks.yml` → Lint, Types & i18n | `npm run format-check`, `npm run typecheck`, `npm run lint -- --quiet`, `npm run i18n:audit:strict` in `Clients/` |
| Unit and component tests | `frontend-checks.yml` → sharded Vitest | `npx vitest run` in `Clients/` |
| Playwright e2e | `e2e-tests.yml` (paths include `Clients/**`; draft PRs skip it) | Not part of the task loop. Renames do not change UI behavior. |

Backend, EvalServer, AI Gateway, and GRS workflows do not apply.

## Risks

- A missed `vi.mock` path still typechecks and fails only when that test file loads.
- `AIDetectionSidebar.context.tsx` and its test reference both clients. Updating one path and leaving the other breaks the sidebar count or the scan poll.
- `useAssessmentTopcis.tsx` is on both rename lists. Rename it once, after its repository import is updated.
