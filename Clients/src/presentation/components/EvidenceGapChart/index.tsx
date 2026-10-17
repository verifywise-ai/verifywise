import { useState } from "react";
import { Box, Typography, LinearProgress, Stack } from "@mui/material";
import { status, text as textColors, border, background } from "../../themes/palette";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { fill } from "../../../i18n/fill";
import { CustomizableButton } from "../button/customizable-button";

/** One requirement that has no evidence, or only evidence graded as low quality. */
interface GapItem {
  framework_type: string;
  control_id: number;
  control_title: string;
  evidence_count: number;
  adequate_count: number;
  gap_type: "no_evidence" | "low_quality" | "adequate";
}

interface GapData {
  total_controls: number;
  controls_without_evidence: number;
  controls_with_low_quality: number;
  controls_adequate: number;
  /** Grades the API counted as low quality — D and F unless the caller widened it. */
  low_grades?: string[];
  gaps: GapItem[];
}

interface EvidenceGapChartProps {
  data: GapData | null;
  isLoading?: boolean;
}

/** The gaps list mixes frameworks, so each row says which one it belongs to. */
const FRAMEWORK_LABELS: Record<string, string> = {
  eu_ai_act: "EU AI Act",
  iso_42001: "ISO 42001",
};

/** How many gaps to list before the rest are folded behind "Show all". */
const VISIBLE_GAPS = 8;

function CoverageBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: { bg: string; text: string };
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <Box sx={{ mb: 1.5 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
        <Typography sx={{ fontSize: 12, color: textColors.secondary }}>{label}</Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: color.text }}>
          {count} ({pct}%)
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        aria-label={label}
        sx={{
          "height": 6,
          "borderRadius": 3,
          "backgroundColor": background.hover,
          "& .MuiLinearProgress-bar": {
            borderRadius: 3,
            backgroundColor: color.text,
          },
        }}
      />
    </Box>
  );
}

export default function EvidenceGapChart({ data, isLoading }: EvidenceGapChartProps) {
  // Interpolated strings never reach the DOM translator as a whole text node,
  // so the counted fragments are translated through the hook (#4911 review).
  const { t } = useTranslation();
  const [showAllGaps, setShowAllGaps] = useState(false);

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <LinearProgress aria-label="Loading evidence coverage" />
      </Box>
    );
  }

  if (!data || data.total_controls === 0) {
    return (
      <Box
        sx={{
          p: 3,
          textAlign: "center",
          backgroundColor: background.accent,
          borderRadius: 2,
          border: `1px solid ${border.light}`,
        }}
      >
        <Typography sx={{ fontSize: 13, color: textColors.tertiary }}>
          No control data available for gap analysis.
        </Typography>
      </Box>
    );
  }

  const lowGrades = data.low_grades?.length ? data.low_grades.join(", ") : "D, F";
  const hasHiddenGaps = data.gaps.length > VISIBLE_GAPS;
  const listedGaps = showAllGaps ? data.gaps : data.gaps.slice(0, VISIBLE_GAPS);

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${border.light}`,
        backgroundColor: background.main,
      }}
    >
      <Typography sx={{ fontSize: 15, fontWeight: 600, color: textColors.primary, mb: 2 }}>
        Evidence coverage
      </Typography>

      {/* Coverage summary bars */}
      <CoverageBar
        label="Adequate evidence"
        count={data.controls_adequate}
        total={data.total_controls}
        color={status.success}
      />
      <CoverageBar
        label="Low-quality evidence"
        count={data.controls_with_low_quality}
        total={data.total_controls}
        color={status.warning}
      />
      <CoverageBar
        label="No evidence"
        count={data.controls_without_evidence}
        total={data.total_controls}
        color={status.error}
      />

      {/* Gap details */}
      {data.gaps.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: textColors.secondary, mb: 1 }}>
            {t("Controls needing attention")} ({data.gaps.length})
          </Typography>
          <Stack spacing={0.5}>
            {listedGaps.map((gap) => {
              const noEvidence = gap.gap_type === "no_evidence";
              const tone = noEvidence ? status.error : status.warning;

              return (
                <Box
                  key={`${gap.framework_type}-${gap.control_id}`}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    p: 1,
                    borderRadius: 1,
                    backgroundColor: tone.bg,
                    border: `1px solid ${tone.border}`,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: textColors.secondary,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      mr: 1,
                    }}
                    title={gap.control_title}
                  >
                    {FRAMEWORK_LABELS[gap.framework_type] ?? gap.framework_type} ·{" "}
                    {gap.control_title}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: tone.text,
                      flexShrink: 0,
                    }}
                  >
                    {noEvidence
                      ? t("No evidence")
                      : `${gap.evidence_count} ${
                          gap.evidence_count === 1 ? t("file") : t("files")
                        }, ${t("none adequate")}`}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
          {hasHiddenGaps && (
            <Box sx={{ mt: 1 }}>
              <CustomizableButton
                variant="text"
                size="small"
                text={
                  showAllGaps
                    ? t("Show fewer")
                    : fill(t("Show all {count}"), { count: data.gaps.length })
                }
                onClick={() => setShowAllGaps((shown) => !shown)}
              />
            </Box>
          )}
        </Box>
      )}

      {/* What counts as low quality */}
      <Typography sx={{ mt: 2, fontSize: 10, color: textColors.accent }}>
        {t("Evidence graded")} {lowGrades}{" "}
        {t("counts as low quality. Files with no AI analysis are not counted as adequate.")}
      </Typography>
    </Box>
  );
}
