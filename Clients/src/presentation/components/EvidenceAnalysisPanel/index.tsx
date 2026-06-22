import { useState } from "react";
import {
  Box,
  Typography,
  LinearProgress,
  Button,
  Stack,
  Card,
  Collapse,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  Sparkles,
  Target,
  CheckCircle2,
  Clock,
  Shield,
  Crosshair,
  FileText,
  Link2,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Quote,
  Info,
  AlertTriangle,
} from "lucide-react";
import Chip from "../Chip";
import {
  status,
  accent,
  text as textColors,
  border as borderPalette,
  background,
} from "../../themes/palette";
import EvidenceQualityBadge from "../EvidenceQualityBadge";

interface QualityScore {
  relevance: number;
  completeness: number;
  recency: number;
  reliability: number;
  specificity: number;
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
}

interface AnalysisData {
  file_id: number;
  summary: string;
  key_findings: string[];
  compliance_areas: string[];
  quality_score: QualityScore;
  overall_quality_score: number;
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

// Consistent card style — matches AIAuditDashboard cardSx pattern
const cardSx = {
  border: `1px solid ${borderPalette.dark}`,
  borderRadius: "4px",
  background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
};

function getScoreColor(score: number) {
  if (score >= 80) return status.success;
  if (score >= 60) return accent.primary;
  if (score >= 40) return status.warning;
  return status.error;
}

function getScoreLabel(score: number) {
  if (score >= 80) return "High";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Low";
}

const DIMENSION_META = [
  {
    key: "relevance",
    label: "Relevance",
    icon: Target,
    description: "Alignment with the control",
  },
  {
    key: "completeness",
    label: "Completeness",
    icon: CheckCircle2,
    description: "Coverage of requirements",
  },
  {
    key: "recency",
    label: "Recency",
    icon: Clock,
    description: "How current the evidence is",
  },
  {
    key: "reliability",
    label: "Reliability",
    icon: Shield,
    description: "Trustworthy source quality",
  },
  {
    key: "specificity",
    label: "Specificity",
    icon: Crosshair,
    description: "Detail and precision",
  },
] as const;

function DimensionCard({
  label,
  description,
  score,
  Icon,
  rationale,
}: {
  label: string;
  description: string;
  score: number;
  Icon: any;
  rationale?: string | null;
}) {
  const colors = getScoreColor(score);
  const [expanded, setExpanded] = useState(false);
  const hasRationale = !!rationale && rationale.trim().length > 0;

  return (
    <Stack
      sx={{
        ...cardSx,
        borderRadius: 2,
        padding: "10px 14px 12px 14px",
        height: "100%",
      }}
      spacing={0.75}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <Box sx={{ color: textColors.icon, display: "flex" }}>
            <Icon size={14} />
          </Box>
          <Typography
            sx={{
              fontSize: 12,
              color: textColors.secondary,
              fontWeight: 500,
            }}
          >
            {label}
          </Typography>
        </Stack>
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
          color: textColors.primary,
          lineHeight: 1.1,
        }}
      >
        {score}
        <Typography
          component="span"
          sx={{
            fontSize: 12,
            fontWeight: 500,
            color: textColors.accent,
            ml: 0.5,
          }}
        >
          / 100
        </Typography>
      </Typography>
      <LinearProgress
        variant="determinate"
        value={score}
        sx={{
          "height": 5,
          "borderRadius": 3,
          "backgroundColor": background.hover,
          "& .MuiLinearProgress-bar": {
            borderRadius: 3,
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
            <Button
              variant="outlined"
              size="small"
              onClick={onTriggerAnalysis}
              disabled={isAnalyzing}
              sx={{
                "textTransform": "none",
                "fontSize": 13,
                "borderColor": accent.primary.border,
                "color": accent.primary.text,
                "&:hover": { backgroundColor: accent.primary.bg },
              }}
            >
              {isAnalyzing ? "Analyzing..." : "Run AI analysis"}
            </Button>
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

  const overallColors = getScoreColor(analysis.overall_quality_score);
  const overallLabel = getScoreLabel(analysis.overall_quality_score);

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
            mb: 2,
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

      {/* Hero overall score panel */}
      <Card elevation={0} sx={{ ...cardSx, mb: 2, p: 2.5 }}>
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
            <Typography sx={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>
              {analysis.overall_quality_score}
            </Typography>
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                opacity: 0.8,
              }}
            >
              / 100
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
                Overall Quality Score
              </Typography>
              <EvidenceQualityBadge score={analysis.overall_quality_score} size="small" />
            </Stack>
            <Typography
              sx={{
                fontSize: 18,
                fontWeight: 600,
                color: textColors.primary,
                fontFamily: "'Red Hat Display', 'Geist', sans-serif",
                mb: 0.75,
              }}
            >
              {overallLabel} quality evidence
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
      <Box sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1 }}>
          <Sparkles size={14} color={textColors.icon} />
          <Typography
            sx={{
              fontSize: 12,
              fontWeight: 600,
              color: textColors.secondary,
              textTransform: "uppercase",
              letterSpacing: 0.3,
            }}
          >
            Quality breakdown
          </Typography>
        </Stack>
        <Box
          sx={{
            display: "grid",
            gap: 1,
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
              score={qualityScore?.[dim.key as keyof QualityScore] ?? 0}
              Icon={dim.icon}
              rationale={rationales?.[dim.key as keyof typeof rationales] ?? null}
            />
          ))}
        </Box>
      </Box>

      {/* Two-column row: Compliance Areas + Key Findings */}
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          mb: 2,
        }}
      >
        {/* Compliance areas */}
        <Card elevation={0} sx={{ ...cardSx, p: 2 }}>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1.5 }}>
            <Shield size={14} color={textColors.icon} />
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: textColors.secondary,
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}
            >
              Compliance areas ({complianceAreas.length})
            </Typography>
          </Stack>
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
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1.5 }}>
            <Lightbulb size={14} color={textColors.icon} />
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: textColors.secondary,
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}
            >
              Key findings ({keyFindings.length})
            </Typography>
          </Stack>
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
                          fontSize: 10,
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
                          <Stack
                            direction="row"
                            spacing={0.5}
                            alignItems="flex-start"
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
                            <Box sx={{ color: accent.primary.text, mt: 0.1 }}>
                              <Quote size={10} />
                            </Box>
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
                          </Stack>
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
      </Box>

      {/* Suggested control links */}
      {suggestedLinks.length > 0 && (
        <Card elevation={0} sx={{ ...cardSx, p: 2, mb: 2 }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 1.5 }}
          >
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <Link2 size={14} color={textColors.icon} />
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
            </Stack>
            {onApplySuggestions && (
              <Button
                variant="outlined"
                size="small"
                onClick={() =>
                  onApplySuggestions(
                    suggestedLinks.map((s) => ({
                      control_id: s.control_id,
                      framework_type: s.framework_type,
                    })),
                  )
                }
                sx={{
                  "textTransform": "none",
                  "fontSize": 11,
                  "py": 0.25,
                  "borderColor": accent.primary.border,
                  "color": accent.primary.text,
                  "&:hover": { backgroundColor: accent.primary.bg },
                }}
              >
                Apply all
              </Button>
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
                  borderRadius: 1,
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
                      fontSize: 10,
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
        <Card elevation={0} sx={{ ...cardSx, p: 2, mb: 2 }}>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1.5 }}>
            <Info size={14} color={textColors.icon} />
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: textColors.secondary,
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}
            >
              Document signals
            </Typography>
          </Stack>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
              gap: 1,
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

      {/* Footer — Analysis metadata */}
      <Box
        sx={{
          pt: 1.5,
          borderTop: `1px solid ${borderPalette.light}`,
          display: "flex",
          alignItems: "center",
          gap: 0.75,
        }}
      >
        <FileText size={11} color={textColors.icon} />
        <Typography sx={{ fontSize: 10, color: textColors.accent }}>
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
        borderRadius: 1,
        px: 1,
        py: 0.5,
      }}
    >
      <Typography
        sx={{
          fontSize: 9,
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
