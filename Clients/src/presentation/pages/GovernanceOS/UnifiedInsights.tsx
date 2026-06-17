import { useContext, useState, useMemo } from "react";
import { Typography, CircularProgress, Stack, Box, Alert, alpha } from "@mui/material";
import { SelectChangeEvent } from "@mui/material/Select";
import { BarChart3, Download, Target } from "lucide-react";
import Select from "../../components/Inputs/Select";
import CoverageChart from "../../components/GovernanceOS/CoverageChart";
import GovernanceTooltip from "../../components/GovernanceOS/GovernanceTooltip";
import MappingStatsPanel from "../../components/GovernanceOS/MappingStatsPanel";
import { DashboardHeaderCard } from "../../components/Cards/DashboardHeaderCard";
import { EmptyState } from "../../components/EmptyState";
import CreateTask from "../../components/Modals/CreateTask";
import { CustomizableButton } from "../../components/button/customizable-button";
import {
  useCoverage,
  useRefreshCoverage,
  useScenarios,
  useGovernancePreferences,
} from "../../../application/hooks/useGovernanceOs";
import { createTask } from "../../../application/repository/task.repository";
import { VerifyWiseContext } from "../../../application/contexts/VerifyWise.context";
import { ITask } from "../../../domain/interfaces/i.task";
import { TaskPriority, TaskStatus } from "../../../domain/enums/task.enum";
import { background, text, brand } from "../../themes/palette";

const UnifiedInsights = () => {
  const { projects, userId, organizationId } = useContext(VerifyWiseContext);
  const [selectedProjectId, setSelectedProjectId] = useState<number | "">("");
  const { data: coverage, isLoading } = useCoverage(
    typeof selectedProjectId === "number" ? selectedProjectId : 0,
  );
  const refreshMutation = useRefreshCoverage();
  const { data: scenarios } = useScenarios();
  const { data: preferences } = useGovernancePreferences();

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskInitialData, setTaskInitialData] = useState<Partial<ITask> | undefined>(undefined);
  const [alert, setAlert] = useState<{
    variant: "success" | "error" | "info";
    title: string;
  } | null>(null);

  const activeScenario = useMemo(() => {
    if (!preferences?.selected_scenario_id || !scenarios) return null;
    return scenarios.find((s) => s.id === preferences.selected_scenario_id) || null;
  }, [preferences, scenarios]);

  const activeScenarioPrimaryId = useMemo(() => {
    if (!activeScenario) return null;
    const po = activeScenario.priority_order as { primary?: number } | null;
    return po?.primary || null;
  }, [activeScenario]);

  const totalMapped = (coverage || []).reduce((sum, c) => sum + c.mapped_controls, 0);
  const totalControls = (coverage || []).reduce((sum, c) => sum + c.total_controls, 0);
  const avgCoverage =
    coverage && coverage.length > 0
      ? Math.round(coverage.reduce((sum, c) => sum + c.coverage_percentage, 0) / coverage.length)
      : 0;

  const projectItems = (projects || []).map((p: any) => ({
    _id: p.id,
    name: p.project_title,
  }));

  const escapeCsv = (value: unknown): string => {
    const str = String(value ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const handleExportCsv = () => {
    if (!coverage || coverage.length === 0) return;
    const headers = [
      "Framework",
      "Total Controls",
      "Mapped Controls",
      "Coverage %",
      "Gaps Count",
      "Synergies Count",
      "Gap Identifiers",
    ];
    const rows = coverage.map((fw) => [
      escapeCsv(fw.framework_name || `Framework ${fw.framework_id}`),
      escapeCsv(fw.total_controls),
      escapeCsv(fw.mapped_controls),
      escapeCsv(fw.coverage_percentage),
      escapeCsv(fw.gap_details.unmapped_controls.length),
      escapeCsv(fw.synergy_details.multi_framework_controls.length),
      escapeCsv(fw.gap_details.unmapped_controls.join("; ")),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `coverage-report-project-${selectedProjectId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openTaskModalForGap = (frameworkName: string, controlId: string) => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);
    setTaskInitialData({
      title: `Map ${controlId} for ${frameworkName}`,
      description: `This control (${controlId}) in ${frameworkName} is currently unmapped against other project frameworks. Review overlapping requirements and create cross-framework mappings where applicable.`,
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.OPEN,
      due_date: dueDate,
      assignees: userId ? [{ user_id: userId }] : [],
      categories: ["governance", "coverage-gap", frameworkName.toLowerCase().replace(/\s+/g, "-")],
    } as Partial<ITask>);
    setTaskModalOpen(true);
  };

  const openTaskModalForBulkGaps = (frameworkName: string, controlIds: string[]) => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 21);
    setTaskInitialData({
      title: `Map ${controlIds.length} unmapped controls for ${frameworkName}`,
      description: `Bulk task to address ${controlIds.length} unmapped controls in ${frameworkName}: ${controlIds.join(", ")}. Review each control for cross-framework mapping opportunities.`,
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.OPEN,
      due_date: dueDate,
      assignees: userId ? [{ user_id: userId }] : [],
      categories: ["governance", "coverage-gap", frameworkName.toLowerCase().replace(/\s+/g, "-")],
    } as Partial<ITask>);
    setTaskModalOpen(true);
  };

  const handleTaskCreated = async (formData: any) => {
    try {
      const { entity_links, ...taskData } = formData;
      const response = await createTask({
        body: {
          ...taskData,
          creator_id: userId,
          organization_id: organizationId,
          entity_links: entity_links || [],
        },
      });
      if (response && response.data) {
        setAlert({
          variant: "success",
          title: "Task created successfully",
        });
        setTimeout(() => setAlert(null), 4000);
        return { id: response.data.id as number };
      }
      return undefined;
    } catch (error) {
      console.error("Error creating task:", error);
      setAlert({
        variant: "error",
        title: "Failed to create task. Please try again.",
      });
      setTimeout(() => setAlert(null), 4000);
      return undefined;
    }
  };

  return (
    <Stack gap="16px">
      {/* Active scenario banner */}
      {activeScenario && (
        <Box
          sx={{
            border: `1px solid ${brand.primary}`,
            borderRadius: "4px",
            p: "16px",
            background: `linear-gradient(135deg, ${background.main} 0%, ${alpha(brand.primary, 0.06)} 100%)`,
          }}
        >
          <Stack direction="row" gap="16px" alignItems="center">
            <Target size={18} color={brand.primary} />
            <Typography sx={{ fontSize: 13, color: text.primary }}>
              Coverage aligned with active scenario: <strong>{activeScenario.name}</strong>
              {activeScenarioPrimaryId && (
                <span style={{ color: text.muted, fontWeight: 400 }}>
                  {" "}
                  — primary framework highlighted below
                </span>
              )}
            </Typography>
          </Stack>
        </Box>
      )}

      <Stack direction="row" gap="16px" alignItems="flex-end">
        <GovernanceTooltip
          header="Select project"
          description="Project to analyze for coverage and gaps"
        >
          <span>
            <Select
              id="project-select"
              label="Select Project"
              placeholder="Choose a project"
              value={selectedProjectId}
              items={projectItems}
              onChange={(e: SelectChangeEvent<string | number>) => {
                const val = e.target.value;
                setSelectedProjectId(val === "" ? "" : Number(val));
              }}
              sx={{ minWidth: 280 }}
            />
          </span>
        </GovernanceTooltip>

        {typeof selectedProjectId === "number" && selectedProjectId > 0 && (
          <>
            <GovernanceTooltip
              header="Refresh coverage data"
              description="Recalculate coverage and gaps for the selected project"
            >
              <span>
                <CustomizableButton
                  size="small"
                  variant="outlined"
                  onClick={() => refreshMutation.mutate(selectedProjectId)}
                  isDisabled={refreshMutation.isPending}
                  text={refreshMutation.isPending ? "Refreshing..." : "Refresh Coverage"}
                  sx={{}}
                />
              </span>
            </GovernanceTooltip>
            <GovernanceTooltip
              header="Export CSV"
              description="Download the coverage report as a CSV file"
            >
              <span>
                <CustomizableButton
                  size="small"
                  variant="outlined"
                  startIcon={<Download size={14} />}
                  onClick={handleExportCsv}
                  isDisabled={!coverage || coverage.length === 0}
                  text="Export CSV"
                  sx={{}}
                />
              </span>
            </GovernanceTooltip>
          </>
        )}
      </Stack>

      {alert && (
        <Alert severity={alert.variant} sx={{ fontSize: 13 }}>
          {alert.title}
        </Alert>
      )}

      {selectedProjectId === "" ? (
        <EmptyState
          message="Select a project to view its cross-framework coverage analysis."
          icon={BarChart3}
          showBorder
        />
      ) : isLoading ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={32} />
        </Stack>
      ) : (
        <Stack gap="16px">
          {/* Summary cards */}
          <Stack direction="row" gap="16px" sx={{ width: "100%" }}>
            <GovernanceTooltip
              header="Average coverage"
              description="Mean percentage of mapped controls across active frameworks"
            >
              <span style={{ flex: 1 }}>
                <DashboardHeaderCard
                  title="Average Coverage"
                  count={`${avgCoverage}%`}
                  disableNavigation
                />
              </span>
            </GovernanceTooltip>
            <GovernanceTooltip
              header="Mapped controls"
              description="Controls that have cross-framework mappings"
            >
              <span style={{ flex: 1 }}>
                <DashboardHeaderCard
                  title="Mapped Controls"
                  count={totalMapped}
                  disableNavigation
                />
              </span>
            </GovernanceTooltip>
            <GovernanceTooltip
              header="Total controls"
              description="Controls across all active frameworks"
            >
              <span style={{ flex: 1 }}>
                <DashboardHeaderCard
                  title="Total Controls"
                  count={totalControls}
                  disableNavigation
                />
              </span>
            </GovernanceTooltip>
            <GovernanceTooltip
              header="Active frameworks"
              description="Frameworks assigned to the selected project"
            >
              <span style={{ flex: 1 }}>
                <DashboardHeaderCard
                  title="Active Frameworks"
                  count={coverage?.length || 0}
                  disableNavigation
                />
              </span>
            </GovernanceTooltip>
          </Stack>

          {/* Coverage breakdown */}
          <CoverageChart
            coverage={coverage || []}
            onCreateTaskForGap={openTaskModalForGap}
            onCreateTasksForGaps={openTaskModalForBulkGaps}
            activeScenarioFrameworkId={activeScenarioPrimaryId}
          />

          {/* Mapping statistics */}
          {typeof selectedProjectId === "number" && selectedProjectId > 0 && (
            <MappingStatsPanel projectId={selectedProjectId} />
          )}
        </Stack>
      )}

      <CreateTask
        isOpen={taskModalOpen}
        setIsOpen={setTaskModalOpen}
        onSuccess={handleTaskCreated}
        initialData={taskInitialData as ITask | undefined}
      />
    </Stack>
  );
};

export default UnifiedInsights;
