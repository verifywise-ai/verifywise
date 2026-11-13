import { Stack, Typography } from "@mui/material";
import { smallStatsCardHeader, smallStatsCardStyle } from "./style";
import ProgressBar from "../../ProjectCard/ProgressBar";
import { palette } from "../../../themes/palette";

interface SmallStatsCardProps {
  attributeTitle?: string;
  rate?: number;
  progress?: string;
}

export function SmallStatsCard({
  attributeTitle = "Compliance tracker",
  rate = 60,
  progress = "90/100",
}: SmallStatsCardProps) {
  return (
    <Stack className="small-stats-card" sx={smallStatsCardStyle}>
      <Stack className="small-stats-card-header" sx={smallStatsCardHeader}>
        <Typography sx={{ fontSize: 13, color: palette.text.accent }}>
          {attributeTitle} completion rate
        </Typography>
        <Typography sx={{ fontSize: 16, color: "#2D3748", fontWeight: 700 }}>
          {Math.floor(rate * 100)}%
        </Typography>
      </Stack>

      <ProgressBar progress={progress} />
    </Stack>
  );
}
