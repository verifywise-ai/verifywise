import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Box,
  Typography,
  Stack,
  IconButton,
  Fade,
} from "@mui/material";
import {
  ChevronLeft,
  ChevronRight,
  Brain,
  Building2,
  ScrollText,
  GraduationCap,
  AlertCircle,
} from "lucide-react";
import useNavigateSearch from "../../../application/hooks/useNavigateSearch";
import { useDashboard } from "../../../application/hooks/useDashboard";
import { useDashboardMetrics, hasDashboardCache } from "../../../application/hooks/useDashboardMetrics";
import { useAuth } from "../../../application/hooks/useAuth";
import { formatRelativeDate } from "../../../application/utils/dateFormatter";
import { PageBreadcrumbs } from "../../components/breadcrumbs/PageBreadcrumbs";
import PageTour from "../../components/PageTour";
import DashboardSteps from "./DashboardSteps";
import AddNewMegaDropdown from "../../components/MegaDropdown/AddNewMegaDropdown";
import MegaDropdownErrorBoundary from "../../components/MegaDropdown/MegaDropdownErrorBoundary";
import DashboardErrorBoundary from "../../components/Dashboard/DashboardErrorBoundary";
import ChangeOrganizationNameModal from "../../components/Modals/ChangeOrganizationName";
import { DashboardHeaderCard } from "../../components/Cards/DashboardHeaderCard";
import { DashboardCard } from "../../components/Cards/DashboardCard";
import { TaskRadarCard } from "../../components/Cards/TaskRadarCard";
import { RiskDonutWithLegend } from "../../components/Charts/RiskDonutWithLegend";
import {
  TrainingCompletionCard,
  PolicyStatusCard,
  IncidentStatusCard,
  EvidenceCoverageCard,
  ModelLifecycleCard,
} from "../../components/Charts/NewMetricsCards";
import { GovernanceScoreCard } from "../../components/Charts/GovernanceScoreCard";
import { PortfolioExposureCard } from "../../components/Charts/PortfolioExposureCard";
import { PortfolioTrendChart } from "../../components/Charts/PortfolioTrendChart";
import { LossCategoryBreakdown } from "../../components/Charts/LossCategoryBreakdown";
import UseCasesTable from "../../components/Table/UseCasesTable";
import { EmptyStateMessage } from "../../components/EmptyStateMessage";
import ActivityItem from "../../components/ActivityItem";
import { ButtonToggle } from "../../components/button-toggle";
import { StepProgressDialog } from "../../components/StepProgressDialog";
import { OrganizationalFrameworkData } from "../../../application/hooks/useDashboardMetrics";
import { useRiskAssessmentMode } from "../../../application/hooks/useRiskAssessmentMode";
import { useOrgPortfolio, usePortfolioTrend } from "../../../application/hooks/useQuantitativeRisk";
import {
  navIconButtonSx,
  getRiskLevelData,
  getVendorRiskData,
  getModelRiskData,
  getNistStatusData,
  getCompletionData,
} from "./constants";
import { text } from "../../themes/palette";

type DashboardView = "executive" | "operations";

const DASHBOARD_VIEW_KEY = "dashboard_view_preference";

const IntegratedDashboard: React.FC = () => {
  const navigateSearch = useNavigateSearch();
  const { userId, isSuperAdmin, activeOrganizationId } = useAuth();
  const isSuperAdminWithoutOrg = isSuperAdmin && !activeOrganizationId;
  const { dashboard, loading: dashboardLoading, fetchDashboard } = useDashboard();

  const [contentReady, setContentReady] = useState(false);

  // Check if there is any cached dashboard metrics data
  const hasAnyCache = useMemo(() => hasDashboardCache(), []);

  // Dashboard view state with localStorage persistence
  const [dashboardView, setDashboardView] = useState<DashboardView>(() => {
    const saved = localStorage.getItem(DASHBOARD_VIEW_KEY);
    return (saved as DashboardView) || "operations";
  });

  const handleViewChange = useCallback((view: DashboardView) => {
    setDashboardView(view);
    localStorage.setItem(DASHBOARD_VIEW_KEY, view);
  }, []);
  const {
    vendorRiskMetrics,
    vendorMetrics,
    policyMetrics,
    incidentMetrics,
    riskMetrics,
    modelRiskMetrics,
    trainingMetrics,
    policyStatusMetrics,
    incidentStatusMetrics,
    evidenceHubMetrics,
    evidenceMetrics,
    modelLifecycleMetrics,
    organizationalFrameworks,
    taskMetrics,
    useCaseMetrics,
    governanceScoreMetrics,
    loading: metricsLoading,
    progressStep,
    progressSteps,
  } = useDashboardMetrics();

  const { isQuantitative } = useRiskAssessmentMode();
  const { portfolio } = useOrgPortfolio();
  const { snapshots: trendSnapshots } = usePortfolioTrend(90);

  const loading = dashboardLoading || metricsLoading;

  // Mark content ready once loading completes
  useEffect(() => {
    if (!loading || isSuperAdminWithoutOrg) {
      setContentReady(true);
    }
  }, [loading, isSuperAdminWithoutOrg]);

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
      veryHigh: 0, high: 0, medium: 0, low: 0, veryLow: 0,
    };
    return {
      data: getVendorRiskData(distribution),
      total: vendorRiskMetrics?.total || 0,
    };
  }, [vendorRiskMetrics]);

  // Calculate model risk data
  const modelRiskData = useMemo(() => {
    const distribution = modelRiskMetrics?.distribution || {
      critical: 0, high: 0, medium: 0, low: 0,
    };
    return {
      data: getModelRiskData(distribution),
      total: modelRiskMetrics?.total || 0,
    };
  }, [modelRiskMetrics]);

  // Convert organizational framework data to RiskDataItem format for donut charts
  // Returns multiple views for ISO frameworks (Overall, Clauses, Annexes)
  const getFrameworkStatusViews = useCallback((framework: OrganizationalFrameworkData) => {
    // For NIST AI RMF, use the status breakdown (single view)
    if (framework.nistStatusBreakdown) {
      const data = getNistStatusData(framework.nistStatusBreakdown).filter(item => item.value > 0);
      const total = data.reduce((sum, item) => sum + item.value, 0);
      return [{ label: "Status", data, total }];
    }

    // For ISO frameworks (42001, 27001), create multiple views
    const clauseProgress = framework.clauseProgress || { totalSubclauses: 0, doneSubclauses: 0 };
    const annexProgress = framework.annexProgress || {};

    const totalClauses = clauseProgress.totalSubclauses || 0;
    const doneClauses = clauseProgress.doneSubclauses || 0;

    const totalAnnex = (annexProgress.totalAnnexControls || 0) + (annexProgress.totalAnnexcategories || 0);
    const doneAnnex = (annexProgress.doneAnnexControls || 0) + (annexProgress.doneAnnexcategories || 0);

    const views = [];

    if (totalClauses > 0) {
      views.push({
        label: "Clauses",
        data: getCompletionData(doneClauses, totalClauses - doneClauses).filter(item => item.value > 0),
        total: totalClauses,
      });
    }

    if (totalAnnex > 0) {
      views.push({
        label: "Annexes",
        data: getCompletionData(doneAnnex, totalAnnex - doneAnnex).filter(item => item.value > 0),
        total: totalAnnex,
      });
    }

    if (views.length === 0) {
      views.push({ label: "Status", data: [], total: 0 });
    }

    return views;
  }, []);

  // State to track current view index for each framework
  const [frameworkViewIndices, setFrameworkViewIndices] = useState<Record<number, number>>({});

  const handlePrevView = useCallback((frameworkId: number, maxViews: number) => {
    setFrameworkViewIndices(prev => ({
      ...prev,
      [frameworkId]: ((prev[frameworkId] || 0) - 1 + maxViews) % maxViews,
    }));
  }, []);

  const handleNextView = useCallback((frameworkId: number, maxViews: number) => {
    setFrameworkViewIndices(prev => ({
      ...prev,
      [frameworkId]: ((prev[frameworkId] || 0) + 1) % maxViews,
    }));
  }, []);

  // Show step progress dialog on cold loads (no cache)
  if (loading && !hasAnyCache) {
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
  // Skip loading wait for super admin without org — API calls will fail, show zeroes immediately
  if (loading && !isSuperAdminWithoutOrg) {
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
        <Typography variant="h5" sx={{ fontWeight: 600, fontSize: 20, fontFamily: "'Red Hat Display', 'Geist', sans-serif" }}>
          Dashboard
        </Typography>

        <Stack direction="row" alignItems="center" gap="16px">
          <ButtonToggle
            options={[
              { label: "Operations view", value: "operations" },
              { label: "Executive view", value: "executive" },
            ]}
            value={dashboardView}
            onChange={(value) => handleViewChange(value as DashboardView)}
            height={34}
          />
          <Box data-joyride-id="add-new-dropdown">
            <MegaDropdownErrorBoundary>
              <AddNewMegaDropdown />
            </MegaDropdownErrorBoundary>
          </Box>
        </Stack>
      </Stack>

      {/* Quick Stats Row */}
      <Box
        data-joyride-id="dashboard-stats"
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: "16px",
          mb: "16px",
          "& > *": {
            flex: "1 1 0",
            minWidth: "150px",
          },
        }}
      >
        <DashboardHeaderCard
          title="Models"
          count={dashboard?.models || 0}
          icon={<Brain size={18} />}
          navigateTo="/model-inventory"
        />
        <DashboardHeaderCard
          title="Vendors"
          count={vendorMetrics?.total || 0}
          icon={<Building2 size={18} />}
          navigateTo="/vendors"
        />
        <DashboardHeaderCard
          title="Policies"
          count={policyMetrics?.total || 0}
          icon={<ScrollText size={18} />}
          navigateTo="/policies"
        />
        <DashboardHeaderCard
          title="Trainings"
          count={dashboard?.trainings || 0}
          icon={<GraduationCap size={18} />}
        />
        <DashboardHeaderCard
          title="Incidents"
          count={incidentMetrics?.total || 0}
          icon={<AlertCircle size={18} />}
          navigateTo="/ai-incident-managements"
        />
      </Box>

      {/* Conditional rows based on dashboard view */}
      {dashboardView === "executive" ? (
        <>
          {/* Executive Row 2: Organizational Frameworks */}
          {organizationalFrameworks.length > 0 && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "16px",
                mb: "16px",
              }}
            >
              {organizationalFrameworks.map((framework) => {
                const views = getFrameworkStatusViews(framework);
                const currentIndex = frameworkViewIndices[framework.projectFrameworkId] || 0;
                const currentView = views[currentIndex];
                const hasMultipleViews = views.length > 1;

                return (
                  <DashboardCard
                    key={framework.projectFrameworkId}
                    title={framework.frameworkName}
                    navigateTo="/framework"
                    actionPosition="center"
                    action={
                      hasMultipleViews ? (
                        <Stack
                          direction="row"
                          alignItems="center"
                          gap={0.5}
                        >
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePrevView(framework.projectFrameworkId, views.length);
                            }}
                            sx={navIconButtonSx}
                          >
                            <ChevronLeft size={18} />
                          </IconButton>
                          <Typography
                            sx={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: `${text.icon}`,
                              minWidth: 55,
                              textAlign: "center",
                            }}
                          >
                            {currentView.label}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNextView(framework.projectFrameworkId, views.length);
                            }}
                            sx={navIconButtonSx}
                          >
                            <ChevronRight size={18} />
                          </IconButton>
                        </Stack>
                      ) : undefined
                    }
                  >
                    {currentView.total === 0 ? (
                      <EmptyStateMessage message="No data available" />
                    ) : (
                      <RiskDonutWithLegend data={currentView.data} total={currentView.total} />
                    )}
                  </DashboardCard>
                );
              })}
            </Box>
          )}

          {/* Executive Row 3: Governance Score + Risks (top row) */}
          <Box
            sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", mb: "16px" }}
          >
            <DashboardCard title="AI governance score">
              {governanceScoreMetrics && governanceScoreMetrics?.score > 0 ? (
                <GovernanceScoreCard
                  score={governanceScoreMetrics?.score}
                  modules={governanceScoreMetrics?.modules}
                />
              ) : (
                <EmptyStateMessage message="Add data to see your governance score" />
              )}
            </DashboardCard>
            <DashboardCard title="Use case & framework risks" navigateTo="/risk-management">
              {useCaseRiskData.total === 0 ? (
                <EmptyStateMessage message="No risks identified" />
              ) : (
                <RiskDonutWithLegend data={useCaseRiskData.data} total={useCaseRiskData.total} />
              )}
            </DashboardCard>
            <DashboardCard title="Vendor risks" navigateTo="/vendors/risks">
              {vendorRiskData.total === 0 ? (
                <EmptyStateMessage message="No vendor risks" />
              ) : (
                <RiskDonutWithLegend data={vendorRiskData.data} total={vendorRiskData.total} />
              )}
            </DashboardCard>
          </Box>

          {/* Executive Row 4: Model risks */}
          <Box
            sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", mb: "16px" }}
          >
            <DashboardCard title="Model risks" navigateTo="/model-inventory/model-risks">
              {modelRiskData.total === 0 ? (
                <EmptyStateMessage message="No model risks" />
              ) : (
                <RiskDonutWithLegend data={modelRiskData.data} total={modelRiskData.total} />
              )}
            </DashboardCard>
          </Box>

          {/* Executive Row 4b: Quantitative risk portfolio (conditional) */}
          {isQuantitative && portfolio && portfolio.risk_count > 0 && (
            <Box
              sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", mb: "16px" }}
            >
              <DashboardCard title="AI portfolio exposure" navigateTo="/risk-management">
                <PortfolioExposureCard portfolio={portfolio} />
              </DashboardCard>
              <DashboardCard title="Exposure trend (90 days)">
                <PortfolioTrendChart snapshots={trendSnapshots} height={200} />
              </DashboardCard>
              <DashboardCard title="Loss category breakdown">
                <LossCategoryBreakdown
                  regulatory={portfolio.loss_regulatory}
                  operational={portfolio.loss_operational}
                  litigation={portfolio.loss_litigation}
                  reputational={portfolio.loss_reputational}
                />
              </DashboardCard>
            </Box>
          )}

          {/* Executive Row 5: Recent activity + Recent use cases */}
          <Box
            sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", mb: "16px" }}
          >
            <DashboardCard title="Recent activity">
              {(() => {
                // Combine all recent items with timestamps and types
                const allActivities: Array<{ id: string; title: string; timestamp: string; type: string }> = [];

                // Add policies
                policyMetrics?.recent?.forEach((policy: any) => {
                  allActivities.push({
                    id: `policy-${policy.id}`,
                    title: policy.title,
                    timestamp: policy.last_updated_at,
                    type: "Policy",
                  });
                });

                // Add incidents (prefer updated_at over created_at)
                incidentMetrics?.recent?.forEach((incident: any) => {
                  allActivities.push({
                    id: `incident-${incident.id}`,
                    title: incident.description
                      ? incident.description.length > 60
                        ? incident.description.slice(0, 60) + "..."
                        : incident.description
                      : incident.incident_id,
                    timestamp: incident.updated_at || incident.created_at,
                    type: "Incident",
                  });
                });

                // Add risks (prefer updated_at over created_at)
                riskMetrics?.recent?.forEach((risk: any) => {
                  allActivities.push({
                    id: `risk-${risk.id}`,
                    title: risk.title,
                    timestamp: risk.updated_at || risk.created_at,
                    type: "Risk",
                  });
                });

                // Add evidence (prefer updated_at)
                evidenceMetrics?.recent?.forEach((evidence: any) => {
                  allActivities.push({
                    id: `evidence-${evidence.id}`,
                    title: evidence.title,
                    timestamp: evidence.updated_at || evidence.uploaded_at,
                    type: "Evidence",
                  });
                });

                // Add vendors (prefer updated_at over created_at)
                vendorMetrics?.recent?.forEach((vendor: any) => {
                  allActivities.push({
                    id: `vendor-${vendor.id}`,
                    title: vendor.name,
                    timestamp: vendor.updated_at || vendor.created_at,
                    type: "Vendor",
                  });
                });

                // Add vendor risks (prefer updated_at over created_at)
                vendorRiskMetrics?.recent?.forEach((vendorRisk: any) => {
                  allActivities.push({
                    id: `vendorRisk-${vendorRisk.id}`,
                    title: vendorRisk.title,
                    timestamp: vendorRisk.updated_at || vendorRisk.created_at,
                    type: "Vendor risk",
                  });
                });

                // Add model risks (prefer updated_at over created_at)
                modelRiskMetrics?.recent?.forEach((modelRisk: any) => {
                  allActivities.push({
                    id: `modelRisk-${modelRisk.id}`,
                    title: modelRisk.title,
                    timestamp: modelRisk.updated_at || modelRisk.created_at,
                    type: "Model risk",
                  });
                });

                // Add tasks (prefer updated_at over created_at)
                taskMetrics?.recent?.forEach((task: any) => {
                  allActivities.push({
                    id: `task-${task.id}`,
                    title: task.title,
                    timestamp: task.updated_at || task.created_at,
                    type: "Task",
                  });
                });

                // Add use cases (prefer last_updated over created_at)
                useCaseMetrics?.recent?.forEach((useCase: any) => {
                  allActivities.push({
                    id: `useCase-${useCase.id}`,
                    title: useCase.title,
                    timestamp: useCase.last_updated || useCase.created_at,
                    type: "Use case",
                  });
                });

                // Add trainings (prefer updated_at over created_at)
                trainingMetrics?.recent?.forEach((training: any) => {
                  allActivities.push({
                    id: `training-${training.id}`,
                    title: training.title,
                    timestamp: training.updated_at || training.created_at,
                    type: "Training",
                  });
                });

                // Sort by timestamp descending and take top 5
                const sortedActivities = allActivities
                  .filter((a) => a.timestamp) // Filter out items without valid timestamps
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .slice(0, 5);

                if (sortedActivities.length === 0) {
                  return <EmptyStateMessage message="No recent activity" />;
                }

                return (
                  <Stack gap={0}>
                    {sortedActivities.map((activity, index) => (
                      <ActivityItem
                        key={activity.id}
                        title={activity.title}
                        timestamp={formatRelativeDate(activity.timestamp)}
                        type={activity.type}
                        isLast={index === sortedActivities.length - 1}
                      />
                    ))}
                  </Stack>
                );
              })()}
            </DashboardCard>
            <DashboardCard title="Recent use cases" navigateTo="/overview">
              {useCases.length === 0 ? (
                <EmptyStateMessage message="No use cases created yet" />
              ) : (
                <UseCasesTable
                  data={useCases}
                  onRowClick={(id) => navigateSearch("/project-view", { projectId: id.toString() })}
                  formatDate={formatRelativeDate}
                />
              )}
            </DashboardCard>
          </Box>

          {/* Executive Row 5: Training, Policy, Incident status */}
          <Box
            sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", mb: "16px" }}
          >
            <DashboardCard title="Training status" navigateTo="/training">
              {trainingMetrics && trainingMetrics.total > 0 ? (
                <TrainingCompletionCard
                  total={trainingMetrics.total}
                  distribution={trainingMetrics.distribution}
                  completionPercentage={trainingMetrics.completionPercentage}
                  totalPeople={trainingMetrics.totalPeople}
                />
              ) : (
                <EmptyStateMessage message="No training data" />
              )}
            </DashboardCard>
            <DashboardCard title="Policy status" navigateTo="/policies">
              {policyStatusMetrics && policyStatusMetrics.total > 0 ? (
                <PolicyStatusCard
                  total={policyStatusMetrics.total}
                  distribution={policyStatusMetrics.distribution}
                />
              ) : (
                <EmptyStateMessage message="No policies" />
              )}
            </DashboardCard>
            <DashboardCard title="Incident status" navigateTo="/ai-incident-managements">
              {incidentStatusMetrics && incidentStatusMetrics.total > 0 ? (
                <IncidentStatusCard
                  total={incidentStatusMetrics.total}
                  distribution={incidentStatusMetrics.distribution}
                />
              ) : (
                <EmptyStateMessage message="No incidents" />
              )}
            </DashboardCard>
          </Box>

          {/* Executive Row 6: Task radar, Evidence coverage, Model lifecycle */}
          <Box
            sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", mb: "16px" }}
          >
            <TaskRadarCard
              overdue={dashboard?.task_radar?.overdue || 0}
              due={dashboard?.task_radar?.due || 0}
              upcoming={dashboard?.task_radar?.upcoming || 0}
            />
            <DashboardCard title="Evidence coverage" navigateTo="/file-manager">
              {evidenceHubMetrics ? (
                <EvidenceCoverageCard
                  total={evidenceHubMetrics.total}
                  totalFiles={evidenceHubMetrics.totalFiles}
                  modelsWithEvidence={evidenceHubMetrics.modelsWithEvidence}
                  totalModels={evidenceHubMetrics.totalModels}
                  coveragePercentage={evidenceHubMetrics.coveragePercentage}
                />
              ) : (
                <EmptyStateMessage message="No evidence data" />
              )}
            </DashboardCard>
            <DashboardCard title="Model lifecycle" navigateTo="/model-inventory">
              {modelLifecycleMetrics && modelLifecycleMetrics.total > 0 ? (
                <ModelLifecycleCard
                  total={modelLifecycleMetrics.total}
                  distribution={modelLifecycleMetrics.distribution}
                />
              ) : (
                <EmptyStateMessage message="No models" />
              )}
            </DashboardCard>
          </Box>
        </>
      ) : (
        <>
          {/* Operations Row 2: Task radar, Incident status, Evidence coverage */}
          <Box
            sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", mb: "16px" }}
          >
            <TaskRadarCard
              overdue={dashboard?.task_radar?.overdue || 0}
              due={dashboard?.task_radar?.due || 0}
              upcoming={dashboard?.task_radar?.upcoming || 0}
            />
            <DashboardCard title="Incident status" navigateTo="/ai-incident-managements">
              {incidentStatusMetrics && incidentStatusMetrics.total > 0 ? (
                <IncidentStatusCard
                  total={incidentStatusMetrics.total}
                  distribution={incidentStatusMetrics.distribution}
                />
              ) : (
                <EmptyStateMessage message="No incidents" />
              )}
            </DashboardCard>
            <DashboardCard title="Evidence coverage" navigateTo="/file-manager">
              {evidenceHubMetrics ? (
                <EvidenceCoverageCard
                  total={evidenceHubMetrics.total}
                  totalFiles={evidenceHubMetrics.totalFiles}
                  modelsWithEvidence={evidenceHubMetrics.modelsWithEvidence}
                  totalModels={evidenceHubMetrics.totalModels}
                  coveragePercentage={evidenceHubMetrics.coveragePercentage}
                />
              ) : (
                <EmptyStateMessage message="No evidence data" />
              )}
            </DashboardCard>
          </Box>

          {/* Operations Row 3: Governance Score + Risks */}
          <Box
            sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", mb: "16px" }}
          >
            <DashboardCard title="AI governance score">
              {governanceScoreMetrics && governanceScoreMetrics?.score > 0  ? (
                <GovernanceScoreCard
                  score={governanceScoreMetrics.score}
                  modules={governanceScoreMetrics.modules}
                />
              ) : (
                <EmptyStateMessage message="Add data to see your governance score" />
              )}
            </DashboardCard>
            <DashboardCard title="Use case & framework risks" navigateTo="/risk-management">
              {useCaseRiskData.total === 0 ? (
                <EmptyStateMessage message="No risks identified" />
              ) : (
                <RiskDonutWithLegend data={useCaseRiskData.data} total={useCaseRiskData.total} />
              )}
            </DashboardCard>
            <DashboardCard title="Vendor risks" navigateTo="/vendors/risks">
              {vendorRiskData.total === 0 ? (
                <EmptyStateMessage message="No vendor risks" />
              ) : (
                <RiskDonutWithLegend data={vendorRiskData.data} total={vendorRiskData.total} />
              )}
            </DashboardCard>
          </Box>

          {/* Operations Row 4: Model risks */}
          <Box
            sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", mb: "16px" }}
          >
            <DashboardCard title="Model risks" navigateTo="/model-inventory/model-risks">
              {modelRiskData.total === 0 ? (
                <EmptyStateMessage message="No model risks" />
              ) : (
                <RiskDonutWithLegend data={modelRiskData.data} total={modelRiskData.total} />
              )}
            </DashboardCard>
          </Box>

          {/* Operations Row 4: Recent use cases + Recent activity */}
          <Box
            sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", mb: "16px" }}
          >
            <DashboardCard title="Recent use cases" navigateTo="/overview">
              {useCases.length === 0 ? (
                <EmptyStateMessage message="No use cases created yet" />
              ) : (
                <UseCasesTable
                  data={useCases}
                  onRowClick={(id) => navigateSearch("/project-view", { projectId: id.toString() })}
                  formatDate={formatRelativeDate}
                />
              )}
            </DashboardCard>
            <DashboardCard title="Recent activity">
              {(() => {
                // Combine all recent items with timestamps and types
                const allActivities: Array<{ id: string; title: string; timestamp: string; type: string }> = [];

                // Add policies
                policyMetrics?.recent?.forEach((policy: any) => {
                  allActivities.push({
                    id: `policy-${policy.id}`,
                    title: policy.title,
                    timestamp: policy.last_updated_at,
                    type: "Policy",
                  });
                });

                // Add incidents (prefer updated_at over created_at)
                incidentMetrics?.recent?.forEach((incident: any) => {
                  allActivities.push({
                    id: `incident-${incident.id}`,
                    title: incident.description
                      ? incident.description.length > 60
                        ? incident.description.slice(0, 60) + "..."
                        : incident.description
                      : incident.incident_id,
                    timestamp: incident.updated_at || incident.created_at,
                    type: "Incident",
                  });
                });

                // Add risks (prefer updated_at over created_at)
                riskMetrics?.recent?.forEach((risk: any) => {
                  allActivities.push({
                    id: `risk-${risk.id}`,
                    title: risk.title,
                    timestamp: risk.updated_at || risk.created_at,
                    type: "Risk",
                  });
                });

                // Add evidence (prefer updated_at)
                evidenceMetrics?.recent?.forEach((evidence: any) => {
                  allActivities.push({
                    id: `evidence-${evidence.id}`,
                    title: evidence.title,
                    timestamp: evidence.updated_at || evidence.uploaded_at,
                    type: "Evidence",
                  });
                });

                // Add vendors (prefer updated_at over created_at)
                vendorMetrics?.recent?.forEach((vendor: any) => {
                  allActivities.push({
                    id: `vendor-${vendor.id}`,
                    title: vendor.name,
                    timestamp: vendor.updated_at || vendor.created_at,
                    type: "Vendor",
                  });
                });

                // Add vendor risks (prefer updated_at over created_at)
                vendorRiskMetrics?.recent?.forEach((vendorRisk: any) => {
                  allActivities.push({
                    id: `vendorRisk-${vendorRisk.id}`,
                    title: vendorRisk.title,
                    timestamp: vendorRisk.updated_at || vendorRisk.created_at,
                    type: "Vendor risk",
                  });
                });

                // Add model risks (prefer updated_at over created_at)
                modelRiskMetrics?.recent?.forEach((modelRisk: any) => {
                  allActivities.push({
                    id: `modelRisk-${modelRisk.id}`,
                    title: modelRisk.title,
                    timestamp: modelRisk.updated_at || modelRisk.created_at,
                    type: "Model risk",
                  });
                });

                // Add tasks (prefer updated_at over created_at)
                taskMetrics?.recent?.forEach((task: any) => {
                  allActivities.push({
                    id: `task-${task.id}`,
                    title: task.title,
                    timestamp: task.updated_at || task.created_at,
                    type: "Task",
                  });
                });

                // Add use cases (prefer last_updated over created_at)
                useCaseMetrics?.recent?.forEach((useCase: any) => {
                  allActivities.push({
                    id: `useCase-${useCase.id}`,
                    title: useCase.title,
                    timestamp: useCase.last_updated || useCase.created_at,
                    type: "Use case",
                  });
                });

                // Add trainings (prefer updated_at over created_at)
                trainingMetrics?.recent?.forEach((training: any) => {
                  allActivities.push({
                    id: `training-${training.id}`,
                    title: training.title,
                    timestamp: training.updated_at || training.created_at,
                    type: "Training",
                  });
                });

                // Sort by timestamp descending and take top 5
                const sortedActivities = allActivities
                  .filter((a) => a.timestamp) // Filter out items without valid timestamps
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .slice(0, 5);

                if (sortedActivities.length === 0) {
                  return <EmptyStateMessage message="No recent activity" />;
                }

                return (
                  <Stack gap={0}>
                    {sortedActivities.map((activity, index) => (
                      <ActivityItem
                        key={activity.id}
                        title={activity.title}
                        timestamp={formatRelativeDate(activity.timestamp)}
                        type={activity.type}
                        isLast={index === sortedActivities.length - 1}
                      />
                    ))}
                  </Stack>
                );
              })()}
            </DashboardCard>
          </Box>

          {/* Operations Row 5: Training, Policy, Model lifecycle */}
          <Box
            sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", mb: "16px" }}
          >
            <DashboardCard title="Training status" navigateTo="/training">
              {trainingMetrics && trainingMetrics.total > 0 ? (
                <TrainingCompletionCard
                  total={trainingMetrics.total}
                  distribution={trainingMetrics.distribution}
                  completionPercentage={trainingMetrics.completionPercentage}
                  totalPeople={trainingMetrics.totalPeople}
                />
              ) : (
                <EmptyStateMessage message="No training data" />
              )}
            </DashboardCard>
            <DashboardCard title="Policy status" navigateTo="/policies">
              {policyStatusMetrics && policyStatusMetrics.total > 0 ? (
                <PolicyStatusCard
                  total={policyStatusMetrics.total}
                  distribution={policyStatusMetrics.distribution}
                />
              ) : (
                <EmptyStateMessage message="No policies" />
              )}
            </DashboardCard>
            <DashboardCard title="Model lifecycle" navigateTo="/model-inventory">
              {modelLifecycleMetrics && modelLifecycleMetrics.total > 0 ? (
                <ModelLifecycleCard
                  total={modelLifecycleMetrics.total}
                  distribution={modelLifecycleMetrics.distribution}
                />
              ) : (
                <EmptyStateMessage message="No models" />
              )}
            </DashboardCard>
          </Box>

          {/* Operations Row 6: Organizational Frameworks (only if any exist) */}
          {organizationalFrameworks.length > 0 && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "16px",
                mb: "16px",
              }}
            >
              {organizationalFrameworks.map((framework) => {
                const views = getFrameworkStatusViews(framework);
                const currentIndex = frameworkViewIndices[framework.projectFrameworkId] || 0;
                const currentView = views[currentIndex];
                const hasMultipleViews = views.length > 1;

                return (
                  <DashboardCard
                    key={framework.projectFrameworkId}
                    title={framework.frameworkName}
                    navigateTo="/framework"
                    actionPosition="center"
                    action={
                      hasMultipleViews ? (
                        <Stack
                          direction="row"
                          alignItems="center"
                          gap={0.5}
                        >
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePrevView(framework.projectFrameworkId, views.length);
                            }}
                            sx={navIconButtonSx}
                          >
                            <ChevronLeft size={18} />
                          </IconButton>
                          <Typography
                            sx={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: "text.icon",
                              minWidth: 55,
                              textAlign: "center",
                            }}
                          >
                            {currentView.label}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNextView(framework.projectFrameworkId, views.length);
                            }}
                            sx={navIconButtonSx}
                          >
                            <ChevronRight size={18} />
                          </IconButton>
                        </Stack>
                      ) : undefined
                    }
                  >
                    {currentView.total === 0 ? (
                      <EmptyStateMessage message="No data available" />
                    ) : (
                      <RiskDonutWithLegend data={currentView.data} total={currentView.total} />
                    )}
                  </DashboardCard>
                );
              })}
            </Box>
          )}
        </>
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
