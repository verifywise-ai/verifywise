import { useState } from "react";
import {
  Box,
  Typography,
  LinearProgress,
  Stack,
  Card,
  Collapse,
  IconButton,
  Tooltip,
} from "@mui/material";
import { CustomizableButton } from "../button/customizable-button";
import { Sparkles, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import Chip from "../Chip";
import {
  status,
  accent,
  text as textColors,
  border as borderPalette,
  background,
} from "../../themes/palette";
import EvidenceQualityBadge, {
  getGradeColor,
  getGradeLabel,
  type QualityGrade,
} from "../EvidenceQualityBadge";

interface QualityScore {
  relevance: QualityGrade | null;
  completeness: QualityGrade | null;
  recency: QualityGrade | null;
  reliability: QualityGrade | null;
  specificity: QualityGrade | null;
}

interface SuggestedLink {
  control_id: number;
  control_title: string;
  framework_type: string;
  match_score: number;
  matched_areas: string[];
}

interface AuditMetadata {
  analyzer_version?: string;
  rationales?: {
    relevance?: string;
    completeness?: string;
    specificity?: string;
    recency?: string;
    reliability?: string;
  };
  abstain_reason?: string | null;
  document_signals?: {
    document_type?: string;
    has_explicit_dates?: boolean;
    has_named_owner?: boolean;
    has_version?: boolean;
    has_metrics?: boolean;
    is_draft?: boolean;
    authority_signal?: number;
  };
  char_count?: number;
  truncated?: boolean;
  findings_with_quotes?: Array<{
    text: string;
    evidence_quote: string;
    relevance: "primary" | "supporting" | "tangential";
  }>;
  filename_check?: {
    mismatch: boolean;
    suggested_filename: string | null;
    reason: string | null;
  } | null;
}

interface AnalysisData {
  file_id: number;
  summary: string;
  key_findings: string[];
  compliance_areas: string[];
  quality_score: QualityScore;
  overall_quality_grade: QualityGrade | null;
  suggested_control_links: SuggestedLink[];
  analysis_model: string;
  analysis_version: number;
  analyzed_at: string;
  audit_metadata?: AuditMetadata | string | null;
}

interface EvidenceAnalysisPanelProps {
  analysis: AnalysisData | null;
  isLoading?: boolean;
  onTriggerAnalysis?: () => void;
  onApplySuggestions?: (suggestions: Array<{ control_id: number; framework_type: string }>) => void;
  isAnalyzing?: boolean;
}

// Flat card per design rules: white bg, light border, 4px radius, no shadow.
const cardSx = {
  backgroundColor: background.main,
  border: `1px solid ${borderPalette.light}`,
  borderRadius: "4px",
  boxShadow: "none",
};

// Grade → progress-bar fill % (A=100 … F=20, null=0)
function gradeFill(grade: QualityGrade | null) {
  switch (grade) {
    case "A":
      return 100;
    case "B":
      return 80;
    case "C":
      return 60;
    case "D":
      return 40;
    case "F":
      return 20;
    default:
      return 0;
  }
}

const DIMENSION_META = [
  { key: "relevance", label: "Relevance", description: "Alignment with the control" },
  { key: "completeness", label: "Completeness", description: "Coverage of requirements" },
  { key: "recency", label: "Recency", description: "How current the evidence is" },
  { key: "reliability", label: "Reliability", description: "Trustworthy source quality" },
  { key: "specificity", label: "Specificity", description: "Detail and precision" },
] as const;

function DimensionCard({
  label,
  description,
  grade,
  rationale,
}: {
  label: string;
  description: string;
  grade: QualityGrade | null;
  rationale?: string | null;
}) {
  const colors = getGradeColor(grade);
  const [expanded, setExpanded] = useState(false);
  const hasRationale = !!rationale && rationale.trim().length > 0;

  return (
    <Stack
      sx={{
        ...cardSx,
        padding: "12px 14px",
        height: "100%",
      }}
      spacing={0.75}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography
          sx={{
            fontSize: 12,
            color: textColors.secondary,
            fontWeight: 500,
          }}
        >
          {label}
        </Typography>
        {hasRationale && (
          <Tooltip title={expanded ? "Hide rationale" : "Why this score?"} arrow>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              sx={{
                "p": 0.25,
                "color": textColors.accent,
                "&:hover": { color: accent.primary.text },
              }}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      <Typography
        sx={{
          fontSize: 24,
          fontWeight: 700,
          color: colors.text,
          lineHeight: 1.1,
        }}
      >
        {grade ?? "—"}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={gradeFill(grade)}
        sx={{
          "height": 5,
          "borderRadius": "4px",
          "backgroundColor": background.hover,
          "& .MuiLinearProgress-bar": {
            borderRadius: "4px",
            backgroundColor: colors.text,
          },
        }}
      />
      <Typography
        sx={{
          fontSize: 11,
          color: textColors.accent,
          lineHeight: 1.3,
        }}
      >
        {description}
      </Typography>
      {hasRationale && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <Box
            sx={{
              mt: 0.75,
              pt: 0.75,
              borderTop: `1px dashed ${borderPalette.light}`,
            }}
          >
            <Typography
              sx={{
                fontSize: 11,
                color: textColors.tertiary,
                lineHeight: 1.45,
                fontStyle: "italic",
              }}
            >
              {rationale}
            </Typography>
          </Box>
        </Collapse>
      )}
    </Stack>
  );
}

export default function EvidenceAnalysisPanel({
  analysis,
  isLoading,
  onTriggerAnalysis,
  onApplySuggestions,
  isAnalyzing,
}: EvidenceAnalysisPanelProps) {
  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography sx={{ mt: 1.5, fontSize: 13, color: textColors.tertiary }}>
          Loading analysis...
        </Typography>
      </Box>
    );
  }

  if (!analysis) {
    return (
      <Box sx={{ p: 3 }}>
        <Card
          elevation={0}
          sx={{
            ...cardSx,
            p: 4,
            textAlign: "center",
          }}
        >
          <Box sx={{ display: "flex", justifyContent: "center", mb: 1.5 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                backgroundColor: accent.primary.bg,
                color: accent.primary.text,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={20} />
            </Box>
          </Box>
          <Typography
            sx={{
              fontSize: 14,
              color: textColors.secondary,
              mb: 2,
              fontWeight: 500,
            }}
          >
            No AI analysis available for this evidence yet.
          </Typography>
          {onTriggerAnalysis && (
            <CustomizableButton
              variant="outlined"
              text={isAnalyzing ? "Analyzing..." : "Run AI analysis"}
              isDisabled={isAnalyzing}
              onClick={onTriggerAnalysis}
              sx={{
                "borderColor": accent.primary.border,
                "color": accent.primary.text,
                "&:hover": { backgroundColor: accent.primary.bg },
              }}
            />
          )}
        </Card>
      </Box>
    );
  }

  const qualityScore: QualityScore =
    typeof analysis.quality_score === "string"
      ? JSON.parse(analysis.quality_score)
      : analysis.quality_score;

  const suggestedLinks: SuggestedLink[] =
    typeof analysis.suggested_control_links === "string"
      ? JSON.parse(analysis.suggested_control_links)
      : analysis.suggested_control_links || [];

  const complianceAreas: string[] =
    typeof analysis.compliance_areas === "string"
      ? JSON.parse(analysis.compliance_areas)
      : analysis.compliance_areas || [];

  const keyFindings: string[] =
    typeof analysis.key_findings === "string"
      ? JSON.parse(analysis.key_findings)
      : analysis.key_findings || [];

  const auditMetadata: AuditMetadata | null = analysis.audit_metadata
    ? typeof analysis.audit_metadata === "string"
      ? (() => {
          try {
            return JSON.parse(analysis.audit_metadata as string);
          } catch {
            return null;
          }
        })()
      : (analysis.audit_metadata as AuditMetadata)
    : null;

  const rationales = auditMetadata?.rationales ?? {};
  const docSignals = auditMetadata?.document_signals;
  const abstainReason = auditMetadata?.abstain_reason;
  const findingsWithQuotes = auditMetadata?.findings_with_quotes;
  const filenameCheck = auditMetadata?.filename_check;

  const overallGrade = analysis.overall_quality_grade;
  const overallColors = getGradeColor(overallGrade);
  const overallLabel = getGradeLabel(overallGrade);

  return (
    <Box sx={{ p: 3, backgroundColor: background.alt }}>
      {/* Abstain banner — only when LLM explicitly abstained */}
      {abstainReason && (
        <Card
          elevation={0}
          sx={{
            ...cardSx,
            borderColor: status.warning.border,
            background: status.warning.bg,
            mb: "16px",
            p: 1.5,
          }}
        >
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Box sx={{ color: status.warning.text, mt: 0.25 }}>
              <AlertTriangle size={16} />
            </Box>
            <Box>
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: status.warning.text,
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                  mb: 0.25,
                }}
              >
                Analyzer abstained
              </Typography>
              <Typography sx={{ fontSize: 12, color: textColors.tertiary, lineHeight: 1.5 }}>
                {abstainReason}
              </Typography>
            </Box>
          </Stack>
        </Card>
      )}

      {/* Filename mismatch — single-sentence suggestion, no card */}
      {filenameCheck?.mismatch && filenameCheck.suggested_filename && (
        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: "16px" }}>
          <Box sx={{ color: accent.orange.text, mt: 0.25, flexShrink: 0 }}>
            <AlertTriangle size={14} />
          </Box>
          <Typography sx={{ fontSize: 13, color: accent.orange.text, lineHeight: 1.5 }}>
            This filename doesn&apos;t match its content — consider renaming it to &quot;
            {filenameCheck.suggested_filename}&quot;
            {filenameCheck.reason ? ` (${filenameCheck.reason})` : ""}.
          </Typography>
        </Stack>
      )}

      {/* Hero overall score panel */}
      <Card elevation={0} sx={{ ...cardSx, mb: "16px", p: 2.5 }}>
        <Stack direction="row" spacing={2.5} alignItems="center">
          {/* Score circle */}
          <Box
            sx={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              backgroundColor: overallColors.bg,
              border: `2px solid ${overallColors.border}`,
              color: overallColors.text,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Typography sx={{ fontSize: 44, fontWeight: 700, lineHeight: 1 }}>
              {overallGrade ?? "—"}
            </Typography>
          </Box>

          {/* Right text */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <Typography
                sx={{
                  fontSize: 13,
                  color: textColors.secondary,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                }}
              >
                Overall Quality Grade
              </Typography>
              <EvidenceQualityBadge grade={overallGrade} size="small" />
            </Stack>
            <Typography
              sx={{
                fontSize: 18,
                fontWeight: 600,
                color: textColors.primary,
                mb: 0.75,
              }}
            >
              {overallGrade ? `${overallLabel} quality evidence` : "AI grading unavailable"}
            </Typography>
            <Typography
              sx={{
                fontSize: 13,
                color: textColors.tertiary,
                lineHeight: 1.5,
              }}
            >
              {analysis.summary}
            </Typography>
          </Box>
        </Stack>
      </Card>

      {/* 5 Quality Dimension stat cards */}
      <Box sx={{ mb: "16px" }}>
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 600,
            color: textColors.secondary,
            textTransform: "uppercase",
            letterSpacing: 0.3,
            mb: 1,
          }}
        >
          Quality breakdown
        </Typography>
        <Box
          sx={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns: {
              xs: "repeat(2, 1fr)",
              sm: "repeat(3, 1fr)",
              md: "repeat(5, 1fr)",
            },
          }}
        >
          {DIMENSION_META.map((dim) => (
            <DimensionCard
              key={dim.key}
              label={dim.label}
              description={dim.description}
              grade={qualityScore?.[dim.key as keyof QualityScore] ?? null}
              rationale={rationales?.[dim.key as keyof typeof rationales] ?? null}
            />
          ))}
        </Box>
      </Box>

      {/* Suggested control links */}
      {suggestedLinks.length > 0 && (
        <Card elevation={0} sx={{ ...cardSx, p: 2, mb: "16px" }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 1.5 }}
          >
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: textColors.secondary,
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}
            >
              Suggested control links ({suggestedLinks.length})
            </Typography>
            {onApplySuggestions && (
              <CustomizableButton
                variant="outlined"
                size="small"
                text="Apply all"
                onClick={() =>
                  onApplySuggestions(
                    suggestedLinks.map((s) => ({
                      control_id: s.control_id,
                      framework_type: s.framework_type,
                    })),
                  )
                }
                sx={{
                  "borderColor": accent.primary.border,
                  "color": accent.primary.text,
                  "&:hover": { backgroundColor: accent.primary.bg },
                }}
              />
            )}
          </Stack>
          <Stack spacing={0.75}>
            {suggestedLinks.slice(0, 6).map((link, i) => (
              <Box
                key={i}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  p: 1.25,
                  backgroundColor: background.accent,
                  borderRadius: "4px",
                  border: `1px solid ${borderPalette.light}`,
                  gap: 1.5,
                }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: textColors.primary,
                      fontWeight: 500,
                      lineHeight: 1.3,
                    }}
                  >
                    {link.control_title}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: textColors.accent,
                      mt: 0.25,
                      textTransform: "uppercase",
                      letterSpacing: 0.3,
                    }}
                  >
                    {link.framework_type.replace(/_/g, " ")}
                  </Typography>
                </Box>
                <Chip
                  label={`${link.match_score}% match`}
                  size="small"
                  variant={link.match_score >= 70 ? "success" : "warning"}
                  uppercase={false}
                />
              </Box>
            ))}
          </Stack>
        </Card>
      )}

      {/* Document signals — only when analyzer-v2 produced them */}
      {docSignals && (
        <Card elevation={0} sx={{ ...cardSx, p: 2, mb: "16px" }}>
          <Typography
            sx={{
              fontSize: 12,
              fontWeight: 600,
              color: textColors.secondary,
              textTransform: "uppercase",
              letterSpacing: 0.3,
              mb: 1.5,
            }}
          >
            Document signals
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
              gap: "16px",
            }}
          >
            <SignalChip
              label="Authority"
              value={`${docSignals.authority_signal ?? 0}/100`}
              positive={(docSignals.authority_signal ?? 0) >= 60}
            />
            <SignalChip label="Type" value={docSignals.document_type ?? "—"} neutral />
            <SignalChip
              label="Named owner"
              value={docSignals.has_named_owner ? "Yes" : "No"}
              positive={!!docSignals.has_named_owner}
            />
            <SignalChip
              label="Version"
              value={docSignals.has_version ? "Yes" : "No"}
              positive={!!docSignals.has_version}
            />
            <SignalChip
              label="Explicit dates"
              value={docSignals.has_explicit_dates ? "Yes" : "No"}
              positive={!!docSignals.has_explicit_dates}
            />
            <SignalChip
              label="Metrics"
              value={docSignals.has_metrics ? "Yes" : "No"}
              positive={!!docSignals.has_metrics}
            />
            <SignalChip
              label="Draft"
              value={docSignals.is_draft ? "Yes" : "No"}
              positive={!docSignals.is_draft}
              invertSemantic
            />
            {auditMetadata?.truncated && (
              <SignalChip
                label="Truncated"
                value={`${auditMetadata.char_count ?? "?"} ch`}
                negative
              />
            )}
          </Box>
        </Card>
      )}

      {/* Compliance areas + Key findings — two full-width rows, findings last */}
      <Stack spacing="16px" sx={{ mb: "16px" }}>
        {/* Compliance areas */}
        <Card elevation={0} sx={{ ...cardSx, p: 2 }}>
          <Typography
            sx={{
              fontSize: 12,
              fontWeight: 600,
              color: textColors.secondary,
              textTransform: "uppercase",
              letterSpacing: 0.3,
              mb: 1.5,
            }}
          >
            Compliance areas ({complianceAreas.length})
          </Typography>
          {complianceAreas.length > 0 ? (
            <Stack direction="row" flexWrap="wrap" gap={0.75}>
              {complianceAreas.map((area, i) => (
                <Chip
                  key={i}
                  label={area}
                  size="small"
                  backgroundColor={accent.blue.bg}
                  textColor={accent.blue.text}
                  uppercase={false}
                />
              ))}
            </Stack>
          ) : (
            <Typography sx={{ fontSize: 12, color: textColors.accent }}>
              No compliance areas detected.
            </Typography>
          )}
        </Card>

        {/* Key findings */}
        <Card elevation={0} sx={{ ...cardSx, p: 2 }}>
          <Typography
            sx={{
              fontSize: 12,
              fontWeight: 600,
              color: textColors.secondary,
              textTransform: "uppercase",
              letterSpacing: 0.3,
              mb: 1.5,
            }}
          >
            Key findings ({keyFindings.length})
          </Typography>
          {keyFindings.length > 0 ? (
            <Stack spacing={1}>
              {keyFindings.slice(0, 5).map((finding, i) => {
                const fwq = findingsWithQuotes?.[i];
                return (
                  <Box key={i}>
                    <Stack direction="row" spacing={0.75} alignItems="flex-start">
                      <Box
                        sx={{
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          backgroundColor: accent.primary.bg,
                          color: accent.primary.text,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 700,
                          flexShrink: 0,
                          mt: 0.1,
                        }}
                      >
                        {i + 1}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          sx={{
                            fontSize: 12,
                            color: textColors.tertiary,
                            lineHeight: 1.5,
                          }}
                        >
                          {finding.length > 160 ? finding.substring(0, 160) + "..." : finding}
                        </Typography>
                        {fwq?.evidence_quote && (
                          <Box
                            sx={{
                              mt: 0.5,
                              pl: 1,
                              borderLeft: `2px solid ${accent.primary.border}`,
                              backgroundColor: background.accent,
                              py: 0.5,
                              pr: 1,
                              borderRadius: "0 4px 4px 0",
                            }}
                          >
                            <Typography
                              sx={{
                                fontSize: 11,
                                color: textColors.tertiary,
                                fontStyle: "italic",
                                lineHeight: 1.45,
                              }}
                            >
                              {fwq.evidence_quote.length > 180
                                ? fwq.evidence_quote.substring(0, 180) + "..."
                                : fwq.evidence_quote}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          ) : (
            <Typography sx={{ fontSize: 12, color: textColors.accent }}>
              No key findings extracted.
            </Typography>
          )}
        </Card>
      </Stack>

      {/* Footer — Analysis metadata */}
      <Box
        sx={{
          pt: 1.5,
          borderTop: `1px solid ${borderPalette.light}`,
        }}
      >
        <Typography sx={{ fontSize: 11, color: textColors.accent }}>
          Analyzed by {analysis.analysis_model} (v{analysis.analysis_version}) ·{" "}
          {new Date(analysis.analyzed_at).toLocaleString()}
          {auditMetadata?.analyzer_version ? ` · ${auditMetadata.analyzer_version}` : ""}
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * Compact signal chip used by document-signals grid.
 */
function SignalChip({
  label,
  value,
  positive,
  negative,
  neutral,
  invertSemantic,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
  neutral?: boolean;
  invertSemantic?: boolean;
}) {
  let bg: string = background.accent;
  let textColor: string = textColors.tertiary;
  let borderColor: string = borderPalette.light;

  if (!neutral) {
    if (invertSemantic) {
      // for "Draft" — positive means "not draft" (good), so green
      if (positive) {
        bg = status.success.bg;
        textColor = status.success.text;
        borderColor = status.success.border;
      } else {
        bg = status.warning.bg;
        textColor = status.warning.text;
        borderColor = status.warning.border;
      }
    } else if (positive) {
      bg = status.success.bg;
      textColor = status.success.text;
      borderColor = status.success.border;
    } else if (negative) {
      bg = status.warning.bg;
      textColor = status.warning.text;
      borderColor = status.warning.border;
    } else {
      bg = status.default.bg;
      textColor = status.default.text;
      borderColor = status.default.border;
    }
  }

  return (
    <Box
      sx={{
        backgroundColor: bg,
        color: textColor,
        border: `1px solid ${borderColor}`,
        borderRadius: "4px",
        px: 1,
        py: 0.5,
      }}
    >
      <Typography
        sx={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.3,
          opacity: 0.8,
          lineHeight: 1.1,
        }}
      >
        {label}
      </Typography>
      <Typography sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{value}</Typography>
    </Box>
  );
}
