import { Box, LinearProgress, Typography, useTheme } from "@mui/material";
import { riskMark } from "../../../themes/palette";
import { bandFor, type ScoreBand } from "../../../../application/utils/intakeScoring/scoreMath";

export interface DimensionBar {
  key?: string;
  label?: string;
  name?: string;
  score: number;
}

/** A dimension score's colour: the colour of the band its score falls in. */
// Bar marks use the riskMark tokens (as charts do), not the risk chip text colours.
const BAND_COLORS: Record<ScoreBand, string> = {
  Low: riskMark.low,
  Medium: riskMark.medium,
  High: riskMark.high,
  Critical: riskMark.critical,
};

const LEGEND: Array<{ band: ScoreBand; label: string }> = [
  { band: "Low", label: "Low (0-25)" },
  { band: "Medium", label: "Medium (26-50)" },
  { band: "High", label: "High (51-75)" },
  { band: "Critical", label: "Critical (76-100)" },
];

export function dimensionBarColor(score: number): string {
  return BAND_COLORS[bandFor(score)];
}

/** One bar per risk dimension (0-100), coloured by band, with a band legend. */
function DimensionBars({ dimensions }: { dimensions: DimensionBar[] }) {
  const theme = useTheme();
  if (dimensions.length === 0) return null;

  return (
    <Box
      data-testid="intake-dimension-bars"
      sx={{ display: "flex", flexDirection: "column", gap: "12px" }}
    >
      {dimensions.map((dim, idx) => {
        const barColor = dimensionBarColor(dim.score);
        const dimLabel = dim.label || dim.name || dim.key || `Dimension ${idx + 1}`;
        return (
          <Box key={`${dimLabel}-${idx}`}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: "4px",
              }}
            >
              <Typography sx={{ fontSize: "13px", color: theme.palette.text.tertiary }}>
                {dimLabel}
              </Typography>
              <Typography sx={{ fontSize: "13px", fontWeight: 600, color: barColor }}>
                {dim.score}/100
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={dim.score}
              aria-label={dimLabel}
              sx={{
                "height": "6px",
                "borderRadius": "3px",
                "backgroundColor": theme.palette.background.accent,
                "& .MuiLinearProgress-bar": {
                  backgroundColor: barColor,
                  borderRadius: "3px",
                },
              }}
            />
          </Box>
        );
      })}

      <Box sx={{ display: "flex", gap: "12px", mt: "4px", flexWrap: "wrap" }}>
        {LEGEND.map((item) => (
          <Box key={item.band} sx={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <Box
              sx={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: BAND_COLORS[item.band],
              }}
            />
            <Typography sx={{ fontSize: "12px", color: theme.palette.text.accent }}>
              {item.label}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default DimensionBars;
