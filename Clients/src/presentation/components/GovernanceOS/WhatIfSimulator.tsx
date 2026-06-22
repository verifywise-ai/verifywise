import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Typography,
  Stack,
  CircularProgress,
  Alert,
  LinearProgress,
  alpha,
} from "@mui/material";
import { Play, Calculator } from "lucide-react";
import Select from "../Inputs/Select";
import GovernanceTooltip from "./GovernanceTooltip";
import { CustomizableButton } from "../button/customizable-button";
import { IGovernanceScenario } from "../../../domain/interfaces/i.governanceOs";
import { border as borderPalette, background, text, accent, brand } from "../../themes/palette";

const FRAMEWORK_OPTIONS = [
  { id: 1, name: "EU AI Act" },
  { id: 2, name: "ISO 42001" },
  { id: 3, name: "ISO 27001" },
  { id: 4, name: "NIST AI RMF" },
];

interface SimulationResult {
  frameworkIds: number[];
  totalControls: number;
  estimatedCoveragePercent: number;
  estimatedEffortHours: number;
  timelineWeeks: number;
  frameworkBreakdown: {
    frameworkId: number;
    frameworkName: string;
    controlCount: number;
    priority: string;
  }[];
  isHeuristicEstimate?: boolean;
  methodology?: {
    coverage: string;
    effort: string;
    timeline: string;
    disclaimer: string;
  };
}

interface WhatIfSimulatorProps {
  scenarios: IGovernanceScenario[];
  result: SimulationResult | null;
  isSimulating: boolean;
  error: Error | null;
  onSimulate: (body: {
    frameworkIds: number[];
    priorityOrder: { primary?: number; secondary?: number[]; supplementary?: number[] };
  }) => void;
}

const WhatIfSimulator: React.FC<WhatIfSimulatorProps> = ({
  scenarios,
  result,
  isSimulating,
  error,
  onSimulate,
}) => {
  const [baseScenarioId, setBaseScenarioId] = useState<string>("");
  const [primaryId, setPrimaryId] = useState<string>("");
  const [secondaryIds, setSecondaryIds] = useState<number[]>([]);
  const [supplementaryIds, setSupplementaryIds] = useState<number[]>([]);

  const baseScenario = useMemo(
    () => scenarios.find((s) => String(s.id) === baseScenarioId) || null,
    [scenarios, baseScenarioId],
  );

  useEffect(() => {
    if (baseScenario) {
      const priorityOrder = baseScenario.priority_order as {
        primary?: number;
        secondary?: number[];
        supplementary?: number[];
      } | null;
      setPrimaryId(priorityOrder?.primary ? String(priorityOrder.primary) : "");
      setSecondaryIds(priorityOrder?.secondary || []);
      setSupplementaryIds(priorityOrder?.supplementary || []);
    }
  }, [baseScenario]);

  const allSelectedIds = useMemo(() => {
    const ids = new Set<number>();
    if (primaryId) ids.add(Number(primaryId));
    secondaryIds.forEach((id) => ids.add(id));
    supplementaryIds.forEach((id) => ids.add(id));
    return Array.from(ids);
  }, [primaryId, secondaryIds, supplementaryIds]);

  const availableForSecondary = FRAMEWORK_OPTIONS.filter(
    (fw) => fw.id !== Number(primaryId) && !supplementaryIds.includes(fw.id),
  );
  const availableForSupplementary = FRAMEWORK_OPTIONS.filter(
    (fw) => fw.id !== Number(primaryId) && !secondaryIds.includes(fw.id),
  );

  const toggleSecondary = (id: number) => {
    setSecondaryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSupplementary = (id: number) => {
    setSupplementaryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleRun = () => {
    if (allSelectedIds.length === 0) return;
    onSimulate({
      frameworkIds: allSelectedIds,
      priorityOrder: {
        primary: primaryId ? Number(primaryId) : undefined,
        secondary: secondaryIds,
        supplementary: supplementaryIds,
      },
    });
  };

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
        <Calculator size={20} color={brand.primary} />
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Rough Estimate</Typography>
      </Stack>

      <Alert severity="info" sx={{ mb: "16px", fontSize: 12 }}>
        These numbers are rough heuristic estimates based on simplified assumptions. They are not
        predictive analytics and should not be used for final compliance planning.
      </Alert>

      <Typography sx={{ fontSize: 13, color: text.accent, mb: "16px" }}>
        Pick a base scenario and adjust framework priorities to get a rough idea of effort,
        coverage, and timeline before activating.
      </Typography>

      <Stack gap="16px">
        <GovernanceTooltip
          header="Base scenario"
          description="Starting point for the what-if simulation"
        >
          <span>
            <Select
              id="base-scenario"
              label="Base scenario"
              placeholder="Choose a scenario"
              value={baseScenarioId}
              items={scenarios.map((s) => ({ _id: String(s.id), name: s.name }))}
              onChange={(e) => setBaseScenarioId(e.target.value as string)}
              sx={{ minWidth: 280 }}
            />
          </span>
        </GovernanceTooltip>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
            gap: 2,
          }}
        >
          {/* Primary */}
          <Box
            sx={{
              border: `1px solid ${borderPalette.light}`,
              borderRadius: "4px",
              p: "16px",
              background: background.main,
            }}
          >
            <GovernanceTooltip
              header="Primary framework"
              description="Baseline framework in the simulation"
            >
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: text.primary, mb: "8px" }}>
                Primary
              </Typography>
            </GovernanceTooltip>
            <Select
              id="sim-primary"
              label="Primary framework"
              placeholder="Select primary"
              value={primaryId}
              items={FRAMEWORK_OPTIONS.map((f) => ({ _id: String(f.id), name: f.name }))}
              onChange={(e) => setPrimaryId(e.target.value as string)}
              sx={{ minWidth: "100%" }}
            />
          </Box>

          {/* Secondary */}
          <Box
            sx={{
              border: `1px solid ${borderPalette.light}`,
              borderRadius: "4px",
              p: "16px",
              background: background.main,
            }}
          >
            <GovernanceTooltip
              header="Secondary frameworks"
              description="Supporting frameworks in the simulation"
            >
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: text.primary, mb: "8px" }}>
                Secondary
              </Typography>
            </GovernanceTooltip>
            <Stack direction="row" flexWrap="wrap" gap="8px">
              {availableForSecondary.map((fw) => (
                <Box
                  key={fw.id}
                  component="span"
                  onClick={() => toggleSecondary(fw.id)}
                  sx={{
                    "display": "inline-flex",
                    "alignItems": "center",
                    "height": 24,
                    "px": "10px",
                    "borderRadius": "4px",
                    "fontSize": 12,
                    "cursor": "pointer",
                    "fontWeight": secondaryIds.includes(fw.id) ? 500 : 400,
                    "backgroundColor": secondaryIds.includes(fw.id)
                      ? alpha(accent.indigo.text, 0.12)
                      : background.hover,
                    "color": secondaryIds.includes(fw.id) ? accent.indigo.text : text.secondary,
                    "border": `1px solid ${
                      secondaryIds.includes(fw.id) ? accent.indigo.text : borderPalette.light
                    }`,
                    "&:hover": {
                      backgroundColor: secondaryIds.includes(fw.id)
                        ? alpha(accent.indigo.text, 0.2)
                        : background.hover,
                    },
                  }}
                >
                  {fw.name}
                </Box>
              ))}
              {availableForSecondary.length === 0 && (
                <Typography sx={{ fontSize: 12, color: text.muted }}>
                  No frameworks available
                </Typography>
              )}
            </Stack>
          </Box>

          {/* Supplementary */}
          <Box
            sx={{
              border: `1px solid ${borderPalette.light}`,
              borderRadius: "4px",
              p: "16px",
              background: background.main,
            }}
          >
            <GovernanceTooltip
              header="Supplementary frameworks"
              description="Optional additional frameworks in the simulation"
            >
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: text.primary, mb: "8px" }}>
                Supplementary
              </Typography>
            </GovernanceTooltip>
            <Stack direction="row" flexWrap="wrap" gap="8px">
              {availableForSupplementary.map((fw) => (
                <Box
                  key={fw.id}
                  component="span"
                  onClick={() => toggleSupplementary(fw.id)}
                  sx={{
                    "display": "inline-flex",
                    "alignItems": "center",
                    "height": 24,
                    "px": "10px",
                    "borderRadius": "4px",
                    "fontSize": 12,
                    "cursor": "pointer",
                    "fontWeight": supplementaryIds.includes(fw.id) ? 500 : 400,
                    "backgroundColor": supplementaryIds.includes(fw.id)
                      ? background.hover
                      : background.hover,
                    "color": supplementaryIds.includes(fw.id) ? text.primary : text.secondary,
                    "border": `1px solid ${
                      supplementaryIds.includes(fw.id) ? borderPalette.dark : borderPalette.light
                    }`,
                    "&:hover": {
                      backgroundColor: background.hover,
                    },
                  }}
                >
                  {fw.name}
                </Box>
              ))}
              {availableForSupplementary.length === 0 && (
                <Typography sx={{ fontSize: 12, color: text.muted }}>
                  No frameworks available
                </Typography>
              )}
            </Stack>
          </Box>
        </Box>

        <Box>
          <GovernanceTooltip
            header="Run estimate"
            description="Calculate rough estimates for coverage, effort, and timeline"
          >
            <span>
              <CustomizableButton
                variant="contained"
                size="small"
                startIcon={
                  isSimulating ? <CircularProgress size={16} color="inherit" /> : <Play size={16} />
                }
                onClick={handleRun}
                isDisabled={isSimulating || allSelectedIds.length === 0}
                text={isSimulating ? "Estimating..." : "Run estimate"}
                sx={{}}
              />
            </span>
          </GovernanceTooltip>
        </Box>

        {error && (
          <Alert severity="error">Simulation failed: {error.message || "Please try again."}</Alert>
        )}

        {result && (
          <Box
            sx={{
              border: `1px solid ${borderPalette.light}`,
              borderRadius: "4px",
              p: "16px",
              background: background.main,
            }}
          >
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary, mb: "16px" }}>
              Rough estimate results
            </Typography>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
                gap: "16px",
                mb: 2,
              }}
            >
              <MetricBox
                label="Est. coverage"
                value={`${result.estimatedCoveragePercent}%`}
                header="Estimated coverage"
                description={
                  result.methodology?.coverage ||
                  "estimatedCoveragePercent = min(85, 40 + 12 * numberOfFrameworks)"
                }
              />
              <MetricBox
                label="Total controls"
                value={String(result.totalControls)}
                header="Total controls"
                description="Total leaf-level controls from the selected framework inventories"
              />
              <MetricBox
                label="Est. effort"
                value={`${result.estimatedEffortHours.toLocaleString()} hrs`}
                header="Estimated effort"
                description={
                  result.methodology?.effort || "estimatedEffortHours = totalControls * 4"
                }
              />
              <MetricBox
                label="Timeline"
                value={`${result.timelineWeeks} wks`}
                header="Timeline"
                description={
                  result.methodology?.timeline || "timelineWeeks = max(4, ceil(totalControls / 20))"
                }
              />
            </Box>

            <Alert severity="warning" sx={{ mb: "16px", fontSize: 12 }}>
              {result.methodology?.disclaimer ||
                "These numbers are rough heuristic estimates based on simplified assumptions. They are not predictive analytics."}
            </Alert>

            <LinearProgress
              variant="determinate"
              value={result.estimatedCoveragePercent}
              sx={{
                "height": 8,
                "borderRadius": "4px",
                "backgroundColor": background.hover,
                "& .MuiLinearProgress-bar": {
                  backgroundColor: brand.primary,
                  borderRadius: "4px",
                },
              }}
            />

            {result.frameworkBreakdown?.length > 0 && (
              <Stack gap="8px" sx={{ mt: "16px" }}>
                {result.frameworkBreakdown.map((fw) => (
                  <Box
                    key={fw.frameworkId}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      py: "4px",
                    }}
                  >
                    <Typography sx={{ fontSize: 13, color: text.primary }}>
                      {fw.frameworkName}
                    </Typography>
                    <Stack direction="row" gap="8px" alignItems="center">
                      <Box
                        component="span"
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          height: 20,
                          px: "8px",
                          borderRadius: "4px",
                          fontSize: 11,
                          fontWeight: 500,
                          textTransform: "capitalize",
                          backgroundColor:
                            fw.priority === "primary"
                              ? alpha(brand.primary, 0.12)
                              : fw.priority === "secondary"
                                ? alpha(accent.indigo.text, 0.12)
                                : background.hover,
                          color:
                            fw.priority === "primary"
                              ? brand.primary
                              : fw.priority === "secondary"
                                ? accent.indigo.text
                                : text.secondary,
                        }}
                      >
                        {fw.priority}
                      </Box>
                      <Typography sx={{ fontSize: 13, color: text.secondary, minWidth: 80 }}>
                        {fw.controlCount} controls
                      </Typography>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        )}
      </Stack>
    </Box>
  );
};

const MetricBox: React.FC<{
  label: string;
  value: string;
  header: string;
  description: string;
}> = ({ label, value, header, description }) => (
  <GovernanceTooltip header={header} description={description}>
    <Box sx={{ textAlign: "center", p: "12px", background: background.hover, borderRadius: "4px" }}>
      <Typography sx={{ fontSize: 18, fontWeight: 600, color: brand.primary }}>{value}</Typography>
      <Typography sx={{ fontSize: 11, color: text.muted }}>{label}</Typography>
    </Box>
  </GovernanceTooltip>
);

export default WhatIfSimulator;
