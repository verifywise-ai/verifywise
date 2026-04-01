import { Route, Navigate } from "react-router-dom";
import Dashboard from "../../presentation/containers/Dashboard";
import Vendors from "../../presentation/pages/Vendors";
import Plugins from "../../presentation/pages/Plugins";
import PluginManagement from "../../presentation/pages/Plugins/PluginManagement";
import Setting from "../../presentation/pages/SettingsPage";
import Organization from "../../presentation/pages/SettingsPage/Organization";
import RegisterUser from "../../presentation/pages/Authentication/RegisterUser";
import SuperAdminOrganizations from "../../presentation/pages/SuperAdmin/Organizations";
import SuperAdminUsers from "../../presentation/pages/SuperAdmin/Users";
import SuperAdminAllUsers from "../../presentation/pages/SuperAdmin/AllUsers";
import SuperAdminSettings from "../../presentation/pages/SuperAdmin/Settings";
import Login from "../../presentation/pages/Authentication/Login";
import ForgotPassword from "../../presentation/pages/Authentication/ForgotPassword";
import ResetPassword from "../../presentation/pages/Authentication/ResetPassword";
import SetNewPassword from "../../presentation/pages/Authentication/SetNewPassword";
import ResetPasswordContinue from "../../presentation/pages/Authentication/ResetPasswordContinue";
import FileManager from "../../presentation/pages/FileManager";
import Reporting from "../../presentation/pages/Reporting";
import VWHome from "../../presentation/pages/Home/1.0Home";
import VWProjectView from "../../presentation/pages/ProjectView/V1.0ProjectView";
import PageNotFound from "../../presentation/pages/PageNotFound";
import ProtectedRoute from "../../presentation/components/ProtectedRoute";
import EvalsDashboard from "../../presentation/pages/EvalsDashboard/EvalsDashboard";
import OrgSettings from "../../presentation/pages/EvalsDashboard/OrgSettings";
import DatasetEditorPage from "../../presentation/pages/EvalsDashboard/DatasetEditorPage";
import AITrustCenter from "../../presentation/pages/AITrustCenter";
import AITrustCentrePublic from "../../presentation/pages/AITrustCentrePublic";
import SharedView from "../../presentation/pages/SharedView";

import Training from "../../presentation/pages/TrainingRegistar";
import PolicyDashboard from "../../presentation/pages/PolicyDashboard/PoliciesDashboard";
import PolicyEditorPage from "../../presentation/pages/PolicyDashboard/PolicyEditorPage";
import WatchTower from "../../presentation/pages/WatchTower";
import ModelInventory from "../../presentation/pages/ModelInventory";
import ModelLifecycleDetail from "../../presentation/pages/ModelInventory/ModelLifecycleDetail";
import Datasets from "../../presentation/pages/Datasets";
import IncidentManagement from "../../presentation/pages/IncidentManagement";
import AgentDiscovery from "../../presentation/pages/AgentDiscovery";
import Framework from "../../presentation/pages/Framework";
import Tasks from "../../presentation/pages/Tasks";
import IntegratedDashboard from "../../presentation/pages/DashboardOverview/IntegratedDashboard";
import StartHere from "../../presentation/pages/StartHere";
import RiskManagement from "../../presentation/pages/RiskManagement";
import AutomationsPage from "../../presentation/pages/Automations";
import StyleGuide from "../../presentation/pages/StyleGuide";

import ApprovalWorkflows from "../../presentation/pages/ApprovalWorkflows";
import ReactFlowDemo from "../../presentation/pages/ReactFlowDemo";
import WizardShowcase from "../../presentation/pages/WizardShowcase";
import ScanPage from "../../presentation/pages/AIDetection/ScanPage";
import HistoryPage from "../../presentation/pages/AIDetection/HistoryPage";
import AIDetectionSettingsPage from "../../presentation/pages/AIDetection/SettingsPage";
import RepositoriesPage from "../../presentation/pages/AIDetection/RepositoriesPage";
import ScanDetailsPage from "../../presentation/pages/AIDetection/ScanDetailsPage";
import InsightsPage from "../../presentation/pages/ShadowAI/InsightsPage";
import UserActivityPage from "../../presentation/pages/ShadowAI/UserActivityPage";
import AIToolsPage from "../../presentation/pages/ShadowAI/AIToolsPage";
import RulesPage from "../../presentation/pages/ShadowAI/RulesPage";
import ShadowAISettingsPage from "../../presentation/pages/ShadowAI/SettingsPage";
import AIGatewayEndpointsPage from "../../presentation/pages/AIGateway/Endpoints";
import AIGatewayAnalyticsPage from "../../presentation/pages/AIGateway/SpendDashboard";
import AIGatewayPlaygroundPage from "../../presentation/pages/AIGateway/Playground";
import AIGatewayGuardrailsPage from "../../presentation/pages/AIGateway/Guardrails";
import AIGatewayLogsPage from "../../presentation/pages/AIGateway/Logs";
import AIGatewayModelsPage from "../../presentation/pages/AIGateway/Models";
import AIGatewaySettingsPage from "../../presentation/pages/AIGateway/Settings";
import AIGatewayVirtualKeysPage from "../../presentation/pages/AIGateway/VirtualKeys";
import AIGatewayPromptsPage from "../../presentation/pages/AIGateway/Prompts";
import AIGatewayPromptEditorPage from "../../presentation/pages/AIGateway/Prompts/PromptEditor";
import MonitoringForm from "../../presentation/pages/PostMarketMonitoring/MonitoringForm";
import ReportsArchive from "../../presentation/pages/PostMarketMonitoring/ReportsArchive";
import IntakeFormsListPage from "../../presentation/pages/IntakeFormBuilder/IntakeFormsListPage";
import IntakeFormBuilder from "../../presentation/pages/IntakeFormBuilder";
import PublicIntakeForm from "../../presentation/pages/PublicIntakeForm";
import SubmissionSuccess from "../../presentation/pages/PublicIntakeForm/SubmissionSuccess";

// Check if we're in development mode
const isDev = import.meta.env.DEV;

export const createRoutes = (
  triggerSidebar: boolean,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _triggerSidebarReload: () => void
) => [
  // ReactFlow Demo - Development only (must be before dashboard route)
  ...(isDev ? [<Route key="reactflow-demo" path="/reactflow-demo" element={<ReactFlowDemo />} />] : []),
  // Wizard Showcase - Development only
  ...(isDev ? [<Route key="wizard-showcase" path="/wizard-showcase" element={<WizardShowcase />} />] : []),
  <Route
    key="dashboard"
    path="/"
    element={
      <ProtectedRoute Component={Dashboard} reloadTrigger={triggerSidebar} />
    }
  >
    <Route path="/vendors" element={<Vendors />}>
      <Route index element={<Vendors />} /> {/* Default tab */}
      <Route path="risks" element={<Vendors />} /> {/* Risks tab */}
    </Route>

    <Route path="/settings" element={<Setting />} />
    <Route path="/settings/:tab" element={<Setting />} />
    <Route path="/plugins" element={<Plugins />} />
    <Route path="/plugins/marketplace" element={<Plugins />} />
    <Route path="/plugins/my-plugins" element={<Plugins />} />
    <Route path="/plugins/:pluginKey/manage" element={<PluginManagement />} />
    <Route path="/setting" element={<Navigate to="/settings" replace />} />
    <Route path="/organization" element={<Organization />} />
      <Route path="/file-manager" element={<FileManager />} />
    <Route path="/reporting" element={<Reporting />} />
    <Route index element={<IntegratedDashboard />} />
    <Route path="/start-here" element={<StartHere />} />
    <Route path="/overview" element={<VWHome />} />
    <Route path="/framework/:tab?" element={<Framework />} />
    <Route path="/project-view" element={<VWProjectView />} />
    <Route path="/evals" element={<EvalsDashboard />} />
    <Route path="/evals/:projectId" element={<EvalsDashboard />} />
    <Route path="/evals/:projectId/datasets/editor" element={<DatasetEditorPage />} />
    <Route path="/evals/settings" element={<OrgSettings />} />
    <Route path="/training" element={<Training />} />
    <Route path="/ai-trust-center" element={<AITrustCenter />} />
    <Route path="/ai-trust-center/:tab" element={<AITrustCenter />} />
    <Route path="/policies/new" element={<PolicyEditorPage />} />
    <Route path="/policies/:id/edit" element={<PolicyEditorPage />} />
    <Route path="/policies" element={<PolicyDashboard />}>
      <Route index element={<PolicyDashboard />} /> {/* Default tab */}
      <Route path="templates" element={<PolicyDashboard />} /> {/* Policy Templates tab */}
    </Route>
    <Route path="/event-tracker" element={<WatchTower />} />
    <Route path="/event-tracker/logs" element={<WatchTower />} />
    <Route path="/model-inventory" element={<ModelInventory />} />
    <Route path="/model-inventory/model-risks" element={<ModelInventory />} />
    <Route path="/datasets" element={<Datasets />} />
    <Route path="/model-inventory/evidence-hub" element={<ModelInventory />} />
    {/* Model lifecycle detail page - rendered by plugin */}
    <Route path="/model-inventory/models/:id" element={<ModelLifecycleDetail />} />
    {/* Dynamic route for plugin tabs (e.g., mlflow, other future plugins) */}
    <Route path="/model-inventory/:pluginTab" element={<ModelInventory />} />
    <Route path="/risk-management" element={<RiskManagement />} />
    <Route path="/tasks" element={<Tasks />} />
    <Route path="/automations" element={<AutomationsPage />} />
    <Route path="/ai-incident-managements" element={<IncidentManagement />} />
    <Route path="/agent-discovery" element={<AgentDiscovery />} />
    <Route path="/approval-workflows" element={<ApprovalWorkflows />} />
    <Route path="/ai-detection" element={<Navigate to="/ai-detection/scan" replace />} />
    <Route path="/ai-detection/scan" element={<ScanPage />} />
    <Route path="/ai-detection/repositories" element={<RepositoriesPage />} />
    <Route path="/ai-detection/history" element={<HistoryPage />} />
    <Route path="/ai-detection/settings" element={<AIDetectionSettingsPage />} />
    <Route path="/ai-detection/scans/:scanId" element={<ScanDetailsPage />} />
    <Route path="/ai-detection/scans/:scanId/:tab" element={<ScanDetailsPage />} />
    <Route path="/shadow-ai" element={<Navigate to="/shadow-ai/insights" replace />} />
    <Route path="/shadow-ai/insights" element={<InsightsPage />} />
    <Route path="/shadow-ai/user-activity" element={<UserActivityPage />} />
    <Route path="/shadow-ai/user-activity/users" element={<UserActivityPage />} />
    <Route path="/shadow-ai/user-activity/departments" element={<UserActivityPage />} />
    <Route path="/shadow-ai/tools" element={<AIToolsPage />} />
    <Route path="/shadow-ai/tools/:toolId" element={<AIToolsPage />} />
    <Route path="/shadow-ai/rules" element={<RulesPage />} />
    <Route path="/shadow-ai/rules/alerts" element={<RulesPage />} />
    <Route path="/shadow-ai/settings" element={<ShadowAISettingsPage />} />
    <Route path="/ai-gateway" element={<Navigate to="/ai-gateway/dashboard" replace />} />
    <Route path="/ai-gateway/endpoints" element={<AIGatewayEndpointsPage />} />
    <Route path="/ai-gateway/dashboard" element={<AIGatewayAnalyticsPage />} />
    <Route path="/ai-gateway/playground" element={<AIGatewayPlaygroundPage />} />
    <Route path="/ai-gateway/guardrails" element={<Navigate to="/ai-gateway/guardrails/pii" replace />} />
    <Route path="/ai-gateway/guardrails/:tab" element={<AIGatewayGuardrailsPage />} />
    <Route path="/ai-gateway/models" element={<Navigate to="/ai-gateway/models/catalog" replace />} />
    <Route path="/ai-gateway/models/:tab" element={<AIGatewayModelsPage />} />
    <Route path="/ai-gateway/logs" element={<AIGatewayLogsPage />} />
    <Route path="/ai-gateway/prompts" element={<AIGatewayPromptsPage />} />
    <Route path="/ai-gateway/prompts/:id" element={<AIGatewayPromptEditorPage />} />
    <Route path="/ai-gateway/virtual-keys" element={<AIGatewayVirtualKeysPage />} />
    <Route path="/ai-gateway/settings" element={<Navigate to="/ai-gateway/settings/api-keys" replace />} />
    <Route path="/ai-gateway/settings/:tab" element={<AIGatewaySettingsPage />} />
    <Route path="/monitoring/cycle/:cycleId" element={<MonitoringForm />} />
    <Route path="/monitoring/reports" element={<ReportsArchive />} />
    <Route path="/intake-forms" element={<IntakeFormsListPage />}>
      <Route index element={<IntakeFormsListPage />} />
      <Route path="submissions" element={<IntakeFormsListPage />} />
    </Route>
    <Route path="/intake-forms/:formId/edit" element={<IntakeFormBuilder />} />
    <Route path="/super-admin" element={<SuperAdminOrganizations />} />
    <Route path="/super-admin/users" element={<SuperAdminAllUsers />} />
    <Route path="/super-admin/organizations/:id/users" element={<SuperAdminUsers />} />
    <Route path="/super-admin/settings" element={<SuperAdminSettings />} />
    <Route path="/super-admin/settings/:tab" element={<SuperAdminSettings />} />
  </Route>,
  <Route
    key="user-reg"
    path="/user-reg"
    element={<ProtectedRoute Component={RegisterUser} />}
  />,
  <Route
    key="register"
    path="/register"
    element={<Navigate to="/login" replace />}
  />,
  <Route
    key="admin-reg"
    path="/admin-reg"
    element={<Navigate to="/login" replace />}
  />,
  <Route
    key="login"
    path="/login"
    element={<ProtectedRoute Component={Login} />}
  />,
  <Route
    key="forgot-password"
    path="/forgot-password"
    element={<ProtectedRoute Component={ForgotPassword} />}
  />,
  <Route
    key="reset-password"
    path="/reset-password"
    element={<ProtectedRoute Component={ResetPassword} />}
  />,
  <Route
    key="set-new-password"
    path="/set-new-password"
    element={<ProtectedRoute Component={SetNewPassword} />}
  />,
  <Route
    key="reset-password-continue"
    path="/reset-password-continue"
    element={<ProtectedRoute Component={ResetPasswordContinue} />}
  />,
// <Route key="public" path="/public" element={<AITrustCentrePublic />} />,
  <Route key="aiTrustCentrepublic" path="/aiTrustCentre/:hash" element={<AITrustCentrePublic />} />,
  <Route key="sharedView" path="/shared/:resourceType/:token" element={<SharedView />} />,
  // Public intake form routes (no authentication required)
  // New URL format: /{publicId}/use-case-form-intake
  <Route key="publicIntakeFormById" path="/:publicId/use-case-form-intake" element={<PublicIntakeForm />} />,
  <Route key="publicIntakeFormByIdSuccess" path="/:publicId/use-case-form-intake/success" element={<SubmissionSuccess />} />,
  // Legacy URL format: /intake/{tenantSlug}/{formSlug}
  <Route key="publicIntakeForm" path="/intake/:tenantSlug/:formSlug" element={<PublicIntakeForm />} />,
  <Route key="publicIntakeFormSuccess" path="/intake/:tenantSlug/:formSlug/success" element={<SubmissionSuccess />} />,
  // Style Guide - Development only
  ...(isDev ? [<Route key="style-guide" path="/style-guide/:section?" element={<StyleGuide />} />] : []),
  <Route key="not-found" path="*" element={<PageNotFound />} />,
];
