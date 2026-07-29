/**
 * @fileoverview Compliance tab panel — EU AI Act compliance mapping and checklist.
 *
 * @module pages/AIDetection/ScanDetails/ComplianceTab
 */

import { useState } from "react";
import { Box, Collapse, IconButton, Tooltip, Typography } from "@mui/material";
import { CheckCircle2, ChevronDown, ChevronRight, FileText, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Chip from "../../../components/Chip";
import {
  ComplianceCategory,
  ComplianceMappingResponse,
} from "../../../../domain/ai-detection/types";
import { palette } from "../../../themes/palette";
import { getProviderIcon } from "./providerIcons";
import {
  ARTICLE_DESCRIPTIONS,
  COMPLIANCE_CATEGORY_CONFIG,
  PRIORITY_CONFIG,
} from "./scanDetailsConfig";

interface ComplianceTabProps {
  complianceData: ComplianceMappingResponse | null;
  complianceLoading: boolean;
}

export function ComplianceTab({ complianceData, complianceLoading }: ComplianceTabProps) {
  const [expandedChecklist, setExpandedChecklist] = useState<Set<string>>(new Set());

  return (
    <Box sx={{ mt: "8px" }}>
      <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mb: 2 }}>
        EU AI Act compliance mapping based on detected AI components. Review these requirements to
        ensure your AI system meets regulatory obligations.
      </Typography>

      {complianceLoading ? (
        <Box sx={{ textAlign: "center", py: 4 }}>
          <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
            Loading compliance data...
          </Typography>
        </Box>
      ) : !complianceData ? (
        <Box sx={{ textAlign: "center", py: 4 }}>
          <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
            Unable to load compliance data
          </Typography>
        </Box>
      ) : (
        <>
          {/* Summary Cards */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "8px",
              mb: "16px",
            }}
          >
            <Box
              sx={{
                backgroundColor: palette.background.main,
                border: `1px solid ${palette.border.dark}`,
                borderRadius: "4px",
                p: 2,
                textAlign: "center",
              }}
            >
              <Typography sx={{ fontSize: "20px", fontWeight: 600 }}>
                {complianceData.summary.totalRequirements}
              </Typography>
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                Total requirements
              </Typography>
            </Box>
            <Box
              sx={{
                backgroundColor: palette.status.error.bg,
                border: `1px solid ${palette.status.error.border}`,
                borderRadius: "4px",
                p: 2,
                textAlign: "center",
              }}
            >
              <Typography
                sx={{ fontSize: "20px", fontWeight: 600, color: palette.status.error.text }}
              >
                {complianceData.summary.byPriority.high}
              </Typography>
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                High priority
              </Typography>
            </Box>
            <Box
              sx={{
                backgroundColor: palette.status.warning.bg,
                border: `1px solid ${palette.status.warning.border}`,
                borderRadius: "4px",
                p: 2,
                textAlign: "center",
              }}
            >
              <Typography
                sx={{ fontSize: "20px", fontWeight: 600, color: palette.status.warning.text }}
              >
                {complianceData.summary.byPriority.medium}
              </Typography>
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                Medium priority
              </Typography>
            </Box>
            <Tooltip
              title="Percentage of EU AI Act requirements triggered by detected AI components"
              arrow
            >
              <Box
                sx={{
                  backgroundColor: palette.background.accent,
                  border: `1px solid ${palette.border.dark}`,
                  borderRadius: "4px",
                  p: 2,
                  textAlign: "center",
                  cursor: "help",
                }}
              >
                <Typography
                  sx={{ fontSize: "20px", fontWeight: 600, color: palette.text.secondary }}
                >
                  {Math.round(complianceData.summary.coveragePercentage)}%
                </Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  Requirements scope
                </Typography>
              </Box>
            </Tooltip>
          </Box>

          {/* Category breakdown */}
          <Box sx={{ mb: "16px" }}>
            <Typography sx={{ fontSize: "15px", fontWeight: 500, mb: 2 }}>
              Requirements by category
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {Object.entries(complianceData.summary.byCategory).map(([category, count]) => {
                const config = COMPLIANCE_CATEGORY_CONFIG[category as ComplianceCategory];
                if (!config || count === 0) return null;
                return (
                  <Chip
                    key={category}
                    label={`${config.label} (${count})`}
                    backgroundColor={config.bgColor}
                    textColor={config.color}
                    uppercase={false}
                    size="small"
                  />
                );
              })}
            </Box>
          </Box>

          {/* Compliance Checklist */}
          <Box>
            <Typography sx={{ fontSize: "15px", fontWeight: 500, mb: 2 }}>
              Compliance checklist
            </Typography>

            {complianceData.checklist.length === 0 ? (
              <Box
                sx={{
                  backgroundColor: palette.status.success.bg,
                  border: `1px solid ${palette.status.success.border}`,
                  borderRadius: "4px",
                  p: 4,
                  textAlign: "center",
                }}
              >
                <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
                  <CheckCircle2 size={48} color={palette.status.success.text} />
                </Box>
                <Typography
                  sx={{
                    fontSize: "13px",
                    fontWeight: 500,
                    color: palette.status.success.text,
                    mb: 1,
                  }}
                >
                  No specific compliance actions needed
                </Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  Based on the scan results, no additional compliance requirements were identified.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {complianceData.checklist.map((item) => {
                  const priorityConfig = PRIORITY_CONFIG[item.priority];
                  const categoryConfig = COMPLIANCE_CATEGORY_CONFIG[item.category];
                  const isExpanded = expandedChecklist.has(item.id);

                  return (
                    <Box
                      key={item.id}
                      sx={{
                        border: `1px solid ${palette.border.light}`,
                        borderRadius: "4px",
                        backgroundColor: palette.background.main,
                      }}
                    >
                      {/* Checklist item header */}
                      <Box
                        sx={{
                          "display": "flex",
                          "alignItems": "flex-start",
                          "p": "12px",
                          "cursor": "pointer",
                          "&:hover": { backgroundColor: palette.background.accent },
                        }}
                        onClick={() => {
                          const newSet = new Set(expandedChecklist);
                          if (isExpanded) {
                            newSet.delete(item.id);
                          } else {
                            newSet.add(item.id);
                          }
                          setExpandedChecklist(newSet);
                        }}
                      >
                        <IconButton size="small" sx={{ mr: 1, mt: "-4px" }}>
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </IconButton>

                        <Box sx={{ flex: 1 }}>
                          <Typography sx={{ fontSize: "14px", fontWeight: 500, mb: "4px" }}>
                            {item.text}
                          </Typography>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              flexWrap: "wrap",
                            }}
                          >
                            {/* Article reference with tooltip */}
                            <Tooltip
                              title={
                                ARTICLE_DESCRIPTIONS[item.articleRef] ||
                                `EU AI Act ${item.articleRef}`
                              }
                              arrow
                              placement="top"
                            >
                              <Box
                                sx={{
                                  px: "6px",
                                  py: "2px",
                                  borderRadius: "4px",
                                  backgroundColor: palette.status.default.bg,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  cursor: "help",
                                }}
                              >
                                <FileText size={12} color={palette.text.tertiary} />
                                <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
                                  {item.articleRef}
                                </Typography>
                              </Box>
                            </Tooltip>
                            {/* Category badge with tooltip */}
                            {categoryConfig && (
                              <Tooltip title={categoryConfig.description} arrow placement="top">
                                <Box
                                  sx={{
                                    px: "6px",
                                    py: "2px",
                                    borderRadius: "4px",
                                    backgroundColor: categoryConfig.bgColor,
                                    cursor: "help",
                                  }}
                                >
                                  <Typography
                                    sx={{ fontSize: "12px", color: categoryConfig.color }}
                                  >
                                    {categoryConfig.label}
                                  </Typography>
                                </Box>
                              </Tooltip>
                            )}
                          </Box>
                        </Box>

                        {/* Priority badge with tooltip */}
                        {priorityConfig && (
                          <Tooltip title={priorityConfig.description} arrow placement="top">
                            <Box
                              sx={{
                                px: "8px",
                                py: "2px",
                                borderRadius: "4px",
                                backgroundColor: priorityConfig.bgColor,
                                border: `1px solid ${priorityConfig.color}20`,
                                cursor: "help",
                              }}
                            >
                              <Typography
                                sx={{
                                  fontSize: "12px",
                                  fontWeight: 500,
                                  color: priorityConfig.color,
                                }}
                              >
                                {priorityConfig.label}
                              </Typography>
                            </Box>
                          </Tooltip>
                        )}
                      </Box>

                      {/* Expanded content - actionable guidance */}
                      <Collapse in={isExpanded}>
                        <Box
                          sx={{
                            px: "12px",
                            pb: "12px",
                            borderTop: `1px solid ${palette.border.light}`,
                            pt: "12px",
                          }}
                        >
                          {(() => {
                            // Group findings by type to show relevant documentation needs per type
                            const findingsByType = item.relatedFindings.reduce(
                              (acc, f) => {
                                if (!acc[f.type]) acc[f.type] = [];
                                acc[f.type].push(f);
                                return acc;
                              },
                              {} as Record<string, typeof item.relatedFindings>,
                            );

                            // Get unique documentation needs and risks per finding type
                            const getInfoForType = (type: string) => {
                              const findings = findingsByType[type] || [];
                              const mappings = findings
                                .map((f) =>
                                  complianceData.mappings.find((m) => m.findingId === f.id),
                                )
                                .filter(Boolean);
                              return {
                                documentationNeeds: [
                                  ...new Set(mappings.flatMap((m) => m?.documentationNeeds || [])),
                                ],
                                riskFactors: [
                                  ...new Set(mappings.flatMap((m) => m?.riskFactors || [])),
                                ],
                              };
                            };

                            const FINDING_TYPE_LABELS: Record<string, string> = {
                              library: "AI/ML libraries",
                              dependency: "Dependencies",
                              api_call: "API calls",
                              model_ref: "Model references",
                              rag_component: "RAG components",
                              agent: "AI agents",
                              secret: "Secrets/credentials",
                            };

                            return (
                              <Box sx={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                {/* Show findings grouped by type with their specific documentation needs */}
                                {Object.entries(findingsByType).map(([type, findings]) => {
                                  const { documentationNeeds, riskFactors } = getInfoForType(type);
                                  const typeLabel = FINDING_TYPE_LABELS[type] || type;

                                  return (
                                    <Box
                                      key={type}
                                      sx={{
                                        backgroundColor: palette.background.accent,
                                        borderRadius: "6px",
                                        p: "12px",
                                      }}
                                    >
                                      {/* Type header with count */}
                                      <Typography
                                        sx={{
                                          fontSize: "13px",
                                          fontWeight: 600,
                                          color: palette.text.secondary,
                                          mb: "8px",
                                        }}
                                      >
                                        {typeLabel} ({findings.length})
                                      </Typography>

                                      {/* Component chips */}
                                      <Box
                                        sx={{
                                          display: "flex",
                                          flexWrap: "wrap",
                                          gap: 1,
                                          mb:
                                            documentationNeeds.length > 0 || riskFactors.length > 0
                                              ? "12px"
                                              : 0,
                                        }}
                                      >
                                        {findings.slice(0, 10).map((finding) => (
                                          <Box
                                            key={finding.id}
                                            sx={{
                                              px: "8px",
                                              py: "4px",
                                              borderRadius: "4px",
                                              backgroundColor: palette.background.main,
                                              border: `1px solid ${palette.border.light}`,
                                              display: "flex",
                                              alignItems: "center",
                                              gap: "6px",
                                            }}
                                          >
                                            {getProviderIcon(finding.name, 14)}
                                            <Typography
                                              sx={{
                                                fontSize: "13px",
                                                color: palette.text.secondary,
                                              }}
                                            >
                                              {finding.name}
                                            </Typography>
                                          </Box>
                                        ))}
                                        {findings.length > 10 && (
                                          <Typography
                                            sx={{
                                              fontSize: "13px",
                                              color: palette.text.tertiary,
                                              alignSelf: "center",
                                            }}
                                          >
                                            +{findings.length - 10} more
                                          </Typography>
                                        )}
                                      </Box>

                                      {/* Documentation needs for this type */}
                                      {documentationNeeds.length > 0 && (
                                        <Box sx={{ mt: "8px" }}>
                                          <Typography
                                            sx={{
                                              fontSize: "13px",
                                              fontWeight: 500,
                                              color: palette.text.tertiary,
                                              mb: "4px",
                                            }}
                                          >
                                            For each {typeLabel.toLowerCase()}, document:
                                          </Typography>
                                          <Box component="ul" sx={{ m: 0, pl: "16px" }}>
                                            {documentationNeeds.map((need, idx) => (
                                              <Typography
                                                component="li"
                                                key={idx}
                                                sx={{
                                                  fontSize: "13px",
                                                  color: palette.text.tertiary,
                                                }}
                                              >
                                                {need}
                                              </Typography>
                                            ))}
                                          </Box>
                                        </Box>
                                      )}

                                      {/* Risk factors for this type */}
                                      {riskFactors.length > 0 && (
                                        <Box sx={{ mt: "8px" }}>
                                          <Typography
                                            sx={{
                                              fontSize: "13px",
                                              fontWeight: 500,
                                              color: palette.status.warning.text,
                                              mb: "4px",
                                            }}
                                          >
                                            Risks to consider:
                                          </Typography>
                                          <Box component="ul" sx={{ m: 0, pl: "16px" }}>
                                            {riskFactors.map((risk, idx) => (
                                              <Typography
                                                component="li"
                                                key={idx}
                                                sx={{
                                                  fontSize: "13px",
                                                  color: palette.text.tertiary,
                                                }}
                                              >
                                                {risk}
                                              </Typography>
                                            ))}
                                          </Box>
                                        </Box>
                                      )}
                                    </Box>
                                  );
                                })}

                                {/* Fallback if no findings */}
                                {item.relatedFindings.length === 0 && (
                                  <Typography
                                    sx={{ fontSize: "13px", color: palette.text.tertiary }}
                                  >
                                    This requirement applies to AI components detected in the scan.
                                    Review your implementation to ensure compliance.
                                  </Typography>
                                )}
                              </Box>
                            );
                          })()}
                        </Box>
                      </Collapse>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>

          {/* Generated timestamp */}
          <Box sx={{ mt: 3, display: "flex", alignItems: "center", gap: 1 }}>
            <Info size={14} color={palette.text.tertiary} />
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
              Compliance mapping generated{" "}
              {formatDistanceToNow(new Date(complianceData.generatedAt), { addSuffix: true })}
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}
