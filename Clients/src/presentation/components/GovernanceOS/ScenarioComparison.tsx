import React, { useMemo } from "react";
import { Box, Typography, Stack, alpha } from "@mui/material";
import { Scale } from "lucide-react";
import Checkbox from "../Inputs/Checkbox";
import FrameworkChip from "./FrameworkChip";
import { IGovernanceScenario } from "../../../domain/interfaces/i.governanceOs";
import { border as borderPalette, background, text, accent, brand } from "../../themes/palette";

interface ScenarioComparisonProps {
  scenarios: IGovernanceScenario[];
  selectedIds: number[];
  onChangeSelectedIds: (ids: number[]) => void;
}

const FRAMEWORK_NAMES: Record<number, string> = {
  1: "EU AI Act",
  2: "ISO 42001",
  3: "ISO 27001",
  4: "NIST AI RMF",
};

const MAX_COMPARE = 3;

const ScenarioComparison: React.FC<ScenarioComparisonProps> = ({
  scenarios,
  selectedIds,
  onChangeSelectedIds,
}) => {
  const comparedScenarios = useMemo(
    () => scenarios.filter((s) => selectedIds.includes(s.id)),
    [scenarios, selectedIds],
  );

  const toggleScenario = (id: number) => {
    onChangeSelectedIds(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : selectedIds.length < MAX_COMPARE
          ? [...selectedIds, id]
          : selectedIds,
    );
  };

  const allFrameworkIds = useMemo(() => {
    const ids = new Set<number>();
    comparedScenarios.forEach((s) => {
      const po = s.priority_order as {
        primary?: number;
        secondary?: number[];
        supplementary?: number[];
      } | null;
      if (po?.primary) ids.add(po.primary);
      po?.secondary?.forEach((id) => ids.add(id));
      po?.supplementary?.forEach((id) => ids.add(id));
    });
    return Array.from(ids).sort((a, b) => a - b);
  }, [comparedScenarios]);

  const getPriorityForFramework = (
    scenario: IGovernanceScenario,
    frameworkId: number,
  ): string | null => {
    const po = scenario.priority_order as {
      primary?: number;
      secondary?: number[];
      supplementary?: number[];
    } | null;
    if (po?.primary === frameworkId) return "Primary";
    if (po?.secondary?.includes(frameworkId)) return "Secondary";
    if (po?.supplementary?.includes(frameworkId)) return "Supplementary";
    return null;
  };

  if (scenarios.length < 2) return null;

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
        <Scale size={20} color={brand.primary} />
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Scenario Comparison</Typography>
      </Stack>

      <Typography sx={{ fontSize: 13, color: text.accent, mb: "16px" }}>
        Select up to {MAX_COMPARE} scenarios to compare frameworks, priorities, and context side by
        side.
      </Typography>

      {/* Scenario selectors */}
      <Stack direction="row" gap="8px" flexWrap="wrap" sx={{ mb: "16px" }}>
        {scenarios.map((scenario) => {
          const isSelected = selectedIds.includes(scenario.id);
          const disabled = !isSelected && selectedIds.length >= MAX_COMPARE;
          return (
            <Box
              key={scenario.id}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1.5,
                py: 0.75,
                borderRadius: "4px",
                border: `1px solid ${isSelected ? brand.primary : borderPalette.light}`,
                backgroundColor: isSelected ? alpha(brand.primary, 0.08) : background.main,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <Checkbox
                id={`compare-${scenario.id}`}
                isChecked={isSelected}
                value={String(scenario.id)}
                onChange={() => toggleScenario(scenario.id)}
                isDisabled={disabled}
              />
              <Typography sx={{ fontSize: 13, color: text.primary }}>{scenario.name}</Typography>
            </Box>
          );
        })}
      </Stack>

      {comparedScenarios.length > 0 ? (
        <Box sx={{ overflowX: "auto" }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: `140px repeat(${comparedScenarios.length}, minmax(180px, 1fr))`,
              minWidth: comparedScenarios.length * 200 + 140,
              border: `1px solid ${borderPalette.light}`,
              borderRadius: "4px",
              overflow: "hidden",
            }}
          >
            {/* Header row */}
            <Box
              sx={{
                p: "12px",
                background: background.hover,
                borderRight: `1px solid ${borderPalette.light}`,
                fontWeight: 600,
                fontSize: 12,
                color: text.muted,
              }}
            >
              Attribute
            </Box>
            {comparedScenarios.map((scenario) => (
              <Box
                key={`h-${scenario.id}`}
                sx={{
                  p: "12px",
                  background: background.hover,
                  borderRight: `1px solid ${borderPalette.light}`,
                  fontWeight: 600,
                  fontSize: 13,
                  color: text.primary,
                }}
              >
                {scenario.name}
              </Box>
            ))}

            {/* Description row */}
            <ComparisonRow label="Description" isFirst>
              {comparedScenarios.map((scenario) => (
                <Cell key={`d-${scenario.id}`}>
                  {scenario.description || (
                    <span style={{ color: text.muted }}>No description</span>
                  )}
                </Cell>
              ))}
            </ComparisonRow>

            {/* Frameworks row */}
            <ComparisonRow label="Frameworks">
              {comparedScenarios.map((scenario) => {
                const po = scenario.priority_order as {
                  primary?: number;
                  secondary?: number[];
                  supplementary?: number[];
                } | null;
                const fwIds = [
                  po?.primary,
                  ...(po?.secondary || []),
                  ...(po?.supplementary || []),
                ].filter(Boolean) as number[];
                return (
                  <Cell key={`f-${scenario.id}`}>
                    <Stack direction="row" flexWrap="wrap" gap="4px">
                      {fwIds.map((id) => (
                        <FrameworkChip
                          key={id}
                          frameworkName={FRAMEWORK_NAMES[id] || `FW ${id}`}
                          priority="supplementary"
                          size="small"
                        />
                      ))}
                      {fwIds.length === 0 && (
                        <Typography sx={{ fontSize: 12, color: text.muted }}>None</Typography>
                      )}
                    </Stack>
                  </Cell>
                );
              })}
            </ComparisonRow>

            {/* Framework-by-framework priority rows */}
            {allFrameworkIds.map((fwId) => (
              <ComparisonRow key={`fw-row-${fwId}`} label={FRAMEWORK_NAMES[fwId] || `FW ${fwId}`}>
                {comparedScenarios.map((scenario) => {
                  const priority = getPriorityForFramework(scenario, fwId);
                  return (
                    <Cell key={`fw-${scenario.id}-${fwId}`}>
                      {priority ? (
                        <PriorityBadge priority={priority} />
                      ) : (
                        <Typography sx={{ fontSize: 12, color: text.muted }}>—</Typography>
                      )}
                    </Cell>
                  );
                })}
              </ComparisonRow>
            ))}

            {/* Industry row */}
            <ComparisonRow label="Industry">
              {comparedScenarios.map((scenario) => (
                <Cell key={`i-${scenario.id}`}>
                  {scenario.industry ? (
                    <Typography sx={{ fontSize: 12, textTransform: "capitalize" }}>
                      {scenario.industry.replace(/_/g, " ")}
                    </Typography>
                  ) : (
                    <Typography sx={{ fontSize: 12, color: text.muted }}>Any</Typography>
                  )}
                </Cell>
              ))}
            </ComparisonRow>

            {/* Region row */}
            <ComparisonRow label="Region">
              {comparedScenarios.map((scenario) => (
                <Cell key={`r-${scenario.id}`}>
                  {scenario.region ? (
                    <Typography sx={{ fontSize: 12 }}>{scenario.region.toUpperCase()}</Typography>
                  ) : (
                    <Typography sx={{ fontSize: 12, color: text.muted }}>Any</Typography>
                  )}
                </Cell>
              ))}
            </ComparisonRow>

            {/* Use case row */}
            <ComparisonRow label="Use case">
              {comparedScenarios.map((scenario) => (
                <Cell key={`u-${scenario.id}`}>
                  {scenario.use_case_type ? (
                    <Typography sx={{ fontSize: 12, textTransform: "capitalize" }}>
                      {scenario.use_case_type.replace(/_/g, " ")}
                    </Typography>
                  ) : (
                    <Typography sx={{ fontSize: 12, color: text.muted }}>Any</Typography>
                  )}
                </Cell>
              ))}
            </ComparisonRow>

            {/* Built-in row */}
            <ComparisonRow label="Source" isLast>
              {comparedScenarios.map((scenario) => (
                <Cell key={`b-${scenario.id}`}>
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
                      backgroundColor: scenario.is_builtin ? background.hover : accent.indigo.bg,
                      color: scenario.is_builtin ? text.secondary : accent.indigo.text,
                    }}
                  >
                    {scenario.is_builtin ? "Built-in" : "Custom"}
                  </Box>
                </Cell>
              ))}
            </ComparisonRow>
          </Box>
        </Box>
      ) : (
        <Box
          sx={{
            p: 4,
            textAlign: "center",
            border: `1px dashed ${borderPalette.light}`,
            borderRadius: "4px",
            background: background.main,
          }}
        >
          <Typography sx={{ fontSize: 13, color: text.muted }}>
            Select at least one scenario above to start comparing.
          </Typography>
        </Box>
      )}
    </Box>
  );
};

const ComparisonRow: React.FC<{
  label: string;
  children: React.ReactNode;
  isFirst?: boolean;
  isLast?: boolean;
}> = ({ label, children, isFirst, isLast }) => (
  <>
    <Box
      sx={{
        p: 1.5,
        background: background.main,
        borderRight: `1px solid ${borderPalette.light}`,
        borderTop: isFirst ? "none" : `1px solid ${borderPalette.light}`,
        borderBottom: isLast ? "none" : `1px solid ${borderPalette.light}`,
        fontWeight: 500,
        fontSize: 12,
        color: text.secondary,
        display: "flex",
        alignItems: "center",
      }}
    >
      {label}
    </Box>
    {React.Children.map(children, (child) => (
      <Box
        sx={{
          p: 1.5,
          background: background.main,
          borderRight: `1px solid ${borderPalette.light}`,
          borderTop: isFirst ? "none" : `1px solid ${borderPalette.light}`,
          borderBottom: isLast ? "none" : `1px solid ${borderPalette.light}`,
          display: "flex",
          alignItems: "center",
        }}
      >
        {child}
      </Box>
    ))}
  </>
);

const Cell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography sx={{ fontSize: 13, color: text.primary }}>{children}</Typography>
);

const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
  const isPrimary = priority === "Primary";
  const isSecondary = priority === "Secondary";
  return (
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
        backgroundColor: isPrimary
          ? alpha(brand.primary, 0.12)
          : isSecondary
            ? alpha(accent.indigo.text, 0.12)
            : background.hover,
        color: isPrimary ? brand.primary : isSecondary ? accent.indigo.text : text.secondary,
      }}
    >
      {priority}
    </Box>
  );
};

export default ScenarioComparison;
