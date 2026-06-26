import { Suspense } from "react";
import { Route, Navigate } from "react-router-dom";
import { lazyRoute, LazyFallback } from "../utils/lazyRoute";
import { SHOW_AI_GATEWAY_PROMPTS } from "./featureFlags";

// Eager imports — app shell, route guard, and Use cases page (mounts with layout for table skeleton UX)
import Dashboard from "../../presentation/containers/Dashboard";
import ProtectedRoute from "../../presentation/components/ProtectedRoute";
import VWHome from "../../presentation/pages/Home/1.0Home";

// ── Authentication routes ─────────────────────────────────────────────
const Login = lazyRoute(() => import("../../presentation/pages/Authentication/Login"));
const ForgotPassword = lazyRoute(
  () => import("../../presentation/pages/Authentication/ForgotPassword"),
);
const ResetPassword = lazyRoute(
  () => import("../../presentation/pages/Authentication/ResetPassword"),
);
const SetNewPassword = lazyRoute(
  () => import("../../presentation/pages/Authentication/SetNewPassword"),
);
const ResetPasswordContinue = lazyRoute(
  () => import("../../presentation/pages/Authentication/ResetPasswordContinue"),
);
const MicrosoftCallback = lazyRoute(
  () => import("../../presentation/pages/Authentication/MicrosoftCallback"),
);
const RegisterUser = lazyRoute(
  () => import("../../presentation/pages/Authentication/RegisterUser"),
);

// ── Core dashboard routes ─────────────────────────────────────────────
const Vendors = lazyRoute(() => import("../../presentation/pages/Vendors"));
const Setting = lazyRoute(() => import("../../presentation/pages/SettingsPage"));
const Organization = lazyRoute(() => import("../../presentation/pages/SettingsPage/Organization"));
const FileManager = lazyRoute(() => import("../../presentation/pages/FileManager"));
const Reporting = lazyRoute(() => import("../../presentation/pages/Reporting"));
const IntegratedDashboard = lazyRoute(
  () => import("../../presentation/pages/DashboardOverview/IntegratedDashboard"),
);
const StartHere = lazyRoute(() => import("../../presentation/pages/StartHere"));
const VWProjectView = lazyRoute(
  () => import("../../presentation/pages/ProjectView/V1.0ProjectView"),
);
const PageNotFound = lazyRoute(() => import("../../presentation/pages/PageNotFound"));

// ── Compliance & framework routes ─────────────────────────────────────
const Framework = lazyRoute(() => import("../../presentation/pages/Framework"));
const Training = lazyRoute(() => import("../../presentation/pages/TrainingRegistar"));
const PolicyDashboard = lazyRoute(
  () => import("../../presentation/pages/PolicyDashboard/PoliciesDashboard"),
);
const PolicyEditorPage = lazyRoute(
  () => import("../../presentation/pages/PolicyDashboard/PolicyEditorPage"),
);
const WatchTower = lazyRoute(() => import("../../presentation/pages/WatchTower"));
const RiskManagement = lazyRoute(() => import("../../presentation/pages/RiskManagement"));
const Tasks = lazyRoute(() => import("../../presentation/pages/Tasks"));
const AutomationsPage = lazyRoute(() => import("../../presentation/pages/Automations"));
const ApprovalWorkflows = lazyRoute(() => import("../../presentation/pages/ApprovalWorkflows"));
const IncidentManagement = lazyRoute(() => import("../../presentation/pages/IncidentManagement"));

// ── AI feature routes ─────────────────────────────────────────────────
const EvalsDashboard = lazyRoute(
  () => import("../../presentation/pages/EvalsDashboard/EvalsDashboard"),
);
const OrgSettings = lazyRoute(() => import("../../presentation/pages/EvalsDashboard/OrgSettings"));
const DatasetEditorPage = lazyRoute(
  () => import("../../presentation/pages/EvalsDashboard/DatasetEditorPage"),
);
const AgentDiscovery = lazyRoute(() => import("../../presentation/pages/AgentDiscovery"));
const ModelInventory = lazyRoute(() => import("../../presentation/pages/ModelInventory"));
const AIApps = lazyRoute(() => import("../../presentation/pages/AIApps"));
const ModelLifecycleDetail = lazyRoute(
  () => import("../../presentation/pages/ModelInventory/ModelLifecycleDetail"),
);
const Datasets = lazyRoute(() => import("../../presentation/pages/Datasets"));
const AITrustCenter = lazyRoute(() => import("../../presentation/pages/AITrustCenter"));

// ── AI Detection & Shadow AI routes ───────────────────────────────────
const ScanPage = lazyRoute(() => import("../../presentation/pages/AIDetection/ScanPage"));
const HistoryPage = lazyRoute(() => import("../../presentation/pages/AIDetection/HistoryPage"));
const AIDetectionSettingsPage = lazyRoute(
  () => import("../../presentation/pages/AIDetection/SettingsPage"),
);
const RepositoriesPage = lazyRoute(
  () => import("../../presentation/pages/AIDetection/RepositoriesPage"),
);
const ScanDetailsPage = lazyRoute(
  () => import("../../presentation/pages/AIDetection/ScanDetailsPage"),
);
// ── AI Trust Index routes ─────────────────────────────────────────────
const AITrustIndex = lazyRoute(() => import("../../presentation/pages/AITrustIndex"));
const AITrustIndexBrowse = lazyRoute(() => import("../../presentation/pages/AITrustIndex/Browse"));
const AITrustIndexTracked = lazyRoute(
  () => import("../../presentation/pages/AITrustIndex/Tracked"),
);
const AITrustIndexSettings = lazyRoute(
  () => import("../../presentation/pages/AITrustIndex/Settings"),
);
const AITrustIndexDetail = lazyRoute(
  () => import("../../presentation/pages/AITrustIndex/AppDetail"),
);

const InsightsPage = lazyRoute(() => import("../../presentation/pages/ShadowAI/InsightsPage"));
const UserActivityPage = lazyRoute(
  () => import("../../presentation/pages/ShadowAI/UserActivityPage"),
);
const AIToolsPage = lazyRoute(() => import("../../presentation/pages/ShadowAI/AIToolsPage"));
const RulesPage = lazyRoute(() => import("../../presentation/pages/ShadowAI/RulesPage"));
const ShadowAISettingsPage = lazyRoute(
  () => import("../../presentation/pages/ShadowAI/SettingsPage"),
);

// ── AI Gateway & MCP routes ───────────────────────────────────────────
const AIGatewayEndpointsPage = lazyRoute(
  () => import("../../presentation/pages/AIGateway/Endpoints"),
);
const AIGatewayAnalyticsPage = lazyRoute(
  () => import("../../presentation/pages/AIGateway/SpendDashboard"),
);
const AIGatewayPlaygroundPage = lazyRoute(
  () => import("../../presentation/pages/AIGateway/Playground"),
);
const AIGatewayGuardrailsPage = lazyRoute(
  () => import("../../presentation/pages/AIGateway/Guardrails"),
);
const AIGatewayLogsPage = lazyRoute(() => import("../../presentation/pages/AIGateway/Logs"));
const AIGatewayModelsPage = lazyRoute(() => import("../../presentation/pages/AIGateway/Models"));
const AIGatewaySettingsPage = lazyRoute(
  () => import("../../presentation/pages/AIGateway/Settings"),
);
const AIGatewayVirtualKeysPage = lazyRoute(
  () => import("../../presentation/pages/AIGateway/VirtualKeys"),
);
const AIGatewayPromptsPage = lazyRoute(() => import("../../presentation/pages/AIGateway/Prompts"));
const AIGatewayPromptEditorPage = lazyRoute(
  () => import("../../presentation/pages/AIGateway/Prompts/PromptEditor"),
);
const MCPAgentKeysPage = lazyRoute(() => import("../../presentation/pages/AIGateway/MCPAgentKeys"));
const MCPServersPage = lazyRoute(() => import("../../presentation/pages/AIGateway/MCPServers"));
const MCPToolCatalogPage = lazyRoute(
  () => import("../../presentation/pages/AIGateway/MCPToolCatalog"),
);
const MCPRunsPage = lazyRoute(() => import("../../presentation/pages/AIGateway/MCPRuns"));
const MCPAuditLogPage = lazyRoute(() => import("../../presentation/pages/AIGateway/MCPAuditLog"));
const MCPApprovalsPage = lazyRoute(() => import("../../presentation/pages/AIGateway/MCPApprovals"));
const MCPGuardrailsPage = lazyRoute(
  () => import("../../presentation/pages/AIGateway/MCPGuardrails"),
);

/*
// ── Governance OS routes ─────────────────────────────────────────────
const GovernanceOS = lazyRoute(() => import("../../presentation/pages/GovernanceOS"));

// ── Governance Intelligence module routes ─────────────────────────────
const GovernanceHub = lazyRoute(() => import("../../presentation/pages/GovernanceOS/Hub"));
const FrameworkMapperModule = lazyRoute(
  () => import("../../presentation/pages/GovernanceOS/FrameworkMapperModule"),
);
const ScenarioBuilderModule = lazyRoute(
  () => import("../../presentation/pages/GovernanceOS/ScenarioBuilderModule"),
);
const UnifiedInsightsModule = lazyRoute(
  () => import("../../presentation/pages/GovernanceOS/UnifiedInsightsModule"),
);
const GovernanceSettings = lazyRoute(
  () => import("../../presentation/pages/GovernanceOS/Settings"),
);
const EvidenceHub = lazyRoute(() => import("../../presentation/pages/GovernanceOS/EvidenceHub"));
const KnowledgeGraph = lazyRoute(
  () => import("../../presentation/pages/GovernanceOS/KnowledgeGraph"),
);
const RegulatoryRadar = lazyRoute(
  () => import("../../presentation/pages/GovernanceOS/RegulatoryRadar"),
);

Governance OS routes are disabled while the module is not broadly released.
*/

// ── Remaining routes ──────────────────────────────────────────────────
const Plugins = lazyRoute(() => import("../../presentation/pages/Plugins"));
const PluginManagement = lazyRoute(
  () => import("../../presentation/pages/Plugins/PluginManagement"),
);
const SuperAdminOrganizations = lazyRoute(
  () => import("../../presentation/pages/SuperAdmin/Organizations"),
);
const SuperAdminUsers = lazyRoute(() => import("../../presentation/pages/SuperAdmin/Users"));
const SuperAdminAllUsers = lazyRoute(() => import("../../presentation/pages/SuperAdmin/AllUsers"));
const SuperAdminSettings = lazyRoute(() => import("../../presentation/pages/SuperAdmin/Settings"));
const MonitoringForm = lazyRoute(
  () => import("../../presentation/pages/PostMarketMonitoring/MonitoringForm"),
);
const ReportsArchive = lazyRoute(
  () => import("../../presentation/pages/PostMarketMonitoring/ReportsArchive"),
);
const IntakeFormsListPage = lazyRoute(
  () => import("../../presentation/pages/IntakeFormBuilder/IntakeFormsListPage"),
);
const IntakeFormBuilder = lazyRoute(() => import("../../presentation/pages/IntakeFormBuilder"));
const PublicIntakeForm = lazyRoute(() => import("../../presentation/pages/PublicIntakeForm"));
const SubmissionSuccess = lazyRoute(
  () => import("../../presentation/pages/PublicIntakeForm/SubmissionSuccess"),
);
const AITrustCentrePublic = lazyRoute(() => import("../../presentation/pages/AITrustCentrePublic"));
const SharedView = lazyRoute(() => import("../../presentation/pages/SharedView"));

// ── Dev-only routes ───────────────────────────────────────────────────
const StyleGuide = lazyRoute(() => import("../../presentation/pages/StyleGuide"));
const ReactFlowDemo = lazyRoute(() => import("../../presentation/pages/ReactFlowDemo"));
const WizardShowcase = lazyRoute(() => import("../../presentation/pages/WizardShowcase"));

// Check if we're in development mode
const isDev = import.meta.env.DEV;

export const createRoutes = (
  triggerSidebar: boolean,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _triggerSidebarReload: () => void,
) => [
  // ReactFlow Demo - Development only (must be before dashboard route)
  ...(isDev
    ? [
        <Route
          key="reactflow-demo"
          path="/reactflow-demo"
          element={
            <Suspense fallback={<LazyFallback />}>
              <ReactFlowDemo />
            </Suspense>
          }
        />,
      ]
    : []),
  // Wizard Showcase - Development only
  ...(isDev
    ? [
        <Route
          key="wizard-showcase"
          path="/wizard-showcase"
          element={
            <Suspense fallback={<LazyFallback />}>
              <WizardShowcase />
            </Suspense>
          }
        />,
      ]
    : []),
  <Route
    key="dashboard"
    path="/"
    element={<ProtectedRoute Component={Dashboard} reloadTrigger={triggerSidebar} />}
  >
    <Route
      path="/vendors"
      element={
        <Suspense fallback={<LazyFallback />}>
          <Vendors />
        </Suspense>
      }
    >
      <Route
        index
        element={
          <Suspense fallback={<LazyFallback />}>
            <Vendors />
          </Suspense>
        }
      />{" "}
      {/* Default tab */}
      <Route
        path="risks"
        element={
          <Suspense fallback={<LazyFallback />}>
            <Vendors />
          </Suspense>
        }
      />{" "}
      {/* Risks tab */}
    </Route>

    <Route
      path="/settings"
      element={
        <Suspense fallback={<LazyFallback />}>
          <Setting />
        </Suspense>
      }
    />
    <Route
      path="/settings/:tab"
      element={
        <Suspense fallback={<LazyFallback />}>
          <Setting />
        </Suspense>
      }
    />
    <Route
      path="/plugins"
      element={
        <Suspense fallback={<LazyFallback />}>
          <Plugins />
        </Suspense>
      }
    />
    <Route
      path="/plugins/marketplace"
      element={
        <Suspense fallback={<LazyFallback />}>
          <Plugins />
        </Suspense>
      }
    />
    <Route
      path="/plugins/my-plugins"
      element={
        <Suspense fallback={<LazyFallback />}>
          <Plugins />
        </Suspense>
      }
    />
    <Route
      path="/plugins/:pluginKey/manage"
      element={
        <Suspense fallback={<LazyFallback />}>
          <PluginManagement />
        </Suspense>
      }
    />
    <Route path="/setting" element={<Navigate to="/settings" replace />} />
    <Route
      path="/organization"
      element={
        <Suspense fallback={<LazyFallback />}>
          <Organization />
        </Suspense>
      }
    />
    <Route
      path="/file-manager"
      element={
        <Suspense fallback={<LazyFallback />}>
          <FileManager />
        </Suspense>
      }
    />
    <Route
      path="/reporting"
      element={
        <Suspense fallback={<LazyFallback />}>
          <Reporting />
        </Suspense>
      }
    />
    <Route
      index
      element={
        <Suspense fallback={<LazyFallback />}>
          <IntegratedDashboard />
        </Suspense>
      }
    />
    <Route
      path="/start-here"
      element={
        <Suspense fallback={<LazyFallback />}>
          <StartHere />
        </Suspense>
      }
    />
    <Route path="/overview" element={<VWHome />} />
    <Route
      path="/framework/:tab?"
      element={
        <Suspense fallback={<LazyFallback />}>
          <Framework />
        </Suspense>
      }
    />
    {/*
    Governance OS routes are disabled while the module is not broadly released.
    <Route
      path="/governance-os/:tab?"
      element={
        <Suspense fallback={<LazyFallback />}>
          <GovernanceOS />
        </Suspense>
      }
    />
    <Route
      path="/governance"
      element={
        <Suspense fallback={<LazyFallback />}>
          <GovernanceHub />
        </Suspense>
      }
    />
    <Route
      path="/governance/framework-mapper"
      element={
        <Suspense fallback={<LazyFallback />}>
          <FrameworkMapperModule />
        </Suspense>
      }
    />
    <Route
      path="/governance/scenarios"
      element={
        <Suspense fallback={<LazyFallback />}>
          <ScenarioBuilderModule />
        </Suspense>
      }
    />
    <Route
      path="/governance/insights"
      element={
        <Suspense fallback={<LazyFallback />}>
          <UnifiedInsightsModule />
        </Suspense>
      }
    />
    <Route
      path="/governance/settings"
      element={
        <Suspense fallback={<LazyFallback />}>
          <GovernanceSettings />
        </Suspense>
      }
    />
    <Route
      path="/governance/evidence"
      element={
        <Suspense fallback={<LazyFallback />}>
          <EvidenceHub />
        </Suspense>
      }
    />
    <Route
      path="/governance/knowledge-graph"
      element={
        <Suspense fallback={<LazyFallback />}>
          <KnowledgeGraph />
        </Suspense>
      }
    />
    <Route
      path="/governance/regulatory-radar"
      element={
        <Suspense fallback={<LazyFallback />}>
          <RegulatoryRadar />
        </Suspense>
      }
    />
    <Route path="/governance-os/*" element={<Navigate to="/governance" replace />} />
    */}
    <Route
      path="/project-view"
      element={
        <Suspense fallback={<LazyFallback />}>
          <VWProjectView />
        </Suspense>
      }
    />
    <Route
      path="/evals"
      element={
        <Suspense fallback={<LazyFallback />}>
          <EvalsDashboard />
        </Suspense>
      }
    />
    <Route
      path="/evals/:projectId"
      element={
        <Suspense fallback={<LazyFallback />}>
          <EvalsDashboard />
        </Suspense>
      }
    />
    <Route
      path="/evals/:projectId/datasets/editor"
      element={
        <Suspense fallback={<LazyFallback />}>
          <DatasetEditorPage />
        </Suspense>
      }
    />
    <Route
      path="/evals/settings"
      element={
        <Suspense fallback={<LazyFallback />}>
          <OrgSettings />
        </Suspense>
      }
    />
    <Route
      path="/training"
      element={
        <Suspense fallback={<LazyFallback />}>
          <Training />
        </Suspense>
      }
    />
    <Route
      path="/training/evidence-hub"
      element={
        <Suspense fallback={<LazyFallback />}>
          <Training />
        </Suspense>
      }
    />
    <Route
      path="/ai-trust-center"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AITrustCenter />
        </Suspense>
      }
    />
    <Route
      path="/ai-trust-center/:tab"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AITrustCenter />
        </Suspense>
      }
    />
    <Route
      path="/policies/new"
      element={
        <Suspense fallback={<LazyFallback />}>
          <PolicyEditorPage />
        </Suspense>
      }
    />
    <Route
      path="/policies/:id/edit"
      element={
        <Suspense fallback={<LazyFallback />}>
          <PolicyEditorPage />
        </Suspense>
      }
    />
    <Route
      path="/policies"
      element={
        <Suspense fallback={<LazyFallback />}>
          <PolicyDashboard />
        </Suspense>
      }
    >
      <Route
        index
        element={
          <Suspense fallback={<LazyFallback />}>
            <PolicyDashboard />
          </Suspense>
        }
      />{" "}
      {/* Default tab */}
      <Route
        path="templates"
        element={
          <Suspense fallback={<LazyFallback />}>
            <PolicyDashboard />
          </Suspense>
        }
      />{" "}
      {/* Policy Templates tab */}
    </Route>
    <Route
      path="/event-tracker"
      element={
        <Suspense fallback={<LazyFallback />}>
          <WatchTower />
        </Suspense>
      }
    />
    <Route
      path="/event-tracker/logs"
      element={
        <Suspense fallback={<LazyFallback />}>
          <WatchTower />
        </Suspense>
      }
    />
    <Route
      path="/ai-apps"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AIApps />
        </Suspense>
      }
    />
    <Route
      path="/ai-apps/:id"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AIApps />
        </Suspense>
      }
    />
    <Route
      path="/model-inventory"
      element={
        <Suspense fallback={<LazyFallback />}>
          <ModelInventory />
        </Suspense>
      }
    />
    <Route
      path="/model-inventory/model-risks"
      element={
        <Suspense fallback={<LazyFallback />}>
          <ModelInventory />
        </Suspense>
      }
    />
    <Route
      path="/datasets"
      element={
        <Suspense fallback={<LazyFallback />}>
          <Datasets />
        </Suspense>
      }
    />
    <Route
      path="/model-inventory/evidence-hub"
      element={
        <Suspense fallback={<LazyFallback />}>
          <ModelInventory />
        </Suspense>
      }
    />
    {/* Model lifecycle detail page - rendered by plugin */}
    <Route
      path="/model-inventory/models/:id"
      element={
        <Suspense fallback={<LazyFallback />}>
          <ModelLifecycleDetail />
        </Suspense>
      }
    />
    {/* Dynamic route for plugin tabs (e.g., mlflow, other future plugins) */}
    <Route
      path="/model-inventory/:pluginTab"
      element={
        <Suspense fallback={<LazyFallback />}>
          <ModelInventory />
        </Suspense>
      }
    />
    <Route
      path="/risk-management"
      element={
        <Suspense fallback={<LazyFallback />}>
          <RiskManagement />
        </Suspense>
      }
    />
    <Route
      path="/tasks"
      element={
        <Suspense fallback={<LazyFallback />}>
          <Tasks />
        </Suspense>
      }
    />
    <Route
      path="/automations"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AutomationsPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-incident-managements"
      element={
        <Suspense fallback={<LazyFallback />}>
          <IncidentManagement />
        </Suspense>
      }
    />
    <Route
      path="/agent-discovery"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AgentDiscovery />
        </Suspense>
      }
    />
    <Route
      path="/approval-workflows"
      element={
        <Suspense fallback={<LazyFallback />}>
          <ApprovalWorkflows />
        </Suspense>
      }
    />
    <Route path="/ai-detection" element={<Navigate to="/ai-detection/scan" replace />} />
    <Route
      path="/ai-detection/scan"
      element={
        <Suspense fallback={<LazyFallback />}>
          <ScanPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-detection/repositories"
      element={
        <Suspense fallback={<LazyFallback />}>
          <RepositoriesPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-detection/history"
      element={
        <Suspense fallback={<LazyFallback />}>
          <HistoryPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-detection/settings"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AIDetectionSettingsPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-detection/scans/:scanId"
      element={
        <Suspense fallback={<LazyFallback />}>
          <ScanDetailsPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-detection/scans/:scanId/:tab"
      element={
        <Suspense fallback={<LazyFallback />}>
          <ScanDetailsPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-trust-index"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AITrustIndex />
        </Suspense>
      }
    />
    <Route
      path="/ai-trust-index/browse"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AITrustIndexBrowse />
        </Suspense>
      }
    />
    <Route
      path="/ai-trust-index/tracked"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AITrustIndexTracked />
        </Suspense>
      }
    />
    <Route
      path="/ai-trust-index/settings"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AITrustIndexSettings />
        </Suspense>
      }
    />
    <Route
      path="/ai-trust-index/:slug"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AITrustIndexDetail />
        </Suspense>
      }
    />
    <Route path="/shadow-ai" element={<Navigate to="/shadow-ai/insights" replace />} />
    <Route
      path="/shadow-ai/insights"
      element={
        <Suspense fallback={<LazyFallback />}>
          <InsightsPage />
        </Suspense>
      }
    />
    <Route
      path="/shadow-ai/user-activity"
      element={
        <Suspense fallback={<LazyFallback />}>
          <UserActivityPage />
        </Suspense>
      }
    />
    <Route
      path="/shadow-ai/user-activity/users"
      element={
        <Suspense fallback={<LazyFallback />}>
          <UserActivityPage />
        </Suspense>
      }
    />
    <Route
      path="/shadow-ai/user-activity/departments"
      element={
        <Suspense fallback={<LazyFallback />}>
          <UserActivityPage />
        </Suspense>
      }
    />
    <Route
      path="/shadow-ai/tools"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AIToolsPage />
        </Suspense>
      }
    />
    <Route
      path="/shadow-ai/tools/:toolId"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AIToolsPage />
        </Suspense>
      }
    />
    <Route
      path="/shadow-ai/rules"
      element={
        <Suspense fallback={<LazyFallback />}>
          <RulesPage />
        </Suspense>
      }
    />
    <Route
      path="/shadow-ai/rules/alerts"
      element={
        <Suspense fallback={<LazyFallback />}>
          <RulesPage />
        </Suspense>
      }
    />
    <Route
      path="/shadow-ai/settings"
      element={
        <Suspense fallback={<LazyFallback />}>
          <ShadowAISettingsPage />
        </Suspense>
      }
    />
    <Route path="/ai-gateway" element={<Navigate to="/ai-gateway/dashboard" replace />} />
    <Route
      path="/ai-gateway/endpoints"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AIGatewayEndpointsPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-gateway/dashboard"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AIGatewayAnalyticsPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-gateway/playground"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AIGatewayPlaygroundPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-gateway/guardrails"
      element={<Navigate to="/ai-gateway/guardrails/pii" replace />}
    />
    <Route
      path="/ai-gateway/guardrails/:tab"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AIGatewayGuardrailsPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-gateway/models"
      element={<Navigate to="/ai-gateway/models/catalog" replace />}
    />
    <Route
      path="/ai-gateway/models/:tab"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AIGatewayModelsPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-gateway/logs"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AIGatewayLogsPage />
        </Suspense>
      }
    />
    {/* Prompts routes are gated behind SHOW_AI_GATEWAY_PROMPTS. */}
    {SHOW_AI_GATEWAY_PROMPTS && (
      <Route
        path="/ai-gateway/prompts"
        element={
          <Suspense fallback={<LazyFallback />}>
            <AIGatewayPromptsPage />
          </Suspense>
        }
      />
    )}
    {SHOW_AI_GATEWAY_PROMPTS && (
      <Route
        path="/ai-gateway/prompts/:id"
        element={
          <Suspense fallback={<LazyFallback />}>
            <AIGatewayPromptEditorPage />
          </Suspense>
        }
      />
    )}
    <Route
      path="/ai-gateway/virtual-keys"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AIGatewayVirtualKeysPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-gateway/settings"
      element={<Navigate to="/ai-gateway/settings/api-keys" replace />}
    />
    <Route
      path="/ai-gateway/settings/:tab"
      element={
        <Suspense fallback={<LazyFallback />}>
          <AIGatewaySettingsPage />
        </Suspense>
      }
    />
    <Route path="/ai-gateway/mcp" element={<Navigate to="/ai-gateway/mcp/agent-keys" replace />} />
    <Route
      path="/ai-gateway/mcp/agent-keys"
      element={
        <Suspense fallback={<LazyFallback />}>
          <MCPAgentKeysPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-gateway/mcp/servers"
      element={
        <Suspense fallback={<LazyFallback />}>
          <MCPServersPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-gateway/mcp/tools"
      element={
        <Suspense fallback={<LazyFallback />}>
          <MCPToolCatalogPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-gateway/mcp/runs"
      element={
        <Suspense fallback={<LazyFallback />}>
          <MCPRunsPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-gateway/mcp/audit"
      element={
        <Suspense fallback={<LazyFallback />}>
          <MCPAuditLogPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-gateway/mcp/approvals"
      element={
        <Suspense fallback={<LazyFallback />}>
          <MCPApprovalsPage />
        </Suspense>
      }
    />
    <Route
      path="/ai-gateway/mcp/guardrails"
      element={
        <Suspense fallback={<LazyFallback />}>
          <MCPGuardrailsPage />
        </Suspense>
      }
    />
    <Route
      path="/monitoring/cycle/:cycleId"
      element={
        <Suspense fallback={<LazyFallback />}>
          <MonitoringForm />
        </Suspense>
      }
    />
    <Route
      path="/monitoring/reports"
      element={
        <Suspense fallback={<LazyFallback />}>
          <ReportsArchive />
        </Suspense>
      }
    />
    <Route
      path="/intake-forms"
      element={
        <Suspense fallback={<LazyFallback />}>
          <IntakeFormsListPage />
        </Suspense>
      }
    >
      <Route
        index
        element={
          <Suspense fallback={<LazyFallback />}>
            <IntakeFormsListPage />
          </Suspense>
        }
      />
      <Route
        path="submissions"
        element={
          <Suspense fallback={<LazyFallback />}>
            <IntakeFormsListPage />
          </Suspense>
        }
      />
    </Route>
    <Route
      path="/intake-forms/:formId/edit"
      element={
        <Suspense fallback={<LazyFallback />}>
          <IntakeFormBuilder />
        </Suspense>
      }
    />
    <Route
      path="/super-admin"
      element={
        <Suspense fallback={<LazyFallback />}>
          <SuperAdminOrganizations />
        </Suspense>
      }
    />
    <Route
      path="/super-admin/users"
      element={
        <Suspense fallback={<LazyFallback />}>
          <SuperAdminAllUsers />
        </Suspense>
      }
    />
    <Route
      path="/super-admin/organizations/:id/users"
      element={
        <Suspense fallback={<LazyFallback />}>
          <SuperAdminUsers />
        </Suspense>
      }
    />
    <Route
      path="/super-admin/settings"
      element={
        <Suspense fallback={<LazyFallback />}>
          <SuperAdminSettings />
        </Suspense>
      }
    />
    <Route
      path="/super-admin/settings/:tab"
      element={
        <Suspense fallback={<LazyFallback />}>
          <SuperAdminSettings />
        </Suspense>
      }
    />
  </Route>,
  <Route
    key="user-reg"
    path="/user-reg"
    element={
      <Suspense fallback={<LazyFallback />}>
        <ProtectedRoute Component={RegisterUser} />
      </Suspense>
    }
  />,
  <Route key="register" path="/register" element={<Navigate to="/login" replace />} />,
  <Route key="admin-reg" path="/admin-reg" element={<Navigate to="/login" replace />} />,
  <Route
    key="login"
    path="/login"
    element={
      <Suspense fallback={<LazyFallback />}>
        <ProtectedRoute Component={Login} />
      </Suspense>
    }
  />,
  <Route
    key="microsoft-callback"
    path="/auth/microsoft/callback"
    element={
      <Suspense fallback={<LazyFallback />}>
        <MicrosoftCallback />
      </Suspense>
    }
  />,
  <Route
    key="forgot-password"
    path="/forgot-password"
    element={
      <Suspense fallback={<LazyFallback />}>
        <ProtectedRoute Component={ForgotPassword} />
      </Suspense>
    }
  />,
  <Route
    key="reset-password"
    path="/reset-password"
    element={
      <Suspense fallback={<LazyFallback />}>
        <ProtectedRoute Component={ResetPassword} />
      </Suspense>
    }
  />,
  <Route
    key="set-new-password"
    path="/set-new-password"
    element={
      <Suspense fallback={<LazyFallback />}>
        <ProtectedRoute Component={SetNewPassword} />
      </Suspense>
    }
  />,
  <Route
    key="reset-password-continue"
    path="/reset-password-continue"
    element={
      <Suspense fallback={<LazyFallback />}>
        <ProtectedRoute Component={ResetPasswordContinue} />
      </Suspense>
    }
  />,
  // <Route key="public" path="/public" element={<AITrustCentrePublic />} />,
  <Route
    key="aiTrustCentrepublic"
    path="/aiTrustCentre/:hash"
    element={
      <Suspense fallback={<LazyFallback />}>
        <AITrustCentrePublic />
      </Suspense>
    }
  />,
  <Route
    key="sharedView"
    path="/shared/:resourceType/:token"
    element={
      <Suspense fallback={<LazyFallback />}>
        <SharedView />
      </Suspense>
    }
  />,
  // Public intake form routes (no authentication required)
  // New URL format: /{publicId}/use-case-form-intake
  <Route
    key="publicIntakeFormById"
    path="/:publicId/use-case-form-intake"
    element={
      <Suspense fallback={<LazyFallback />}>
        <PublicIntakeForm />
      </Suspense>
    }
  />,
  <Route
    key="publicIntakeFormByIdSuccess"
    path="/:publicId/use-case-form-intake/success"
    element={
      <Suspense fallback={<LazyFallback />}>
        <SubmissionSuccess />
      </Suspense>
    }
  />,
  // Legacy URL format: /intake/{tenantSlug}/{formSlug}
  <Route
    key="publicIntakeForm"
    path="/intake/:tenantSlug/:formSlug"
    element={
      <Suspense fallback={<LazyFallback />}>
        <PublicIntakeForm />
      </Suspense>
    }
  />,
  <Route
    key="publicIntakeFormSuccess"
    path="/intake/:tenantSlug/:formSlug/success"
    element={
      <Suspense fallback={<LazyFallback />}>
        <SubmissionSuccess />
      </Suspense>
    }
  />,
  // Style Guide - Development only
  ...(isDev
    ? [
        <Route
          key="style-guide"
          path="/style-guide/:section?"
          element={
            <Suspense fallback={<LazyFallback />}>
              <StyleGuide />
            </Suspense>
          }
        />,
      ]
    : []),
  <Route
    key="not-found"
    path="*"
    element={
      <Suspense fallback={<LazyFallback />}>
        <PageNotFound />
      </Suspense>
    }
  />,
];
