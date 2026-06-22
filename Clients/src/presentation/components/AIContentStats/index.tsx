import { Box, Typography, LinearProgress, Stack } from "@mui/material";
import Chip from "../Chip";
import { text as textColors, border, background, brand } from "../../themes/palette";

interface AIContentStatsData {
  total: number;
  reviewed: number;
  unreviewed: number;
  review_rate: number;
  by_badge_type: {
    generated: number;
    assisted: number;
    reviewed: number;
    suggested: number;
  };
  by_review_action: {
    approved: number;
    modified: number;
    rejected: number;
  };
  avg_confidence: number | null;
}

interface AIContentStatsProps {
  data: AIContentStatsData | null;
  isLoading?: boolean;
}

const BADGE_COLORS: Record<string, { label: string; color: string }> = {
  generated: { label: "AI-generated", color: brand.primary },
  assisted: { label: "AI-assisted", color: brand.primary },
  reviewed: { label: "AI-reviewed", color: brand.primary },
  suggested: { label: "AI-suggested", color: brand.primary },
};

export default function AIContentStats({ data, isLoading }: AIContentStatsProps) {
  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <LinearProgress />
      </Box>
    );
  }

  if (!data || data.total === 0) {
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
          No AI-generated content tracked yet.
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
      <Typography sx={{ fontSize: 15, fontWeight: 600, color: textColors.primary, mb: 1 }}>
        AI content transparency
      </Typography>

      {/* Summary stats */}
      <Box sx={{ display: "flex", gap: 1, mb: 1, flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 80, textAlign: "center" }}>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: textColors.primary }}>
            {data.total}
          </Typography>
          <Typography sx={{ fontSize: 10, color: textColors.secondary }}>Total items</Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 80, textAlign: "center" }}>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: textColors.primary }}>
            {data.review_rate}%
          </Typography>
          <Typography sx={{ fontSize: 10, color: textColors.secondary }}>Reviewed</Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 80, textAlign: "center" }}>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: textColors.primary }}>
            {data.unreviewed}
          </Typography>
          <Typography sx={{ fontSize: 10, color: textColors.secondary }}>Pending</Typography>
        </Box>
        {data.avg_confidence !== null && (
          <Box sx={{ flex: 1, minWidth: 80, textAlign: "center" }}>
            <Typography sx={{ fontSize: 22, fontWeight: 700, color: textColors.primary }}>
              {data.avg_confidence}%
            </Typography>
            <Typography sx={{ fontSize: 10, color: textColors.secondary }}>
              Avg confidence
            </Typography>
          </Box>
        )}
      </Box>

      {/* Review progress bar */}
      <Box sx={{ mb: 1 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
          <Typography sx={{ fontSize: 11, color: textColors.secondary }}>
            Review progress
          </Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: textColors.primary }}>
            {data.reviewed}/{data.total}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={data.review_rate}
          sx={{
            "height": 6,
            "borderRadius": 3,
            "backgroundColor": background.hover,
            "& .MuiLinearProgress-bar": {
              borderRadius: 3,
              backgroundColor: brand.primary,
            },
          }}
        />
      </Box>

      {/* Badge type breakdown */}
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: textColors.secondary, mb: 1 }}>
        By type
      </Typography>
      <Stack spacing={0.5} sx={{ mb: 1 }}>
        {Object.entries(data.by_badge_type).map(([key, count]) => {
          const config = BADGE_COLORS[key];
          if (!config || count === 0) return null;
          const pct = data.total > 0 ? Math.round((count / data.total) * 100) : 0;
          return (
            <Box key={key} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "2px",
                  backgroundColor: config.color,
                  flexShrink: 0,
                }}
              />
              <Typography sx={{ fontSize: 11, color: textColors.secondary, flex: 1 }}>
                {config.label}
              </Typography>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: textColors.primary }}>
                {count} ({pct}%)
              </Typography>
            </Box>
          );
        })}
      </Stack>

      {/* Review actions breakdown */}
      {(data.by_review_action.approved > 0 ||
        data.by_review_action.modified > 0 ||
        data.by_review_action.rejected > 0) && (
        <>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: textColors.secondary, mb: 1 }}>
            Review outcomes
          </Typography>
          <Stack direction="row" spacing={1}>
            {data.by_review_action.approved > 0 && (
              <Chip
                label={`${data.by_review_action.approved} Approved`}
                variant="success"
                size="small"
                uppercase={false}
              />
            )}
            {data.by_review_action.modified > 0 && (
              <Chip
                label={`${data.by_review_action.modified} Modified`}
                variant="warning"
                size="small"
                uppercase={false}
              />
            )}
            {data.by_review_action.rejected > 0 && (
              <Chip
                label={`${data.by_review_action.rejected} Rejected`}
                variant="error"
                size="small"
                uppercase={false}
              />
            )}
          </Stack>
        </>
      )}
    </Box>
  );
}
