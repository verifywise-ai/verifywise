# VerifyWise Frontend Feature Inventory

**Scope:** React/TypeScript single-page application under `Clients/src`.
**Generated:** 2026-08-24.

This document catalogs the VerifyWise frontend: the app shell, route table, navigation structure, per-page features, feature flags, public routes, and known caveats.

## Table of contents

1. [App shell & routing architecture](#1-app-shell--routing-architecture)
2. [Complete route table](#2-complete-route-table)
3. [Navigation structure](#3-navigation-structure)
4. [Per-page feature details by category](#4-per-page-feature-details-by-category)
5. [Feature flags / gated routes](#5-feature-flags--gated-routes)
6. [Public / unauthenticated routes](#6-public--unauthenticated-routes)
7. [Notable caveats](#7-notable-caveats)
8. [Appendix: File index quick reference](#appendix-file-index-quick-reference)

---

## 1. App shell & routing architecture

### 1.1 Entry point

| File | Responsibility |
|------|---------------|
| `Clients/src/main.tsx` | Bootstraps the React app, wraps `<App />` in the router (`BrowserRouter`) and QueryClient providers. |
| `Clients/src/App.tsx` | Top-level component. Sets up global providers, theme, alert toasts, onboarding modal, command palette, smart prompt, user-guide sidebar, and renders `<Routes>{createRoutes(...)}</Routes>`. |

Key `App.tsx` details:
- **Global providers:** Redux `Provider` + `PersistGate`, `VerifyWiseContext`, `ExtensionsProvider`, `UserGuideSidebarProvider`, `SmartPromptProvider`, `AdvisorConversationProvider`, and five module-specific sidebar contexts (`Evals`, `AIDetection`, `ShadowAI`, `AIGateway`, `AITrustIndex`).
- **Theme:** `ConditionalThemeWrapper` applies the MUI `light` theme to all routes except `/aiTrustCentre/*` public pages.
- **Sidebars hidden on:** auth routes (`/login`, `/admin-reg`, `/user-reg`, `/register`, `/forgot-password`, `/reset-password`, `/set-new-password`, `/reset-password-continue`) and public routes (`/use-case-form-intake`, `/intake/*`, `/shared/*`, `/aiTrustCentre/*`).
- **Onboarding:** `SetupModal` is shown on `/` or `/start-here` when the user is authenticated and onboarding is incomplete.
- **Command palette:** Always-mounted; toggled via `useCommandPalette` (`Ctrl/Cmd + K`).
- **User guide sidebar:** Rendered inside `AdvisorConversationProvider` on non-auth, non-public pages.

### 1.2 Route definition file

| File | Responsibility |
|------|---------------|
| `Clients/src/application/config/routes.tsx` | Exports `createRoutes(triggerSidebar, triggerSidebarReload)` which returns the full `<Route>` tree consumed by `react-router`. |

Architecture notes from `routes.tsx`:
- **Lazy loading:** Almost every page is loaded via `lazyRoute(...)` (code-split) with a shared `<LazyFallback />` suspense boundary.
- **Eager imports:** Only the `Dashboard` layout shell, `SuperAdminLayout`, `ProtectedRoute`, and the legacy `VWHome` use-case page are eagerly imported so the layout skeleton mounts immediately.
- **Nested routing:** `Dashboard` is the parent layout for all authenticated tenant routes; `SuperAdminLayout` is the parent for `/super-admin/*`.
- **Redirects/aliases:** `/setting` → `/settings`; `/ai-detection` → `/ai-detection/scan`; `/shadow-ai` → `/shadow-ai/insights`; `/ai-gateway` → `/ai-gateway/dashboard`; `/ai-gateway/guardrails` → `/ai-gateway/guardrails/pii`; `/ai-gateway/models` → `/ai-gateway/models/catalog`; `/ai-gateway/settings` → `/ai-gateway/settings/api-keys`; `/ai-gateway/mcp` → `/ai-gateway/mcp/agent-keys`; `/register` & `/admin-reg` → `/login`.
- **Development-only routes:** `/reactflow-demo`, `/wizard-showcase`, `/style-guide/:section?` are gated by `import.meta.env.DEV`.

### 1.3 Route guards

| File | Responsibility |
|------|---------------|
| `Clients/src/presentation/components/ProtectedRoute/index.tsx` | Validates the auth token, checks that the user exists (`/users/check/exists`), validates token freshness with `/users/:id`, enforces `requireSuperAdmin`, and redirects bootstrap SuperAdmins (no `organizationId` in token) to `/super-admin`. |

Guard behavior:
- Allows public auth routes (`/login`, `/forgot-password`, etc.) without a token.
- Redirects unauthenticated users on protected routes to `/login` with `state.from`.
- Redirects non-SuperAdmins on SuperAdmin routes to `/`.
- Redirects bootstrap SuperAdmins away from org-scoped screens to `/super-admin`.

### 1.4 Layout wrappers

| Layout | File | Used by |
|--------|------|---------|
| `Dashboard` | `Clients/src/presentation/containers/Dashboard/index.tsx` | All authenticated tenant routes under `/`. Provides `AppSwitcher`, `ContextSidebar`, demo-data modals, toast area, and scrollable `<Outlet />`. |
| `SuperAdminLayout` | `Clients/src/presentation/containers/SuperAdminLayout/index.tsx` | `/super-admin/*`. Provides `AppSwitcher` and `SuperAdminSidebar`. |
| `PageHeaderExtended` | `Clients/src/presentation/components/Layout/PageHeaderExtended.tsx` | Most content pages. Renders title, description, breadcrumbs, help-article link, optional summary cards/alerts, and action buttons. |

---

## 2. Complete route table

The table below lists every defined frontend route, the page component file that renders it, the navigation category, how it is reached from the sidebar/menus, any known role requirement, and feature flags that gate it.

| Route path | Page component file | Category | Sidebar / menu access | Required role | Feature flags |
|------------|---------------------|----------|------------------------|---------------|---------------|
| `/` | `pages/DashboardOverview/IntegratedDashboard.tsx` | Core | Main sidebar → Dashboard | Any authenticated | — |
| `/start-here` | `pages/StartHere/index.tsx` | Core | Main sidebar → Start here | Any authenticated | — |
| `/overview` | `pages/Home/1.0Home/index.tsx` | Project / Inventory | Main sidebar → Use cases | Any authenticated | — |
| `/project-view` | `pages/ProjectView/V1.0ProjectView/index.tsx` | Project | Use-cases table row click / navigation | Any authenticated | — |
| `/settings` | `pages/SettingsPage/index.tsx` | Admin | Main sidebar footer → Management → Settings | Any authenticated | — |
| `/settings/:tab` | `pages/SettingsPage/index.tsx` | Admin | Direct URL / tab navigation | Varies by tab | `ssoFeatureEnabled` gates SSO tab; `SHOW_AI_APPROVAL_RULES` gates AI Approval Rules |
| `/organization` | `pages/SettingsPage/Organization/index.tsx` | Admin | Redirect/legacy | Admin | — |
| `/file-manager` | `pages/FileManager/index.tsx` | Assurance / Core | Main sidebar → Evidence | Any authenticated | — |
| `/reporting` | `pages/Reporting/index.tsx` | Assurance | Main sidebar → Reporting | Any authenticated | — |
| `/vendors` | `pages/Vendors/index.tsx` | Governance | Main sidebar → Vendors | Any authenticated | — |
| `/vendors/risks` | `pages/Vendors/index.tsx` | Governance | Vendors page → Risks tab | Any authenticated | — |
| `/tasks` | `pages/Tasks/index.tsx` | Core | Main sidebar → Tasks | Any authenticated | — |
| `/extensions` | `pages/Extensions/index.tsx` | Admin | Main sidebar → Management → Settings → Features (enable) or direct URL | Admin (manage features) | Extension-enabled flags |
| `/extensions/:key/settings` | `pages/Extensions/Settings/index.tsx` | Admin | Extensions page → extension settings | Admin | Per-extension enabled |
| `/framework/:tab?` | `pages/Framework/index.tsx` | Governance | Main sidebar → Frameworks | Any authenticated | — |
| `/projects/:projectId/framework/:frameworkId` | `pages/Framework/Generic/index.tsx` | Governance | Framework-linked model requirement drill-down | Any authenticated | — |
| `/training` | `pages/TrainingRegistar/index.tsx` | Assurance | Main sidebar → Training registry | Any authenticated | — |
| `/training/evidence-hub` | `pages/TrainingRegistar/index.tsx` | Assurance | Training page → Evidence hub tab | Any authenticated | — |
| `/policies` | `pages/PolicyDashboard/PoliciesDashboard.tsx` | Governance | Main sidebar → Policy manager | Any authenticated | — |
| `/policies/templates` | `pages/PolicyDashboard/PoliciesDashboard.tsx` | Governance | Policy manager → Templates tab | Any authenticated | — |
| `/policies/new` | `pages/PolicyDashboard/PolicyEditorPage.tsx` | Governance | Policy manager → New policy | Admin/Editor | — |
| `/policies/:id/edit` | `pages/PolicyDashboard/PolicyEditorPage.tsx` | Governance | Policy manager → Edit policy | Admin/Editor | — |
| `/event-tracker` | `pages/WatchTower/index.tsx` | Governance | Main sidebar footer → Management → Event Tracker | Any authenticated | — |
| `/event-tracker/logs` | `pages/WatchTower/index.tsx` | Governance | Event Tracker → Logs tab | Any authenticated | — |
| `/ai-incident-managements` | `pages/IncidentManagement/index.tsx` | Governance / AI Product | Main sidebar → Incident management | Any authenticated | — |
| `/risk-management` | `pages/RiskManagement/index.tsx` | Assurance | Main sidebar → Risk management | Any authenticated | — |
| `/automations` | `pages/Automations/index.tsx` | AI Product | Direct URL / MegaDropdown Add new | Any authenticated | — |
| `/approval-workflows` | `pages/ApprovalWorkflows/index.tsx` | AI Product | Direct URL / MegaDropdown Add new | Any authenticated | — |
| `/model-inventory` | `pages/ModelInventory/index.tsx` | Inventory / AI Product | Main sidebar → Model inventory | Any authenticated | — |
| `/model-inventory/model-risks` | `pages/ModelInventory/index.tsx` | Inventory / AI Product | Model inventory → Model risks tab | Any authenticated | — |
| `/model-inventory/evidence-hub` | `pages/ModelInventory/index.tsx` | Inventory / AI Product | Model inventory → Evidence hub tab | Any authenticated | — |
| `/model-inventory/model-risk-management` | `pages/ModelInventory/index.tsx` | Inventory / AI Product | Model inventory → Model risk management tab | Any authenticated | — |
| `/model-inventory/model-risk-management/:mrmTab` | `pages/ModelInventory/index.tsx` | Inventory / AI Product | MRM sub-tabs | Any authenticated | — |
| `/model-inventory/model-risk-management/settings/:settingsSection` | `pages/ModelInventory/index.tsx` | Inventory / AI Product | MRM settings sections | Any authenticated | — |
| `/model-inventory/models/:id` | `pages/ModelInventory/ModelLifecycleDetail/index.tsx` | Inventory / AI Product | Model inventory row → lifecycle detail | Any authenticated | — |
| `/model-inventory/:pluginTab` | `pages/ModelInventory/index.tsx` | Inventory / AI Product | Extension-contributed tabs (MLflow, Azure AI Foundry) | Any authenticated | Extension enabled |
| `/ai-apps` | `pages/AIApps/index.tsx` | Inventory / AI Product | Main sidebar → AI apps | Any authenticated | — |
| `/ai-apps/:id` | `pages/AIApps/AIAppDetail/index.tsx` | Inventory / AI Product | AI apps table → app detail | Any authenticated | — |
| `/datasets` | `pages/Datasets/index.tsx` | Inventory / AI Product | Main sidebar → Datasets | Any authenticated | — |
| `/agent-discovery` | `pages/AgentDiscovery/index.tsx` | Inventory / AI Product | Main sidebar → Agent discovery | Any authenticated | — |
| `/ai-audit` | `pages/AIAuditDashboard/index.tsx` | AI Product | Direct URL (also hidden dashboard tab) | Any authenticated | Hidden by `SHOW_AI_AGENT_DASHBOARD_TABS=false` |
| `/ai-observability` | `pages/AIObservability/index.tsx` | AI Product | Direct URL | Any authenticated | — |
| `/ai-trust-center` | `pages/AITrustCenter/index.tsx` | Assurance | Main sidebar → AI trust center | Any authenticated | — |
| `/ai-trust-center/:tab` | `pages/AITrustCenter/index.tsx` | Assurance | AI Trust Center tabs | Any authenticated | — |
| `/evals` | `pages/EvalsDashboard/EvalsDashboard.tsx` | LLM Evals | App switcher → LLM Evals | Any authenticated | — |
| `/evals/:projectId` | `pages/EvalsDashboard/EvalsDashboard.tsx` | LLM Evals | Evals project selector / recent projects | Any authenticated | — |
| `/evals/:projectId/datasets/editor` | `pages/EvalsDashboard/DatasetEditorPage.tsx` | LLM Evals | Evals → Datasets → editor | Any authenticated | — |
| `/evals/settings` | `pages/EvalsDashboard/OrgSettings.tsx` | LLM Evals | Evals sidebar → Settings | Any authenticated | — |
| `/ai-detection/scan` | `pages/AIDetection/ScanPage.tsx` | AI Detection | App switcher → AI Detection | Any authenticated | — |
| `/ai-detection/repositories` | `pages/AIDetection/RepositoriesPage.tsx` | AI Detection | AI Detection sidebar → Repositories | Any authenticated | — |
| `/ai-detection/history` | `pages/AIDetection/HistoryPage.tsx` | AI Detection | AI Detection sidebar → Scan results | Any authenticated | — |
| `/ai-detection/settings` | `pages/AIDetection/SettingsPage.tsx` | AI Detection | AI Detection sidebar → Settings | Any authenticated | — |
| `/ai-detection/scans/:scanId` | `pages/AIDetection/ScanDetailsPage.tsx` | AI Detection | History → scan row | Any authenticated | — |
| `/ai-detection/scans/:scanId/:tab` | `pages/AIDetection/ScanDetailsPage.tsx` | AI Detection | Scan details tabs | Any authenticated | — |
| `/shadow-ai/insights` | `pages/ShadowAI/InsightsPage.tsx` | Shadow AI | App switcher → Shadow AI | Any authenticated | — |
| `/shadow-ai/user-activity` | `pages/ShadowAI/UserActivityPage.tsx` | Shadow AI | Shadow AI sidebar → User activity | Any authenticated | — |
| `/shadow-ai/user-activity/users` | `pages/ShadowAI/UserActivityPage.tsx` | Shadow AI | User activity → Users sub-tab | Any authenticated | — |
| `/shadow-ai/user-activity/departments` | `pages/ShadowAI/UserActivityPage.tsx` | Shadow AI | User activity → Departments sub-tab | Any authenticated | — |
| `/shadow-ai/tools` | `pages/ShadowAI/AIToolsPage.tsx` | Shadow AI | Shadow AI sidebar → AI tools | Any authenticated | — |
| `/shadow-ai/tools/:toolId` | `pages/ShadowAI/AIToolsPage.tsx` | Shadow AI | AI tools → tool detail | Any authenticated | — |
| `/shadow-ai/rules` | `pages/ShadowAI/RulesPage.tsx` | Shadow AI | Shadow AI sidebar → Rules & alerts | Any authenticated | — |
| `/shadow-ai/rules/alerts` | `pages/ShadowAI/RulesPage.tsx` | Shadow AI | Rules & alerts → Alerts sub-tab | Any authenticated | — |
| `/shadow-ai/settings` | `pages/ShadowAI/SettingsPage.tsx` | Shadow AI | Shadow AI sidebar → Settings | Any authenticated | — |
| `/ai-gateway/dashboard` | `pages/AIGateway/SpendDashboard/index.tsx` | AI Gateway | App switcher → AI Gateway | Any authenticated | — |
| `/ai-gateway/endpoints` | `pages/AIGateway/Endpoints/index.tsx` | AI Gateway | AI Gateway sidebar → Endpoints | Any authenticated | — |
| `/ai-gateway/playground` | `pages/AIGateway/Playground/index.tsx` | AI Gateway | AI Gateway sidebar → Playground | Any authenticated | — |
| `/ai-gateway/guardrails/:tab` | `pages/AIGateway/Guardrails/index.tsx` | AI Gateway | AI Gateway sidebar → Guardrails | Any authenticated | — |
| `/ai-gateway/models/:tab` | `pages/AIGateway/Models/index.tsx` | AI Gateway | AI Gateway sidebar → Models | Any authenticated | — |
| `/ai-gateway/logs` | `pages/AIGateway/Logs/index.tsx` | AI Gateway | AI Gateway sidebar → Logs | Any authenticated | — |
| `/ai-gateway/prompts` | `pages/AIGateway/Prompts/index.tsx` | AI Gateway | AI Gateway sidebar → Prompts | Any authenticated | `SHOW_AI_GATEWAY_PROMPTS` |
| `/ai-gateway/prompts/:id` | `pages/AIGateway/Prompts/PromptEditor.tsx` | AI Gateway | Prompt library → edit prompt | Any authenticated | `SHOW_AI_GATEWAY_PROMPTS` |
| `/ai-gateway/virtual-keys` | `pages/AIGateway/VirtualKeys/index.tsx` | AI Gateway | AI Gateway sidebar → Virtual keys | Any authenticated | — |
| `/ai-gateway/settings/:tab` | `pages/AIGateway/Settings/index.tsx` | AI Gateway | AI Gateway sidebar → Settings | Any authenticated | — |
| `/ai-gateway/mcp/agent-keys` | `pages/AIGateway/MCPAgentKeys/index.tsx` | AI Gateway (MCP) | AI Gateway sidebar → Agent Control → Agent keys | Any authenticated | — |
| `/ai-gateway/mcp/servers` | `pages/AIGateway/MCPServers/index.tsx` | AI Gateway (MCP) | AI Gateway sidebar → Agent Control → MCP servers | Any authenticated | — |
| `/ai-gateway/mcp/tools` | `pages/AIGateway/MCPToolCatalog/index.tsx` | AI Gateway (MCP) | AI Gateway sidebar → Agent Control → MCP tools | Any authenticated | — |
| `/ai-gateway/mcp/runs` | `pages/AIGateway/MCPRuns/index.tsx` | AI Gateway (MCP) | AI Gateway sidebar → Agent Control → Runs | Any authenticated | — |
| `/ai-gateway/mcp/audit` | `pages/AIGateway/MCPAuditLog/index.tsx` | AI Gateway (MCP) | AI Gateway sidebar → Agent Control → Activity | Any authenticated | — |
| `/ai-gateway/mcp/approvals` | `pages/AIGateway/MCPApprovals/index.tsx` | AI Gateway (MCP) | AI Gateway sidebar → Agent Control → Approvals | Any authenticated | — |
| `/ai-gateway/mcp/guardrails` | `pages/AIGateway/MCPGuardrails/index.tsx` | AI Gateway (MCP) | AI Gateway sidebar → Agent Control → Guardrails | Any authenticated | — |
| `/ai-trust-index` | `pages/AITrustIndex/index.tsx` | AI Trust Index | App switcher → AI Trust Index | Any authenticated | — |
| `/ai-trust-index/browse` | `pages/AITrustIndex/Browse/index.tsx` | AI Trust Index | AI Trust Index sidebar → Browse | Any authenticated | — |
| `/ai-trust-index/tracked` | `pages/AITrustIndex/Tracked/index.tsx` | AI Trust Index | AI Trust Index sidebar → Tracked | Any authenticated | — |
| `/ai-trust-index/settings` | `pages/AITrustIndex/Settings/index.tsx` | AI Trust Index | AI Trust Index sidebar → Settings | Admin | — |
| `/ai-trust-index/:slug` | `pages/AITrustIndex/AppDetail/index.tsx` | AI Trust Index | Browse → app card | Any authenticated | — |
| `/monitoring/cycle/:cycleId` | `pages/PostMarketMonitoring/MonitoringForm.tsx` | AI Product | Direct URL / compliance monitoring | Any authenticated | — |
| `/monitoring/reports` | `pages/PostMarketMonitoring/ReportsArchive.tsx` | AI Product | Direct URL | Any authenticated | — |
| `/intake-forms` | `pages/IntakeFormBuilder/IntakeFormsListPage.tsx` | AI Product / Admin | Direct URL / MegaDropdown Add new | Admin/Editor | — |
| `/intake-forms/submissions` | `pages/IntakeFormBuilder/IntakeFormsListPage.tsx` | AI Product / Admin | Intake forms → Submissions tab | Admin/Editor | — |
| `/intake-forms/:formId/edit` | `pages/IntakeFormBuilder/index.tsx` | AI Product / Admin | Intake forms → Edit | Admin/Editor | — |
| `/super-admin` | `pages/SuperAdmin/Organizations/index.tsx` | Admin | App switcher → Super Admin (SuperAdmin only) | Super Admin | — |
| `/super-admin/users` | `pages/SuperAdmin/AllUsers/index.tsx` | Admin | Super Admin sidebar → Users | Super Admin | — |
| `/super-admin/organizations/:id/users` | `pages/SuperAdmin/Users/index.tsx` | Admin | Organizations → org users | Super Admin | — |
| `/super-admin/settings` | `pages/SuperAdmin/Settings/index.tsx` | Admin | Super Admin sidebar → Settings | Super Admin | — |
| `/super-admin/settings/:tab` | `pages/SuperAdmin/Settings/index.tsx` | Admin | Super Admin settings tabs | Super Admin | — |
| `/login` | `pages/Authentication/Login/index.tsx` | Auth | Public auth page | Public | — |
| `/user-reg` | `pages/Authentication/RegisterUser/index.tsx` | Auth | First user registration | Public (when no users exist) | — |
| `/forgot-password` | `pages/Authentication/ForgotPassword/index.tsx` | Auth | Login → Forgot password | Public | — |
| `/reset-password` | `pages/Authentication/ResetPassword/index.tsx` | Auth | Password reset flow | Public | — |
| `/set-new-password` | `pages/Authentication/SetNewPassword/index.tsx` | Auth | Password reset flow | Public | — |
| `/reset-password-continue` | `pages/Authentication/ResetPasswordContinue/index.tsx` | Auth | Password reset flow | Public | — |
| `/auth/microsoft/callback` | `pages/Authentication/MicrosoftCallback/index.tsx` | Auth | Microsoft Entra ID SSO callback | Public | `ssoFeatureEnabled` |
| `/aiTrustCentre/:hash` | `pages/AITrustCentrePublic/index.tsx` | Public | External shared AI Trust Centre link | Public | — |
| `/shared/:resourceType/:token` | `pages/SharedView/index.tsx` | Public | Shared view links generated in-app | Public | — |
| `/:publicId/use-case-form-intake` | `pages/PublicIntakeForm/index.tsx` | Public | Public intake form link | Public | — |
| `/:publicId/use-case-form-intake/success` | `pages/PublicIntakeForm/SubmissionSuccess.tsx` | Public | Intake form submission success | Public | — |
| `/intake/:tenantSlug/:formSlug` | `pages/PublicIntakeForm/index.tsx` | Public | Legacy public intake form URL | Public | — |
| `/intake/:tenantSlug/:formSlug/success` | `pages/PublicIntakeForm/SubmissionSuccess.tsx` | Public | Legacy intake success | Public | — |
| `/reactflow-demo` | `pages/ReactFlowDemo/index.tsx` | Dev | Direct URL only | Any authenticated | `import.meta.env.DEV` |
| `/wizard-showcase` | `pages/WizardShowcase/index.tsx` | Dev | Direct URL only | Any authenticated | `import.meta.env.DEV` |
| `/style-guide/:section?` | `pages/StyleGuide/index.tsx` | Dev | Direct URL only | Any authenticated | `import.meta.env.DEV` |
| `*` | `pages/PageNotFound/index.tsx` | Core | Catch-all 404 | Any / Public | — |



---

## 3. Navigation structure

### 3.1 App switcher (module switcher)

File: `Clients/src/presentation/components/AppSwitcher/index.tsx`

The left-most vertical strip in the authenticated shell. It lets users jump between VerifyWise modules. Module visibility depends on `isSuperAdmin` and `hasOrg`:

| Module ID | Label | Icon | Default route | Visible to |
|-----------|-------|------|---------------|------------|
| `main` | Governance | Shield | `/` | Everyone |
| `evals` | LLM Evals | FlaskConical | `/evals` | Everyone |
| `ai-gateway` | AI Gateway | Router | `/ai-gateway/dashboard` | Everyone |
| `ai-trust-index` | AI Trust Index | Gauge | `/ai-trust-index/browse` | Everyone |
| `shadow-ai` | Shadow AI | Eye | `/shadow-ai/insights` | Everyone |
| `ai-detection` | AI Detection | ScanSearch | `/ai-detection/scan` | Everyone |
| `super-admin` | Super Admin | Crown | `/super-admin` | Super Admin only |

The active module is detected from the URL by `useActiveModule` (`Clients/src/application/hooks/useActiveModule.ts`) and persisted to `localStorage`.

### 3.2 Main VerifyWise sidebar

File: `Clients/src/presentation/components/Sidebar/index.tsx` using the reusable `SidebarShell` (`components/Sidebar/SidebarShell.tsx`).

**Top-level items**

| Label | Route | Notes |
|-------|-------|-------|
| Start here | `/start-here` | Onboarding landing page |
| Dashboard | `/` | Main dashboard |
| Tasks | `/tasks` | Shows open task count badge |
| Frameworks | `/framework` | Organizational compliance frameworks |

**INVENTORY group**

| Label | Route | Notes |
|-------|-------|-------|
| Use cases | `/overview` | Highlights for `/project-view` as well |
| Model inventory | `/model-inventory` | |
| AI apps | `/ai-apps` | |
| Datasets | `/datasets` | |
| Agent discovery | `/agent-discovery` | |

**ASSURANCE group**

| Label | Route | Notes |
|-------|-------|-------|
| Risk management | `/risk-management` | |
| Training registry | `/training` | |
| Evidence | `/file-manager` | |
| Reporting | `/reporting` | |
| AI trust center | `/ai-trust-center` | |

**GOVERNANCE group**

| Label | Route | Notes |
|-------|-------|-------|
| Vendors | `/vendors` | |
| Policy manager | `/policies` | |
| Incident management | `/ai-incident-managements` | |

**Footer / Management menu**

File: `Clients/src/presentation/components/Sidebar/SidebarFooter.tsx`

- Demo data button (admin only): Create / delete demo data.
- Management dropdown: Event Tracker, Settings.
- In Super Admin mode the footer shows only Settings.
- User profile drawer with logout, theme toggle, help/release notes.

### 3.3 Context-aware sidebars

When the active module is not `main`, `ContextSidebar` (`Clients/src/presentation/components/ContextSidebar/index.tsx`) swaps the main sidebar for a module-specific sidebar.

#### LLM Evals sidebar

File: `Clients/src/presentation/pages/EvalsDashboard/EvalsSidebar.tsx`

Includes a project selector at the top and the following flat items:

| Item | Route / hash | Notes |
|------|--------------|-------|
| Overview | `/evals/:projectId#overview` | Always enabled; shows project list when no project selected |
| Experiments | `#experiments` | Disabled when no project selected |
| Datasets | `#datasets` | Org-scoped |
| Scorers | `#scorers` | Org-scoped |
| Models | `#models` | Org-scoped |
| Bias audits | `#bias-audits` | |
| Playground | `#playground` | Chat with any model |
| Arena | `#arena` | |
| Reports | `#reports` | Disabled when no project selected |
| Settings | `#settings` | Org-scoped |

Recent experiments and recent projects are shown below the menu.

#### AI Detection sidebar

File: `Clients/src/presentation/pages/AIDetection/AIDetectionSidebar.tsx`

| Item | Route | Notes |
|------|-------|-------|
| Scan | `/ai-detection/scan` | |
| Repositories | `/ai-detection/repositories` | Badge = repository count |
| Scan results | `/ai-detection/history` | Badge = total scans |
| Settings | `/ai-detection/settings` | |

Recent scans are listed at the bottom.

#### Shadow AI sidebar

File: `Clients/src/presentation/pages/ShadowAI/ShadowAISidebar.tsx`

| Item | Route | Notes |
|------|-------|-------|
| Insights | `/shadow-ai/insights` | |
| User activity | `/shadow-ai/user-activity/users` | |
| AI tools | `/shadow-ai/tools` | Badge = tool count |
| Rules & alerts | `/shadow-ai/rules` | Badge = alert count |
| Settings | `/shadow-ai/settings` | |

Recent tools are listed at the bottom.

#### AI Gateway sidebar

File: `Clients/src/presentation/pages/AIGateway/AIGatewaySidebar.tsx`

Flat items:

| Item | Route | Notes |
|------|-------|-------|
| Dashboard | `/ai-gateway/dashboard` | |
| Endpoints | `/ai-gateway/endpoints` | Badge = active endpoints |
| Playground | `/ai-gateway/playground` | |
| Guardrails | `/ai-gateway/guardrails/pii` | |
| Prompts | `/ai-gateway/prompts` | Hidden when `SHOW_AI_GATEWAY_PROMPTS=false` |
| Models | `/ai-gateway/models/catalog` | |
| Logs | `/ai-gateway/logs` | |
| Settings | `/ai-gateway/settings/api-keys` | |

**Agent Control group**

| Item | Route | Notes |
|------|-------|-------|
| Runs | `/ai-gateway/mcp/runs` | |
| Activity | `/ai-gateway/mcp/audit` | |
| Approvals | `/ai-gateway/mcp/approvals` | |
| Guardrails | `/ai-gateway/mcp/guardrails` | |
| Agent keys | `/ai-gateway/mcp/agent-keys` | |
| MCP servers | `/ai-gateway/mcp/servers` | |
| MCP tools | `/ai-gateway/mcp/tools` | |

#### AI Trust Index sidebar

File: `Clients/src/presentation/pages/AITrustIndex/AITrustIndexSidebar.tsx`

| Item | Route | Notes |
|------|-------|-------|
| Browse | `/ai-trust-index/browse` | |
| Tracked | `/ai-trust-index/tracked` | Badge = tracked apps |
| Settings | `/ai-trust-index/settings` | Admin only |

#### Super Admin sidebar

File: `Clients/src/presentation/components/SuperAdminSidebar/index.tsx`

| Item | Route | Notes |
|------|-------|-------|
| Organizations | `/super-admin` | |
| Users | `/super-admin/users` | Badge = total user count |

### 3.4 Command palette (Wise Search)

File: `Clients/src/presentation/components/CommandPalette/index.tsx`
Registry: `Clients/src/application/commands/registry.ts`

- Opened with `Ctrl/Cmd + K`.
- Two modes:
  - **Command mode** when query is empty or does not trigger search: lists navigation commands from `commandRegistry` (Dashboard, Tasks, Use cases, Frameworks, Vendors, Model Inventory, Risk Management, Training, Evidence, Reporting, AI Trust Center, Policy Manager, Event Tracker, Settings, Incident Management).
  - **Wise Search mode** when the user types: server-side search across projects, tasks, vendors, vendor risks, model inventories, evidence hub, project risks, file manager, policies, policy templates, AI trust center resources/subprocessors, training registry, incident management, and DeepEval projects.
- Includes an evidence-status filter bar (draft, pending review, approved, rejected, expired, superseded).
- Recent searches are persisted and shown when no query is entered.
- Command actions include `navigate`, `modal`, `function`, `filter`, `export`.

### 3.5 User guide sidebar

File: `Clients/src/presentation/components/UserGuide/SidebarWrapper.tsx` and related components.

- A slide-out helper panel on the right side of authenticated pages.
- Not rendered on auth pages or public pages.
- Articles are sourced from `shared/user-guide-content/content/` (TypeScript article objects) and rendered by `UserGuide` components.
- Can be opened via the help icon in `PageHeaderExtended` or the footer release-notes link.

---

## 4. Per-page feature details by category

For each page/screen the following subsections describe: routes, user-facing features and actions, key components/sub-pages, access paths, e2e test files, unit/component test directories, backend API domain, and user-guide article links.

### 4.1 Authentication

#### Login

| Attribute | Value |
|-----------|-------|
| Routes | `/login` |
| Component | `Clients/src/presentation/pages/Authentication/Login/index.tsx` |
| Features | Email/password form, "Remember for 30 days", forgot-password link, Microsoft Entra ID SSO (when `ssoFeatureEnabled`), demo-app prefilled credentials, inline error alerts, loading overlay. |
| Key components | `Field`, `Checkbox`, `MicrosoftSignIn`, `Alert`, animated `LoginLoadingOverlay`. |
| Access | Public; redirects authenticated users to `/`. |
| e2e tests | `Clients/e2e/auth.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/Authentication/Login/__tests__/Login.test.tsx` |
| Backend domain | `/api/users/login`, `/api/users/check/exists`, `/api/sso/orgs`, `/api/sso/status/:id` |
| User guide | — |

#### Forgot / reset / set-new password

| Attribute | Value |
|-----------|-------|
| Routes | `/forgot-password`, `/reset-password`, `/set-new-password`, `/reset-password-continue` |
| Components | `ForgotPassword/index.tsx`, `ResetPassword/index.tsx`, `SetNewPassword/index.tsx`, `ResetPasswordContinue/index.tsx` |
| Features | Email request, token validation, password strength, reset confirmation. |
| e2e tests | `Clients/e2e/auth.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/Authentication/ForgotPassword/__tests__/ForgotPassword.test.tsx` |
| Backend domain | `/api/users/forgot-password`, `/api/users/reset-password`, `/api/users/set-new-password` |

#### User registration

| Attribute | Value |
|-----------|-------|
| Routes | `/user-reg` |
| Component | `Clients/src/presentation/pages/Authentication/RegisterUser/index.tsx` |
| Features | First admin/user registration form. |
| e2e tests | `Clients/e2e/auth.spec.ts` |
| Backend domain | `/api/users/register` |

#### Microsoft SSO callback

| Attribute | Value |
|-----------|-------|
| Routes | `/auth/microsoft/callback` |
| Component | `Clients/src/presentation/pages/Authentication/MicrosoftCallback/index.tsx` |
| Features | Handles Microsoft Entra ID auth code exchange, stores token, redirects. |
| Backend domain | `/api/auth/microsoft/callback` |

---

### 4.2 Core

#### Integrated Dashboard

| Attribute | Value |
|-----------|-------|
| Routes | `/` |
| Component | `Clients/src/presentation/pages/DashboardOverview/IntegratedDashboard.tsx` |
| Features | Operations/Executive view toggle, quick-stats cards (Models, Vendors, Policies, Trainings, Incidents, Governance Intelligence), executive view cards (organizational frameworks, AI governance score, use case & framework risks, vendor risks, model risks, quantitative portfolio exposure/trend/loss breakdown, recent activity, recent use cases, training/policy/incident status, task radar, evidence coverage, model lifecycle), operations view cards (task radar, incident status, evidence coverage, governance score, risks, use cases table), `AddNewMegaDropdown` for creating entities, change-organization-name modal on first login, page tour. |
| Key components | `DashboardTabs`, `DashboardHeaderCard`, `DashboardCard`, `TaskRadarCard`, `RiskDonutWithLegend`, `GovernanceScoreCard`, `PortfolioExposureCard`, `PortfolioTrendChart`, `LossCategoryBreakdown`, `TrainingCompletionCard`, `PolicyStatusCard`, `IncidentStatusCard`, `EvidenceCoverageCard`, `ModelLifecycleCard`, `UseCasesTable`, `ActivityItem`, `AddNewMegaDropdown`, `ChangeOrganizationNameModal`. |
| Access | Main sidebar → Dashboard; app switcher → Governance. |
| e2e tests | `Clients/e2e/dashboard.spec.ts`, `Clients/e2e/overview.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/DashboardOverview/__tests__/IntegratedDashboard.test.tsx` |
| Backend domain | `/api/dashboard`, `/api/projects`, `/api/vendors`, `/api/vendorRisks`, `/api/modelInventory`, `/api/modelRisks`, `/api/policies`, `/api/incidents`, `/api/training`, `/api/evidenceHub`, `/api/tasks`, `/api/quantitative-risk/portfolio`, `/api/quantitative-risk/trend` |
| User guide | `shared/user-guide-content/content/getting-started/dashboard.ts`, `docs/user-guide-audit/getting-started/dashboard.md` |

**Hidden dashboard tabs** (gated by `SHOW_AI_AGENT_DASHBOARD_TABS=false` in `IntegratedDashboard.tsx`):
- Audit readiness (`ReadinessDashboard`)
- AI content review (`AIContentReview`)
- AI audit (`AIAuditDashboard`)

#### Start Here

| Attribute | Value |
|-----------|-------|
| Routes | `/start-here` |
| Component | `Clients/src/presentation/pages/StartHere/index.tsx` |
| Features | Personalized greeting, onboarding progress ring, getting-started cards (welcome video, quick start, dashboard guide, installation), explore VerifyWise carousel with feature videos, shortcut icons, expert contact cards, resources/what's-new sidebar. |
| Access | Main sidebar → Start here; onboarding completion redirect. |
| e2e tests | `Clients/e2e/start-here.spec.ts`, `Clients/e2e/onboarding.spec.ts` |
| Backend domain | `/api/projectRisks`, `/api/users/:id`, `/api/projects` |
| User guide | `shared/user-guide-content/content/getting-started/welcome.ts`, `docs/user-guide-audit/getting-started/welcome.md` |

#### Tasks

| Attribute | Value |
|-----------|-------|
| Routes | `/tasks` |
| Component | `Clients/src/presentation/pages/Tasks/index.tsx` |
| Features | Task list/table, filters by status/assignee/due date, create/edit task modal, task detail drawer, bulk actions. |
| Access | Main sidebar → Tasks. |
| e2e tests | `Clients/e2e/tasks.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/Tasks/__tests__/*.test.tsx` |
| Backend domain | `/api/tasks` |
| User guide | `shared/user-guide-content/content/ai-governance/task-management.ts`, `docs/user-guide-audit/ai-governance/task-management.md` |

#### Settings

| Attribute | Value |
|-----------|-------|
| Routes | `/settings`, `/settings/:tab` |
| Component | `Clients/src/presentation/pages/SettingsPage/index.tsx` |
| Tabs | Profile, Password, Preferences, Team, Organization, Features, API Keys, Audit ledger, SSO, Custom fields, AI Approval Rules (hidden). |
| Features | Profile editing, password change, theme/language/notification preferences, team management (Admin only), organization settings, feature toggles, API key generation (Admin), audit ledger (Admin), Microsoft Entra ID SSO config (when enabled), custom field definitions (Admin). |
| Access | Main sidebar footer → Management → Settings; command palette → Settings. |
| e2e tests | `Clients/e2e/settings.spec.ts`, `Clients/e2e/super-admin.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/SettingsPage/**/*.test.tsx` |
| Backend domain | `/api/users`, `/api/organizations`, `/api/roles`, `/api/api-keys`, `/api/audit-ledger`, `/api/sso-config`, `/api/custom-fields` |
| User guide | `shared/user-guide-content/content/settings/*.ts`, `docs/user-guide-audit/settings/*.md` |

#### Extensions

| Attribute | Value |
|-----------|-------|
| Routes | `/extensions`, `/extensions/:key/settings` |
| Component | `Clients/src/presentation/pages/Extensions/index.tsx`, `Extensions/Settings/index.tsx` |
| Features | Extension marketplace/grid, enable/disable toggles, per-extension settings (MLflow, Azure AI Foundry, Jira Assets, Slack, dataset bulk upload, model lifecycle, risk import). |
| Access | Start Here shortcut; direct URL; Settings → Features enable. |
| e2e tests | `Clients/e2e/plugins.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/Extensions/**/*.test.tsx` |
| Backend domain | `/api/extensions`, `/api/extensions/:key/config` |
| User guide | `shared/user-guide-content/content/integrations/plugins.ts`, `docs/user-guide-audit/integrations/plugins.md` |

---

### 4.3 Project

#### Use cases (Project list)

| Attribute | Value |
|-----------|-------|
| Routes | `/overview` |
| Component | `Clients/src/presentation/pages/Home/1.0Home/index.tsx` |
| Features | Project/use-case list table, "New use case" button, AI-or-not screening modal, project creation modal (`ProjectForm`), page tour, delete/edit actions (role-gated). |
| Key components | `ProjectsList`, `ProjectForm`, `AiOrNotScreening`, `PageTour`. |
| Access | Main sidebar → Use cases; Start Here shortcut. |
| e2e tests | `Clients/e2e/overview.spec.ts`, `Clients/e2e/use-cases.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/Home/1.0Home/**/*.test.tsx`, `Clients/src/presentation/components/ProjectsList/__tests__/*.test.tsx`, `Clients/src/presentation/components/Forms/ProjectForm/__tests__/*.test.tsx` |
| Backend domain | `/api/projects`, `/api/projectRisks` |
| User guide | `shared/user-guide-content/content/ai-governance/use-cases.ts`, `docs/user-guide-audit/ai-governance/use-cases.md` |

#### Project view

| Attribute | Value |
|-----------|-------|
| Routes | `/project-view?projectId=...` |
| Component | `Clients/src/presentation/pages/ProjectView/V1.0ProjectView/index.tsx` |
| Features | Per-project dashboard, frameworks assigned to the project, compliance progress, risk register, evidence, team members, project settings, add framework modal. |
| Access | Use cases table row click; Wise Search result; command palette. |
| e2e tests | `Clients/e2e/project-view.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/ProjectView/**/*.test.tsx` |
| Backend domain | `/api/projects/:id`, `/api/projectFrameworks`, `/api/projectRisks`, `/api/evidenceHub`, `/api/files`, `/api/tasks`, `/api/users` |
| User guide | `shared/user-guide-content/content/ai-governance/project-overview.ts`, `docs/user-guide-audit/ai-governance/project-overview.md` |

---

### 4.4 Inventory

#### Model inventory

| Attribute | Value |
|-----------|-------|
| Routes | `/model-inventory`, `/model-inventory/model-risks`, `/model-inventory/evidence-hub`, `/model-inventory/model-risk-management`, `/model-inventory/model-risk-management/:mrmTab`, `/model-inventory/model-risk-management/settings/:settingsSection`, `/model-inventory/models/:id`, `/model-inventory/:pluginTab` |
| Component | `Clients/src/presentation/pages/ModelInventory/index.tsx` |
| Tabs | Models, Model risks, Evidence hub, Evaluations, Model risk management, plus extension tabs (MLflow, Azure AI Foundry). |
| Features | Model table with status cards, search, filters, grouping, column visibility, export; add/edit model modal (`NewModelInventory`); model-risk table with add/edit modal (`NewModelRisk`); evidence hub table with upload/edit modal (`EvidenceHub`) and file preview; model evaluations; model-risk management (MRM) with overview, tiering, validation, findings, monitoring, settings sub-tabs; model lifecycle detail page; share view dropdown. |
| Key components | `ModelInventoryTable`, `ModelRisksTable`, `EvidenceHubTable`, `DatasetSummary`, `ModelInventorySummary`, `ModelRiskSummary`, `AnalyticsDrawer`, `NewModelInventory`, `NewModelRisk`, `EvidenceHub`, `FilePreviewPanel`, `ModelEvaluationsTab`, `ModelRiskManagementTab`, `ShareViewDropdown`, `MLFlowTab`, `AzureAIFoundryTab`. |
| Access | Main sidebar → Model inventory. |
| e2e tests | `Clients/e2e/model-inventory.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/ModelInventory/**/*.test.tsx`, `Clients/src/presentation/components/Modals/NewModelInventory/__tests__/*.test.tsx`, `Clients/src/presentation/components/Modals/NewModelRisk/__tests__/*.test.tsx`, `Clients/src/presentation/components/Modals/EvidenceHub/__tests__/*.test.tsx` |
| Backend domain | `/api/modelInventory`, `/api/modelRisks`, `/api/evidenceHub`, `/api/datasets`, `/api/modelLifecycle`, `/api/modelEvaluations`, `/api/share`, `/api/mlflow/*`, `/api/azure-ai-foundry/*` |
| User guide | `shared/user-guide-content/content/ai-governance/model-inventory.ts`, `docs/user-guide-audit/ai-governance/model-inventory.md`, `shared/user-guide-content/content/ai-governance/mrm.ts` |

#### AI apps

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-apps`, `/ai-apps/:id` |
| Component | `Clients/src/presentation/pages/AIApps/index.tsx`, `AIApps/AIAppDetail/index.tsx` |
| Features | AI app table with status filter and search, create/edit modal (`NewAIApp`), delete confirmation, app detail view with approval center, model dependencies, policy mapping, risk assessment. |
| Key components | `AIAppsTable`, `AIAppDetail`, `AIAppApprovalCenter`, `AIAppModelDependencies`, `AIAppPolicyMapping`, `AIAppRiskAssessment`, `NewAIApp`. |
| Access | Main sidebar → AI apps. |
| e2e tests | `Clients/e2e/ai-trust-center.spec.ts` (related), direct navigation |
| Unit tests | `Clients/src/presentation/pages/AIApps/__tests__/AIApps.test.tsx`, `Clients/src/presentation/pages/AIApps/AIAppDetail/**/*.test.tsx` |
| Backend domain | `/api/ai-apps` |
| User guide | `shared/user-guide-content/content/ai-governance/ai-apps.ts` |

#### Datasets

| Attribute | Value |
|-----------|-------|
| Routes | `/datasets` |
| Component | `Clients/src/presentation/pages/Datasets/index.tsx` |
| Features | Dataset table with status summary cards, search, filters, grouping, column visibility; add/edit dataset modal (`NewDataset`); delete; bulk upload extension (`BulkUploadButton`/`BulkUploadModal`). |
| Key components | `DatasetTable`, `DatasetSummary`, `NewDataset`, `BulkUploadButton`, `BulkUploadModal`. |
| Access | Main sidebar → Datasets. |
| e2e tests | `Clients/e2e/datasets.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/Datasets/__tests__/Datasets.test.tsx` |
| Backend domain | `/api/datasets`, `/api/modelInventory` |
| User guide | `shared/user-guide-content/content/ai-governance/datasets.ts`, `docs/user-guide-audit/ai-governance/datasets.md` |

#### Agent discovery

| Attribute | Value |
|-----------|-------|
| Routes | `/agent-discovery` |
| Component | `Clients/src/presentation/pages/AgentDiscovery/index.tsx` |
| Features | Discovered AI agents table, link model modal, manual agent modal, review agent modal, agent approval workflow. |
| Key components | `AgentTable`, `LinkModelModal`, `ManualAgentModal`, `ReviewAgentModal`. |
| Access | Main sidebar → Agent discovery. |
| e2e tests | `Clients/e2e/agent-discovery.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AgentDiscovery/__tests__/AgentDiscovery.test.tsx` |
| Backend domain | `/api/agent-discovery`, `/api/modelInventory` |
| User guide | `shared/user-guide-content/content/ai-governance/agent-discovery.ts`, `docs/user-guide-audit/ai-governance/agent-discovery.md` |

---

### 4.5 Assurance

#### Risk management

| Attribute | Value |
|-----------|-------|
| Routes | `/risk-management` |
| Component | `Clients/src/presentation/pages/RiskManagement/index.tsx` |
| Features | Project risk register, risk heatmap/timeline visualization, risk filters, create/edit risk modals (`NewRisk`, `AddNewRiskForm`, `AddNewRiskIBMForm`, `AddNewRiskMITForm`), quantitative risk assessment mode toggle, mitigation section, linked policies. |
| Key components | `RisksView`, `RiskVisualizationTabs`, `RiskHeatMap`, `RiskTimeline`, `RiskCategories`, `NewRisk`, `AddNewRiskForm`, `QuantitativeRiskForm`. |
| Access | Main sidebar → Risk management; Start Here shortcut. |
| e2e tests | `Clients/e2e/risk-management.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/RiskManagement/**/*.test.tsx`, `Clients/src/presentation/components/AddNewRiskForm/__tests__/*.test.tsx`, `Clients/src/presentation/components/QuantitativeRiskForm/__tests__/*.test.tsx` |
| Backend domain | `/api/projectRisks`, `/api/vendorRisks`, `/api/modelRisks`, `/api/quantitative-risk` |
| User guide | `shared/user-guide-content/content/risk-management/*.ts`, `docs/user-guide-audit/risk-management/*.md` |

#### Training registry

| Attribute | Value |
|-----------|-------|
| Routes | `/training`, `/training/evidence-hub` |
| Component | `Clients/src/presentation/pages/TrainingRegistar/index.tsx` |
| Features | Training programs table, create/edit training modal (`NewTraining`), evidence hub for training records, compliance tracking, completion status. |
| Access | Main sidebar → Training registry. |
| e2e tests | `Clients/e2e/training.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/TrainingRegistar/**/*.test.tsx`, `Clients/src/presentation/components/Modals/NewTraining/__tests__/*.test.tsx` |
| Backend domain | `/api/training`, `/api/evidenceHub`, `/api/files` |
| User guide | `shared/user-guide-content/content/training/training-tracking.ts`, `docs/user-guide-audit/training/training-tracking.md` |

#### Evidence / File manager

| Attribute | Value |
|-----------|-------|
| Routes | `/file-manager` |
| Component | `Clients/src/presentation/pages/FileManager/index.tsx` |
| Features | Folder tree, file table, create/edit folders, file metadata editor, file preview panel, version history drawer, assign-to-folder modal, column selector, status badges, upload modal (`FileManagerUpload`). |
| Key components | `FolderTree`, `FileTable`, `FilePreviewPanel`, `FileVersionHistoryDrawer`, `FileMetadataEditor`, `CreateFolderModal`, `AssignToFolderModal`, `FileManagerUpload`. |
| Access | Main sidebar → Evidence. |
| e2e tests | `Clients/e2e/file-manager.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/FileManager/__tests__/FileManager.test.tsx`, `Clients/src/presentation/pages/FileManager/components/**/*.test.tsx` |
| Backend domain | `/api/files`, `/api/folders`, `/api/fileManager`, `/api/evidenceHub` |
| User guide | `shared/user-guide-content/content/ai-governance/evidence-collection.ts`, `docs/user-guide-audit/ai-governance/evidence-collection.md` |

#### Reporting

| Attribute | Value |
|-----------|-------|
| Routes | `/reporting` |
| Component | `Clients/src/presentation/pages/Reporting/index.tsx` |
| Features | Report templates list, generate report flow with section selector, download report form, AI key banner, report table, export. |
| Key components | `GenerateReport`, `SectionSelector`, `DownloadReportFrom`, `GenerateReportFrom`, `ReportTable`. |
| Access | Main sidebar → Reporting; Start Here shortcut. |
| e2e tests | `Clients/e2e/reporting.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/Reporting/**/*.test.tsx`, `Clients/src/presentation/components/Reporting/GenerateReport/__tests__/*.test.tsx` |
| Backend domain | `/api/reports`, `/api/generate-report` |
| User guide | `shared/user-guide-content/content/reporting/*.ts`, `docs/user-guide-audit/reporting/*.md` |

#### AI Trust Center

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-trust-center`, `/ai-trust-center/:tab` |
| Component | `Clients/src/presentation/pages/AITrustCenter/index.tsx` |
| Tabs | Overview, Resources, Subprocessors, Settings. |
| Features | Public-facing trust center configuration, resources list, subprocessors table, trust center steps/wizard, share links. |
| Key components | `AITrustCenterSteps`, `Overview`, `Resources`, `Subprocessors`, `Settings`. |
| Access | Main sidebar → AI trust center. |
| e2e tests | `Clients/e2e/ai-trust-center.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AITrustCenter/__tests__/AITrustCenter.test.tsx`, `Clients/src/presentation/pages/AITrustCenter/Overview/__tests__/*.test.tsx` |
| Backend domain | `/api/ai-trust-center`, `/api/resources`, `/api/subprocessors` |
| User guide | `shared/user-guide-content/content/ai-governance/ai-trust-center.ts`, `docs/user-guide-audit/ai-governance/ai-trust-center.md` |

---

### 4.6 Governance

#### Vendors

| Attribute | Value |
|-----------|-------|
| Routes | `/vendors`, `/vendors/risks` |
| Component | `Clients/src/presentation/pages/Vendors/index.tsx` |
| Tabs | Vendor list, Vendor risks. |
| Features | Vendor table with status tile cards, search, filters (`FilterBy`), grouping, column visibility, export; create/edit vendor modal (`NewVendor`); vendor-risk table with create/edit modal (`NewRisk`); delete actions; project filter; scorecard column. |
| Key components | `TableWithPlaceholder`, `RisksTable`, `NewVendor`, `NewRisk`, `StatusTileCards`, `FilterBy`, `GroupBy`, `ColumnSelector`, `ExportMenu`. |
| Access | Main sidebar → Vendors; dashboard stat cards. |
| e2e tests | `Clients/e2e/vendors.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/Vendors/**/*.test.tsx`, `Clients/src/presentation/components/Modals/NewVendor/__tests__/*.test.tsx` |
| Backend domain | `/api/vendors`, `/api/vendorRisks`, `/api/projects`, `/api/users` |
| User guide | `shared/user-guide-content/content/risk-management/vendor-management.ts`, `docs/user-guide-audit/risk-management/vendor-management.md`, `docs/user-guide-audit/risk-management/vendor-risks.md` |

#### Policy manager

| Attribute | Value |
|-----------|-------|
| Routes | `/policies`, `/policies/templates`, `/policies/new`, `/policies/:id/edit` |
| Component | `Clients/src/presentation/pages/PolicyDashboard/PoliciesDashboard.tsx`, `PolicyEditorPage.tsx` |
| Tabs | Policies, Templates. |
| Features | Policy table with status/progress, search, filters; create/edit policy editor with rich text, AI editor menu, version history, approval workflow, linked policies/evidence/risks selectors; policy templates table. |
| Key components | `PolicyTable`, `PolicyForm`, `AIEditorMenu`, `RichTextEditor`, `RichTextRenderer`, `LinkedPoliciesTable`, `LinkedPolicyModal`, `LinkEvidenceSelectorModal`, `LinkRiskSelectorModal`. |
| Access | Main sidebar → Policy manager. |
| e2e tests | `Clients/e2e/policies.spec.ts`, `Clients/e2e/policy-editor.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/PolicyDashboard/**/*.test.tsx`, `Clients/src/presentation/components/Policies/**/*.test.tsx`, `Clients/src/presentation/components/RichTextEditor/__tests__/*.test.tsx` |
| Backend domain | `/api/policies`, `/api/policy-templates`, `/api/evidenceHub`, `/api/projectRisks`, `/api/vendorRisks` |
| User guide | `shared/user-guide-content/content/policies/*.ts`, `docs/user-guide-audit/policies/*.md` |

#### Incident management

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-incident-managements` |
| Component | `Clients/src/presentation/pages/IncidentManagement/index.tsx` |
| Features | Incident table, create/edit incident modal (`NewIncident`), status distribution, archive action, linked entities. |
| Key components | `IncidentsTable`, `NewIncident`. |
| Access | Main sidebar → Incident management; dashboard stat card. |
| e2e tests | `Clients/e2e/incidents.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/IncidentManagement/**/*.test.tsx`, `Clients/src/presentation/components/Modals/NewIncident/__tests__/*.test.tsx` |
| Backend domain | `/api/incidents` |
| User guide | `shared/user-guide-content/content/ai-governance/incident-management.ts`, `docs/user-guide-audit/ai-governance/incident-management.md` |

#### Frameworks

| Attribute | Value |
|-----------|-------|
| Routes | `/framework/:tab?`, `/projects/:projectId/framework/:frameworkId` |
| Component | `Clients/src/presentation/pages/Framework/index.tsx`, `Framework/Generic/index.tsx` |
| Tabs | Dashboard, Framework risks, Linked models, Requirements and Controls, Settings. |
| Features | Framework dashboard with progress cards, ISO 27001 / ISO 42001 / NIST AI RMF clause/annex/function views, status filters, owner/reviewer filters, generic framework control table, add/remove frameworks, edit/delete organizational project, linked models count, framework risks. |
| Key components | `FrameworkDashboard`, `FrameworkRisks`, `FrameworkLinkedModels`, `ISO27001Clause`, `ISO27001Annex`, `ISO42001Clause`, `ISO42001Annex`, `NISTAIRMFGovern`, `NISTAIRMFMap`, `NISTAIRMFMeasure`, `NISTAIRMFManage`, `GenericFramework`, `AddFrameworkModal`, `ProjectForm`. |
| Access | Main sidebar → Frameworks; Start Here shortcut. |
| e2e tests | `Clients/e2e/frameworks.spec.ts`, `Clients/e2e/assessment.spec.ts`, `Clients/e2e/compliance-tracker.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/Framework/**/*.test.tsx` |
| Backend domain | `/api/frameworks`, `/api/projects`, `/api/projectFrameworks`, `/api/controls`, `/api/subcontrols`, `/api/modelInventory`, `/api/projectRisks` |
| User guide | `shared/user-guide-content/content/compliance/*.ts`, `docs/user-guide-audit/compliance/*.md` |

#### Event tracker (WatchTower)

| Attribute | Value |
|-----------|-------|
| Routes | `/event-tracker`, `/event-tracker/logs` |
| Component | `Clients/src/presentation/pages/WatchTower/index.tsx` |
| Features | Event/audit log table, filters, log detail, export, real-time/event-driven tracking. |
| Access | Main sidebar footer → Management → Event Tracker. |
| e2e tests | `Clients/e2e/event-tracker.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/WatchTower/**/*.test.tsx` |
| Backend domain | `/api/events`, `/api/audit-logs` |
| User guide | `shared/user-guide-content/content/ai-governance/watchtower.ts`, `docs/user-guide-audit/ai-governance/watchtower.md` |

---

### 4.7 AI Product

#### AI audit dashboard

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-audit` |
| Component | `Clients/src/presentation/pages/AIAuditDashboard/index.tsx` |
| Features | Complete audit trail of AI actions (EU AI Act art. 12), action log table, filters, agent/tool call details. |
| Access | Direct URL; intended as a dashboard tab behind `SHOW_AI_AGENT_DASHBOARD_TABS`. |
| e2e tests | — |
| Unit tests | `Clients/src/presentation/pages/AIAuditDashboard/**/*.test.tsx` |
| Backend domain | `/api/ai-audit`, `/api/ai-actions` |

#### AI observability

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-observability` |
| Component | `Clients/src/presentation/pages/AIObservability/index.tsx` |
| Features | Observability dashboards for AI systems, metrics, logs, alerts. |
| Access | Direct URL. |
| e2e tests | — |
| Unit tests | `Clients/src/presentation/pages/AIObservability/__tests__/index.test.tsx` |
| Backend domain | `/api/ai-observability` |

#### Approval workflows

| Attribute | Value |
|-----------|-------|
| Routes | `/approval-workflows` |
| Component | `Clients/src/presentation/pages/ApprovalWorkflows/index.tsx` |
| Features | Approval workflow table, create/edit workflow modal (`NewApprovalWorkflow`), requestor approval modal, step details. |
| Access | Direct URL; MegaDropdown Add new. |
| e2e tests | `Clients/e2e/approval-workflows.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/ApprovalWorkflows/__tests__/ApprovalWorkflows.test.tsx`, `Clients/src/presentation/components/Modals/NewApprovalWorkflow/__tests__/*.test.tsx`, `Clients/src/presentation/components/Modals/RequestorApprovalModal/__tests__/*.test.tsx` |
| Backend domain | `/api/approval-workflows`, `/api/approval-requests` |
| User guide | `shared/user-guide-content/content/ai-governance/approval-workflows.ts`, `docs/user-guide-audit/ai-governance/approval-workflows.md` |

#### Automations

| Attribute | Value |
|-----------|-------|
| Routes | `/automations` |
| Component | `Clients/src/presentation/pages/Automations/index.tsx` |
| Features | Automation list, automation builder, configuration panel, automation history. |
| Access | Direct URL; MegaDropdown Add new; Start Here explore card. |
| e2e tests | `Clients/e2e/automations.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/Automations/__tests__/Automations.test.tsx` |
| Backend domain | `/api/automations`, `/api/automation-runs` |
| User guide | `shared/user-guide-content/content/integrations/automations.ts`, `docs/user-guide-audit/integrations/automations.md` |

#### Post-market monitoring

| Attribute | Value |
|-----------|-------|
| Routes | `/monitoring/cycle/:cycleId`, `/monitoring/reports` |
| Component | `Clients/src/presentation/pages/PostMarketMonitoring/MonitoringForm.tsx`, `ReportsArchive.tsx` |
| Features | Monitoring cycle form, reports archive table. |
| Access | Direct URL. |
| e2e tests | `Clients/e2e/post-market-monitoring.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/PostMarketMonitoring/**/*.test.tsx` |
| Backend domain | `/api/monitoring`, `/api/monitoring-reports` |
| User guide | `shared/user-guide-content/content/compliance/post-market-monitoring.ts`, `docs/user-guide-audit/compliance/post-market-monitoring.md` |

#### Intake forms

| Attribute | Value |
|-----------|-------|
| Routes | `/intake-forms`, `/intake-forms/submissions`, `/intake-forms/:formId/edit` |
| Component | `Clients/src/presentation/pages/IntakeFormBuilder/IntakeFormsListPage.tsx`, `IntakeFormBuilder/index.tsx` |
| Features | List of intake forms, submissions tab, form builder with drag/drop fields, public URL generation. |
| Access | Direct URL; MegaDropdown Add new. |
| e2e tests | `Clients/e2e/intake-forms.spec.ts`, `Clients/e2e/public-intake-form.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/IntakeFormBuilder/**/*.test.tsx` |
| Backend domain | `/api/intake-forms`, `/api/intake-submissions` |
| User guide | `shared/user-guide-content/content/ai-governance/intake-forms.ts`, `docs/user-guide-audit/ai-governance/intake-forms.md` |

---

### 4.8 LLM Evals

#### Evals dashboard

| Attribute | Value |
|-----------|-------|
| Routes | `/evals`, `/evals/:projectId`, `/evals/:projectId/datasets/editor`, `/evals/settings` |
| Component | `Clients/src/presentation/pages/EvalsDashboard/EvalsDashboard.tsx` |
| Tabs (hash-based) | Overview, Experiments, Datasets, Scorers, Models, Bias audits, Playground, Arena, Reports, Settings. |
| Features | Project selector, experiments table, dataset management with inline editor and template preview, scorer configuration, model registry, bias audit list and detail, LLM arena, playground chat, reports, organization settings. |
| Key components | `EvalsSidebar`, `ProjectOverview`, `ProjectExperiments`, `ProjectDatasets`, `DatasetInlineEditor`, `DatasetPreviewDrawer`, `PromptEditDrawer`, `ProjectScorers`, `ModelsPage`, `BiasAuditsList`, `BiasAuditDetail`, `ArenaPage`, `ArenaResultsPage`, `PlaygroundPage`, `ReportPage`, `OrgSettings`, `NewExperimentModal`, `NewBiasAuditModal`, `CreateScorerModal`. |
| Access | App switcher → LLM Evals. |
| e2e tests | `Clients/e2e/evals-dashboard.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/EvalsDashboard/**/*.test.tsx` |
| Backend domain | `/api/deepeval/projects`, `/api/deepeval/experiments`, `/api/deepeval/datasets`, `/api/deepeval/scorers`, `/api/deepeval/models`, `/api/deepeval/bias-audits`, `/api/deepeval/arena`, `/api/deepeval/reports` |
| User guide | `shared/user-guide-content/content/llm-evals/*.ts`, `docs/user-guide-audit/llm-evals/*.md` |

---

### 4.9 AI Detection

#### Scan

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-detection/scan` |
| Component | `Clients/src/presentation/pages/AIDetection/ScanPage.tsx` |
| Features | Configure and start repository scans, provider selection, scan progress, risk score cards. |
| Access | AI Detection sidebar → Scan. |
| e2e tests | `Clients/e2e/ai-detection.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIDetection/__tests__/ScanPage.test.tsx` |
| Backend domain | `/api/ai-detection/scans` |
| User guide | `shared/user-guide-content/content/ai-detection/scanning.ts`, `docs/user-guide-audit/ai-detection/scanning.md` |

#### Repositories

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-detection/repositories` |
| Component | `Clients/src/presentation/pages/AIDetection/RepositoriesPage.tsx` |
| Features | Connected repositories table, add repository modal, sync settings. |
| Access | AI Detection sidebar → Repositories. |
| e2e tests | `Clients/e2e/ai-detection.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIDetection/__tests__/RepositoriesPage.test.tsx` |
| Backend domain | `/api/ai-detection/repositories` |
| User guide | `shared/user-guide-content/content/ai-detection/repositories.ts`, `docs/user-guide-audit/ai-detection/repositories.md` |

#### Scan results / History

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-detection/history` |
| Component | `Clients/src/presentation/pages/AIDetection/HistoryPage.tsx` |
| Features | List of past scans, status badges, navigation to scan details. |
| Access | AI Detection sidebar → Scan results. |
| e2e tests | `Clients/e2e/ai-detection.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIDetection/__tests__/HistoryPage.test.tsx` |
| Backend domain | `/api/ai-detection/scans` |
| User guide | `shared/user-guide-content/content/ai-detection/history.ts`, `docs/user-guide-audit/ai-detection/history.md` |

#### Scan details

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-detection/scans/:scanId`, `/ai-detection/scans/:scanId/:tab` |
| Component | `Clients/src/presentation/pages/AIDetection/ScanDetailsPage.tsx` |
| Tabs | Findings, Vulnerabilities, Security findings, Compliance, Suggested risks. |
| Features | Scan metadata header, file path tree, finding rows, suppression rules, suggested risks section, governance popover, security/vulnerability/compliance tabs. |
| Key components | `ScanDetailsHeader`, `FindingsTabPanel`, `FindingRow`, `VulnerabilitiesTab`, `SecurityFindingsTab`, `ComplianceTab`, `SuggestedRisksSection`, `SuppressFindingDialog`, `SuppressionRulesTab`. |
| Access | History → scan row. |
| e2e tests | `Clients/e2e/ai-detection.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIDetection/ScanDetails/**/*.test.tsx` |
| Backend domain | `/api/ai-detection/scans/:id`, `/api/ai-detection/findings`, `/api/ai-detection/suppressions` |
| User guide | `shared/user-guide-content/content/ai-detection/risk-scoring.ts`, `docs/user-guide-audit/ai-detection/risk-scoring.md` |

#### AI Detection settings

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-detection/settings` |
| Component | `Clients/src/presentation/pages/AIDetection/SettingsPage.tsx` |
| Features | Scan settings, exclusion rules, severity mappings, provider credentials. |
| Access | AI Detection sidebar → Settings. |
| e2e tests | `Clients/e2e/ai-detection.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIDetection/__tests__/SettingsPage.test.tsx` |
| Backend domain | `/api/ai-detection/settings` |
| User guide | `shared/user-guide-content/content/ai-detection/settings.ts`, `docs/user-guide-audit/ai-detection/settings.md` |

---

### 4.10 Shadow AI

#### Insights

| Attribute | Value |
|-----------|-------|
| Routes | `/shadow-ai/insights` |
| Component | `Clients/src/presentation/pages/ShadowAI/InsightsPage.tsx` |
| Features | Shadow AI discovery dashboard, tool usage trends, risk summaries, department breakdown. |
| Access | Shadow AI sidebar → Insights. |
| e2e tests | `Clients/e2e/shadow-ai.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/ShadowAI/**/*.test.tsx` |
| Backend domain | `/api/shadow-ai/insights` |
| User guide | `shared/user-guide-content/content/shadow-ai/insights.ts`, `docs/user-guide-audit/shadow-ai/insights.md` |

#### User activity

| Attribute | Value |
|-----------|-------|
| Routes | `/shadow-ai/user-activity`, `/shadow-ai/user-activity/users`, `/shadow-ai/user-activity/departments` |
| Component | `Clients/src/presentation/pages/ShadowAI/UserActivityPage.tsx` |
| Tabs | Users, Departments. |
| Features | Per-user and per-department AI tool activity tables, filters, export. |
| Access | Shadow AI sidebar → User activity. |
| e2e tests | `Clients/e2e/shadow-ai.spec.ts` |
| Backend domain | `/api/shadow-ai/activity` |
| User guide | `shared/user-guide-content/content/shadow-ai/user-activity.ts`, `docs/user-guide-audit/shadow-ai/user-activity.md` |

#### AI tools

| Attribute | Value |
|-----------|-------|
| Routes | `/shadow-ai/tools`, `/shadow-ai/tools/:toolId` |
| Component | `Clients/src/presentation/pages/ShadowAI/AIToolsPage.tsx` |
| Features | Discovered AI tools table, tool detail, risk classification, approval/block actions. |
| Access | Shadow AI sidebar → AI tools. |
| e2e tests | `Clients/e2e/shadow-ai.spec.ts` |
| Backend domain | `/api/shadow-ai/tools` |
| User guide | `shared/user-guide-content/content/shadow-ai/ai-tools.ts`, `docs/user-guide-audit/shadow-ai/ai-tools.md` |

#### Rules & alerts

| Attribute | Value |
|-----------|-------|
| Routes | `/shadow-ai/rules`, `/shadow-ai/rules/alerts` |
| Component | `Clients/src/presentation/pages/ShadowAI/RulesPage.tsx` |
| Tabs | Rules, Alerts. |
| Features | Policy rules for shadow AI detection, alert configuration, alert history. |
| Access | Shadow AI sidebar → Rules & alerts. |
| e2e tests | `Clients/e2e/shadow-ai.spec.ts` |
| Backend domain | `/api/shadow-ai/rules`, `/api/shadow-ai/alerts` |
| User guide | `shared/user-guide-content/content/shadow-ai/rules.ts`, `docs/user-guide-audit/shadow-ai/rules.md` |

#### Shadow AI settings

| Attribute | Value |
|-----------|-------|
| Routes | `/shadow-ai/settings` |
| Component | `Clients/src/presentation/pages/ShadowAI/SettingsPage.tsx` |
| Features | Integration guide, data sources, ingestion settings, notification preferences. |
| Access | Shadow AI sidebar → Settings. |
| e2e tests | `Clients/e2e/shadow-ai.spec.ts` |
| Backend domain | `/api/shadow-ai/settings`, `/api/shadow-ai/integrations` |
| User guide | `shared/user-guide-content/content/shadow-ai/integration-guide.ts`, `docs/user-guide-audit/shadow-ai/integration-guide.md`, `docs/user-guide-audit/shadow-ai/settings.md` |

---

### 4.11 AI Gateway

#### Dashboard / Spend dashboard

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-gateway/dashboard` |
| Component | `Clients/src/presentation/pages/AIGateway/SpendDashboard/index.tsx` |
| Features | Spend analytics, cost charts, usage trends, onboarding overlay, mock dashboard fallback. |
| Access | AI Gateway sidebar → Dashboard. |
| e2e tests | `Clients/e2e/ai-gateway.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIGateway/SpendDashboard/**/*.test.tsx` |
| Backend domain | `/api/ai-gateway/analytics`, `/api/ai-gateway/spend` |
| User guide | `shared/user-guide-content/content/ai-gateway/analytics.ts`, `docs/user-guide-audit/ai-gateway/analytics.md` |

#### Endpoints

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-gateway/endpoints` |
| Component | `Clients/src/presentation/pages/AIGateway/Endpoints/index.tsx` |
| Features | LLM proxy endpoints table, create/edit endpoint, model mapping, fallback configuration, active endpoint badge. |
| Access | AI Gateway sidebar → Endpoints. |
| e2e tests | `Clients/e2e/ai-gateway.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIGateway/Endpoints/index.test.tsx` |
| Backend domain | `/api/ai-gateway/endpoints` |
| User guide | `shared/user-guide-content/content/ai-gateway/endpoints.ts`, `docs/user-guide-audit/ai-gateway/endpoints.md` |

#### Playground

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-gateway/playground` |
| Component | `Clients/src/presentation/pages/AIGateway/Playground/index.tsx` |
| Features | Chat interface against configured endpoints, message history, composer, runtime hook, model selector. |
| Access | AI Gateway sidebar → Playground. |
| e2e tests | `Clients/e2e/ai-gateway.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIGateway/Playground/**/*.test.tsx` |
| Backend domain | `/api/ai-gateway/playground`, `/api/ai-gateway/chat` |
| User guide | `shared/user-guide-content/content/ai-gateway/playground.ts`, `docs/user-guide-audit/ai-gateway/playground.md` |

#### Guardrails

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-gateway/guardrails/:tab` |
| Component | `Clients/src/presentation/pages/AIGateway/Guardrails/index.tsx` |
| Tabs | PII, Prompt injection, etc. |
| Features | Content-policy rules, guardrail toggles, severity thresholds, test panel. |
| Access | AI Gateway sidebar → Guardrails. |
| e2e tests | `Clients/e2e/ai-gateway.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIGateway/Guardrails/index.test.tsx` |
| Backend domain | `/api/ai-gateway/guardrails` |
| User guide | `shared/user-guide-content/content/ai-gateway/guardrails.ts`, `docs/user-guide-audit/ai-gateway/guardrails.md` |

#### Prompts

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-gateway/prompts`, `/ai-gateway/prompts/:id` |
| Component | `Clients/src/presentation/pages/AIGateway/Prompts/index.tsx`, `Prompts/PromptEditor.tsx` |
| Features | Prompt library table, prompt editor, version history, version diff modal, test dataset panel, compare panel. |
| Access | AI Gateway sidebar → Prompts (hidden when flag is off). |
| e2e tests | `Clients/e2e/ai-gateway.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIGateway/Prompts/**/*.test.tsx` |
| Backend domain | `/api/ai-gateway/prompts` |
| User guide | `shared/user-guide-content/content/ai-gateway/prompts.ts`, `docs/user-guide-audit/ai-gateway/prompts.md` |

#### Models

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-gateway/models/:tab` |
| Component | `Clients/src/presentation/pages/AIGateway/Models/index.tsx` |
| Tabs | Catalog, Provider models, etc. |
| Features | Model catalog, provider model configuration, pricing, capabilities. |
| Access | AI Gateway sidebar → Models. |
| e2e tests | `Clients/e2e/ai-gateway.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIGateway/Models/index.test.tsx` |
| Backend domain | `/api/ai-gateway/models` |
| User guide | `shared/user-guide-content/content/ai-gateway/models.ts`, `docs/user-guide-audit/ai-gateway/models.md` |

#### Logs

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-gateway/logs` |
| Component | `Clients/src/presentation/pages/AIGateway/Logs/index.tsx` |
| Features | Request/response log table, filters, log detail drawer, export. |
| Access | AI Gateway sidebar → Logs. |
| e2e tests | `Clients/e2e/ai-gateway.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIGateway/Logs/**/*.test.tsx` |
| Backend domain | `/api/ai-gateway/logs` |
| User guide | `shared/user-guide-content/content/ai-gateway/logs.ts`, `docs/user-guide-audit/ai-gateway/logs.md` |

#### Virtual keys

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-gateway/virtual-keys` |
| Component | `Clients/src/presentation/pages/AIGateway/VirtualKeys/index.tsx` |
| Features | API/virtual key table, create/edit key, rate limits, scopes, active key badge. |
| Access | AI Gateway sidebar → Virtual keys. |
| e2e tests | `Clients/e2e/ai-gateway.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIGateway/VirtualKeys/index.test.tsx` |
| Backend domain | `/api/ai-gateway/virtual-keys` |
| User guide | `shared/user-guide-content/content/ai-gateway/virtual-keys.ts`, `docs/user-guide-audit/ai-gateway/virtual-keys.md` |

#### Settings

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-gateway/settings/:tab` |
| Component | `Clients/src/presentation/pages/AIGateway/Settings/index.tsx` |
| Tabs | API keys, LLM keys, Cache, Rate limits, etc. |
| Features | AI Gateway configuration, provider API keys, cache settings, rate-limit rules. |
| Access | AI Gateway sidebar → Settings. |
| e2e tests | `Clients/e2e/ai-gateway.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIGateway/Settings/index.test.tsx` |
| Backend domain | `/api/ai-gateway/settings`, `/api/ai-gateway/llm-keys`, `/api/ai-gateway/cache`, `/api/ai-gateway/rate-limits` |
| User guide | `shared/user-guide-content/content/ai-gateway/settings.ts`, `docs/user-guide-audit/ai-gateway/settings.md` |

---

### 4.12 AI Gateway — Agent Control (MCP)

#### Agent keys

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-gateway/mcp/agent-keys` |
| Component | `Clients/src/presentation/pages/AIGateway/MCPAgentKeys/index.tsx` |
| Features | Agent API key table, create/edit key, scopes, revocation. |
| Access | AI Gateway sidebar → Agent Control → Agent keys. |
| e2e tests | `Clients/e2e/ai-gateway.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIGateway/MCPAgentKeys/index.test.tsx` |
| Backend domain | `/api/ai-gateway/mcp/agent-keys` |
| User guide | `shared/user-guide-content/content/ai-gateway/mcp-agent-keys.ts`, `docs/user-guide-audit/ai-gateway/mcp-agent-keys.md` |

#### MCP servers

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-gateway/mcp/servers` |
| Component | `Clients/src/presentation/pages/AIGateway/MCPServers/index.tsx` |
| Features | MCP server registry table, add/edit server, transport config, tool listing. |
| Access | AI Gateway sidebar → Agent Control → MCP servers. |
| e2e tests | `Clients/e2e/ai-gateway.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIGateway/MCPServers/index.test.tsx` |
| Backend domain | `/api/ai-gateway/mcp/servers` |
| User guide | `shared/user-guide-content/content/ai-gateway/mcp-servers.ts`, `docs/user-guide-audit/ai-gateway/mcp-servers.md`, `docs/user-guide-audit/ai-gateway/mcp-overview.md` |

#### MCP tools

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-gateway/mcp/tools` |
| Component | `Clients/src/presentation/pages/AIGateway/MCPToolCatalog/index.tsx` |
| Features | Tool catalog, tool schema viewer, approval requirements, guardrail mappings. |
| Access | AI Gateway sidebar → Agent Control → MCP tools. |
| e2e tests | `Clients/e2e/ai-gateway.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIGateway/MCPToolCatalog/index.test.tsx` |
| Backend domain | `/api/ai-gateway/mcp/tools` |
| User guide | `shared/user-guide-content/content/ai-gateway/mcp-tools.ts`, `docs/user-guide-audit/ai-gateway/mcp-tools.md` |

#### Runs

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-gateway/mcp/runs` |
| Component | `Clients/src/presentation/pages/AIGateway/MCPRuns/index.tsx`, `MCPRuns/RunDetailDrawer.tsx` |
| Features | Agent run history table, run detail drawer with tool call trace, status filters. |
| Access | AI Gateway sidebar → Agent Control → Runs. |
| e2e tests | `Clients/e2e/ai-gateway.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIGateway/MCPRuns/index.test.tsx`, `MCPRuns/RunDetailDrawer.test.tsx` |
| Backend domain | `/api/ai-gateway/mcp/runs` |
| User guide | `shared/user-guide-content/content/ai-gateway/mcp-runs.ts` |

#### Activity (Audit)

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-gateway/mcp/audit` |
| Component | `Clients/src/presentation/pages/AIGateway/MCPAuditLog/index.tsx` |
| Features | Agent activity audit log, filters, export. |
| Access | AI Gateway sidebar → Agent Control → Activity. |
| e2e tests | `Clients/e2e/ai-gateway.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIGateway/MCPAuditLog/index.test.tsx` |
| Backend domain | `/api/ai-gateway/mcp/audit` |
| User guide | `shared/user-guide-content/content/ai-gateway/mcp-audit.ts`, `docs/user-guide-audit/ai-gateway/mcp-audit.md` |

#### Approvals

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-gateway/mcp/approvals` |
| Component | `Clients/src/presentation/pages/AIGateway/MCPApprovals/index.tsx` |
| Features | Pending and historical agent tool-call approvals, approve/reject actions. |
| Access | AI Gateway sidebar → Agent Control → Approvals. |
| e2e tests | `Clients/e2e/ai-gateway.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIGateway/MCPApprovals/index.test.tsx` |
| Backend domain | `/api/ai-gateway/mcp/approvals` |
| User guide | `shared/user-guide-content/content/ai-gateway/mcp-approvals.ts`, `docs/user-guide-audit/ai-gateway/mcp-approvals.md` |

#### MCP Guardrails

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-gateway/mcp/guardrails` |
| Component | `Clients/src/presentation/pages/AIGateway/MCPGuardrails/index.tsx` |
| Features | Agent-specific guardrails, tool-level policy rules, overrides. |
| Access | AI Gateway sidebar → Agent Control → Guardrails. |
| e2e tests | `Clients/e2e/ai-gateway.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AIGateway/MCPGuardrails/index.test.tsx` |
| Backend domain | `/api/ai-gateway/mcp/guardrails` |
| User guide | `shared/user-guide-content/content/ai-gateway/mcp-guardrails.ts`, `docs/user-guide-audit/ai-gateway/mcp-guardrails.md` |

---

### 4.13 AI Trust Index

#### Browse

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-trust-index`, `/ai-trust-index/browse` |
| Component | `Clients/src/presentation/pages/AITrustIndex/Browse/index.tsx` |
| Features | Public/private AI app directory, search, filters, app cards, score breakdown. |
| Access | App switcher → AI Trust Index → Browse. |
| e2e tests | `Clients/e2e/ai-trust-center.spec.ts` (related) |
| Unit tests | `Clients/src/presentation/pages/AITrustIndex/**/*.test.tsx` |
| Backend domain | `/api/ai-trust-index/apps` |
| User guide | `shared/user-guide-content/content/ai-trust-index/browse.ts` |

#### App detail

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-trust-index/:slug` |
| Component | `Clients/src/presentation/pages/AITrustIndex/AppDetail/index.tsx` |
| Features | App score breakdown, insights, trust badge, track/untrack action. |
| Access | Browse → app card. |
| Unit tests | `Clients/src/presentation/pages/AITrustIndex/AppDetail/**/*.test.tsx` |
| Backend domain | `/api/ai-trust-index/apps/:slug` |
| User guide | `shared/user-guide-content/content/ai-trust-index/dashboard.ts` |

#### Tracked

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-trust-index/tracked` |
| Component | `Clients/src/presentation/pages/AITrustIndex/Tracked/index.tsx` |
| Features | List of apps tracked by the organization, alerts, score changes. |
| Access | AI Trust Index sidebar → Tracked. |
| Unit tests | `Clients/src/presentation/pages/AITrustIndex/Tracked/**/*.test.tsx` |
| Backend domain | `/api/ai-trust-index/tracked` |
| User guide | `shared/user-guide-content/content/ai-trust-index/tracked.ts` |

#### Settings

| Attribute | Value |
|-----------|-------|
| Routes | `/ai-trust-index/settings` |
| Component | `Clients/src/presentation/pages/AITrustIndex/Settings/index.tsx` |
| Features | Data sources, scoring weights, update frequency, admin configuration. |
| Access | AI Trust Index sidebar → Settings (admin only). |
| Unit tests | `Clients/src/presentation/pages/AITrustIndex/Settings/**/*.test.tsx` |
| Backend domain | `/api/ai-trust-index/settings` |
| User guide | `shared/user-guide-content/content/ai-trust-index/settings.ts` |

---

### 4.14 Super Admin

#### Organizations

| Attribute | Value |
|-----------|-------|
| Routes | `/super-admin` |
| Component | `Clients/src/presentation/pages/SuperAdmin/Organizations/index.tsx` |
| Features | Tenant/organization table, create/edit organization, navigate to org users. |
| Access | App switcher → Super Admin (SuperAdmin only). |
| e2e tests | `Clients/e2e/super-admin.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/SuperAdmin/Organizations/**/*.test.tsx` |
| Backend domain | `/api/super-admin/organizations` |
| User guide | `shared/user-guide-content/content/settings/super-admin.ts`, `docs/user-guide-audit/settings/super-admin.md` |

#### All users / Organization users

| Attribute | Value |
|-----------|-------|
| Routes | `/super-admin/users`, `/super-admin/organizations/:id/users` |
| Component | `Clients/src/presentation/pages/SuperAdmin/AllUsers/index.tsx`, `SuperAdmin/Users/index.tsx` |
| Features | User table, create/edit user, assign organization/role, impersonation helpers. |
| Access | Super Admin sidebar → Users; Organizations → users. |
| e2e tests | `Clients/e2e/super-admin.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/SuperAdmin/**/*.test.tsx` |
| Backend domain | `/api/super-admin/users`, `/api/super-admin/organizations/:id/users` |
| User guide | `shared/user-guide-content/content/settings/user-management.ts`, `docs/user-guide-audit/settings/user-management.md` |

#### Super Admin settings

| Attribute | Value |
|-----------|-------|
| Routes | `/super-admin/settings`, `/super-admin/settings/:tab` |
| Component | `Clients/src/presentation/pages/SuperAdmin/Settings/index.tsx` |
| Features | System-level settings (email, security, licensing, maintenance). |
| Access | Super Admin sidebar → Settings. |
| e2e tests | `Clients/e2e/super-admin.spec.ts` |
| Backend domain | `/api/super-admin/settings` |
| User guide | `shared/user-guide-content/content/settings/organization-settings.ts`, `docs/user-guide-audit/settings/organization-settings.md` |

---

### 4.15 Public

#### Public AI Trust Centre

| Attribute | Value |
|-----------|-------|
| Routes | `/aiTrustCentre/:hash` |
| Component | `Clients/src/presentation/pages/AITrustCentrePublic/index.tsx` |
| Tabs | Overview, Resources, Subprocessors. |
| Features | Public, unauthenticated trust center page for an organization, custom branding, subprocessors table, resources list. |
| Access | External shared link. |
| e2e tests | `Clients/e2e/ai-trust-center.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/AITrustCentrePublic/__tests__/AITrustCentrePublic.test.tsx` |
| Backend domain | `/api/ai-trust-centre/:hash` |

#### Shared views

| Attribute | Value |
|-----------|-------|
| Routes | `/shared/:resourceType/:token` |
| Component | `Clients/src/presentation/pages/SharedView/index.tsx` |
| Features | Public, read-only shared view of a model inventory, vendor, or risk table; respects share settings (export, open records). |
| Access | Shared link generated from in-app Share button. |
| e2e tests | `Clients/e2e/ai-governance/share-links.md` |
| Unit tests | `Clients/src/presentation/pages/SharedView/**/*.test.tsx` |
| Backend domain | `/api/shared/:resourceType/:token`, `/api/share` |
| User guide | `shared/user-guide-content/content/ai-governance/share-links.ts`, `docs/user-guide-audit/ai-governance/share-links.md` |

#### Public intake forms

| Attribute | Value |
|-----------|-------|
| Routes | `/:publicId/use-case-form-intake`, `/:publicId/use-case-form-intake/success`, `/intake/:tenantSlug/:formSlug`, `/intake/:tenantSlug/:formSlug/success` |
| Component | `Clients/src/presentation/pages/PublicIntakeForm/index.tsx`, `SubmissionSuccess.tsx` |
| Features | Public, unauthenticated multi-step intake form, field validation, file upload, submission success page. |
| Access | Public link generated from Intake Form Builder. |
| e2e tests | `Clients/e2e/public-intake-form.spec.ts`, `Clients/e2e/intake-forms.spec.ts` |
| Unit tests | `Clients/src/presentation/pages/PublicIntakeForm/**/*.test.tsx` |
| Backend domain | `/api/intake-forms/public/:publicId`, `/api/intake-submissions` |
| User guide | `shared/user-guide-content/content/ai-governance/intake-forms.ts`, `docs/user-guide-audit/ai-governance/intake-forms.md` |

---

### 4.16 Development-only

| Route | Component | Purpose |
|-------|-----------|---------|
| `/reactflow-demo` | `pages/ReactFlowDemo/index.tsx` | React Flow graph experiments. |
| `/wizard-showcase` | `pages/WizardShowcase/index.tsx` | Wizard/stepper component showcase. |
| `/style-guide/:section?` | `pages/StyleGuide/index.tsx` | Design-system component gallery. |

These routes are only registered when `import.meta.env.DEV` is true.

---

## 5. Feature flags / gated routes

All feature flags are compile-time constants in `Clients/src/application/config/featureFlags.ts` or local constants in consuming files.

| Flag | Location | Default | Effect |
|------|----------|---------|--------|
| `SHOW_AI_GATEWAY_PROMPTS` | `application/config/featureFlags.ts` | `false` | Hides `/ai-gateway/prompts` and `/ai-gateway/prompts/:id` routes; hides the Prompts sidebar item; disables the prompts badge fetch in `AIGatewaySidebar.context.tsx`; hides prompts from endpoints prompt-template picker; unregisters the user-guide article. |
| `SHOW_AI_AGENT_DASHBOARD_TABS` | `pages/DashboardOverview/IntegratedDashboard.tsx` | `false` | Hides the Audit readiness, AI content review, and AI audit dashboard tabs and the customizable tab bar. Keeps the underlying pages and `/ai-audit` route reachable by direct URL. |
| `SHOW_AI_APPROVAL_RULES` | `pages/SettingsPage/index.tsx` | `false` | Hides the "AI Approval Rules" tab in Settings. |
| `ssoFeatureEnabled` | `application/hooks/useSsoFeatureEnabled.ts` | Backend-driven | Shows/hides Microsoft SSO login, SSO settings tab, and the Microsoft callback route registration depends on backend config. |
| `isEnabled(extensionKey)` | `application/contexts/Extensions.context.tsx` | Per-tenant config | Shows/hides extension tabs in Model inventory, Extensions settings, MegaDropdown Add new items, and dataset bulk upload. |
| `import.meta.env.DEV` | `application/config/routes.tsx` | Build-time | Registers `/reactflow-demo`, `/wizard-showcase`, `/style-guide/:section?`. |

---

## 6. Public / unauthenticated routes

Routes that do not require authentication:

| Route(s) | Purpose |
|----------|---------|
| `/login` | User login. |
| `/user-reg` | First user registration (only when no users exist). |
| `/forgot-password`, `/reset-password`, `/set-new-password`, `/reset-password-continue` | Password reset flow. |
| `/auth/microsoft/callback` | SSO callback (protected by state, no session yet). |
| `/aiTrustCentre/:hash` | Public AI Trust Centre for an organization. |
| `/shared/:resourceType/:token` | Public shared view of a resource table. |
| `/:publicId/use-case-form-intake` and success page | Public use-case intake form (new format). |
| `/intake/:tenantSlug/:formSlug` and success page | Legacy public intake form format. |

The `App.tsx` `PUBLIC_ROUTE_PATTERNS` array prevents the user-guide sidebar from rendering on these routes.

---

## 7. Notable caveats

1. **Governance OS routes are disabled.** The large `GovernanceOS` module (Hub, Framework Mapper, Scenario Builder, Unified Insights, Evidence Hub, Knowledge Graph, Regulatory Radar, Settings) is commented out of `routes.tsx`. The files remain in `Clients/src/presentation/pages/GovernanceOS/` and components in `Clients/src/presentation/components/GovernanceOS/`, but the routes are not registered and command-palette navigation is intentionally removed. The module can be re-enabled by uncommenting the imports and route block in `routes.tsx`.

2. **AI Agent dashboard tabs are hidden.** `IntegratedDashboard.tsx` sets `SHOW_AI_AGENT_DASHBOARD_TABS = false`, so only the Overview tab is shown. The `ReadinessDashboard`, `AIContentReview`, and `AIAuditDashboard` sub-pages are still importable and the `/ai-audit` route still exists.

3. **AI Gateway Prompts is hidden.** `SHOW_AI_GATEWAY_PROMPTS = false` removes the route and sidebar item. The `Prompts` page, editor, backend router, and database tables remain in place.

4. **Settings AI Approval Rules tab is hidden.** `SHOW_AI_APPROVAL_RULES = false` removes the tab from Settings.

5. **Bootstrap SuperAdmin is pinned to `/super-admin`.** `ProtectedRoute` detects a SuperAdmin JWT without an `organizationId` and redirects them away from tenant routes, preventing 401s from org-scoped hooks.

6. **Legacy `/public` route is removed.** The commented-out `/public` route for the AI Trust Centre was replaced by `/aiTrustCentre/:hash`.

7. **SSE notifications are disabled.** The `useNotifications` hook is commented out in `App.tsx`.

8. **Route aliases.** `/setting` redirects to `/settings`; `/register` and `/admin-reg` redirect to `/login`.

9. **Module sidebars are context-provided.** `Dashboard.tsx` wraps the whole layout in `EvalsSidebarProvider`, `AIDetectionSidebarProvider`, `ShadowAISidebarProvider`, `AIGatewaySidebarProvider`, and `AITrustIndexSidebarProvider` so `ContextSidebar` can safely read their state even when inactive.

10. **Lazy fallback.** Non-shell routes are code-split; all use the same `<LazyFallback />` component while loading.

---

## Appendix: File index quick reference

| Concern | Primary files |
|---------|---------------|
| App shell | `Clients/src/App.tsx`, `Clients/src/main.tsx` |
| Routes | `Clients/src/application/config/routes.tsx` |
| Route guard | `Clients/src/presentation/components/ProtectedRoute/index.tsx` |
| Layouts | `Clients/src/presentation/containers/Dashboard/index.tsx`, `Clients/src/presentation/containers/SuperAdminLayout/index.tsx` |
| Navigation | `Clients/src/presentation/components/Sidebar/index.tsx`, `Clients/src/presentation/components/AppSwitcher/index.tsx`, `Clients/src/presentation/components/ContextSidebar/index.tsx` |
| Command palette | `Clients/src/presentation/components/CommandPalette/index.tsx`, `Clients/src/application/commands/registry.ts` |
| Feature flags | `Clients/src/application/config/featureFlags.ts` |
| User guide content | `shared/user-guide-content/content/**/*.ts` |
| User guide audit docs | `docs/user-guide-audit/**/*.md` |
| e2e tests | `Clients/e2e/*.spec.ts` |

