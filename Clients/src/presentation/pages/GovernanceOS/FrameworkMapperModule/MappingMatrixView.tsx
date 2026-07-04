import React, { useMemo } from "react";
import { Box, Typography, Stack } from "@mui/material";
import { IGovernanceControlMapping } from "../../../../domain/interfaces/i.governanceOs";
import GovernanceTooltip from "../../../components/GovernanceOS/GovernanceTooltip";
import { border as borderPalette, background, text, chart } from "../../../themes/palette";

interface MappingMatrixViewProps {
  mappings: IGovernanceControlMapping[];
  onCellClick: (sourceId: number, targetId: number) => void;
}

const FRAMEWORKS = [
  { id: 1, name: "EU AI Act", color: chart[0] },
  { id: 2, name: "ISO 42001", color: chart[1] },
  { id: 3, name: "ISO 27001", color: chart[2] },
  { id: 4, name: "NIST AI RMF", color: chart[3] },
];

const MappingMatrixView: React.FC<MappingMatrixViewProps> = ({ mappings, onCellClick }) => {
  const matrix = useMemo(() => {
    const counts: Record<string, number> = {};
    const maxCount = { value: 0 };

    // Initialize all pairs
    for (const fw1 of FRAMEWORKS) {
      for (const fw2 of FRAMEWORKS) {
        const key = `${fw1.id}-${fw2.id}`;
        counts[key] = 0;
      }
    }

    // Count mappings
    for (const m of mappings) {
      const key = `${m.source_framework_id}-${m.target_framework_id}`;
      counts[key] = (counts[key] || 0) + 1;
      if (counts[key] > maxCount.value) maxCount.value = counts[key];
    }

    return { counts, maxCount: maxCount.value };
  }, [mappings]);

  const getCellColor = (count: number, max: number) => {
    if (max === 0) return background.main;
    const intensity = count / max;
    // Interpolate between light green and dark green
    const r = Math.round(230 - intensity * 93); // 230 → 137
    const g = Math.round(244 - intensity * 79); // 244 → 165
    const b = Math.round(234 - intensity * 55); // 234 → 179
    return `rgb(${r}, ${g}, ${b})`;
  };

  const getTextColor = (count: number, max: number) => {
    if (max === 0) return text.tertiary;
    const intensity = count / max;
    return intensity > 0.5 ? "#fff" : text.primary;
  };

  return (
    <Box>
      <Typography sx={{ fontSize: 12, color: text.secondary, mb: 2, display: "block" }}>
        Click any cell to view mappings between those frameworks
      </Typography>

      <Box sx={{ overflowX: "auto" }}>
        <Stack direction="column" gap="4px">
          {/* Header row */}
          <Stack direction="row" gap="4px" alignItems="center">
            <Box sx={{ width: 140, flexShrink: 0 }} />
            {FRAMEWORKS.map((fw) => (
              <Box
                key={fw.id}
                sx={{
                  width: 100,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <GovernanceTooltip
                  header="Framework axis"
                  description="Source frameworks as rows and target frameworks as columns"
                >
                  <Box
                    component="span"
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 22,
                      px: "8px",
                      borderRadius: "4px",
                      fontSize: 11,
                      fontWeight: 600,
                      maxWidth: 100,
                      backgroundColor: `${fw.color}15`,
                      color: fw.color,
                      border: `1px solid ${fw.color}30`,
                    }}
                  >
                    {fw.name}
                  </Box>
                </GovernanceTooltip>
              </Box>
            ))}
          </Stack>

          {/* Data rows */}
          {FRAMEWORKS.map((rowFw) => (
            <Stack key={rowFw.id} direction="row" gap="4px" alignItems="center">
              {/* Row label */}
              <Box
                sx={{
                  width: 140,
                  height: 60,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  pr: "12px",
                  flexShrink: 0,
                }}
              >
                <GovernanceTooltip
                  header="Framework axis"
                  description="Source frameworks as rows and target frameworks as columns"
                >
                  <Box
                    component="span"
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 22,
                      px: "8px",
                      borderRadius: "4px",
                      fontSize: 11,
                      fontWeight: 600,
                      maxWidth: 130,
                      backgroundColor: `${rowFw.color}15`,
                      color: rowFw.color,
                      border: `1px solid ${rowFw.color}30`,
                    }}
                  >
                    {rowFw.name}
                  </Box>
                </GovernanceTooltip>
              </Box>

              {/* Cells */}
              {FRAMEWORKS.map((colFw) => {
                const count = matrix.counts[`${rowFw.id}-${colFw.id}`] || 0;
                const isDiagonal = rowFw.id === colFw.id;
                const cell = (
                  <Box
                    key={colFw.id}
                    onClick={() => !isDiagonal && count > 0 && onCellClick(rowFw.id, colFw.id)}
                    sx={{
                      "width": 100,
                      "height": 60,
                      "display": "flex",
                      "alignItems": "center",
                      "justifyContent": "center",
                      "backgroundColor": isDiagonal
                        ? background.hover
                        : getCellColor(count, matrix.maxCount),
                      "border": `1px solid ${borderPalette.light}`,
                      "borderRadius": "4px",
                      "cursor": !isDiagonal && count > 0 ? "pointer" : "default",
                      "transition": "all 150ms ease",
                      "flexShrink": 0,
                      "&:hover": {
                        borderColor: !isDiagonal && count > 0 ? rowFw.color : borderPalette.light,
                      },
                    }}
                  >
                    {isDiagonal ? (
                      <Typography sx={{ fontSize: 11, color: text.muted }}>—</Typography>
                    ) : (
                      <Typography
                        sx={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: getTextColor(count, matrix.maxCount),
                        }}
                      >
                        {count}
                      </Typography>
                    )}
                  </Box>
                );
                return !isDiagonal && count > 0 ? (
                  <GovernanceTooltip
                    key={colFw.id}
                    header="Mapping count"
                    description="Click to view the mappings between these two frameworks"
                  >
                    {cell}
                  </GovernanceTooltip>
                ) : (
                  cell
                );
              })}
            </Stack>
          ))}
        </Stack>
      </Box>

      {/* Legend */}
      <GovernanceTooltip
        header="Density legend"
        description="Color intensity shows the density of mappings"
      >
        <Stack direction="row" gap="16px" alignItems="center" sx={{ mt: "16px" }}>
          <Typography sx={{ fontSize: 12, color: text.muted }}>Density:</Typography>
          <Stack direction="row" gap="4px" alignItems="center">
            {[0, 0.25, 0.5, 0.75, 1].map((intensity, i) => (
              <Box
                key={i}
                sx={{
                  width: 24,
                  height: 16,
                  backgroundColor: getCellColor(intensity * matrix.maxCount, matrix.maxCount || 1),
                  border: `1px solid ${borderPalette.light}`,
                  borderRadius: "4px",
                }}
              />
            ))}
          </Stack>
          <Typography sx={{ fontSize: 12, color: text.muted }}>Low → High</Typography>
        </Stack>
      </GovernanceTooltip>
    </Box>
  );
};

export default MappingMatrixView;
