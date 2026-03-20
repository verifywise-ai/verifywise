import React, { useMemo } from "react";
import { Box, Typography, Tooltip, Stack, useTheme } from "@mui/material";
import { IRiskHeatMapProps } from "../../types/interfaces/i.risk";
import { IHeatMapCell } from "../../../domain/interfaces/i.widget";

const RiskHeatMap: React.FC<IRiskHeatMapProps> = ({
  risks,
  onRiskSelect,
  selectedRisk,
}) => {
  const theme = useTheme();

  const getRiskLevelColor = (
    riskLevel: number,
    alpha: number = 0.8
  ): string => {
    if (riskLevel >= 16) return `rgba(198, 54, 34, ${alpha})`; // Very High - Dark Red
    if (riskLevel >= 12) return `rgba(214, 139, 97, ${alpha})`; // High - Orange Red
    if (riskLevel >= 8) return `rgba(214, 185, 113, ${alpha})`; // Medium - Orange
    if (riskLevel >= 4) return `rgba(82, 171, 67, ${alpha})`; // Low - Light Green
    return `rgba(184, 211, 156, ${alpha})`; // Very Low - Very Light Green
  };

  // Helper functions to convert string values to numeric
  const getLikelihoodNumeric = (likelihood: string): number => {
    switch (likelihood?.toLowerCase()) {
      case "rare":
        return 1;
      case "unlikely":
        return 2;
      case "possible":
        return 3;
      case "likely":
        return 4;
      case "almost certain":
        return 5;
      default:
        return 1;
    }
  };

  const getSeverityNumeric = (severity: string): number => {
    switch (severity?.toLowerCase()) {
      case "negligible":
        return 1;
      case "minor":
        return 2;
      case "moderate":
        return 3;
      case "major":
        return 4;
      case "critical":
      case "catastrophic":
        return 5;
      default:
        return 1;
    }
  };

  const heatMapData = useMemo(() => {
    const grid: IHeatMapCell[][] = [];

    for (let severity = 5; severity >= 1; severity--) {
      const row: IHeatMapCell[] = [];
      for (let likelihood = 1; likelihood <= 5; likelihood++) {
        const cellRisks = risks.filter((risk) => {
          const riskLikelihood = getLikelihoodNumeric(risk.likelihood);
          const riskSeverity = getSeverityNumeric(risk.risk_severity);
          return riskLikelihood === likelihood && riskSeverity === severity;
        });

        const riskLevel = likelihood * severity;


        row.push({
          likelihood,
          severity,
          risks: cellRisks,
          riskLevel,
          color: getRiskLevelColor(riskLevel, cellRisks.length > 0 ? 0.8 : 0.1),
        });
      }
      grid.push(row);
    }

    return grid;
  }, [risks]);

  const getSeverityLabel = (severity: number): string => {
    const labels = ["", "Very Low", "Low", "Medium", "High", "Very High"];
    return labels[severity];
  };

  const getLikelihoodLabel = (likelihood: number): string => {
    const labels = ["", "Very Low", "Low", "Medium", "High", "Very High"];
    return labels[likelihood];
  };

  const renderCell = (cell: IHeatMapCell) => {
    const isSelected =
      selectedRisk && cell.risks.some((r) => r.id === selectedRisk.id);

    return (
      <Tooltip
        key={`${cell.likelihood}-${cell.severity}`}
        title={
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {getLikelihoodLabel(cell.likelihood)} Likelihood ×{" "}
              {getSeverityLabel(cell.severity)} Severity
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Risk Level: {cell.riskLevel}
            </Typography>
            <Typography variant="body2">
              {cell.risks.length} risk{cell.risks.length !== 1 ? "s" : ""}
            </Typography>
            {cell.risks.length > 0 && (
              <Box sx={{ mt: 1 }}>
                {cell.risks.slice(0, 3).map((risk, idx) => (
                  <Typography key={idx} variant="caption" display="block">
                    • {risk.risk_name || `Risk ${risk.id}`}
                  </Typography>
                ))}
                {cell.risks.length > 3 && (
                  <Typography variant="caption" sx={{ fontStyle: "italic" }}>
                    +{cell.risks.length - 3} more...
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        }
        arrow
        placement="top"
      >
        <Box
          sx={{
            width: { xs: 60, sm: 80 },
            height: { xs: 45, sm: 60 },
            backgroundColor: cell.color,
            border: `2px solid ${isSelected ? "#13715B" : "transparent"}`,
            borderRadius: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            cursor: cell.risks.length > 0 ? "pointer" : "default",
            transition: "all 0.2s ease-in-out",
            "&:hover":
              cell.risks.length > 0
                ? {
                  transform: "scale(1.05)",
                  boxShadow: theme.shadows[4],
                  borderColor: "brand.primary",
                }
                : {},
          }}
          onClick={() => {
            if (cell.risks.length > 0 && onRiskSelect) {
              onRiskSelect(cell.risks[0]);
            }
          }}
        >
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              color: cell.risks.length > 0 ? "text.primary" : "text.disabled",
              fontSize: 18,
            }}
          >
            {cell.risks.length}
          </Typography>
          {cell.risks.length > 0 && (
            <Typography
              variant="caption"
              sx={{
                color: "#4B5563",
                fontSize: 10,
                lineHeight: 1,
              }}
            >
              L{cell.riskLevel}
            </Typography>
          )}
        </Box>
      </Tooltip>
    );
  };

  return (
    <Box
      sx={{
        p: 3,
        backgroundColor: "transparent",
        display: "flex",
        alignItems: "center",
        minHeight: "500px",
      }}
    >
      <Stack
        direction="row"
        spacing={4}
        alignItems="center"
        sx={{ width: "100%" }}
      >
        {/* Main Heat Map */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            overflow: "auto",
            minWidth: { xs: "100%", sm: "auto" },
          }}
        >
          <Stack spacing={2}>
            {/* Y-axis label */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: { xs: 1, sm: 2 },
                minWidth: "fit-content",
              }}
            >
              <Box
                sx={{
                  writingMode: "vertical-rl",
                  textOrientation: "mixed",
                  minWidth: 80,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 600,
                    color: "#4B5563",
                    transform: "rotate(180deg)",
                  }}
                >
                  SEVERITY
                </Typography>
              </Box>

              <Stack spacing={1}>
                {heatMapData.map((row, rowIndex) => (
                  <Stack
                    key={rowIndex}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                  >
                    {/* Severity labels */}
                    <Box sx={{ minWidth: 80, textAlign: "right", pr: 1 }}>
                      <Typography
                        variant="caption"
                        sx={{ color: "status.default.text", fontWeight: 500 }}
                      >
                        {getSeverityLabel(row[0].severity)}
                      </Typography>
                    </Box>

                    {/* Heat map cells */}
                    <Stack direction="row" spacing={1}>
                      {row.map((cell) => renderCell(cell))}
                    </Stack>
                  </Stack>
                ))}

                {/* X-axis labels */}
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ minWidth: 80 }} />
                  <Stack direction="row" spacing={1}>
                    {[1, 2, 3, 4, 5].map((likelihood) => (
                      <Box
                        key={likelihood}
                        sx={{ width: { xs: 60, sm: 80 }, textAlign: "center" }}
                      >
                        <Typography
                          variant="caption"
                          sx={{ color: "status.default.text", fontWeight: 500 }}
                        >
                          {getLikelihoodLabel(likelihood)}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Stack>
              </Stack>
            </Box>

            {/* X-axis label */}
            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ minWidth: 80 }} />
              <Box
                sx={{
                  width: { xs: 5 * 60 + 4 * 8, sm: 5 * 80 + 4 * 8 }, // 5 cells + 4 gaps
                  textAlign: "center",
                  pt: "40px", // Add 40px top padding
                  pl: "130px", // Add 130px left padding to shift right
                }}
              >
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 600, color: "#4B5563" }}
                >
                  LIKELIHOOD
                </Typography>
              </Box>
            </Stack>
          </Stack>
        </Box>

        {/* Legend Sidebar */}
        <Box
          sx={{
            display: { xs: "none", lg: "block" },
            minWidth: 200,
            p: 3,
            backgroundColor: "background.accent",
            borderRadius: 2,
            border: "1px solid status.default.border",
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{ color: "#374151", fontWeight: 600, mb: 2 }}
          >
            Risk Levels
          </Typography>
          <Stack spacing={2}>
            {[
              { level: "1-3", color: getRiskLevelColor(2), label: "Very low" },
              { level: "4-7", color: getRiskLevelColor(6), label: "Low" },
              { level: "8-11", color: getRiskLevelColor(10), label: "Medium" },
              { level: "12-15", color: getRiskLevelColor(14), label: "High" },
              {
                level: "16-25",
                color: getRiskLevelColor(20),
                label: "Very high",
              },
            ].map((item, idx) => (
              <Box
                key={idx}
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <Box
                  sx={{
                    width: 16,
                    height: 16,
                    backgroundColor: item.color,
                    borderRadius: 0.5,
                    border: "1px solid status.default.border",
                  }}
                />
                <Stack>
                  <Typography
                    variant="caption"
                    sx={{ color: "#374151", fontWeight: 500 }}
                  >
                    {item.label}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "status.default.text", fontSize: "0.7rem" }}
                  >
                    Level {item.level}
                  </Typography>
                </Stack>
              </Box>
            ))}
          </Stack>
        </Box>

        {/* Mobile Legend (below on small screens) */}
        <Box
          sx={{
            display: { xs: "block", lg: "none" },
            position: "absolute",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "background.main",
            p: 2,
            borderRadius: 2,
            border: "1px solid status.default.border",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography
              variant="caption"
              sx={{ color: "status.default.text", fontWeight: 500 }}
            >
              Risk Level:
            </Typography>
            {[
              { level: "1-3", color: getRiskLevelColor(2), label: "Very low" },
              { level: "4-7", color: getRiskLevelColor(6), label: "Low" },
              { level: "8-11", color: getRiskLevelColor(10), label: "Medium" },
              { level: "12-15", color: getRiskLevelColor(14), label: "High" },
              {
                level: "16-25",
                color: getRiskLevelColor(20),
                label: "Very high",
              },
            ].map((item, idx) => (
              <Box
                key={idx}
                sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
              >
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    backgroundColor: item.color,
                    borderRadius: 0.5,
                    border: "1px solid status.default.border",
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{ color: "#4B5563", fontSize: "0.7rem" }}
                >
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
};

export default RiskHeatMap;
