import { useState } from "react";
import {
  Box,
  Typography,
  Skeleton,
  Stack,
  Card,
  Collapse,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { CustomizableButton } from "../button/customizable-button";
import { Sparkles, ChevronDown, ChevronUp, AlertTriangle, Check } from "lucide-react";
import Chip from "../Chip";
import { TagChip } from "../Tags";
import Alert from "../Alert";
import { EmptyState } from "../EmptyState";
import singleTheme from "../../themes/v1SingleTheme";
import {
  status,
  brand,
  text as textColors,
  border as borderPalette,
  background,
} from "../../themes/palette";
import { getGradeColor, getGradeLabel, type QualityGrade } from "../EvidenceQualityBadge";

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

// Cards & containers: background.main, border.light, 4px radius, no shadow.
const cardSx = {
  backgroundColor: background.main,
  border: `1px solid ${borderPalette.light}`,
  borderRadius: "4px",
  boxShadow: "none",
};

// Card/Container padding pattern from the spacing scale: 12px 16px.
const cardPadding = "12px 16px";

// Subsection title: 14px / 600 / 1.5 / text.primary.
const subsectionTitleSx = {
  fontSize: 14,
  fontWeight: 600,
  color: textColors.primary,
  lineHeight: 1.5,
};

// Status-color triple for a boolean document signal (Status indicators page).
function signalStatusColors(opts: {
  positive?: boolean;
  negative?: boolean;
  neutral?: boolean;
  invertSemantic?: boolean;
}): { bg: string; text: string } {
  const { positive, negative, neutral, invertSemantic } = opts;
  if (neutral) return { bg: status.default.bg, text: status.default.text };
  if (invertSemantic) {
    return positive
      ? { bg: status.success.bg, text: status.success.text }
      : { bg: status.warning.bg, text: status.warning.text };
  }
  if (positive) return { bg: status.success.bg, text: status.success.text };
  if (negative) return { bg: status.warning.bg, text: status.warning.text };
  return { bg: status.default.bg, text: status.default.text };
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
    <Stack sx={{ ...cardSx, padding: cardPadding, height: "100%" }} spacing="8px">
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography sx={{ fontSize: 12, fontWeight: 500, color: textColors.secondary }}>
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
                "p": "4px",
                "color": textColors.accent,
                "&:hover": { color: brand.primary },
              }}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      <Typography sx={{ fontSize: 24, fontWeight: 700, color: colors.text, lineHeight: 1.1 }}>
        {grade ?? "—"}
      </Typography>
      {/* Caption: 11px / 400 / 1.4 / text.accent */}
      <Typography sx={{ fontSize: 11, color: textColors.accent, lineHeight: 1.4 }}>
        {description}
      </Typography>
      {hasRationale && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <Box sx={{ mt: "8px", pt: "8px", borderTop: `1px dashed ${borderPalette.light}` }}>
            <Typography
              sx={{
                fontSize: 11,
                color: textColors.accent,
                lineHeight: 1.4,
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
    // Content shape is known (hero + 5-dimension grid), so skeleton loaders
    // are used per the loading-states checklist ("prefer skeleton loaders
    // over spinners when content shape is known"), not a bare spinner.
    return (
      <Stack spacing="16px">
        <Skeleton variant="rounded" height={120} />
        <Box sx={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(5, 1fr)" }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={96} />
          ))}
        </Box>
        <Skeleton variant="rounded" height={140} />
      </Stack>
    );
  }

  if (!analysis) {
    return (
      <EmptyState icon={Sparkles} message="No AI analysis available for this evidence yet." showBorder>
        {onTriggerAnalysis && (
          <CustomizableButton
            variant="outlined"
            text={isAnalyzing ? "Analyzing..." : "Run AI analysis"}
            icon={<Sparkles size={16} />}
            loading={isAnalyzing}
            isDisabled={isAnalyzing}
            onClick={onTriggerAnalysis}
            sx={{
              "borderColor": brand.primary,
              "color": brand.primary,
              "&:hover": { backgroundColor: background.fill },
            }}
          />
        )}
      </EmptyState>
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
    // No outer padding/background here — StandardModal's content area already
    // applies the documented 20px modal-content padding and background.modal.
    <Stack spacing="16px">
      {/* Abstain banner — real Alert component, warning variant */}
      {abstainReason && <Alert variant="warning" title="Analyzer abstained" body={abstainReason} />}

      {/* Filename mismatch — single documented-color sentence, no box */}
      {filenameCheck?.mismatch && filenameCheck.suggested_filename && (
        <Stack direction="row" spacing="16px" alignItems="flex-start">
          <Box sx={{ color: status.warning.text, mt: "2px", flexShrink: 0 }}>
            <AlertTriangle size={14} />
          </Box>
          <Typography sx={{ fontSize: 13, color: status.warning.text, lineHeight: 1.5 }}>
            This filename doesn&apos;t match its content — consider renaming it to &quot;
            {filenameCheck.suggested_filename}&quot;
            {filenameCheck.reason ? ` (${filenameCheck.reason})` : ""}.
          </Typography>
        </Stack>
      )}

      {/* Hero overall score panel */}
      <Card elevation={0} sx={{ ...cardSx, padding: cardPadding }}>
        <Stack direction="row" spacing="16px" alignItems="center">
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
            <Stack direction="row" spacing="8px" alignItems="center" sx={{ mb: "8px" }}>
              <Typography sx={{ fontSize: 12, fontWeight: 500, color: textColors.secondary }}>
                Overall quality grade
              </Typography>
              {/* Status chip pattern: real Chip, grade-colored */}
              <Chip
                label={overallGrade ?? "—"}
                size="small"
                uppercase={false}
                backgroundColor={overallColors.bg}
                textColor={overallColors.text}
              />
            </Stack>
            {/* Card title: 16px / 600 / 1.4 / text.primary */}
            <Typography sx={{ fontSize: 16, fontWeight: 600, color: textColors.primary, mb: "8px" }}>
              {overallGrade ? `${overallLabel} quality evidence` : "AI grading unavailable"}
            </Typography>
            {/* Body default: 13px / 400 / 1.5 / text.secondary */}
            <Typography sx={{ fontSize: 13, color: textColors.secondary, lineHeight: 1.5 }}>
              {analysis.summary}
            </Typography>
          </Box>
        </Stack>
      </Card>

      {/* 5 Quality Dimension stat cards */}
      <Box>
        <Typography sx={{ ...subsectionTitleSx, mb: "12px" }}>Quality breakdown</Typography>
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

      {/* Suggested control links — real Table, singleTheme.tableStyles.primary */}
      {suggestedLinks.length > 0 && (
        <Card elevation={0} sx={{ ...cardSx, padding: cardPadding }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: "12px" }}>
            <Typography sx={subsectionTitleSx}>
              Suggested control links ({suggestedLinks.length})
            </Typography>
            {onApplySuggestions && (
              <CustomizableButton
                variant="outlined"
                size="small"
                text="Apply all"
                icon={<Check size={16} />}
                onClick={() =>
                  onApplySuggestions(
                    suggestedLinks.map((s) => ({
                      control_id: s.control_id,
                      framework_type: s.framework_type,
                    })),
                  )
                }
                sx={{
                  "borderColor": brand.primary,
                  "color": brand.primary,
                  "&:hover": { backgroundColor: background.fill },
                }}
              />
            )}
          </Stack>
          {/* singleTheme.tableStyles.primary: frame on Table, header bg on TableHead */}
          <TableContainer>
            <Table size="small" sx={singleTheme.tableStyles.primary.frame}>
              <TableHead
                sx={{ backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors }}
              >
                <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                  {["Control", "Framework", "Match"].map((h) => (
                    <TableCell key={h} sx={singleTheme.tableStyles.primary.header.cell}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {suggestedLinks.slice(0, 6).map((link, i) => (
                  <TableRow key={i} sx={singleTheme.tableStyles.primary.body.row}>
                    <TableCell
                      sx={{ ...singleTheme.tableStyles.primary.body.cell, color: textColors.primary }}
                    >
                      {link.control_title}
                    </TableCell>
                    <TableCell
                      sx={{ ...singleTheme.tableStyles.primary.body.cell, color: textColors.tertiary }}
                    >
                      {link.framework_type.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      <Chip
                        label={`${link.match_score}% match`}
                        size="small"
                        variant={link.match_score >= 70 ? "success" : "warning"}
                        uppercase={false}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* Document signals — only when analyzer-v2 produced them */}
      {docSignals && (
        <Card elevation={0} sx={{ ...cardSx, padding: cardPadding }}>
          <Typography sx={{ ...subsectionTitleSx, mb: "12px" }}>Document signals</Typography>
          <Stack direction="row" flexWrap="wrap" gap="8px">
            {(() => {
              const c = signalStatusColors({ positive: (docSignals.authority_signal ?? 0) >= 60 });
              return (
                <Chip
                  label={`Authority ${docSignals.authority_signal ?? 0}/100`}
                  size="small"
                  uppercase={false}
                  backgroundColor={c.bg}
                  textColor={c.text}
                />
              );
            })()}
            {(() => {
              const c = signalStatusColors({ neutral: true });
              return (
                <Chip
                  label={`Type ${docSignals.document_type ?? "—"}`}
                  size="small"
                  uppercase={false}
                  backgroundColor={c.bg}
                  textColor={c.text}
                />
              );
            })()}
            {(() => {
              const c = signalStatusColors({ positive: !!docSignals.has_named_owner });
              return (
                <Chip
                  label={`Named owner ${docSignals.has_named_owner ? "Yes" : "No"}`}
                  size="small"
                  uppercase={false}
                  backgroundColor={c.bg}
                  textColor={c.text}
                />
              );
            })()}
            {(() => {
              const c = signalStatusColors({ positive: !!docSignals.has_version });
              return (
                <Chip
                  label={`Version ${docSignals.has_version ? "Yes" : "No"}`}
                  size="small"
                  uppercase={false}
                  backgroundColor={c.bg}
                  textColor={c.text}
                />
              );
            })()}
            {(() => {
              const c = signalStatusColors({ positive: !!docSignals.has_explicit_dates });
              return (
                <Chip
                  label={`Explicit dates ${docSignals.has_explicit_dates ? "Yes" : "No"}`}
                  size="small"
                  uppercase={false}
                  backgroundColor={c.bg}
                  textColor={c.text}
                />
              );
            })()}
            {(() => {
              const c = signalStatusColors({ positive: !!docSignals.has_metrics });
              return (
                <Chip
                  label={`Metrics ${docSignals.has_metrics ? "Yes" : "No"}`}
                  size="small"
                  uppercase={false}
                  backgroundColor={c.bg}
                  textColor={c.text}
                />
              );
            })()}
            {(() => {
              const c = signalStatusColors({ positive: !docSignals.is_draft, invertSemantic: true });
              return (
                <Chip
                  label={`Draft ${docSignals.is_draft ? "Yes" : "No"}`}
                  size="small"
                  uppercase={false}
                  backgroundColor={c.bg}
                  textColor={c.text}
                />
              );
            })()}
            {auditMetadata?.truncated &&
              (() => {
                const c = signalStatusColors({ negative: true });
                return (
                  <Chip
                    label={`Truncated ${auditMetadata.char_count ?? "?"} ch`}
                    size="small"
                    uppercase={false}
                    backgroundColor={c.bg}
                    textColor={c.text}
                  />
                );
              })()}
          </Stack>
        </Card>
      )}

      {/* Compliance areas + Key findings — two full-width rows, findings last */}
      <Stack spacing="16px">
        {/* Compliance areas */}
        <Card elevation={0} sx={{ ...cardSx, padding: cardPadding }}>
          <Typography sx={{ ...subsectionTitleSx, mb: "12px" }}>
            Compliance areas ({complianceAreas.length})
          </Typography>
          {complianceAreas.length > 0 ? (
            <Stack direction="row" flexWrap="wrap" gap="8px">
              {complianceAreas.map((area, i) => (
                <TagChip key={i} tag={area} />
              ))}
            </Stack>
          ) : (
            <Typography sx={{ fontSize: 12, color: textColors.accent }}>
              No compliance areas detected.
            </Typography>
          )}
        </Card>

        {/* Key findings */}
        <Card elevation={0} sx={{ ...cardSx, padding: cardPadding }}>
          <Typography sx={{ ...subsectionTitleSx, mb: "12px" }}>
            Key findings ({keyFindings.length})
          </Typography>
          {keyFindings.length > 0 ? (
            <Stack spacing="12px">
              {keyFindings.slice(0, 5).map((finding, i) => {
                const fwq = findingsWithQuotes?.[i];
                return (
                  <Stack key={i} direction="row" spacing="8px" alignItems="flex-start">
                    <Box
                      sx={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        backgroundColor: background.fill,
                        color: brand.primary,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {/* Body small: 12px / 400 / 1.5 / text.tertiary */}
                      <Typography sx={{ fontSize: 12, color: textColors.tertiary, lineHeight: 1.5 }}>
                        {finding.length > 160 ? finding.substring(0, 160) + "..." : finding}
                      </Typography>
                      {fwq?.evidence_quote && (
                        <Box
                          sx={{
                            mt: "8px",
                            pl: "12px",
                            pr: "12px",
                            py: "8px",
                            borderLeft: `2px solid ${brand.primary}`,
                            backgroundColor: background.accent,
                            borderRadius: "4px",
                          }}
                        >
                          {/* Caption: 11px / 400 / 1.4 / text.accent */}
                          <Typography
                            sx={{
                              fontSize: 11,
                              color: textColors.accent,
                              fontStyle: "italic",
                              lineHeight: 1.4,
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
      <Box sx={{ pt: "12px", borderTop: `1px solid ${borderPalette.light}` }}>
        <Typography sx={{ fontSize: 11, color: textColors.accent }}>
          Analyzed by {analysis.analysis_model} (v{analysis.analysis_version}) ·{" "}
          {new Date(analysis.analyzed_at).toLocaleString()}
          {auditMetadata?.analyzer_version ? ` · ${auditMetadata.analyzer_version}` : ""}
        </Typography>
      </Box>
    </Stack>
  );
}
