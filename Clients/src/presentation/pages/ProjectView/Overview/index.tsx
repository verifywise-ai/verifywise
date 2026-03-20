/**
 * This file is currently in use
 */

import { Stack, Typography, useTheme } from "@mui/material";
import ProgressBar from "../../../components/ProjectCard/ProgressBar";
import { FC, memo, useCallback, useMemo } from "react";
import { displayFormattedDate } from "../../../tools/isoDateToString";
import Risks from "../../../components/Risks";
import IntakeSubmissionCard from "../IntakeSubmissionCard";
import { useSearchParams } from "react-router-dom";
import useProjectData from "../../../../application/hooks/useProjectData";
import useProjectStatus from "../../../../application/hooks/useProjectStatus";
import { useAuth } from "../../../../application/hooks/useAuth";
import getProjectData from "../../../../application/tools/getProjectData";
import { text } from "../../../themes/palette";

export type RiskData = {
  veryHighRisks: number;
  highRisks: number;
  mediumRisks: number;
  lowRisks: number;
  veryLowRisks: number;
};

interface OverviewProps {
  projectRisksSummary: RiskData;  
}

interface ProgressBarCardProps {
  progress: string;
  label: string;
  completed: number;
}

const Overview: FC<OverviewProps> = memo(({ projectRisksSummary }) => {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "1"; // default project ID is 2
  // Extract numeric ID for plugin-sourced IDs like "prefix-123"
  const numericProjectId = projectId.includes("-")
    ? parseInt(projectId.substring(projectId.lastIndexOf("-") + 1), 10) || 0
    : parseInt(projectId, 10) || 0;
  const { project, projectOwner, error, isLoading } = useProjectData({
    projectId,
  });
  const theme = useTheme();
  const { userId } = useAuth();
  const { projectStatus } = useProjectStatus({ userId });

  const {
    controlsProgress,
    requirementsProgress: assessmentsProgress,
    controlsCompleted,
    requirementsCompleted,
  } = getProjectData({
    projectId: numericProjectId,
    assessments: projectStatus.assessments,
    controls: projectStatus.controls,
  });

  const styles = useMemo(
    () => ({
      block: {
        borderRadius: 2,
        backgroundColor: theme.palette.background.main,
        minWidth: 228,
        width: "100%",
        padding: "8px 36px 14px 14px",
      },
      title: {
        fontSize: 12,
        color: "#8594AC",
        pb: "2px",
      },
      value: {
        fontSize: 16,
        fontWeight: 600,
        color: "#2D3748",
      },
    }),
    [theme]
  );

  const progressBarCardRender = useCallback(
    ({ progress, label, completed }: ProgressBarCardProps) => (
      <Stack sx={styles.block}>
        <Typography
          sx={{
            "&:first-letter": { textTransform: "uppercase" },
            ...styles.title,
          }}
        >
          {label} status
        </Typography>
        <ProgressBar progress={progress} />
        <Typography sx={{ fontSize: 11, color: "#8594AC" }}>
          {progress} {label}
          {completed > 1 && "s"} completed
        </Typography>
      </Stack>
    ),
    [styles.block, styles.title]
  );

  if (!project) {
    return "No project found";
  }

  return (
    <Stack sx={{ width: "100%" }}>
      {/* Main Content */}
      <Stack sx={{ width: "100%" }}>
        {isLoading && (
          <Typography variant="body1" color="text.secondary" sx={{ mb: 12 }}>
            Project are loading...
          </Typography>
        )}
        {error && (
          <Typography variant="body1" color="error" sx={{ mb: 12 }}>
            {error}
          </Typography>
        )}
        <Stack direction="row" spacing={18} sx={{ pb: "31px" }}>
          <Stack sx={styles.block}>
            <Typography sx={styles.title}>Owner</Typography>
            <Typography sx={styles.value}>{projectOwner}</Typography>
          </Stack>
          <Stack sx={styles.block}>
            <Typography sx={styles.title}>Last updated</Typography>
            <Typography sx={styles.value}>
              {displayFormattedDate(project.last_updated.toISOString())}
            </Typography>
          </Stack>
          <Stack sx={styles.block}>
            <Typography sx={styles.title}>Last updated by</Typography>
            <Typography sx={styles.value}>{project.last_updated_by}</Typography>
          </Stack>
        </Stack>
        <IntakeSubmissionCard projectId={numericProjectId} />
        <Stack direction="row" spacing={18} sx={{ pb: "56px" }} data-joyride-id="framework-progress">
          {progressBarCardRender({
            progress: controlsProgress,
            label: "control",
            completed: controlsCompleted,
          })}
          <Stack data-joyride-id="project-assessments">
            {progressBarCardRender({
              progress: assessmentsProgress,
              label: "assessment",
              completed: requirementsCompleted,
            })}
          </Stack>
          <Stack
            sx={{ minWidth: 228, width: "100%", p: "8px 36px 14px 14px" }}
          ></Stack>
        </Stack>
        <Stack sx={{ mb: 0 }} data-joyride-id="risk-summary">
          <Typography
            sx={{ color: `${text.primary}`, fontWeight: 600, mb: "10px", fontSize: 16 }}
          >
            Use case risks
          </Typography>
          <Risks {...projectRisksSummary} />
        </Stack>
      </Stack>
    </Stack>
  );
});

export default Overview;
