import { Box, Stack, Typography } from "@mui/material";
import { DASHBOARD_COLORS, TEXT_STYLES } from "../../styles/colors";
import { DashboardChartLayout, DASHBOARD_CHART_SIZE } from "./DashboardChartLayout";

const C = DASHBOARD_COLORS;

interface ModuleScore {
  name: string;
  score: number;
  weight: number;
}

interface GovernanceScoreProps {
  score: number;
  modules: ModuleScore[];
}

// Get color based on score value
const getScoreColor = (score: number): string => {
  if (score >= 80) return C.completed; // Green
  if (score >= 60) return C.inProgress; // Amber
  return C.high; // Red
};

// Circular progress component for the main score (includes label)
function ScoreGauge({ score, size = DASHBOARD_CHART_SIZE }: { score: number; size?: number }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const scoreColor = getScoreColor(score);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Box sx={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={C.progressBackground}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={scoreColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        <Typography
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            fontSize: 24,
            fontWeight: 700,
            color: scoreColor,
          }}
        >
          {score}
        </Typography>
      </Box>
      <Typography sx={{ ...TEXT_STYLES.label, mt: 1 }}>Overall score</Typography>
    </Box>
  );
}

export function GovernanceScoreCard({ score, modules }: GovernanceScoreProps) {
  return (
    <DashboardChartLayout
      alignItems="center"
      chart={<ScoreGauge score={score} />}
      sideContent={
        <Stack spacing={2} sx={{ width: "100%" }}>
          {modules.map((module) => {
            const scoreColor = getScoreColor(module.score);
            return (
              <Typography
                key={module.name}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: C.textSecondary,
                  gap: 1,
                }}
              >
                <span>{module.name}</span>
                <span style={{ fontWeight: 600, color: scoreColor, flexShrink: 0 }}>
                  {module.score}%
                </span>
              </Typography>
            );
          })}
        </Stack>
      }
    />
  );
}
