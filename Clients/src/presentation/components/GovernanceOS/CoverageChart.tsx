import { useState } from "react";
import {
  Box,
  Typography,
  LinearProgress,
  Stack,
  IconButton,
  Collapse,
  Divider,
  alpha,
} from "@mui/material";
import { ChevronDown, ChevronUp, Plus, CheckSquare, Square } from "lucide-react";
import { ICoverageChartProps } from "../../../domain/interfaces/i.governanceOs";
import { CustomizableButton } from "../button/customizable-button";
import GovernanceTooltip from "./GovernanceTooltip";
import { border as borderPalette, background, text, status, brand } from "../../themes/palette";

const CoverageChart = ({
  coverage,
  onCreateTaskForGap,
  onCreateTasksForGaps,
  activeScenarioFrameworkId,
}: ICoverageChartProps) => {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [selectedGapsByFramework, setSelectedGapsByFramework] = useState<
    Record<number, Set<string>>
  >({});

  const toggleExpand = (frameworkId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(frameworkId)) {
        next.delete(frameworkId);
      } else {
        next.add(frameworkId);
      }
      return next;
    });
  };

  const toggleGapSelection = (frameworkId: number, controlId: string) => {
    setSelectedGapsByFramework((prev) => {
      const current = new Set(prev[frameworkId] || []);
      if (current.has(controlId)) {
        current.delete(controlId);
      } else {
        current.add(controlId);
      }
      return { ...prev, [frameworkId]: current };
    });
  };

  const selectAllGaps = (frameworkId: number, controlIds: string[]) => {
    setSelectedGapsByFramework((prev) => ({
      ...prev,
      [frameworkId]: new Set(controlIds),
    }));
  };

  const clearAllGaps = (frameworkId: number) => {
    setSelectedGapsByFramework((prev) => ({
      ...prev,
      [frameworkId]: new Set(),
    }));
  };

  const handleBulkCreate = (fw: (typeof coverage)[0]) => {
    const selected = Array.from(selectedGapsByFramework[fw.framework_id] || []);
    if (selected.length > 0 && onCreateTasksForGaps) {
      onCreateTasksForGaps(fw.framework_name || `Framework ${fw.framework_id}`, selected);
      clearAllGaps(fw.framework_id);
    }
  };

  if (!coverage || coverage.length === 0) {
    return (
      <Typography sx={{ fontSize: 13, color: text.accent }}>
        No coverage data available. Assign frameworks to a project first.
      </Typography>
    );
  }

  return (
    <Stack gap="16px">
      {coverage.map((fw) => {
        const isExpanded = expandedIds.has(fw.framework_id);
        const isPrimary = activeScenarioFrameworkId === fw.framework_id;
        const gapIds = fw.gap_details.unmapped_controls;
        const synergyIds = fw.synergy_details.multi_framework_controls;
        const selectedGaps = selectedGapsByFramework[fw.framework_id] || new Set<string>();
        const hasGaps = gapIds.length > 0;
        const hasSynergies = synergyIds.length > 0;

        return (
          <Box
            key={fw.framework_id}
            sx={{
              "border": `1px solid ${isPrimary ? brand.primary : borderPalette.light}`,
              "borderRadius": "4px",
              "p": "16px",
              "background": isPrimary ? alpha(brand.primary, 0.04) : background.main,
              "transition": "all 0.2s ease",
              "&:hover": {
                borderColor: isPrimary ? brand.primary : borderPalette.dark,
                background: background.accent,
              },
            }}
          >
            {/* Header row */}
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ cursor: hasGaps || hasSynergies ? "pointer" : "default" }}
              onClick={() => {
                if (hasGaps || hasSynergies) toggleExpand(fw.framework_id);
              }}
            >
              <Stack direction="row" gap="8px" alignItems="center">
                <GovernanceTooltip
                  header="Framework coverage"
                  description="Overview of how well this framework is mapped to controls"
                >
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
                    {fw.framework_name || `Framework ${fw.framework_id}`}
                  </Typography>
                </GovernanceTooltip>
                {isPrimary && (
                  <GovernanceTooltip
                    header="Primary framework"
                    description="The framework used as the baseline in the active scenario"
                  >
                    <Box
                      component="span"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        height: 18,
                        px: "6px",
                        borderRadius: "4px",
                        fontSize: 10,
                        fontWeight: 500,
                        backgroundColor: alpha(brand.primary, 0.12),
                        color: brand.primary,
                      }}
                    >
                      Primary
                    </Box>
                  </GovernanceTooltip>
                )}
              </Stack>

              <Stack direction="row" gap="8px" alignItems="center">
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: brand.primary }}>
                  {fw.coverage_percentage}%
                </Typography>
                {(hasGaps || hasSynergies) && (
                  <IconButton size="small" disableRipple sx={{ color: text.muted }}>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </IconButton>
                )}
              </Stack>
            </Stack>

            <GovernanceTooltip
              header="Coverage progress"
              description="Mapped controls shown as a percentage of total controls"
            >
              <LinearProgress
                variant="determinate"
                value={fw.coverage_percentage}
                sx={{
                  "height": 6,
                  "borderRadius": "4px",
                  "mt": "8px",
                  "mb": "8px",
                  "backgroundColor": background.hover,
                  "& .MuiLinearProgress-bar": {
                    backgroundColor: brand.primary,
                    borderRadius: "4px",
                  },
                }}
              />
            </GovernanceTooltip>

            <Stack direction="row" gap="8px" justifyContent="space-between" alignItems="center">
              <Typography sx={{ fontSize: 11, color: text.muted }}>
                {fw.mapped_controls}/{fw.total_controls} controls mapped
              </Typography>
              <Box>
                {hasGaps && (
                  <GovernanceTooltip
                    header="Control gaps"
                    description="Unmapped controls that need a remediation task"
                  >
                    <Box
                      component="span"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        height: 20,
                        px: "6px",
                        borderRadius: "4px",
                        fontSize: 10,
                        fontWeight: 500,
                        mr: "4px",
                        backgroundColor: status.warning.bg,
                        color: status.warning.text,
                        border: `1px solid ${status.warning.border}`,
                      }}
                    >
                      {gapIds.length} gaps
                    </Box>
                  </GovernanceTooltip>
                )}
                {hasSynergies && (
                  <GovernanceTooltip
                    header="Multi-framework synergies"
                    description="Controls that satisfy requirements in multiple frameworks"
                  >
                    <Box
                      component="span"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        height: 20,
                        px: "6px",
                        borderRadius: "4px",
                        fontSize: 10,
                        fontWeight: 500,
                        backgroundColor: status.success.bg,
                        color: status.success.text,
                        border: `1px solid ${status.success.border}`,
                      }}
                    >
                      {synergyIds.length} synergies
                    </Box>
                  </GovernanceTooltip>
                )}
              </Box>
            </Stack>

            {/* Expandable detail section */}
            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
              <Divider sx={{ my: "12px", borderColor: borderPalette.light }} />

              {/* Gaps section */}
              {hasGaps && (
                <Box sx={{ mb: "16px" }}>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: "8px" }}
                  >
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: status.warning.text }}>
                      Unmapped controls ({gapIds.length})
                    </Typography>
                    <Stack direction="row" gap="4px">
                      <GovernanceTooltip
                        header="Select all gaps"
                        description="Choose every unmapped control in this framework for bulk action"
                      >
                        <span>
                          <CustomizableButton
                            size="small"
                            onClick={() => selectAllGaps(fw.framework_id, gapIds)}
                            text="Select all"
                            sx={{ minWidth: 0, px: 1 }}
                          />
                        </span>
                      </GovernanceTooltip>
                      <GovernanceTooltip
                        header="Clear selection"
                        description="Remove all selected gaps from the bulk task list"
                      >
                        <span>
                          <CustomizableButton
                            size="small"
                            onClick={() => clearAllGaps(fw.framework_id)}
                            text="Clear"
                            sx={{ minWidth: 0, px: 1 }}
                          />
                        </span>
                      </GovernanceTooltip>
                    </Stack>
                  </Stack>

                  <Box
                    sx={{
                      border: `1px solid ${borderPalette.light}`,
                      borderRadius: "4px",
                      maxHeight: 200,
                      overflow: "auto",
                    }}
                  >
                    {gapIds.map((controlId, idx) => {
                      const isSelected = selectedGaps.has(controlId);
                      return (
                        <Box
                          key={controlId}
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            px: "12px",
                            py: "8px",
                            borderBottom:
                              idx < gapIds.length - 1 ? `1px solid ${borderPalette.light}` : "none",
                            backgroundColor: isSelected
                              ? alpha(brand.primary, 0.04)
                              : background.main,
                          }}
                        >
                          <Stack direction="row" gap="8px" alignItems="center">
                            <Box
                              component="span"
                              sx={{ cursor: "pointer", display: "flex", alignItems: "center" }}
                              onClick={() => toggleGapSelection(fw.framework_id, controlId)}
                            >
                              {isSelected ? (
                                <CheckSquare size={16} color={brand.primary} />
                              ) : (
                                <Square size={16} color={text.muted} />
                              )}
                            </Box>
                            <Typography
                              sx={{ fontSize: 12, color: text.primary, fontFamily: "monospace" }}
                            >
                              {controlId}
                            </Typography>
                          </Stack>
                          {onCreateTaskForGap && (
                            <GovernanceTooltip
                              header="Create task"
                              description="Add a remediation task for this unmapped control"
                            >
                              <span>
                                <CustomizableButton
                                  size="small"
                                  variant="text"
                                  startIcon={<Plus size={14} />}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCreateTaskForGap(
                                      fw.framework_name || `Framework ${fw.framework_id}`,
                                      controlId,
                                    );
                                  }}
                                  text="Task"
                                  sx={{
                                    color: brand.primary,
                                    minWidth: 0,
                                    px: 1,
                                  }}
                                />
                              </span>
                            </GovernanceTooltip>
                          )}
                        </Box>
                      );
                    })}
                  </Box>

                  {selectedGaps.size > 0 && onCreateTasksForGaps && (
                    <Box sx={{ mt: "8px", display: "flex", justifyContent: "flex-end" }}>
                      <GovernanceTooltip
                        header="Create tasks for selected gaps"
                        description="Generate remediation tasks for all selected unmapped controls"
                      >
                        <span>
                          <CustomizableButton
                            size="small"
                            variant="contained"
                            onClick={() => handleBulkCreate(fw)}
                            text={`Create tasks for ${selectedGaps.size} gap(s)`}
                            sx={{}}
                          />
                        </span>
                      </GovernanceTooltip>
                    </Box>
                  )}
                </Box>
              )}

              {/* Synergies section */}
              {hasSynergies && (
                <Box>
                  <Typography
                    sx={{ fontSize: 12, fontWeight: 600, color: status.success.text, mb: "8px" }}
                  >
                    Multi-framework controls ({synergyIds.length})
                  </Typography>
                  <Stack direction="row" flexWrap="wrap" gap="6px">
                    {synergyIds.map((controlId) => (
                      <Box
                        key={controlId}
                        component="span"
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          height: 22,
                          px: "8px",
                          borderRadius: "4px",
                          fontSize: 11,
                          fontFamily: "monospace",
                          backgroundColor: status.success.bg,
                          color: status.success.text,
                          border: `1px solid ${status.success.border}`,
                        }}
                      >
                        {controlId}
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}
            </Collapse>
          </Box>
        );
      })}
    </Stack>
  );
};

export default CoverageChart;
