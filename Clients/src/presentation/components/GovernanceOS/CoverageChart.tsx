import { Box, Typography, LinearProgress, Stack, Chip } from "@mui/material";
import { ICoverageChartProps } from "../../../domain/interfaces/i.governanceOs";
import { border as borderPalette, background, text, status, brand } from "../../themes/palette";

const CoverageChart = ({ coverage }: ICoverageChartProps) => {
  if (!coverage || coverage.length === 0) {
    return (
      <Typography sx={{ fontSize: 13, color: text.accent }}>
        No coverage data available. Assign frameworks to a project first.
      </Typography>
    );
  }

  return (
    <Stack spacing={2}>
      {coverage.map((fw) => (
        <Box
          key={fw.framework_id}
          sx={{
            "border": `1px solid ${borderPalette.light}`,
            "borderRadius": 2,
            "p": 2,
            "background": background.main,
            "transition": "all 0.2s ease",
            "&:hover": {
              borderColor: borderPalette.dark,
              background: background.accent,
            },
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
              {fw.framework_name || `Framework ${fw.framework_id}`}
            </Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: brand.primary }}>
              {fw.coverage_percentage}%
            </Typography>
          </Stack>

          <LinearProgress
            variant="determinate"
            value={fw.coverage_percentage}
            sx={{
              "height": 6,
              "borderRadius": 3,
              "mb": 1,
              "backgroundColor": background.hover,
              "& .MuiLinearProgress-bar": {
                backgroundColor: brand.primary,
                borderRadius: 3,
              },
            }}
          />

          <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
            <Typography sx={{ fontSize: 11, color: text.muted }}>
              {fw.mapped_controls}/{fw.total_controls} controls mapped
            </Typography>
            <Box>
              {fw.gap_details.unmapped_controls.length > 0 && (
                <Chip
                  label={`${fw.gap_details.unmapped_controls.length} gaps`}
                  size="small"
                  sx={{
                    fontSize: 10,
                    height: 20,
                    mr: 0.5,
                    backgroundColor: status.warning.bg,
                    color: status.warning.text,
                    border: `1px solid ${status.warning.border}`,
                  }}
                />
              )}
              {fw.synergy_details.multi_framework_controls.length > 0 && (
                <Chip
                  label={`${fw.synergy_details.multi_framework_controls.length} synergies`}
                  size="small"
                  sx={{
                    fontSize: 10,
                    height: 20,
                    backgroundColor: status.success.bg,
                    color: status.success.text,
                    border: `1px solid ${status.success.border}`,
                  }}
                />
              )}
            </Box>
          </Stack>
        </Box>
      ))}
    </Stack>
  );
};

export default CoverageChart;
