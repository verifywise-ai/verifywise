import { useContext, useState } from "react";
import { Typography, CircularProgress, Button, Stack } from "@mui/material";
import { SelectChangeEvent } from "@mui/material/Select";
import { BarChart3 } from "lucide-react";
import Select from "../../components/Inputs/Select";
import CoverageChart from "../../components/GovernanceOS/CoverageChart";
import { DashboardHeaderCard } from "../../components/Cards/DashboardHeaderCard";
import { EmptyState } from "../../components/EmptyState";
import { useCoverage, useRefreshCoverage } from "../../../application/hooks/useGovernanceOs";
import { VerifyWiseContext } from "../../../application/contexts/VerifyWise.context";

const UnifiedInsights = () => {
  const { projects } = useContext(VerifyWiseContext);
  const [selectedProjectId, setSelectedProjectId] = useState<number | "">("");
  const { data: coverage, isLoading } = useCoverage(
    typeof selectedProjectId === "number" ? selectedProjectId : 0,
  );
  const refreshMutation = useRefreshCoverage();

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

  return (
    <Stack spacing={3}>
      <Typography variant="body2" sx={{ color: "#475467" }}>
        View cross-framework coverage analysis per project. Identify gaps and synergies across your
        active frameworks.
      </Typography>

      <Stack direction="row" spacing={2} alignItems="flex-end">
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

        {typeof selectedProjectId === "number" && selectedProjectId > 0 && (
          <Button
            size="small"
            variant="outlined"
            onClick={() => refreshMutation.mutate(selectedProjectId)}
            disabled={refreshMutation.isPending}
            sx={{ height: 34 }}
          >
            {refreshMutation.isPending ? "Refreshing..." : "Refresh Coverage"}
          </Button>
        )}
      </Stack>

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
        <Stack spacing={3}>
          {/* Summary cards */}
          <Stack direction="row" spacing={2} sx={{ width: "100%" }}>
            <DashboardHeaderCard
              title="Average Coverage"
              count={`${avgCoverage}%`}
              disableNavigation
            />
            <DashboardHeaderCard title="Mapped Controls" count={totalMapped} disableNavigation />
            <DashboardHeaderCard title="Total Controls" count={totalControls} disableNavigation />
            <DashboardHeaderCard
              title="Active Frameworks"
              count={coverage?.length || 0}
              disableNavigation
            />
          </Stack>

          {/* Coverage breakdown */}
          <CoverageChart coverage={coverage || []} />
        </Stack>
      )}
    </Stack>
  );
};

export default UnifiedInsights;
