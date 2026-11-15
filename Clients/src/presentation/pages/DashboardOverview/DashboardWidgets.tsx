import React, { useCallback, useState } from "react";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import {
  AlertCircle,
  Brain,
  Building2,
  ChevronLeft,
  ChevronRight,
  GitCompareArrows,
  GraduationCap,
  ScrollText,
} from "lucide-react";
import ActivityItem from "../../components/ActivityItem";
import { DashboardCard } from "../../components/Cards/DashboardCard";
import { DashboardHeaderCard } from "../../components/Cards/DashboardHeaderCard";
import { TaskRadarCard } from "../../components/Cards/TaskRadarCard";
import { GovernanceScoreCard } from "../../components/Charts/GovernanceScoreCard";
import { LossCategoryBreakdown } from "../../components/Charts/LossCategoryBreakdown";
import {
  EvidenceCoverageCard,
  IncidentStatusCard,
  ModelLifecycleCard,
  PolicyStatusCard,
  TrainingCompletionCard,
} from "../../components/Charts/NewMetricsCards";
import { PortfolioExposureCard } from "../../components/Charts/PortfolioExposureCard";
import { PortfolioTrendChart } from "../../components/Charts/PortfolioTrendChart";
import { RiskDonutWithLegend } from "../../components/Charts/RiskDonutWithLegend";
import { EmptyStateMessage } from "../../components/EmptyStateMessage";
import HelperIcon from "../../components/HelperIcon";
import UseCasesTable from "../../components/Table/UseCasesTable";
import { useDashboard } from "../../../application/hooks/useDashboard";
import {
  useDashboardMetrics,
  type OrganizationalFrameworkData,
} from "../../../application/hooks/useDashboardMetrics";
import useNavigateSearch from "../../../application/hooks/useNavigateSearch";
import { useOrgPortfolio, usePortfolioTrend } from "../../../application/hooks/useQuantitativeRisk";
import { formatRelativeDate } from "../../../application/utils/dateFormatter";
import { text } from "../../themes/palette";
import { getCompletionData, getNistStatusData, navIconButtonSx } from "./constants";
import { buildRecentActivities } from "./recentActivity";
import UseCaseLifecycleWidgets from "./UseCaseLifecycleWidgets";
import type { DashboardWidgetKey } from "./widgetRegistry";

type RiskDonutData = React.ComponentProps<typeof RiskDonutWithLegend>["data"];

interface RiskDonut {
  data: RiskDonutData;
  total: number;
}

/** Everything the widgets draw, loaded once by the dashboard page. */
export interface DashboardWidgetData {
  dashboard: ReturnType<typeof useDashboard>["dashboard"];
  metrics: ReturnType<typeof useDashboardMetrics>;
  isGovernanceEnabled: boolean;
  portfolio: ReturnType<typeof useOrgPortfolio>["portfolio"];
  trendSnapshots: ReturnType<typeof usePortfolioTrend>["snapshots"];
  useCases: React.ComponentProps<typeof UseCasesTable>["data"];
  useCaseRisks: RiskDonut;
  vendorRisks: RiskDonut;
  modelRisks: RiskDonut;
}

interface FrameworkView {
  label: string;
  data: RiskDonutData;
  total: number;
}

/** A NIST framework has one status view; an ISO framework has clauses and annexes. */
function getFrameworkStatusViews(framework: OrganizationalFrameworkData): FrameworkView[] {
  if (framework.nistStatusBreakdown) {
    const data = getNistStatusData(framework.nistStatusBreakdown).filter((item) => item.value > 0);
    const total = data.reduce((sum, item) => sum + item.value, 0);
    return [{ label: "Status", data, total }];
  }

  const clauseProgress = framework.clauseProgress || { totalSubclauses: 0, doneSubclauses: 0 };
  const annexProgress = framework.annexProgress || {};

  const totalClauses = clauseProgress.totalSubclauses || 0;
  const doneClauses = clauseProgress.doneSubclauses || 0;

  const totalAnnex =
    (annexProgress.totalAnnexControls || 0) + (annexProgress.totalAnnexcategories || 0);
  const doneAnnex =
    (annexProgress.doneAnnexControls || 0) + (annexProgress.doneAnnexcategories || 0);

  const views: FrameworkView[] = [];

  if (totalClauses > 0) {
    views.push({
      label: "Clauses",
      data: getCompletionData(doneClauses, totalClauses - doneClauses).filter(
        (item) => item.value > 0,
      ),
      total: totalClauses,
    });
  }

  if (totalAnnex > 0) {
    views.push({
      label: "Annexes",
      data: getCompletionData(doneAnnex, totalAnnex - doneAnnex).filter((item) => item.value > 0),
      total: totalAnnex,
    });
  }

  if (views.length === 0) {
    views.push({ label: "Status", data: [], total: 0 });
  }

  return views;
}

const threeColumnGridSx = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "16px",
  mb: "16px",
};

const OrganizationalFrameworksWidget = ({
  frameworks,
}: {
  frameworks: OrganizationalFrameworkData[];
}) => {
  const [viewIndices, setViewIndices] = useState<Record<number, number>>({});

  const stepView = useCallback((frameworkId: number, delta: number, maxViews: number) => {
    setViewIndices((prev) => ({
      ...prev,
      [frameworkId]: ((prev[frameworkId] || 0) + delta + maxViews) % maxViews,
    }));
  }, []);

  return (
    <Box sx={threeColumnGridSx}>
      {frameworks.map((framework) => {
        const views = getFrameworkStatusViews(framework);
        const currentView = views[viewIndices[framework.projectFrameworkId] || 0];

        return (
          <DashboardCard
            key={framework.projectFrameworkId}
            title={framework.frameworkName}
            navigateTo="/framework"
            actionPosition="center"
            action={
              views.length > 1 ? (
                <Stack direction="row" alignItems="center" gap="4px">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      stepView(framework.projectFrameworkId, -1, views.length);
                    }}
                    aria-label={`Previous ${framework.frameworkName} view`}
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
                      stepView(framework.projectFrameworkId, 1, views.length);
                    }}
                    aria-label={`Next ${framework.frameworkName} view`}
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
  );
};

const RecentUseCasesWidget = ({ useCases }: { useCases: DashboardWidgetData["useCases"] }) => {
  const navigateSearch = useNavigateSearch();
  return (
    <DashboardCard title="Recent use cases" navigateTo="/overview">
      {useCases.length === 0 ? (
        <EmptyStateMessage message="No use cases created yet" />
      ) : (
        <UseCasesTable
          data={useCases}
          ariaLabel="Recent use cases"
          onRowClick={(id) => navigateSearch("/project-view", { projectId: id.toString() })}
          formatDate={formatRelativeDate}
        />
      )}
    </DashboardCard>
  );
};

const RecentActivityWidget = ({ metrics }: { metrics: DashboardWidgetData["metrics"] }) => {
  const sortedActivities = buildRecentActivities(metrics);
  return (
    <DashboardCard title="Recent activity">
      {sortedActivities.length === 0 ? (
        <EmptyStateMessage message="No recent activity" />
      ) : (
        // ActivityItem carries role="listitem", which is only valid inside a list.
        <Stack gap="0px" role="list">
          {sortedActivities.map((activity, index) => (
            <ActivityItem
              key={activity.id}
              title={activity.title}
              timestamp={formatRelativeDate(activity.timestamp)}
              type={activity.type}
              entityId={activity.entityId}
              entityType={activity.entityType}
              isLast={index === sortedActivities.length - 1}
            />
          ))}
        </Stack>
      )}
    </DashboardCard>
  );
};

const RiskDonutCard = ({
  title,
  navigateTo,
  emptyMessage,
  risks,
}: {
  title: string;
  navigateTo: string;
  emptyMessage: string;
  risks: RiskDonut;
}) => (
  <DashboardCard title={title} navigateTo={navigateTo}>
    {risks.total === 0 ? (
      <EmptyStateMessage message={emptyMessage} />
    ) : (
      <RiskDonutWithLegend data={risks.data} total={risks.total} />
    )}
  </DashboardCard>
);

type WidgetRenderer = (data: DashboardWidgetData) => React.ReactNode;

// A Record over the widget keys: adding a widget to the registry without a
// renderer here is a compile error.
const WIDGET_RENDERERS: Record<DashboardWidgetKey, WidgetRenderer> = {
  "quick-stats": ({ dashboard, metrics, isGovernanceEnabled }) => (
    <Box
      data-joyride-id="dashboard-stats"
      sx={{
        "display": "flex",
        "flexWrap": "wrap",
        "gap": "16px",
        "mb": "16px",
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
        count={metrics.vendorMetrics?.total || 0}
        icon={<Building2 size={18} />}
        navigateTo="/vendors"
      />
      <DashboardHeaderCard
        title="Policies"
        count={metrics.policyMetrics?.total || 0}
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
        count={metrics.incidentMetrics?.total || 0}
        icon={<AlertCircle size={18} />}
        navigateTo="/ai-incident-managements"
      />
      {isGovernanceEnabled && (
        <DashboardHeaderCard
          title="Governance Intelligence"
          count="Open"
          icon={<GitCompareArrows size={18} />}
          navigateTo="/governance"
        />
      )}
    </Box>
  ),
  "task-radar": ({ dashboard }) => (
    <TaskRadarCard
      overdue={dashboard?.task_radar?.overdue || 0}
      due={dashboard?.task_radar?.due || 0}
      upcoming={dashboard?.task_radar?.upcoming || 0}
    />
  ),
  "incident-status": ({ metrics: { incidentStatusMetrics } }) => (
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
  ),
  "evidence-coverage": ({ metrics: { evidenceHubMetrics } }) => (
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
  ),
  "governance-score": ({ metrics: { governanceScoreMetrics } }) => (
    <DashboardCard
      title="AI governance score"
      action={<HelperIcon articlePath="getting-started/dashboard" sectionId="governance-score" />}
    >
      {governanceScoreMetrics && governanceScoreMetrics.score > 0 ? (
        <GovernanceScoreCard
          score={governanceScoreMetrics.score}
          modules={governanceScoreMetrics.modules}
        />
      ) : (
        <EmptyStateMessage message="Add data to see your governance score" />
      )}
    </DashboardCard>
  ),
  "use-case-risks": ({ useCaseRisks }) => (
    <RiskDonutCard
      title="Use case & framework risks"
      navigateTo="/risk-management"
      emptyMessage="No risks identified"
      risks={useCaseRisks}
    />
  ),
  "vendor-risks": ({ vendorRisks }) => (
    <RiskDonutCard
      title="Vendor risks"
      navigateTo="/vendors/risks"
      emptyMessage="No vendor risks"
      risks={vendorRisks}
    />
  ),
  "model-risks": ({ modelRisks }) => (
    <RiskDonutCard
      title="Model risks"
      navigateTo="/model-inventory/model-risks"
      emptyMessage="No model risks"
      risks={modelRisks}
    />
  ),
  "recent-use-cases": ({ useCases }) => <RecentUseCasesWidget useCases={useCases} />,
  "recent-activity": ({ metrics }) => <RecentActivityWidget metrics={metrics} />,
  "use-case-lifecycle": () => <UseCaseLifecycleWidgets />,
  "training-status": ({ metrics: { trainingMetrics } }) => (
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
  ),
  "policy-status": ({ metrics: { policyStatusMetrics } }) => (
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
  ),
  "model-lifecycle": ({ metrics: { modelLifecycleMetrics } }) => (
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
  ),
  "organizational-frameworks": ({ metrics: { organizationalFrameworks } }) => (
    <OrganizationalFrameworksWidget frameworks={organizationalFrameworks} />
  ),
  "quantitative-portfolio": ({ portfolio, trendSnapshots }) =>
    portfolio && (
      <Box sx={threeColumnGridSx}>
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
    ),
};

/** One dashboard widget. Its place in the layout comes from widgetRegistry.ts. */
export const DashboardWidget = ({
  widgetKey,
  data,
}: {
  widgetKey: DashboardWidgetKey;
  data: DashboardWidgetData;
}) => <>{WIDGET_RENDERERS[widgetKey](data)}</>;
