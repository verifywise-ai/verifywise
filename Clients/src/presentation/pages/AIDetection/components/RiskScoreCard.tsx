/**
 * @fileoverview Governance score card
 *
 * Displays the governance score (AGRS, 0-100, higher = safer) as 4 cards in a
 * row matching the Shadow AI insights StatCard style:
 * 1. Governance score  2. Grade  3. Dimensions at risk  4. Dimension breakdown
 *
 * The score is calculated when a scan completes. A score that leaves out LLM
 * vulnerability checks is marked partial. Optional LLM analysis runs in the
 * background; its state is shown under the cards.
 */

import { ReactNode, useState } from "react";
import { Link as RouterLink } from "react-router";
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Link,
  Typography,
  LinearProgress,
  Tooltip,
  Collapse,
  useTheme,
} from "@mui/material";
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  Gauge,
  Award,
  AlertTriangle,
  BarChart3,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cardStyles } from "../../../themes";
import { palette, radiusPx } from "../../../themes/palette";
import {
  RiskGrade,
  RiskScoreDetails,
  DIMENSION_LABELS,
  DIMENSION_ORDER,
  getGradeLabel,
} from "../../../../domain/ai-detection/riskScoringTypes";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import type { VulnerabilityCheckStatus } from "../../../../domain/ai-detection/types";
import { isScorePartial, partialScoreLabel, VULNERABILITY_SETTINGS_PATH } from "./governanceScore";

// ============================================================================
// Types
// ============================================================================

interface RiskScoreCardProps {
  score: number | null;
  grade: RiskGrade | null;
  details: RiskScoreDetails | null;
  calculatedAt: string | null;
  vulnerabilityCheckStatus?: VulnerabilityCheckStatus | null;
  isRecalculating?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function getGradeColor(grade: RiskGrade | null): string {
  switch (grade) {
    case "A":
    case "B":
      return palette.status.success.text;
    case "C":
      return palette.status.warning.text;
    case "D":
      return palette.riskMark.high;
    case "F":
      return palette.status.error.text;
    default:
      return palette.text.accent;
  }
}

function getScoreBarColor(score: number): string {
  if (score >= 80) return palette.status.success.text;
  if (score >= 60) return palette.status.warning.text;
  return palette.status.error.text;
}

// ============================================================================
// StatCard — matches Shadow AI insights card style exactly
// ============================================================================

function RiskStatCard({
  title,
  value,
  subtitle,
  Icon,
  valueColor,
  footer,
}: {
  title: string;
  value: string;
  subtitle?: string;
  Icon: LucideIcon;
  valueColor?: string;
  footer?: ReactNode;
}) {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Card
      elevation={0}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        ...(cardStyles.base(theme) as Record<string, unknown>),
        "background": `linear-gradient(135deg, ${palette.background.main} 0%, ${palette.background.alt} 100%)`,
        "border": `1px solid ${palette.border.light}`,
        "height": "100%",
        "minHeight": "80px",
        "position": "relative",
        "transition": "all 0.2s ease",
        "display": "flex",
        "flexDirection": "column",
        "boxSizing": "border-box",
        "borderRadius": radiusPx.lg,
        "overflow": "hidden",
        "&:hover": {
          background: `linear-gradient(135deg, ${palette.background.accent} 0%, ${palette.background.hover} 100%)`,
          borderColor: palette.border.dark,
        },
      }}
    >
      <CardContent
        sx={{
          "p": "14px 16px",
          "position": "relative",
          "height": "100%",
          "display": "flex",
          "flexDirection": "column",
          "flex": 1,
          "overflow": "hidden",
          "&:last-child": { pb: "14px" },
        }}
      >
        <Box
          sx={{
            position: "absolute",
            bottom: "-20px",
            right: "-20px",
            opacity: isHovered ? 0.06 : 0.03,
            transform: isHovered ? "translateY(-4px)" : "translateY(0px)",
            zIndex: 0,
            pointerEvents: "none",
            transition: "opacity 0.2s ease, transform 0.3s ease",
          }}
        >
          <Icon size={64} />
        </Box>
        <Box sx={{ position: "relative", zIndex: 1 }}>
          <Typography
            sx={{
              color: palette.status.default.text,
              fontSize: "13px",
              fontWeight: 500,
              letterSpacing: "0.3px",
              mb: "16px",
            }}
          >
            {title}
          </Typography>
          <Typography
            sx={{
              fontSize: "20px",
              fontWeight: 600,
              color: valueColor || palette.text.primary,
              lineHeight: 1.3,
            }}
          >
            {value}
          </Typography>
          {subtitle && (
            <Typography
              sx={{
                fontSize: "13px",
                color: palette.text.accent,
                mt: 0.5,
                fontWeight: 400,
              }}
            >
              {subtitle}
            </Typography>
          )}
          {footer}
        </Box>
      </CardContent>
    </Card>
  );
}

/** Partial-score note with a link to the setting that turns checks on */
function PartialScoreNote({ status }: { status: VulnerabilityCheckStatus | null | undefined }) {
  const label = partialScoreLabel(status);
  if (!label) return null;
  return (
    <Box sx={{ mt: "4px" }}>
      <Typography sx={{ fontSize: "13px", color: palette.status.warning.text, fontWeight: 500 }}>
        {label}
      </Typography>
      {(status === "off" || status === "failed") && (
        <Link
          component={RouterLink}
          to={VULNERABILITY_SETTINGS_PATH}
          sx={{ fontSize: "13px", color: palette.brand.primary }}
        >
          Open vulnerability settings
        </Link>
      )}
    </Box>
  );
}

/** State of the background LLM analysis, shown under the cards */
function LlmStatusNote({ details }: { details: RiskScoreDetails | null }) {
  if (details?.llm_status === "pending") {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: "8px", mt: "8px" }}>
        <CircularProgress size={12} sx={{ color: palette.text.tertiary }} />
        <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
          AI analysis is running. The score updates when it finishes.
        </Typography>
      </Box>
    );
  }
  if (details?.llm_status === "failed") {
    return (
      <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mt: "8px" }}>
        AI analysis didn't finish. The score shown is rule-based.
      </Typography>
    );
  }
  return null;
}

// ============================================================================
// LLM Section
// ============================================================================

/**
 * Render narrative text with **bold** markdown and paragraph splitting.
 * Splits on double-newlines or sentences ending with periods followed by a capital letter.
 */
function renderNarrative(text: string) {
  // Split into paragraphs on double-newline
  const paragraphs = text.split(/\n\n+/).filter(Boolean);

  // If only one paragraph and it's long, split on sentence boundaries
  const blocks =
    paragraphs.length === 1 && paragraphs[0].length > 300
      ? paragraphs[0].split(/(?<=\.)\s+(?=[A-Z])/).reduce<string[]>((acc, sentence) => {
          const last = acc[acc.length - 1];
          if (last && last.length + sentence.length < 250) {
            acc[acc.length - 1] = `${last} ${sentence}`;
          } else {
            acc.push(sentence);
          }
          return acc;
        }, [])
      : paragraphs;

  return blocks.map((block, i) => {
    // Handle **bold** markers within text
    const parts = block.split(/(\*\*[^*]+\*\*)/g);
    return (
      <Typography
        key={i}
        sx={{
          fontSize: 13,
          color: palette.text.secondary,
          mb: i < blocks.length - 1 ? "8px" : 0,
          lineHeight: 1.6,
        }}
      >
        {parts.map((part, j) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={j}>{part.slice(2, -2)}</strong>;
          }
          return part;
        })}
      </Typography>
    );
  });
}

function LLMSection({ details }: { details: RiskScoreDetails }) {
  const [showLLMDetails, setShowLLMDetails] = useState(false);

  if (!details.llm_enhanced || !details.llm_narrative) return null;

  return (
    <Box>
      <Box
        sx={{
          "display": "flex",
          "alignItems": "center",
          "gap": "8px",
          "cursor": "pointer",
          "&:hover": { opacity: 0.8 },
        }}
        onClick={() => setShowLLMDetails(!showLLMDetails)}
      >
        {showLLMDetails ? (
          <ChevronDown size={14} strokeWidth={1.5} color={palette.text.accent} />
        ) : (
          <ChevronRight size={14} strokeWidth={1.5} color={palette.text.accent} />
        )}
        <Sparkles size={12} color={palette.accent.purple.text} strokeWidth={1.5} />
        <Typography sx={{ fontSize: 13, color: palette.text.secondary, fontWeight: 500 }}>
          AI analysis
        </Typography>
      </Box>
      <Collapse in={showLLMDetails}>
        <Box sx={{ mt: "12px", pl: "24px" }}>
          <Box sx={{ mb: "12px" }}>{renderNarrative(details.llm_narrative)}</Box>
          {details.llm_recommendations && details.llm_recommendations.length > 0 && (
            <Box>
              <Typography
                sx={{ fontSize: 13, fontWeight: 600, color: palette.text.primary, mb: "8px" }}
              >
                Recommendations
              </Typography>
              <Box sx={{ pl: "16px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {details.llm_recommendations.map((rec, i) => {
                  // Handle **bold** in recommendations too
                  const parts = rec.split(/(\*\*[^*]+\*\*)/g);
                  return (
                    <Box key={i} sx={{ display: "flex", gap: "8px" }}>
                      <Typography
                        sx={{
                          fontSize: 13,
                          color: palette.text.accent,
                          lineHeight: 1.5,
                          flexShrink: 0,
                        }}
                      >
                        •
                      </Typography>
                      <Typography
                        sx={{ fontSize: 13, color: palette.text.secondary, lineHeight: 1.5 }}
                      >
                        {parts.map((part, j) => {
                          if (part.startsWith("**") && part.endsWith("**")) {
                            return <strong key={j}>{part.slice(2, -2)}</strong>;
                          }
                          return part;
                        })}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

// ============================================================================
// Main Export
// ============================================================================

export function RiskScoreCard({
  score,
  grade,
  details,
  calculatedAt,
  vulnerabilityCheckStatus,
  isRecalculating = false,
}: RiskScoreCardProps) {
  const theme = useTheme();
  const formatDate = useFormattedDate();

  // No score: scoring failed at scan completion, or the scan predates automatic scoring
  if (score === null || grade === null) {
    return (
      <Card
        elevation={0}
        sx={{
          ...(cardStyles.base(theme) as Record<string, unknown>),
          background: `linear-gradient(135deg, ${palette.background.main} 0%, ${palette.background.alt} 100%)`,
          border: `1px solid ${palette.border.light}`,
          borderRadius: radiusPx.lg,
          mb: "16px",
        }}
      >
        <CardContent sx={{ "p": "14px 16px", "&:last-child": { pb: "14px" } }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: palette.text.primary }}>
            Governance score
          </Typography>
          {isRecalculating ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: "8px", mt: "12px" }}>
              <CircularProgress size={12} sx={{ color: palette.text.tertiary }} />
              <Typography sx={{ fontSize: 13, color: palette.text.accent }}>
                Calculating governance score…
              </Typography>
            </Box>
          ) : (
            <Typography sx={{ fontSize: 13, color: palette.text.accent, mt: "12px" }}>
              This scan has no governance score yet. Select Recalculate score to calculate it.
            </Typography>
          )}
        </CardContent>
      </Card>
    );
  }

  const partial = isScorePartial(vulnerabilityCheckStatus);

  const gradeColor = getGradeColor(grade);
  const gradeLabel = getGradeLabel(grade);
  const dimensionsAtRisk = details
    ? DIMENSION_ORDER.filter((k) => (details.dimensions[k]?.score ?? 100) < 70).length
    : 0;

  return (
    <Box sx={{ mb: 2 }}>
      {/* 4 cards in a row, 16px gap */}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "16px" }}>
        {/* Card 1 — Governance score */}
        <RiskStatCard
          title="Governance score"
          value={`${Math.round(score)} / 100`}
          subtitle={
            partial
              ? undefined
              : score >= 80
                ? "Low risk"
                : score >= 60
                  ? "Moderate risk"
                  : "High risk"
          }
          Icon={Gauge}
          valueColor={gradeColor}
          footer={<PartialScoreNote status={vulnerabilityCheckStatus} />}
        />

        {/* Card 2 — Grade (kept visible, marked partial when checks didn't run) */}
        <RiskStatCard
          title={partial ? "Grade (partial)" : "Grade"}
          value={`${grade} — ${gradeLabel}`}
          subtitle={
            calculatedAt ? formatDate(new Date(calculatedAt), { includeTime: true }) : undefined
          }
          Icon={Award}
          valueColor={gradeColor}
        />

        {/* Card 3 — Dimensions at risk */}
        <RiskStatCard
          title="Dimensions at risk"
          value={`${dimensionsAtRisk} / ${DIMENSION_ORDER.length}`}
          subtitle="Below 70 threshold"
          Icon={AlertTriangle}
          valueColor={
            dimensionsAtRisk > 0 ? palette.status.error.text : palette.status.success.text
          }
        />

        {/* Card 4 — Dimension breakdown */}
        <Card
          elevation={0}
          sx={{
            ...(cardStyles.base(theme) as Record<string, unknown>),
            "background": `linear-gradient(135deg, ${palette.background.main} 0%, ${palette.background.alt} 100%)`,
            "border": `1px solid ${palette.border.light}`,
            "height": "100%",
            "position": "relative",
            "transition": "all 0.2s ease",
            "display": "flex",
            "flexDirection": "column",
            "boxSizing": "border-box",
            "borderRadius": radiusPx.lg,
            "overflow": "hidden",
            "&:hover": {
              background: `linear-gradient(135deg, ${palette.background.accent} 0%, ${palette.background.hover} 100%)`,
              borderColor: palette.border.dark,
            },
          }}
        >
          <CardContent
            sx={{
              "p": "14px 16px",
              "position": "relative",
              "height": "100%",
              "display": "flex",
              "flexDirection": "column",
              "flex": 1,
              "overflow": "hidden",
              "&:last-child": { pb: "14px" },
            }}
          >
            {/* Background icon */}
            <Box
              sx={{
                position: "absolute",
                bottom: "-20px",
                right: "-20px",
                opacity: 0.03,
                zIndex: 0,
                pointerEvents: "none",
              }}
            >
              <BarChart3 size={64} />
            </Box>

            <Box
              sx={{
                position: "relative",
                zIndex: 1,
                flex: 1,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Typography
                sx={{
                  color: palette.status.default.text,
                  fontSize: "13px",
                  fontWeight: 500,
                  letterSpacing: "0.3px",
                  mb: "16px",
                }}
              >
                Dimension breakdown
              </Typography>

              {details?.dimensions && (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    flex: 1,
                    justifyContent: "center",
                  }}
                >
                  {DIMENSION_ORDER.map((key) => {
                    const dim = details.dimensions[key];
                    if (!dim) return null;
                    const barColor = getScoreBarColor(dim.score);
                    return (
                      <Tooltip
                        key={key}
                        title={
                          dim.top_contributors.length > 0
                            ? dim.top_contributors.join(", ")
                            : "No penalties"
                        }
                        placement="top"
                        arrow
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography
                            sx={{
                              fontSize: 13,
                              color: palette.text.secondary,
                              minWidth: 100,
                              lineHeight: 1,
                            }}
                          >
                            {DIMENSION_LABELS[key]}
                          </Typography>
                          <Box sx={{ flex: 1 }}>
                            <LinearProgress
                              variant="determinate"
                              value={dim.score}
                              sx={{
                                "height": 4,
                                "borderRadius": radiusPx.sm,
                                "backgroundColor": palette.border.light,
                                "& .MuiLinearProgress-bar": {
                                  backgroundColor: barColor,
                                  borderRadius: radiusPx.sm,
                                },
                              }}
                            />
                          </Box>
                          <Typography
                            sx={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: barColor,
                              minWidth: 24,
                              textAlign: "right",
                              lineHeight: 1,
                            }}
                          >
                            {Math.round(dim.score)}
                          </Typography>
                        </Box>
                      </Tooltip>
                    );
                  })}
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>

      <LlmStatusNote details={details} />

      {/* LLM section below the cards — only when LLM analysis is available */}
      {details?.llm_enhanced && (
        <Card
          elevation={0}
          sx={{
            ...(cardStyles.base(theme) as Record<string, unknown>),
            background: `linear-gradient(135deg, ${palette.background.main} 0%, ${palette.background.alt} 100%)`,
            border: `1px solid ${palette.border.light}`,
            borderRadius: radiusPx.lg,
            mt: "16px",
          }}
        >
          <CardContent sx={{ "p": "14px 16px", "&:last-child": { pb: "14px" } }}>
            <LLMSection details={details} />
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
