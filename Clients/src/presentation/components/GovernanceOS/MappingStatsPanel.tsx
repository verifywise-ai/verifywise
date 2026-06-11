import React from "react";
import { Box, Typography, Stack, CircularProgress, alpha } from "@mui/material";
import { Network } from "lucide-react";
import { useUnifiedView } from "../../../application/hooks/useGovernanceOs";
import { border as borderPalette, background, text, brand, accent } from "../../themes/palette";

interface MappingStatsPanelProps {
  projectId: number;
}

const STRENGTH_LABELS: Record<string, string> = {
  direct: "Direct",
  partial: "Partial",
  related: "Related",
};

const STRENGTH_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  direct: {
    bg: alpha(brand.primary, 0.12),
    text: brand.primary,
    border: alpha(brand.primary, 0.3),
  },
  partial: {
    bg: alpha(accent.indigo.text, 0.12),
    text: accent.indigo.text,
    border: alpha(accent.indigo.text, 0.3),
  },
  related: { bg: background.hover, text: text.secondary, border: borderPalette.light },
};

const MappingStatsPanel: React.FC<MappingStatsPanelProps> = ({ projectId }) => {
  const { data: unifiedView, isLoading } = useUnifiedView(projectId);

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: "24px" }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  const stats = unifiedView?.mappingStats;

  if (!stats || stats.total === 0) {
    return (
      <Box
        sx={{
          border: `1px dashed ${borderPalette.light}`,
          borderRadius: "4px",
          p: "16px",
          background: background.main,
        }}
      >
        <Typography sx={{ fontSize: 13, color: text.muted }}>
          No mapping statistics available. Add framework mappings to see breakdowns.
        </Typography>
      </Box>
    );
  }

  const domainEntries = Object.entries(stats.byDomain || {}).sort((a, b) => b[1] - a[1]);
  const strengthEntries = Object.entries(stats.byStrength || {}).sort((a, b) => b[1] - a[1]);

  return (
    <Box
      sx={{
        border: `1px solid ${borderPalette.dark}`,
        borderRadius: "4px",
        p: "16px",
        background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
      }}
    >
      <Stack direction="row" gap="16px" alignItems="center" sx={{ mb: "16px" }}>
        <Network size={20} color={brand.primary} />
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Mapping Statistics</Typography>
      </Stack>

      <Stack gap="16px">
        {/* Total mappings */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: "16px",
          }}
        >
          <Box
            sx={{
              p: "16px",
              background: background.hover,
              borderRadius: "4px",
              textAlign: "center",
            }}
          >
            <Typography sx={{ fontSize: 20, fontWeight: 600, color: brand.primary }}>
              {stats.total}
            </Typography>
            <Typography sx={{ fontSize: 11, color: text.muted }}>Total mappings</Typography>
          </Box>
        </Box>

        {/* By domain */}
        {domainEntries.length > 0 && (
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: text.primary, mb: "8px" }}>
              By domain
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap="8px">
              {domainEntries.map(([domain, count]) => (
                <Box
                  key={domain}
                  component="span"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 24,
                    px: "8px",
                    borderRadius: "4px",
                    fontSize: 12,
                    fontWeight: 400,
                    textTransform: "capitalize",
                    backgroundColor: background.hover,
                    color: text.secondary,
                    border: `1px solid ${borderPalette.light}`,
                  }}
                >
                  {domain}: {count}
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {/* By strength */}
        {strengthEntries.length > 0 && (
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: text.primary, mb: "8px" }}>
              By mapping strength
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap="8px">
              {strengthEntries.map(([strength, count]) => {
                const colors = STRENGTH_COLORS[strength] || STRENGTH_COLORS.related;
                return (
                  <Box
                    key={strength}
                    component="span"
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 24,
                      px: "8px",
                      borderRadius: "4px",
                      fontSize: 12,
                      fontWeight: 500,
                      textTransform: "capitalize",
                      backgroundColor: colors.bg,
                      color: colors.text,
                      border: `1px solid ${colors.border}`,
                    }}
                  >
                    {STRENGTH_LABELS[strength] || strength}: {count}
                  </Box>
                );
              })}
            </Stack>
          </Box>
        )}
      </Stack>
    </Box>
  );
};

export default MappingStatsPanel;
