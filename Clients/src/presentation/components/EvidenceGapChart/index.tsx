import { Box, Typography, LinearProgress, Stack } from "@mui/material";
import { status, text as textColors, border, background } from "../../themes/palette";

interface GapItem {
  framework_type: string;
  control_id: number;
  control_title: string;
  evidence_count: number;
  avg_quality: number;
  gap_type: "no_evidence" | "low_quality" | "adequate";
}

interface GapData {
  total_controls: number;
  controls_without_evidence: number;
  controls_with_low_quality: number;
  controls_adequate: number;
  quality_threshold: number;
  gaps: GapItem[];
}

interface EvidenceGapChartProps {
  data: GapData | null;
  isLoading?: boolean;
}

function CoverageBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: { bg: string; text: string };
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <Box sx={{ mb: 1.5 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
        <Typography sx={{ fontSize: 12, color: textColors.secondary }}>{label}</Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: color.text }}>
          {count} ({pct}%)
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          "height": 6,
          "borderRadius": 3,
          "backgroundColor": background.hover,
          "& .MuiLinearProgress-bar": {
            borderRadius: 3,
            backgroundColor: color.text,
          },
        }}
      />
    </Box>
  );
}

export default function EvidenceGapChart({ data, isLoading }: EvidenceGapChartProps) {
  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <LinearProgress />
      </Box>
    );
  }

  if (!data || data.total_controls === 0) {
    return (
      <Box
        sx={{
          p: 3,
          textAlign: "center",
          backgroundColor: background.accent,
          borderRadius: 2,
          border: `1px solid ${border.light}`,
        }}
      >
        <Typography sx={{ fontSize: 13, color: textColors.tertiary }}>
          No control data available for gap analysis.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${border.light}`,
        backgroundColor: background.main,
      }}
    >
      <Typography sx={{ fontSize: 15, fontWeight: 600, color: textColors.primary, mb: 2 }}>
        Evidence Coverage
      </Typography>

      {/* Coverage summary bars */}
      <CoverageBar
        label="Adequate Evidence"
        count={data.controls_adequate}
        total={data.total_controls}
        color={status.success}
      />
      <CoverageBar
        label="Low Quality Evidence"
        count={data.controls_with_low_quality}
        total={data.total_controls}
        color={status.warning}
      />
      <CoverageBar
        label="No Evidence"
        count={data.controls_without_evidence}
        total={data.total_controls}
        color={status.error}
      />

      {/* Gap details */}
      {data.gaps.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: textColors.secondary, mb: 1 }}>
            Controls Needing Attention ({data.gaps.length})
          </Typography>
          <Stack spacing={0.5}>
            {data.gaps.slice(0, 8).map((gap, i) => (
              <Box
                key={i}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  p: 1,
                  borderRadius: 1,
                  backgroundColor:
                    gap.gap_type === "no_evidence" ? status.error.bg : status.warning.bg,
                  border: `1px solid ${
                    gap.gap_type === "no_evidence" ? status.error.border : status.warning.border
                  }`,
                }}
              >
                <Typography
                  sx={{
                    fontSize: 12,
                    color: textColors.secondary,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    mr: 1,
                  }}
                >
                  {gap.control_title}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: gap.gap_type === "no_evidence" ? status.error.text : status.warning.text,
                    flexShrink: 0,
                  }}
                >
                  {gap.gap_type === "no_evidence" ? "No evidence" : `Quality: ${gap.avg_quality}`}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {/* Quality threshold note */}
      <Typography sx={{ mt: 2, fontSize: 10, color: textColors.accent }}>
        Quality threshold: {data.quality_threshold}/100
      </Typography>
    </Box>
  );
}
