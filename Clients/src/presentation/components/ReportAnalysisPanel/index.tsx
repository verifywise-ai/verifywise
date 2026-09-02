import type { ReactNode } from "react";
import { Box, Skeleton, Stack, Typography, useTheme } from "@mui/material";
import type { Theme } from "@mui/material";
import { AlertTriangle, Info, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Chip from "../Chip";
import { EmptyState } from "../EmptyState";
import type {
  AnalysisPayload,
  ComplianceGapPayload,
  ExecutiveSummaryPayload,
  KeyFindingsPayload,
  RecommendedActionsPayload,
  ReportRunAnalysis,
  RiskAnalysisPayload,
  SectionSummariesPayload,
  VendorRiskPayload,
} from "../../../domain/interfaces/i.reporting";

interface ReportAnalysisPanelProps {
  /** Rows from GET /reporting/runs/:id/analyses. The caller owns the hook. */
  analyses: ReportRunAnalysis[] | undefined;
  isLoading?: boolean;
}

/**
 * Readable heading per section key. `section_key` is typed as a plain string on
 * the row, so an unmapped key falls back to the raw key rather than rendering
 * nothing — a new backend analyzer must never disappear from this panel.
 */
const SECTION_LABELS: Record<string, string> = {
  executiveSummary: "Executive summary",
  keyFindings: "Key findings",
  recommendedActions: "Recommended actions",
  riskAnalysis: "Risk analysis",
  complianceGap: "Compliance gap analysis",
  vendorRisk: "Third-party risk analysis",
  sectionSummaries: "Per-section summaries",
};

/**
 * Every analyzer payload except sectionSummaries carries abstain_reason. The
 * `in` check narrows the union, so no cast is needed and no field is invented.
 */
function abstainReasonOf(payload: AnalysisPayload): string | null {
  if (!payload || !("abstain_reason" in payload)) return null;
  return payload.abstain_reason;
}

/**
 * Card container per the style guide's Cards & containers section: white
 * surface, 1px border.light frame, 4px radius, 16px padding, no shadow. Written
 * locally rather than through cardStyles.base because that shared helper pads
 * with theme.spacing(2) — 4px on this 2px-based scale — which is what made the
 * drawer read as unpadded text.
 *
 * border.light rather than border.dark: five stacked frames in one scroll, and
 * the card spec's own colour is the quieter of the two.
 */
const analysisCardSx = (theme: Theme) => ({
  backgroundColor: theme.palette.background.main,
  border: `1px solid ${theme.palette.border.light}`,
  borderRadius: "4px",
  boxShadow: "none",
  p: "16px",
});

/**
 * Status-colored notice box (Cards & containers §Alert boxes): warning bg,
 * warning border, 4px radius, 12px 16px padding, 16px icon at a 12px gap.
 *
 * Aligned to the top, not centred: an abstain reason wraps to several lines in
 * a 400px drawer, and a centred icon would then float beside the middle line.
 * The 2px nudge is theme.spacing(1), the scale's icon-gap step.
 */
function WarningNotice({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  const theme = useTheme();
  return (
    <Stack
      direction="row"
      spacing="12px"
      sx={{
        alignItems: "flex-start",
        backgroundColor: theme.palette.status.warning.bg,
        border: `1px solid ${theme.palette.status.warning.main}`,
        borderRadius: "4px",
        p: "12px 16px",
      }}
    >
      <Box
        sx={{
          color: theme.palette.status.warning.text,
          display: "flex",
          flexShrink: 0,
          mt: "2px",
        }}
      >
        <Icon size={16} />
      </Box>
      <Typography sx={{ fontSize: 13, color: theme.palette.status.warning.text, lineHeight: 1.5 }}>
        {text}
      </Typography>
    </Stack>
  );
}

/**
 * Narratives and summaries are the long-form text in this panel, so they take
 * the guide's long-form settings rather than the 13px/1.5 body default: Body
 * large (14px) and the Loose line height (1.75), which is listed for exactly
 * this kind of content. Short list rows below stay at the 13px body size.
 */
function Prose({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Typography
      sx={{
        fontSize: 14,
        color: theme.palette.text.secondary,
        lineHeight: 1.75,
        whiteSpace: "pre-line",
      }}
    >
      {text}
    </Typography>
  );
}

/** One list row: primary sentence, an optional severity/level chip, an optional caption. */
function ListItem({
  primary,
  chipLabel,
  secondary,
}: {
  primary: string;
  chipLabel?: string;
  secondary?: string | null;
}) {
  const theme = useTheme();
  return (
    <Stack spacing="4px">
      <Stack
        direction="row"
        spacing="8px"
        sx={{
          alignItems: "flex-start",
        }}
      >
        <Typography
          sx={{
            fontSize: 13,
            color: theme.palette.text.secondary,
            lineHeight: 1.5,
            flex: 1,
            minWidth: 0,
          }}
        >
          {primary}
        </Typography>
        {/* The chip must keep its width when the sentence beside it wraps. */}
        {chipLabel && (
          <Box sx={{ flexShrink: 0 }}>
            <Chip label={chipLabel} size="small" uppercase={false} />
          </Box>
        )}
      </Stack>
      {/* Body small (12 / 1.5 / text.tertiary), not the 11px caption: a
          recommended action's rationale runs to several sentences here, and
          caption sizing is for hints and timestamps. */}
      {secondary && (
        <Typography sx={{ fontSize: 12, color: theme.palette.text.tertiary, lineHeight: 1.5 }}>
          {secondary}
        </Typography>
      )}
    </Stack>
  );
}

/**
 * Narrow on section_key and render only the fields the analyzer schemas
 * actually produce (mirrored in i.reporting.ts). Returns null when there is
 * nothing to show, so the caller can decide what quiet state to render.
 */
function sectionBody(sectionKey: string, payload: AnalysisPayload): ReactNode {
  if (!payload) return null;

  switch (sectionKey) {
    case "executiveSummary": {
      const p = payload as ExecutiveSummaryPayload;
      return p.summary ? <Prose text={p.summary} /> : null;
    }

    case "keyFindings": {
      const p = payload as KeyFindingsPayload;
      if (!p.findings?.length) return null;
      return (
        <Stack spacing="12px">
          {p.findings.map((f, i) => (
            <ListItem key={i} primary={f.text} chipLabel={f.severity} secondary={f.section} />
          ))}
        </Stack>
      );
    }

    case "recommendedActions": {
      const p = payload as RecommendedActionsPayload;
      if (!p.actions?.length) return null;
      return (
        <Stack spacing="12px">
          {p.actions.map((a, i) => (
            <ListItem
              key={i}
              primary={a.action}
              chipLabel={a.priority}
              secondary={
                a.suggestedOwner ? `${a.rationale} — Owner: ${a.suggestedOwner}` : a.rationale
              }
            />
          ))}
        </Stack>
      );
    }

    case "riskAnalysis": {
      const p = payload as RiskAnalysisPayload;
      const risks = p.top_risks ?? [];
      if (!p.narrative && !risks.length) return null;
      return (
        <Stack spacing="12px">
          {p.narrative && <Prose text={p.narrative} />}
          {risks.map((r, i) => (
            <ListItem key={i} primary={r.name} chipLabel={r.level} secondary={r.why} />
          ))}
        </Stack>
      );
    }

    case "complianceGap": {
      const p = payload as ComplianceGapPayload;
      const gaps = p.gaps ?? [];
      if (!p.narrative && !gaps.length && !p.scores_caveat) return null;
      return (
        <Stack spacing="12px">
          {p.narrative && <Prose text={p.narrative} />}
          {p.scores_caveat && <WarningNotice icon={Info} text={p.scores_caveat} />}
          {gaps.map((g, i) => (
            <ListItem key={i} primary={g.control} chipLabel={g.priority} secondary={g.gap} />
          ))}
        </Stack>
      );
    }

    case "vendorRisk": {
      const p = payload as VendorRiskPayload;
      const concerns = p.concerns ?? [];
      if (!p.narrative && !concerns.length) return null;
      return (
        <Stack spacing="12px">
          {p.narrative && <Prose text={p.narrative} />}
          {concerns.map((c, i) => (
            <ListItem key={i} primary={c.vendor} chipLabel={c.severity} secondary={c.concern} />
          ))}
        </Stack>
      );
    }

    case "sectionSummaries": {
      const p = payload as SectionSummariesPayload;
      const entries = Object.entries(p.summaries ?? {});
      if (!entries.length) return null;
      return <SummaryList entries={entries} />;
    }

    default:
      return null;
  }
}

/**
 * One long card holds every per-section summary, so each key is set as a
 * subsection title (14 / 600 / text.primary) and entries are separated by the
 * 24px section-to-section step. At 12px / tertiary the keys read as captions
 * and got lost in the prose.
 */
function SummaryList({ entries }: { entries: Array<[string, string]> }) {
  const theme = useTheme();
  return (
    <Stack spacing="24px">
      {entries.map(([key, summary]) => (
        <Stack key={key} spacing="4px">
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 600,
              lineHeight: 1.5,
              color: theme.palette.text.primary,
            }}
          >
            {key}
          </Typography>
          <Prose text={summary} />
        </Stack>
      ))}
    </Stack>
  );
}

function AnalysisCard({ analysis }: { analysis: ReportRunAnalysis }) {
  const theme = useTheme();
  const label = SECTION_LABELS[analysis.section_key] ?? analysis.section_key;
  const abstainReason = abstainReasonOf(analysis.payload);
  const body = sectionBody(analysis.section_key, analysis.payload);

  return (
    <Box sx={analysisCardSx(theme)}>
      {/* Gaps rather than margins between the card's children (Do's & don'ts
          §Spacing), so every section card spaces the same way. */}
      <Stack spacing="12px">
        {/* Card title: 16px / 600 / 1.4 / text.primary */}
        <Typography
          sx={{
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1.4,
            color: theme.palette.text.primary,
          }}
        >
          {label}
        </Typography>

        {/* One Typography, so the reason stays searchable as a single string. */}
        {abstainReason && (
          <WarningNotice icon={AlertTriangle} text={`The analyzer abstained: ${abstainReason}`} />
        )}

        {body}

        {/* Quiet fallback — a null payload (abstained or failed analyzer) or an
            empty result. Suppressed when an abstain reason already explains it. */}
        {!body && !abstainReason && (
          <Typography sx={{ fontSize: 12, color: theme.palette.text.tertiary, lineHeight: 1.5 }}>
            This section was not generated.
          </Typography>
        )}

        <Box sx={{ pt: "12px", borderTop: `1px solid ${theme.palette.border.light}` }}>
          <Typography sx={{ fontSize: 11, color: theme.palette.text.accent, lineHeight: 1.4 }}>
            {analysis.analysis_model ?? "Model not recorded"} ·{" "}
            {new Date(analysis.analyzed_at).toLocaleString()}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}

export default function ReportAnalysisPanel({ analyses, isLoading }: ReportAnalysisPanelProps) {
  if (isLoading) {
    // Shape is known (a stack of section cards), so skeletons rather than a spinner.
    return (
      <Stack spacing="16px">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={140} />
        ))}
      </Stack>
    );
  }

  if (!analyses?.length) {
    // showBorder={false} — the guide reserves the dashed frame for tables and
    // full-width lists, not for a narrow panel that already has its own edge.
    return (
      <EmptyState
        icon={Sparkles}
        message="No AI analyses were generated for this report run."
        showBorder={false}
      />
    );
  }

  return (
    <Stack spacing="16px">
      {analyses.map((analysis) => (
        <AnalysisCard key={analysis.id} analysis={analysis} />
      ))}
    </Stack>
  );
}
