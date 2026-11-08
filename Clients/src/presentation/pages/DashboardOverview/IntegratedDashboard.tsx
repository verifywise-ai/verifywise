import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Box, Typography, Stack, Fade } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import { LayoutGrid } from "lucide-react";
import DashboardTabs from "../../components/DashboardTabs";
import type { DashboardTabConfig } from "../../components/DashboardTabs";
import ReadinessDashboard from "../ReadinessDashboard";
import AIContentReview from "../AIContentReview";
import AIAuditDashboard from "../AIAuditDashboard";
import { useDashboard } from "../../../application/hooks/useDashboard";
import {
  useDashboardMetrics,
  hasDashboardCache,
} from "../../../application/hooks/useDashboardMetrics";
import {
  useDashboardPreferences,
  useUpdateDashboardPreferences,
} from "../../../application/hooks/useDashboardPreferences";
import { useAuth } from "../../../application/hooks/useAuth";
import { useGovernancePreferences } from "../../../application/hooks/useGovernanceOs";
import { PageBreadcrumbs } from "../../components/breadcrumbs/PageBreadcrumbs";
import PageTour from "../../components/PageTour";
import DashboardSteps from "./DashboardSteps";
import AddNewMegaDropdown from "../../components/MegaDropdown/AddNewMegaDropdown";
import MegaDropdownErrorBoundary from "../../components/MegaDropdown/MegaDropdownErrorBoundary";
import DashboardErrorBoundary from "../../components/Dashboard/DashboardErrorBoundary";
import ChangeOrganizationNameModal from "../../components/Modals/ChangeOrganizationName";
import { EmptyStateMessage } from "../../components/EmptyStateMessage";
import { ButtonToggle } from "../../components/button-toggle";
import { CustomizableButton } from "../../components/button/customizable-button";
import { StepProgressDialog } from "../../components/StepProgressDialog";
import { useRiskAssessmentMode } from "../../../application/hooks/useRiskAssessmentMode";
import { useOrgPortfolio, usePortfolioTrend } from "../../../application/hooks/useQuantitativeRisk";
import { getRiskLevelData, getVendorRiskData, getModelRiskData } from "./constants";
import { DashboardWidget, type DashboardWidgetData } from "./DashboardWidgets";
import EditLayoutModal from "./EditLayoutModal";
import {
  buildLayoutForSave,
  defaultViewLayout,
  groupWidgetRows,
  isWidgetAvailable,
  resolveViewLayout,
  type DashboardView,
  type DashboardWidgetKey,
  type ViewWidget,
} from "./widgetRegistry";

const DASHBOARD_VIEW_KEY = "dashboard_view_preference";
const DASHBOARD_TABS_KEY = "dashboard_active_tabs";
const DASHBOARD_SELECTED_TAB_KEY = "dashboard_selected_tab";

const AVAILABLE_DASHBOARD_TABS: DashboardTabConfig[] = [
  {
    id: "overview",
    label: "Overview",
    icon: "LayoutDashboard",
    description: "Main dashboard with metrics and activity",
    removable: false,
  },
  {
    id: "readiness",
    label: "Audit readiness",
    icon: "ShieldCheck",
    description: "Per-control readiness scores and audit preparation",
  },
  {
    id: "ai-content",
    label: "AI content review",
    icon: "Sparkles",
    description: "Review and approve AI-generated content (EU AI Act art. 52)",
  },
  {
    id: "ai-audit",
    label: "AI audit",
    icon: "FileText",
    description: "Complete audit trail for every AI action (EU AI Act art. 12)",
  },
];

// Feature flag: the AI Agent dashboard tabs (Audit readiness, AI content review,
// AI audit) and the customizable tab bar are hidden from end users for now. The
// underlying pages, hooks, and APIs stay in the codebase; flip this to true to
// surface them again.
const SHOW_AI_AGENT_DASHBOARD_TABS = false;

const DEFAULT_TABS = SHOW_AI_AGENT_DASHBOARD_TABS
  ? ["overview", "readiness", "ai-content", "ai-audit"]
  : ["overview"];

const IntegratedDashboard: React.FC = () => {
  const { userId } = useAuth();
  const { dashboard, loading: dashboardLoading, fetchDashboard } = useDashboard();
  const { data: governancePrefs } = useGovernancePreferences();
  const isGovernanceEnabled = governancePrefs?.is_enabled ?? false;

  const [contentReady, setContentReady] = useState(false);

  // Dashboard tab system — customizable by user
  const [activeTabs, setActiveTabs] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(DASHBOARD_TABS_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_TABS;
    } catch {
      return DEFAULT_TABS;
    }
  });
  const [dashboardTab, setDashboardTab] = useState<string>(() => {
    const saved = localStorage.getItem(DASHBOARD_SELECTED_TAB_KEY);
    return saved && DEFAULT_TABS.includes(saved) ? saved : "overview";
  });

  const handleDashboardTabChange = useCallback((tabId: string) => {
    setDashboardTab(tabId);
    localStorage.setItem(DASHBOARD_SELECTED_TAB_KEY, tabId);
  }, []);

  const handleActiveTabsChange = useCallback((tabIds: string[]) => {
    setActiveTabs(tabIds);
    localStorage.setItem(DASHBOARD_TABS_KEY, JSON.stringify(tabIds));
  }, []);

  // Check if there is any cached dashboard metrics data
  const hasAnyCache = useMemo(() => hasDashboardCache(), []);

  // Dashboard view state with localStorage persistence
  const [dashboardView, setDashboardView] = useState<DashboardView>(() => {
    const saved = localStorage.getItem(DASHBOARD_VIEW_KEY);
    return saved === "executive" ? "executive" : "operations";
  });

  const handleViewChange = useCallback((view: DashboardView) => {
    setDashboardView(view);
    localStorage.setItem(DASHBOARD_VIEW_KEY, view);
  }, []);
  const metrics = useDashboardMetrics();
  const {
    vendorRiskMetrics,
    riskMetrics,
    modelRiskMetrics,
    organizationalFrameworks,
    loading: metricsLoading,
    progressStep,
    progressSteps,
  } = metrics;

  const { isQuantitative } = useRiskAssessmentMode();
  const { portfolio } = useOrgPortfolio();
  const { snapshots: trendSnapshots } = usePortfolioTrend(90);

  // Per-user layout (#5257). No saved row or a failed read leaves `savedLayout`
  // empty, which resolves to the default layout.
  const { data: preferences, isLoading: layoutLoading } = useDashboardPreferences();
  const { mutateAsync: saveLayout } = useUpdateDashboardPreferences();
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const savedLayout = preferences?.layout;

  const loading = dashboardLoading || metricsLoading;

  // Mark content ready once loading completes
  useEffect(() => {
    if (!loading) {
      setContentReady(true);
    }
  }, [loading]);

  const [showOrgNameModal, setShowOrgNameModal] = useState(false);
  const [currentOrgName, setCurrentOrgName] = useState("");
  const [organizationId, setOrganizationId] = useState<number>(-1);

  useEffect(() => {
    fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for first login and show organization name modal
  useEffect(() => {
    const checkFirstLogin = () => {
      const hasSeenOrgModal = localStorage.getItem("has_seen_org_name_modal");
      const initialOrgName = localStorage.getItem("initial_org_name");
      const orgId = localStorage.getItem("initial_org_id");

      if (!hasSeenOrgModal && initialOrgName && userId) {
        setCurrentOrgName(initialOrgName);
        setShowOrgNameModal(true);
        setOrganizationId(Number(orgId));
      }
    };
    checkFirstLogin();
  }, [userId]);

  const handleOrgNameSuccess = () => {
    localStorage.setItem("has_seen_org_name_modal", "true");
    localStorage.removeItem("initial_org_name");
    localStorage.removeItem("initial_org_id");
    setShowOrgNameModal(false);
  };

  // Get use cases (projects) for table
  const useCases = useMemo(() => {
    if (!dashboard?.projects_list) return [];
    return dashboard.projects_list
      .filter((p: any) => !p.is_organizational)
      .slice(0, 5)
      .map((project: any) => {
        let frameworkName = "Unknown";
        if (Array.isArray(project.framework) && project.framework.length > 0) {
          frameworkName =
            project.framework
              .map((f: any) => f.name)
              .filter(Boolean)
              .join(", ") || "Unknown";
        } else if (typeof project.framework === "string") {
          frameworkName = project.framework;
        } else if (project.framework?.name) {
          frameworkName = project.framework.name;
        }

        return {
          id: project.id,
          name: project.project_title || "Untitled",
          framework: frameworkName,
          progress:
            project.totalSubcontrols > 0
              ? Math.round((project.doneSubcontrols / project.totalSubcontrols) * 100)
              : 0,
          status: project.status || "Active",
          updated: project.last_updated || new Date().toISOString(),
        };
      });
  }, [dashboard?.projects_list]);

  // Calculate use case / framework risk data
  const useCaseRiskData = useMemo(() => {
    const distribution = riskMetrics?.distribution || { high: 0, medium: 0, low: 0 };
    return {
      data: getRiskLevelData(distribution),
      total: riskMetrics?.total || 0,
    };
  }, [riskMetrics]);

  // Calculate vendor risk data
  const vendorRiskData = useMemo(() => {
    const distribution = vendorRiskMetrics?.distribution || {
      veryHigh: 0,
      high: 0,
      medium: 0,
      low: 0,
      veryLow: 0,
    };
    return {
      data: getVendorRiskData(distribution),
      total: vendorRiskMetrics?.total || 0,
    };
  }, [vendorRiskMetrics]);

  // Calculate model risk data
  const modelRiskData = useMemo(() => {
    const distribution = modelRiskMetrics?.distribution || {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    return {
      data: getModelRiskData(distribution),
      total: modelRiskMetrics?.total || 0,
    };
  }, [modelRiskMetrics]);

  const availability = {
    hasOrganizationalFrameworks: organizationalFrameworks.length > 0,
    hasQuantitativePortfolio: Boolean(isQuantitative && portfolio && portfolio.risk_count > 0),
  };
  const isAvailable = (key: DashboardWidgetKey) => isWidgetAvailable(key, availability);

  const viewLayout = resolveViewLayout(savedLayout, dashboardView);
  const widgetRows = groupWidgetRows(
    viewLayout.filter((w) => w.visible && isAvailable(w.key)).map((w) => w.key),
  );

  const widgetData: DashboardWidgetData = {
    dashboard,
    metrics,
    isGovernanceEnabled,
    portfolio,
    trendSnapshots,
    useCases,
    useCaseRisks: useCaseRiskData,
    vendorRisks: vendorRiskData,
    modelRisks: modelRiskData,
  };

  const handleSaveLayout = async (widgets: ViewWidget[]) => {
    await saveLayout((latest) => buildLayoutForSave(latest, dashboardView, widgets));
  };

  // Show step progress dialog on cold loads (no cache)
  if ((loading || layoutLoading) && !hasAnyCache) {
    return (
      <StepProgressDialog
        open={true}
        title="Loading dashboard"
        steps={progressSteps}
        currentStep={progressStep}
      />
    );
  }

  // Don't render anything while loading (before content is ready)
  if (loading) {
    return null;
  }

  return (
    <Fade in={contentReady} timeout={300}>
      <Box sx={{ pb: 3, width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
        <PageBreadcrumbs />

        {/* Organization Name Modal */}
        {showOrgNameModal && (
          <ChangeOrganizationNameModal
            isOpen={showOrgNameModal}
            currentOrgName={currentOrgName}
            organizationId={organizationId}
            onSuccess={handleOrgNameSuccess}
          />
        )}

        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb="16px">
          <Typography
            variant="h5"
            sx={{
              fontWeight: 600,
              fontSize: 20,
              fontFamily: "'Red Hat Display', 'Geist', sans-serif",
            }}
          >
            Dashboard
          </Typography>

          <Stack direction="row" alignItems="center" gap="16px">
            {dashboardTab === "overview" && (
              <CustomizableButton
                text="Edit layout"
                variant="outlined"
                startIcon={<LayoutGrid size={16} strokeWidth={1.5} />}
                onClick={() => setIsEditingLayout(true)}
                sx={{ height: "30px" }}
              />
            )}
            {dashboardTab === "overview" && (
              <ButtonToggle
                options={[
                  { label: "Operations view", value: "operations" },
                  { label: "Executive view", value: "executive" },
                ]}
                value={dashboardView}
                onChange={(value) => handleViewChange(value as DashboardView)}
                height={34}
              />
            )}
            <Box data-joyride-id="add-new-dropdown">
              <MegaDropdownErrorBoundary>
                <AddNewMegaDropdown />
              </MegaDropdownErrorBoundary>
            </Box>
          </Stack>
        </Stack>

        {/* Dashboard Tab Bar */}
        {SHOW_AI_AGENT_DASHBOARD_TABS && (
          <TabContext value={dashboardTab}>
            <Box sx={{ mb: 1 }}>
              <DashboardTabs
                availableTabs={AVAILABLE_DASHBOARD_TABS}
                activeTabs={activeTabs}
                activeTab={dashboardTab}
                onTabChange={handleDashboardTabChange}
                onTabsChange={handleActiveTabsChange}
              />
            </Box>
          </TabContext>
        )}

        {/* Tab: Readiness Dashboard */}
        {dashboardTab === "readiness" && <ReadinessDashboard />}

        {/* Tab: AI Content Review */}
        {dashboardTab === "ai-content" && <AIContentReview />}

        {/* Tab: AI Audit */}
        {dashboardTab === "ai-audit" && <AIAuditDashboard />}

        {/* Tab: Overview (original dashboard): rows come from the widget registry.
            They wait for the saved layout so widgets do not visibly rearrange. */}
        {dashboardTab === "overview" &&
          !layoutLoading &&
          (widgetRows.length === 0 ? (
            <EmptyStateMessage message="All widgets are hidden. Use Edit layout to show them." />
          ) : (
            widgetRows.map((row) =>
              row.width === "full" ? (
                <DashboardWidget key={row.keys[0]} widgetKey={row.keys[0]} data={widgetData} />
              ) : (
                <Box
                  key={row.keys[0]}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: row.width === "half" ? "1fr 1fr" : "repeat(3, 1fr)",
                    gap: "16px",
                    mb: "16px",
                  }}
                >
                  {row.keys.map((key) => (
                    <DashboardWidget key={key} widgetKey={key} data={widgetData} />
                  ))}
                </Box>
              ),
            )
          ))}

        {isEditingLayout && (
          <EditLayoutModal
            widgets={viewLayout}
            defaults={defaultViewLayout(dashboardView)}
            isAvailable={isAvailable}
            onSave={handleSaveLayout}
            onClose={() => setIsEditingLayout(false)}
          />
        )}

        {/* Page Tour */}
        <PageTour steps={DashboardSteps} run={true} tourKey="dashboard-tour" />
      </Box>
    </Fade>
  );
};

// Wrap the dashboard with error boundary for better error handling
const ProtectedIntegratedDashboard: React.FC = () => {
  return (
    <DashboardErrorBoundary>
      <IntegratedDashboard />
    </DashboardErrorBoundary>
  );
};

export default ProtectedIntegratedDashboard;
