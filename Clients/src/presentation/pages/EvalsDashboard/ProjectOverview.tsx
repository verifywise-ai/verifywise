import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Stack,
  Typography,
  CircularProgress,
  Card,
  CardContent,
  useTheme,
} from "@mui/material";
import { Play, Beaker, Activity, CheckCircle, Clock, Star, Coins, LucideIcon } from "lucide-react";
import { cardStyles } from "../../themes";
import { CustomizableButton } from "../../components/button/customizable-button";
import EvaluationTable from "../../components/Table/EvaluationTable";
import type { IEvaluationRow } from "../../types/interfaces/i.table";
import {
  getProject,
  getExperiments,
  getMonitorDashboard,
  getLogs,
  type Experiment,
  type MonitorDashboard,
  type EvaluationLog,
} from "../../../application/repository/deepEval.repository";
import NewExperimentModal from "./NewExperimentModal";
import type { DeepEvalProject } from "./types";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/Layout/PageHeader";
import HelperIcon from "../../components/HelperIcon";
import TipBox from "../../components/TipBox";
import { useAuth } from "../../../application/hooks/useAuth";
import allowedRoles from "../../../application/constants/permissions";
import { palette } from "../../themes/palette";

interface ProjectOverviewProps {
  projectId: string;
  orgId?: string | null;
  project: DeepEvalProject | null;
  onProjectUpdate: (project: DeepEvalProject) => void;
  onViewExperiment?: (experimentId: string) => void;
}

// Stat card component matching IntegratedDashboard MetricCard style
interface StatCardProps {
  title: string;
  value: string | number;
  Icon: LucideIcon;
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, Icon, subtitle }) => {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Card
      elevation={0}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        ...(cardStyles.base(theme) as Record<string, unknown>),
        "background": `linear-gradient(135deg, ${palette.background.main} 0%, ${palette.background.accent} 100%)`,
        "border": `1px solid ${palette.border.light}`,
        "height": "100%",
        "minHeight": "80px",
        "position": "relative",
        "transition": "all 0.2s ease",
        "display": "flex",
        "flexDirection": "column",
        "boxSizing": "border-box",
        "borderRadius": "8px",
        "overflow": "hidden",
        "&:hover": {
          background: `linear-gradient(135deg, ${palette.background.accent} 0%, ${palette.background.hover} 100%)`,
          borderColor: palette.border.dark,
        },
      }}
    >
      <CardContent
        sx={{
          "p": "14px 16px",
          "position": "relative",
          "height": "100%",
          "display": "flex",
          "flexDirection": "column",
          "flex": 1,
          "overflow": "hidden",
          "&:last-child": { pb: "14px" },
        }}
      >
        {/* Background Icon */}
        <Box
          sx={{
            position: "absolute",
            bottom: "-20px",
            right: "-20px",
            opacity: isHovered ? 0.06 : 0.03,
            transform: isHovered ? "translateY(-4px)" : "translateY(0px)",
            zIndex: 0,
            pointerEvents: "none",
            transition: "opacity 0.2s ease, transform 0.3s ease",
          }}
        >
          <Icon size={64} />
        </Box>

        {/* Content */}
        <Box sx={{ position: "relative", zIndex: 1 }}>
          <Typography
            variant="body2"
            sx={{
              color: palette.text.disabled,
              fontSize: "11px",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              mb: 0.5,
            }}
          >
            {title}
          </Typography>
          <Typography
            sx={{
              fontSize: "20px",
              fontWeight: 600,
              color: palette.text.primary,
              lineHeight: 1.3,
            }}
          >
            {value}
          </Typography>
          {subtitle && (
            <Typography
              sx={{
                fontSize: "10px",
                color: palette.text.disabled,
                mt: 0.25,
                fontWeight: 400,
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default function ProjectOverview({
  projectId,
  orgId,
  project,
  onProjectUpdate,
  onViewExperiment,
}: ProjectOverviewProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [evaluationLogs, setEvaluationLogs] = useState<EvaluationLog[]>([]);
  const [dashboardData, setDashboardData] = useState<MonitorDashboard | null>(null);
  const [newExperimentModalOpen, setNewExperimentModalOpen] = useState(false);

  // RBAC permissions
  const { userRoleName, isSuperAdmin } = useAuth();
  const canCreateExperiment =
    allowedRoles.evals.createExperiment.includes(userRoleName) && !isSuperAdmin;

  const loadOverviewData = useCallback(async () => {
    try {
      setLoading(true);

      // Load project if not provided
      if (!project) {
        const projectData = await getProject(projectId);
        onProjectUpdate(projectData.project);
      }

      // Load experiments, logs, and dashboard data in parallel
      const [experimentsData, logsData, dashboardResponse] = await Promise.all([
        getExperiments({ project_id: projectId, limit: 100 }),
        getLogs({ project_id: projectId, limit: 1000 }).catch(() => ({ logs: [] })),
        getMonitorDashboard(projectId).catch(() => ({ data: null })),
      ]);

      setExperiments(experimentsData.experiments || []);
      setEvaluationLogs(logsData.logs || []);
      setDashboardData(dashboardResponse.data);
    } catch (err) {
      console.error("Failed to load overview data:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, project, onProjectUpdate]);

  useEffect(() => {
    loadOverviewData();
  }, [loadOverviewData]);

  const handleNewExperiment = () => {
    setNewExperimentModalOpen(true);
  };

  const handleExperimentSuccess = () => {
    // Reload stats after experiment is created
    loadOverviewData();
  };

  // Format numbers for display
  const formatNumber = (num: number | undefined, decimals = 0): string => {
    if (num === undefined || num === null || isNaN(num)) return "-";
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(decimals);
  };

  const formatLatency = (ms: number | undefined): string => {
    if (ms === undefined || ms === null || isNaN(ms)) return "-";
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${Math.round(ms)}ms`;
  };

  const formatScore = (score: number | undefined): string => {
    if (score === undefined || score === null || isNaN(score)) return "-";
    return score.toFixed(2);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={8}>
        <CircularProgress />
      </Box>
    );
  }

  const hasExperiments = experiments.length > 0;

  // Calculate metrics from experiments data
  const totalExperiments = experiments.length;
  const completedExperiments = experiments.filter((e) => e.status === "completed").length;
  const failedExperiments = experiments.filter((e) => e.status === "failed").length;

  // Success rate: completed / (completed + failed) - ignore running/pending
  const finishedExperiments = completedExperiments + failedExperiments;
  const successRate =
    finishedExperiments > 0
      ? `${((completedExperiments / finishedExperiments) * 100).toFixed(0)}%`
      : "No data";
  const successRateSubtitle =
    finishedExperiments > 0 ? `${finishedExperiments} finished` : "Run an experiment";

  // Calculate avg latency from evaluation logs (each log = one prompt evaluation)
  const logsWithLatency = evaluationLogs.filter(
    (log) => typeof log.latency_ms === "number" && !isNaN(log.latency_ms) && log.latency_ms > 0,
  );
  const avgLatencyValue =
    logsWithLatency.length > 0
      ? formatLatency(
          logsWithLatency.reduce((sum, log) => sum + (log.latency_ms || 0), 0) /
            logsWithLatency.length,
        )
      : dashboardData?.metrics?.latency?.average !== undefined
        ? formatLatency(dashboardData.metrics.latency.average)
        : null;
  const avgLatency = avgLatencyValue ?? "No data";
  const avgLatencySubtitle = avgLatencyValue
    ? `${logsWithLatency.length} logs`
    : "Run a successful experiment";

  // Calculate avg score from experiment results (avg_scores contains metric averages)
  const experimentsWithResults = experiments.filter(
    (e) => e.results && typeof e.results === "object",
  );
  const allScores: number[] = [];
  experimentsWithResults.forEach((e) => {
    const results = e.results as Record<string, unknown>;
    const avgScores = results?.avg_scores as Record<string, number> | undefined;
    if (avgScores && typeof avgScores === "object") {
      // Get all metric scores and average them
      const metricValues = Object.values(avgScores).filter(
        (v): v is number => typeof v === "number" && !isNaN(v) && v > 0,
      );
      if (metricValues.length > 0) {
        allScores.push(metricValues.reduce((a, b) => a + b, 0) / metricValues.length);
      }
    }
  });
  const avgScoreValue =
    allScores.length > 0
      ? formatScore(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : dashboardData?.metrics?.score_average?.average !== undefined
        ? formatScore(dashboardData.metrics.score_average.average)
        : null;
  const avgScore = avgScoreValue ?? "No data";
  const avgScoreSubtitle = avgScoreValue
    ? `${allScores.length} experiments`
    : "Run a successful experiment";

  // Calculate total tokens from evaluation logs
  const logsWithTokens = evaluationLogs.filter(
    (log) => typeof log.token_count === "number" && !isNaN(log.token_count) && log.token_count > 0,
  );
  const totalTokensValue =
    logsWithTokens.length > 0
      ? formatNumber(logsWithTokens.reduce((sum, log) => sum + (log.token_count || 0), 0))
      : dashboardData?.metrics?.token_count?.average !== undefined && dashboardData?.logs?.total
        ? formatNumber(dashboardData.metrics.token_count.average * dashboardData.logs.total)
        : null;
  const totalTokens = totalTokensValue ?? "No data";
  const totalTokensSubtitle = totalTokensValue
    ? "Across all experiments"
    : "Run a successful experiment";

  // Transform experiments to table rows (top 5 recent)
  const recentExperimentsRows: IEvaluationRow[] = [...experiments]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((exp) => {
      // Get dataset name from config
      let datasetName = "Dataset";
      const datasetConfig = exp.config?.dataset;
      if (datasetConfig) {
        if (datasetConfig.name) {
          datasetName = datasetConfig.name;
        } else if (datasetConfig.path) {
          const pathParts = datasetConfig.path.split("/");
          const fileName = pathParts[pathParts.length - 1]?.replace(/\.json$/i, "") || "";
          datasetName = fileName
            .split("_")
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
        } else if (datasetConfig.datasetId) {
          datasetName = datasetConfig.datasetId;
        } else if (datasetConfig.categories?.[0]) {
          datasetName = datasetConfig.categories[0];
        } else if (datasetConfig.useBuiltin) {
          datasetName = "Template";
        }
      }

      // Format date
      const createdDate = exp.created_at
        ? new Date(exp.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "-";

      // Judge/scorer display
      const judgeModel = exp.config?.judgeLlm?.model || exp.config?.judgeLlm?.provider || "";
      const scorerName = exp.config?.scorerName || "";
      const evaluationMode = exp.config?.evaluationMode || "standard";
      let judgeDisplay = "-";
      if (evaluationMode === "scorer" && scorerName) {
        judgeDisplay = scorerName;
      } else if (evaluationMode === "standard" && judgeModel) {
        judgeDisplay = judgeModel;
      } else if (evaluationMode === "both" && judgeModel && scorerName) {
        judgeDisplay = `${judgeModel} + ${scorerName}`;
      } else if (judgeModel) {
        judgeDisplay = judgeModel;
      } else if (scorerName) {
        judgeDisplay = scorerName;
      }

      // Calculate prompt count from config or results
      const promptCount =
        exp.config?.dataset?.count ||
        exp.config?.dataset?.prompts?.length ||
        exp.results?.total_prompts ||
        0;

      return {
        id: exp.id,
        name: exp.name,
        model: exp.config?.model?.name || "Unknown",
        judge: judgeDisplay,
        dataset: datasetName,
        prompts: promptCount,
        date: createdDate,
        status:
          exp.status === "completed"
            ? "Completed"
            : exp.status === "failed"
              ? "Failed"
              : exp.status === "running"
                ? "Running"
                : "Pending",
      };
    });

  // Handle viewing experiment details
  const handleViewExperiment = (row: IEvaluationRow) => {
    if (onViewExperiment) {
      onViewExperiment(row.id);
    } else {
      navigate(`/evals/${projectId}/experiment/${row.id}`);
    }
  };

  return (
    <Stack sx={{ width: "100%", overflow: "hidden" }}>
      <PageHeader
        title="Overview"
        description="Monitor your project's evaluation performance, track key metrics, and view recent experiments at a glance."
        rightContent={<HelperIcon articlePath="llm-evals/llm-evals-overview" />}
      />
      <Box sx={{ mt: "18px" }}>
        <TipBox entityName="evals-overview" />
      </Box>

      {/* Header with New Experiment button */}
      <Box display="flex" justifyContent="flex-end" alignItems="center" mb={3}>
        <CustomizableButton
          onClick={handleNewExperiment}
          variant="contained"
          text="New experiment"
          icon={<Play size={16} />}
          isDisabled={!canCreateExperiment}
          sx={{
            "backgroundColor": palette.brand.primary,
            "border": `1px solid ${palette.brand.primary}`,
            "gap": 2,
            "&:hover": {
              backgroundColor: palette.brand.primaryHover,
            },
          }}
        />
      </Box>

      {/* Stat cards: 3x2 grid */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" },
          gap: "16px",
          mb: "24px",
        }}
      >
        <StatCard
          title="Experiments"
          value={formatNumber(totalExperiments)}
          Icon={Beaker}
          subtitle={`${completedExperiments} completed`}
        />
        <StatCard
          title="Success rate"
          value={successRate}
          Icon={CheckCircle}
          subtitle={successRateSubtitle}
        />
        <StatCard
          title="Avg latency"
          value={avgLatency}
          Icon={Clock}
          subtitle={avgLatencySubtitle}
        />
        <StatCard title="Avg score" value={avgScore} Icon={Star} subtitle={avgScoreSubtitle} />
        <StatCard
          title="Total tokens"
          value={totalTokens}
          Icon={Coins}
          subtitle={totalTokensSubtitle}
        />
        <StatCard
          title="Running"
          value={experiments.filter((e) => e.status === "running").length}
          Icon={Activity}
          subtitle="Experiments in progress"
        />
      </Box>

      {/* Recent experiments table */}
      <Box>
        <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: "14px" }}>
            Recent experiments
          </Typography>
        </Box>

        {!hasExperiments ? (
          <Box
            sx={{
              border: `1px solid ${palette.border.dark}`,
              borderRadius: "4px",
              backgroundColor: palette.background.main,
              textAlign: "center",
              py: 4,
              px: 2,
            }}
          >
            <Box sx={{ mb: 2 }}>
              <Beaker size={32} color={palette.text.disabled} strokeWidth={1} />
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, fontSize: "13px" }}>
              No experiments yet
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 2, fontSize: "12px", maxWidth: 320, mx: "auto", lineHeight: 1.5 }}
            >
              Run your first experiment to start evaluating your LLM.
            </Typography>
            <CustomizableButton
              onClick={handleNewExperiment}
              variant="contained"
              text="Run first experiment"
              icon={<Play size={14} />}
              isDisabled={!canCreateExperiment}
              sx={{
                "backgroundColor": palette.brand.primary,
                "border": `1px solid ${palette.brand.primary}`,
                "gap": 1,
                "fontSize": "12px",
                "height": "32px",
                "&:hover": {
                  backgroundColor: palette.brand.primaryHover,
                },
              }}
            />
          </Box>
        ) : (
          <EvaluationTable
            columns={["EXPERIMENT NAME", "MODEL", "JUDGE/SCORER", "# PROMPTS", "DATASET", "DATE"]}
            rows={recentExperimentsRows}
            page={0}
            setCurrentPagingation={() => {}}
            onShowDetails={handleViewExperiment}
            hidePagination
          />
        )}
      </Box>

      {/* New Experiment Modal - only render when project useCase is available */}
      {project?.useCase && (
        <NewExperimentModal
          isOpen={newExperimentModalOpen}
          onClose={() => setNewExperimentModalOpen(false)}
          projectId={projectId}
          orgId={orgId}
          onSuccess={handleExperimentSuccess}
          useCase={project.useCase as "chatbot" | "rag" | "agent"}
        />
      )}
    </Stack>
  );
}
